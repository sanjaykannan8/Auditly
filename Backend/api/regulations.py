"""
Regulations endpoints — list + detail, combining PostgreSQL tracking + MongoDB agent output.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from fastapi import Depends

from api.deps import get_current_user, require_admin
from db.mongo import get_db
from db.postgres import get_pool

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/regulations", tags=["regulations"])


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
