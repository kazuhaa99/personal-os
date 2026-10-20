import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import auth, finance, planning, profile, system
from app.api.deps import require_token
from app.config import get_settings
from app.db import SessionLocal
from app.errors import DomainError
from app.services.auth import ensure_admin
from app.services.error_text import field_label, pydantic_message, translate
from app.services.i18n import pick_language, use_language

settings = get_settings()
logging.basicConfig(level=settings.log_level)
# Request bodies (amounts, descriptions) are never logged; uvicorn's access log
# records only method, path and status.
log = logging.getLogger("personal_os")



@asynccontextmanager
async def lifespan(_: FastAPI):
    with SessionLocal() as db:
        ensure_admin(db)
    yield


app = FastAPI(title="Personal OS API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Accept-Language"],
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


def _lang(request: Request) -> str:
    return pick_language(request.headers.get("accept-language"))


@app.exception_handler(DomainError)
async def domain_error(request: Request, exc: DomainError):
    return _error(exc.status_code, exc.code, translate(exc.message, _lang(request)), exc.details)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    lang = _lang(request)
    details = []
    for e in exc.errors():
        field = ".".join(str(p) for p in e["loc"] if p != "body")
        text = e["msg"].removeprefix("Value error, ") if lang == "en" else pydantic_message(e, lang)
        details.append({"field": field, "message": text})
    first = details[0] if details else {"field": "", "message": translate("Invalid input", lang)}
    label = field_label(first["field"], lang) if lang != "en" else first["field"]
    msg = f"{label}: {first['message']}" if first["field"] else first["message"]
    return _error(422, "validation_failed", msg, details)


@app.exception_handler(IntegrityError)
async def integrity_error(request: Request, exc: IntegrityError):
    constraint = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
    log.warning("integrity error on constraint %s", constraint)
    return _error(409, "conflict", translate("This change conflicts with existing data", _lang(request)), {"constraint": constraint})


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    detail = translate(exc.detail, _lang(request)) if isinstance(exc.detail, str) else exc.detail
    return JSONResponse(status_code=exc.status_code, content={"detail": detail}, headers=getattr(exc, "headers", None))


app.include_router(auth.router, prefix="/api")
# use_language: services (insights, CSV import reasons) localise generated text.
protected = [Depends(use_language), Depends(require_token)]
app.include_router(finance.router, prefix="/api", dependencies=protected)
app.include_router(planning.router, prefix="/api", dependencies=protected)
app.include_router(system.router, prefix="/api", dependencies=protected)
app.include_router(profile.router, prefix="/api", dependencies=protected)
