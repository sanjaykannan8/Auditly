"""
Internal HTTP endpoints — called only by trusted internal services (the consumer).

All routes require X-Internal-Token header matching INTERNAL_SECRET env var.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel

from api.materialize import materialize_for_org
from api.ws import manager
from db.mongo import get_db
from db.postgres import get_pool

log = logging.getLogger(__name__)
router = APIRouter(prefix="/internal", tags=["internal"])

_INTERNAL_SECRET = os.environ.get("INTERNAL_SECRET", "")


def _check_internal_token(x_internal_token: str = Header(...)) -> None:
    if not _INTERNAL_SECRET or x_internal_token != _INTERNAL_SECRET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


# ---------------------------------------------------------------------------
# POST /internal/regulation-done
# ---------------------------------------------------------------------------

class RegulationDonePayload(BaseModel):
    direction_id: str
    title: str
    pdf_url: str | None = None
    source: str = "rbi"
    published_date: str | None = None
    overall_summary: str = ""
    parsed: dict = {}
    maps: list[dict] = []
    markdown_text: str = ""
    validation: dict = {}
    processing_time_s: float = 0.0


@router.post("/regulation-done", status_code=200)
async def regulation_done(
    payload: RegulationDonePayload,
    _: None = Depends(_check_internal_token),
) -> dict:
    """
    Called by the consumer after the LangGraph pipeline completes successfully.

    RBI directions apply to every bank, so we store ONE master copy of the agent
    output and then fan it out to every organization — each gets its own private
    working copy with department IDs resolved against its own departments.
    """
    pool = await get_pool()
    db = get_db()

    # 1. Store / refresh the master copy (source of truth, dept by name, raw steps)
    master: dict[str, Any] = {
        "direction_id": payload.direction_id,
        "title": payload.title,
        "pdf_url": payload.pdf_url,
        "source": payload.source,
        "published_date": payload.published_date,
        "markdown_text": payload.markdown_text,
        "parsed": payload.parsed,
        "maps": payload.maps,
        "overall_summary": payload.overall_summary,
        "validation": payload.validation,
        "processing_time_s": payload.processing_time_s,
        "created_at": datetime.now(timezone.utc),
    }
    await db["regulation_master"].update_one(
        {"direction_id": payload.direction_id},
        {"$set": master},
        upsert=True,
    )

    # 2. Fan out to every organization
    fanned: list[tuple[str, str]] = []
    async with pool.acquire() as conn:
        orgs = await conn.fetch("SELECT id FROM organizations")
        for o in orgs:
            org_id = str(o["id"])
            reg_id = await materialize_for_org(conn, db, org_id, master)
            fanned.append((org_id, reg_id))

    # 3. Notify each org's connected clients
    for org_id, reg_id in fanned:
        await manager.broadcast(
            org_id,
            {
                "type": "regulation.processed",
                "regulation_id": reg_id,
                "title": payload.title,
                "maps_count": len(payload.maps),
            },
        )

    log.info(
        "[internal] regulation-done  direction_id=%s  fanned to %d org(s)  maps=%d",
        payload.direction_id, len(fanned), len(payload.maps),
    )
    return {"orgs_updated": len(fanned), "direction_id": payload.direction_id}


# ---------------------------------------------------------------------------
# GET /internal/departments — global department registry for the agent prompt
# ---------------------------------------------------------------------------

@router.get("/departments")
async def internal_departments(_: None = Depends(_check_internal_token)) -> dict:
    """Union of all departments across every org (deduped by name).

    The MAP generator uses this so newly-added departments dynamically appear
    in the agent's taxonomy.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT name, MAX(objective) AS objective
            FROM departments
            GROUP BY name
            ORDER BY name
            """
        )
    return {"departments": [{"name": r["name"], "objective": r["objective"] or ""} for r in rows]}


# ---------------------------------------------------------------------------
# POST /internal/notify — generic WS broadcast (e.g. reminders)
# ---------------------------------------------------------------------------

class NotifyPayload(BaseModel):
    org_id: str
    event_type: str
    payload: dict = {}


@router.post("/notify", status_code=200)
async def notify(
    body: NotifyPayload,
    _: None = Depends(_check_internal_token),
) -> dict:
    await manager.broadcast(body.org_id, {"type": body.event_type, **body.payload})
    return {"ok": True}
