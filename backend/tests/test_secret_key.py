"""The generated key that signs session cookies: one per installation, never empty, and a
failure to keep it is reported instead of silently signing everyone out on the next restart."""

import logging
import os

import pytest

from app.config import get_settings
from app.services import auth as svc


@pytest.fixture
def key_file(tmp_path, monkeypatch):
    path = tmp_path / ".secret_key"
    monkeypatch.setattr(get_settings(), "secret_key", None)
    monkeypatch.setattr(svc, "_KEY_FILE", path)
    monkeypatch.setattr(svc, "_key_cache", None)
    return path


def _restart(monkeypatch):
    monkeypatch.setattr(svc, "_key_cache", None)


def test_generated_key_is_kept_private_and_reused(key_file, monkeypatch):
    key = svc._key()
    assert len(key) >= 32
    assert key_file.read_bytes() == key
    assert key_file.stat().st_mode & 0o777 == 0o600
    _restart(monkeypatch)
    assert svc._key() == key


def test_a_key_written_meanwhile_by_another_worker_wins(key_file, monkeypatch):
    theirs = b"b" * 64
    real_link = os.link

    def other_worker_was_faster(src, dst):
        key_file.write_bytes(theirs)
        raise FileExistsError(dst)

    monkeypatch.setattr(os, "link", other_worker_was_faster)
    assert svc._key() == theirs
    monkeypatch.setattr(os, "link", real_link)
    assert list(key_file.parent.iterdir()) == [key_file]  # no temporary file left behind


def test_an_empty_or_short_key_file_is_refused(key_file):
    key_file.write_bytes(b"  \n")
    with pytest.raises(RuntimeError, match="POS_SECRET_KEY"):
        svc._key()


def test_a_key_that_cannot_be_saved_is_reported(key_file, monkeypatch, caplog):
    key_file.parent.chmod(0o500)
    try:
        with caplog.at_level(logging.WARNING, logger="personal_os"):
            key = svc._key()
    finally:
        key_file.parent.chmod(0o700)
    assert len(key) >= 32
    assert "POS_SECRET_KEY" in caplog.text
