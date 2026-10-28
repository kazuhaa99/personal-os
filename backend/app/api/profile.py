from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas.profile import IncomeSourceIn, IncomeSourceOut, IncomeSourceUpdate, ProfileOut, ProfileUpdate
from app.services import profile as svc

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileOut)
def read_profile(db: Session = Depends(get_db)):
    return svc.profile_out(db)


@router.patch("", response_model=ProfileOut)
def write_profile(data: ProfileUpdate, db: Session = Depends(get_db)):
    svc.update_profile(db, data.model_dump(exclude_unset=True))
    return svc.profile_out(db)


@router.get("/avatar")
def read_avatar(db: Session = Depends(get_db)):
    content, mime = svc.get_avatar(db)
    # The URL carries ?v=<version>, so a changed avatar is a new URL.
    return Response(content, media_type=mime, headers={"Cache-Control": "private, max-age=31536000, immutable"})


@router.put("/avatar", response_model=ProfileOut)
async def upload_avatar(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read(svc.AVATAR_MAX_BYTES + 1)
    def save() -> dict:  # decoding the image and saving it block: keep them off the event loop
        svc.set_avatar(db, content)
        return svc.profile_out(db)

    return await run_in_threadpool(save)


@router.delete("/avatar", response_model=ProfileOut)
def delete_avatar(db: Session = Depends(get_db)):
    svc.clear_avatar(db)
    return svc.profile_out(db)


@router.post("/incomes", response_model=IncomeSourceOut, status_code=201)
def add_income(data: IncomeSourceIn, db: Session = Depends(get_db)):
    return svc.source_out(svc.create_source(db, data.model_dump()))


@router.patch("/incomes/{source_id}", response_model=IncomeSourceOut)
def edit_income(source_id: int, data: IncomeSourceUpdate, db: Session = Depends(get_db)):
    return svc.source_out(svc.update_source(db, source_id, data.model_dump(exclude_unset=True)))


@router.delete("/incomes/{source_id}", status_code=204)
def remove_income(source_id: int, db: Session = Depends(get_db)):
    svc.delete_source(db, source_id)
