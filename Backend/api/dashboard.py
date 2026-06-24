"""
Dashboard endpoints — Today's Brief, priority actions, department heatmap.

All data is derived from DB queries — no LLM calls here.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi import Depends

from api.deps import require_admin
from db.mongo import get_db
from db.postgres import get_pool

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/brief")
async def get_brief(user: dict = Depends(require_admin)) -> dict:
    pool = await get_pool()
    db = get_db()
    today = datetime.now(timezone.utc).date()

    async with pool.acquire() as conn:
        new_today = await conn.fetchval(
            "SELECT COUNT(*) FROM regulations WHERE org_id = $1 AND created_at::date = $2",
            user["org_id"], today,
        )
        processing = await conn.fetchval(
            "SELECT COUNT(*) FROM regulations WHERE org_id = $1 AND status = 'processing'",
            user["org_id"],
        )

    # Overdue MAPs
    today_str = today.isoformat()
    _cur = await db["agent_outputs"].aggregate([
        {"$match": {"org_id": user["org_id"]}},
        {"$unwind": "$maps"},
        {"$match": {
            "maps.status": {"$nin": ["approved", "rejected"]},
            "maps.deadline": {"$lt": today_str, "$ne": None},
        }},
        {"$count": "total"},
    ])
    overdue_agg = await _cur.to_list(1)
    overdue_count = overdue_agg[0]["total"] if overdue_agg else 0

    # Lead with the most urgent fact first — overdue items, then what's new, then what's in flight.
    parts = []
    if overdue_count:
        parts.append(f"{overdue_count} action item{'s' if overdue_count != 1 else ''} past their deadline")
    if new_today:
        parts.append(f"{new_today} new regulation{'s' if new_today != 1 else ''} published today")
    if processing:
        parts.append(f"{processing} regulation{'s' if processing != 1 else ''} being reviewed by the AI")
    if not parts:
        parts.append("No critical actions pending today")

    text = ". ".join(parts) + "."

    return {
        "text": text,
        "overdue_count": overdue_count,
        "new_today": new_today,
        "processing_count": processing,
    }


@router.get("/priority-actions")
async def get_priority_actions(user: dict = Depends(require_admin)) -> list:
    db = get_db()
    today_str = datetime.now(timezone.utc).date().isoformat()

    pipeline = [
        {"$match": {"org_id": user["org_id"]}},
        {"$unwind": "$maps"},
        {"$match": {
            "maps.status": {"$in": ["pending", "in_progress", "submitted", "overdue", "rejected"]},
        }},
        {"$addFields": {
            "urgency": {
                "$switch": {
                    "branches": [
                        {"case": {"$eq": ["$maps.status", "overdue"]}, "then": 0},
                        {"case": {"$eq": ["$maps.priority", "HIGH"]}, "then": 1},
                        {"case": {"$eq": ["$maps.status", "submitted"]}, "then": 2},
                        {"case": {"$eq": ["$maps.priority", "MEDIUM"]}, "then": 3},
                    ],
                    "default": 4,
                }
            }
        }},
        {"$sort": {"urgency": 1, "maps.deadline": 1}},
        {"$limit": 5},
        {"$project": {
            "regulation_id": 1,
            "direction_id": 1,
            "map": "$maps",
            "urgency": 1,
        }},
    ]

    items = []
    _cur = await db["agent_outputs"].aggregate(pipeline)
    async for doc in _cur:
        m = doc["map"]
        items.append({
            "regulation_id": doc["regulation_id"],
            "direction_id": doc["direction_id"],
            "map_code": m["id"],
            "title": m["title"],
            "department": m["department"],
            "department_id": m.get("department_id"),
            "priority": m.get("priority"),
            "deadline": m.get("deadline"),
            "status": m.get("status"),
        })

    return items


@router.get("/department-heatmap")
async def get_department_heatmap(user: dict = Depends(require_admin)) -> list:
    pool = await get_pool()
    db = get_db()

    async with pool.acquire() as conn:
        dept_rows = await conn.fetch(
            "SELECT id, name FROM departments WHERE org_id = $1 ORDER BY name",
            user["org_id"],
        )

    pipeline = [
        {"$match": {"org_id": user["org_id"]}},
        {"$unwind": "$maps"},
        {"$group": {
            "_id": "$maps.department_id",
            "total": {"$sum": 1},
            "approved": {"$sum": {"$cond": [{"$eq": ["$maps.status", "approved"]}, 1, 0]}},
            "overdue": {"$sum": {"$cond": [{"$eq": ["$maps.status", "overdue"]}, 1, 0]}},
        }},
    ]
    stats: dict[str, dict] = {}
    _cur = await db["agent_outputs"].aggregate(pipeline)
    async for doc in _cur:
        if doc.get("_id"):
            t = doc["total"]
            stats[doc["_id"]] = {
                "completion_rate": round(doc["approved"] / t * 100) if t else 0,
                "overdue_count": doc["overdue"],
            }

    result = []
    for r in dept_rows:
        dept_id = str(r["id"])
        s = stats.get(dept_id, {})
        result.append({
            "dept_id": dept_id,
            "name": r["name"],
            "completion_rate": s.get("completion_rate", 0),
            "overdue_count": s.get("overdue_count", 0),
        })

    return result
