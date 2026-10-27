"""Database work never runs on the event loop: one slow query there would stall every request."""

import asyncio
import io
import threading

from starlette.datastructures import Headers, UploadFile
from starlette.requests import Request

from app.api import deps, finance
from app.errors import ValidationFailed
from app.api import profile as profile_api
from app.services import csv_io
from app.services import profile as profile_service


def _record_thread(monkeypatch, module, name, seen):
    real = getattr(module, name)

    def wrapper(*args, **kwargs):
        seen[name] = threading.current_thread()
        return real(*args, **kwargs)

    monkeypatch.setattr(module, name, wrapper)


def _upload(name, content, mime):
    return UploadFile(io.BytesIO(content), filename=name, headers=Headers({"content-type": mime}))


def test_resolving_the_user_queries_off_the_loop(monkeypatch):
    seen = {}
    _record_thread(monkeypatch, deps, "first_user_id", seen)  # tests run with auth disabled
    request = Request({"type": "http", "method": "GET", "path": "/", "headers": []})
    assert asyncio.run(deps.require_user(request, authorization=None, session=None)) == 1
    assert seen["first_user_id"] is not threading.main_thread()  # asyncio.run's loop is the main thread


def test_uploads_are_processed_off_the_loop(db, monkeypatch):
    seen = {}
    _record_thread(monkeypatch, csv_io, "import_csv", seen)
    _record_thread(monkeypatch, profile_service, "set_avatar", seen)
    calls = [finance.import_transactions(_upload("a.csv", b"date,amount\n", "text/csv"), dry_run=True, db=db),
             profile_api.upload_avatar(_upload("a.png", b"not an image", "image/png"), db=db)]
    for call in calls:
        try:
            asyncio.run(call)
        except ValidationFailed:  # neither file is valid: only where the work ran matters here
            pass
    assert seen.keys() == {"import_csv", "set_avatar"}
    assert threading.main_thread() not in seen.values()
