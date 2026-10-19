import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.api import finance, planning, system
from app.api.deps import require_token
from app.config import get_settings
from app.db import SessionLocal
from app.errors import DomainError
from app.services.categories import ensure_default_categories
from app.services.settings import ensure_app_settings

settings = get_settings()
logging.basicConfig(level=settings.log_level)
# Request bodies (amounts, descriptions) are never logged; uvicorn's access log
# records only method, path and status.
log = logging.getLogger("personal_os")



@asynccontextmanager
async def lifespan(_: FastAPI):
    with SessionLocal() as db:
        ensure_app_settings(db)
        ensure_default_categories(db)
    yield


app = FastAPI(title="Personal OS API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cache-Control", "no-store")
    return response


def _error(status: int, code: str, message: str, details=None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "details": details}})


@app.exception_handler(DomainError)
async def domain_error(_: Request, exc: DomainError):
    return _error(exc.status_code, exc.code, exc.message, exc.details)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    details = [
        {"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"].removeprefix("Value error, ")}
        for e in exc.errors()
    ]
    first = details[0] if details else {"field": "", "message": "Invalid input"}
    msg = f"{first['field']}: {first['message']}" if first["field"] else first["message"]
    return _error(422, "validation_failed", msg, details)


@app.exception_handler(IntegrityError)
async def integrity_error(_: Request, exc: IntegrityError):
    constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
    log.warning("integrity error on constraint %s", constraint)
    return _error(409, "conflict", "This change conflicts with existing data", {"constraint": constraint})


protected = [Depends(require_token)]
app.include_router(finance.router, prefix="/api", dependencies=protected)
app.include_router(planning.router, prefix="/api", dependencies=protected)
app.include_router(system.router, prefix="/api", dependencies=protected)
