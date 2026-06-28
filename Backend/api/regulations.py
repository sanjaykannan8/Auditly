"""
Regulations endpoints — list + detail, combining PostgreSQL tracking + MongoDB agent output.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timezone

import pika
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi import Depends
from pydantic import BaseModel

from api.deps import get_current_user, require_admin
from db.mongo import get_db
from db.postgres import get_pool
from storage import UPLOAD_DIR, PUBLIC_BASE_URL

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/regulations", tags=["regulations"])

# RabbitMQ publish settings (same as publish_test.py)
_EXCHANGE    = "regulations"
_ROUTING_KEY = "regulation.rbi.new"


def _publish_to_queue(payload: dict) -> None:
    """Synchronously publish one message to the regulations exchange."""
    url = os.environ.get("CLOUDAMQP_URL")
    if not url:
        raise RuntimeError("CLOUDAMQP_URL is not set — cannot publish to queue")

    params = pika.URLParameters(url)
    params.socket_timeout = 10
    connection = pika.BlockingConnection(params)
    try:
        channel = connection.channel()
        channel.basic_publish(
            exchange=_EXCHANGE,
            routing_key=_ROUTING_KEY,
            body=json.dumps(payload),
            properties=pika.BasicProperties(
                delivery_mode=2,
                content_type="application/json",
                message_id=payload["direction_id"],
            ),
        )
        log.info("[upload] Published direction_id=%s to queue", payload["direction_id"])
    finally:
        connection.close()

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/regulations", tags=["regulations"])


@router.post("/upload", status_code=201)
async def upload_regulation(
    file: UploadFile = File(...),
    title: str = Form(...),
    direction_id: str = Form(None),
    user: dict = Depends(require_admin),
) -> dict:
    """
    Upload any regulator PDF directly from the compliance officer UI.

    Steps:
      1. Save the file to the local uploads/ directory (same store used by proof uploads).
      2. Insert a 'processing' row in regulations so the dashboard shows it immediately.
      3. Publish to the RabbitMQ queue — the running consumer picks it up and runs the
         full LangGraph pipeline, then fans the result back to all orgs via /internal/regulation-done.

    The consumer reads the pdf_url as a local file path (not an HTTP URL), exactly
    the same way publish_test.py works — it passes the path straight to MarkItDown.
    """
    # ── Validate file type ────────────────────────────────────────────────
    content_type = file.content_type or ""
    filename     = file.filename or "upload.pdf"
    if not (
        content_type == "application/pdf"
        or filename.lower().endswith(".pdf")
    ):
        raise HTTPException(400, "Only PDF files are accepted.")

    # ── Save to uploads/ ──────────────────────────────────────────────────
    raw  = await file.read()
    name = f"{uuid.uuid4().hex}.pdf"
    dest = UPLOAD_DIR / name
    dest.write_bytes(raw)

    # Public URL (for the UI to link to the original) and local path (for the consumer)
    public_url = f"{PUBLIC_BASE_URL}/uploads/{name}"
    local_path = str(dest)          # absolute path on the host — consumer reads this directly

    # ── Resolve direction_id ──────────────────────────────────────────────
    dir_id = (direction_id or "").strip() or f"UPLOAD-{uuid.uuid4().hex[:8].upper()}"

    # ── Insert regulation row (status = processing) ───────────────────────
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Upsert — if re-uploading the same direction_id, refresh the row
        reg_id = await conn.fetchval(
            """
            INSERT INTO regulations (org_id, direction_id, title, pdf_url, source, status)
            VALUES ($1, $2, $3, $4, 'upload', 'processing')
            ON CONFLICT (org_id, direction_id) DO UPDATE
                SET title   = EXCLUDED.title,
                    pdf_url = EXCLUDED.pdf_url,
                    status  = 'processing'
            RETURNING id
            """,
            user["org_id"], dir_id, title.strip(), public_url,
        )

    # ── Publish to queue ──────────────────────────────────────────────────
    payload = {
        "direction_id":   dir_id,
        "title":          title.strip(),
        "page_url":       None,
        "pdf_url":        local_path,          # local path — consumer reads directly
        "published_date": None,
        "scraped_at":     datetime.now(timezone.utc).isoformat(),
    }
    try:
        _publish_to_queue(payload)
    except Exception as exc:
        log.error("[upload] Failed to publish to queue: %s", exc)
        # Don't fail the HTTP request — the row is already in the DB.
        # The officer can re-upload to retry publishing.
        return {
            "regulation_id": str(reg_id),
            "direction_id":  dir_id,
            "pdf_url":       public_url,
            "warning":       f"Saved but could not publish to queue: {exc}",
        }

    log.info(
        "[upload] Uploaded regulation org=%s dir=%s file=%s",
        user["org_id"], dir_id, name,
    )
    return {
        "regulation_id": str(reg_id),
        "direction_id":  dir_id,
        "pdf_url":       public_url,
    }


@router.get("")
async def list_regulations(
    page: int = 1,
    limit: int = 20,
    user: dict = Depends(get_current_user),
) -> dict:
    pool = await get_pool()
    db = get_db()
    offset = (page - 1) * limit

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, direction_id, title, pdf_url, source, status, published_date, created_at
            FROM regulations
            WHERE org_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            """,
            user["org_id"], limit, offset,
        )
        total = await conn.fetchval(
            "SELECT COUNT(*) FROM regulations WHERE org_id = $1",
            user["org_id"],
        )

    reg_ids = [str(r["id"]) for r in rows]
    summaries: dict[str, dict] = {}
    if reg_ids:
        _cur = db["agent_outputs"].find(
            {"regulation_id": {"$in": reg_ids}},
            {"regulation_id": 1, "overall_summary": 1, "parsed": 1, "maps": 1},
        )
        async for doc in _cur:
            maps = doc.get("maps", [])
            summaries[doc["regulation_id"]] = {
                "overall_summary": doc.get("overall_summary", ""),
                "maps_count": len(maps),
                # Coverage confidence stages
                "parsed_ok": bool(doc.get("parsed")) or bool(doc.get("overall_summary")),
                "maps_generated": len(maps) > 0,
                "assigned": len(maps) > 0 and all(m.get("department_id") for m in maps),
            }

    items = []
    for r in rows:
        rid = str(r["id"])
        s = summaries.get(rid, {})
        items.append({
            "id": rid,
            "direction_id": r["direction_id"],
            "title": r["title"],
            "pdf_url": r["pdf_url"],
            "source": r["source"],
            "status": r["status"],
            "published_date": r["published_date"].isoformat() if r["published_date"] else None,
            "created_at": r["created_at"].isoformat(),
            "overall_summary": s.get("overall_summary", ""),
            "maps_count": s.get("maps_count", 0),
            "parsed_ok": s.get("parsed_ok", False),
            "maps_generated": s.get("maps_generated", False),
            "assigned": s.get("assigned", False),
        })

    # Org-wide summary (across all regulations, not just this page)
    _scur = await db["agent_outputs"].aggregate([
        {"$match": {"org_id": user["org_id"]}},
        {"$group": {
            "_id": None,
            "processed": {"$sum": 1},
            "total_maps": {"$sum": {"$size": {"$ifNull": ["$maps", []]}}},
            "parsed": {"$sum": {"$cond": [
                {"$gt": [{"$strLenCP": {"$ifNull": ["$overall_summary", ""]}}, 0]}, 1, 0
            ]}},
        }},
    ])
    srows = await _scur.to_list(1)
    sdoc = srows[0] if srows else {}
    summary = {
        "total_regulations": total,
        "processed": sdoc.get("processed", 0),
        "parsed": sdoc.get("parsed", 0),
        "total_maps": sdoc.get("total_maps", 0),
    }

    return {"items": items, "total": total, "summary": summary, "page": page, "limit": limit}


@router.get("/{regulation_id}")
async def get_regulation(
    regulation_id: str,
    user: dict = Depends(get_current_user),
) -> dict:
    pool = await get_pool()
    db = get_db()

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM regulations WHERE id = $1 AND org_id = $2",
            regulation_id, user["org_id"],
        )

    if not row:
        raise HTTPException(404, "Regulation not found")

    agent_doc = await db["agent_outputs"].find_one(
        {"regulation_id": regulation_id},
        {"markdown_text": 0},  # exclude large field
    )

    result = dict(row)
    result["id"] = str(result["id"])
    if result.get("published_date"):
        result["published_date"] = result["published_date"].isoformat()
    result["created_at"] = result["created_at"].isoformat()

    if agent_doc:
        agent_doc.pop("_id", None)
        result["agent_output"] = agent_doc

    return result
