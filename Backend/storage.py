"""
Local file storage — replaces Cloudinary.

Files are written to UPLOAD_DIR with a uuid4-based filename and served back at
GET /uploads/<filename> via the StaticFiles mount in main.py.

Config (env):
  UPLOAD_DIR        default "uploads" (relative to the backend working dir)
  PUBLIC_BASE_URL   default "http://localhost:9000" — prefix for returned URLs
"""

from __future__ import annotations

import base64
import os
import re
import uuid
from pathlib import Path

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "uploads")).resolve()
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://localhost:9000").rstrip("/")

_DATA_URL_RE = re.compile(r"^data:([^;]+);base64,(.*)$", re.DOTALL)

_EXT_BY_MIME = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}


def save_data_url(data_url: str, filename_hint: str | None = None) -> str:
    """Decode a `data:<mime>;base64,...` URL, save it locally, return its public URL."""
    match = _DATA_URL_RE.match(data_url)
    if not match:
        raise ValueError("Not a valid data: URL")
    mime, b64 = match.group(1), match.group(2)
    raw = base64.b64decode(b64)

    ext = Path(filename_hint).suffix if filename_hint else _EXT_BY_MIME.get(mime, "")
    name = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / name).write_bytes(raw)
    return f"{PUBLIC_BASE_URL}/uploads/{name}"
