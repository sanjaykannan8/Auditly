"""
MAP endpoints for the compliance officer view.

MAPs are stored inside agent_outputs.maps[] in MongoDB Atlas.
Status changes are persisted as $set updates on the embedded map document.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query
from fastapi import Depends
from pydantic import BaseModel

from api.deps import require_admin
from api.ws import manager
from db.mongo import get_db
from db.postgres import get_pool

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/maps", tags=["maps"])

VALID_TABS = {"needs_attention", "in_progress", "completed"}

_TAB_STATUSES: dict[str, list[str]] = {
    "needs_attention": ["pending", "overdue", "rejected"],
    "in_progress":     ["in_progress", "submitted"],
    "completed":       ["approved"],
}


@router.get("")
async def list_maps(
    tab: str = Query("needs_attention"),
    department_id: str | None = Query(None),
    page: int = 1,
    limit: int = 20,
    user: dict = Depends(require_admin),
) -> dict:
    if tab not in VALID_TABS:
        raise HTTPException(400, f"tab must be one of {VALID_TABS}")

    db = get_db()
    statuses = _TAB_STATUSES[tab]
    today = datetime.now(timezone.utc).date().isoformat()

    map_match: dict = {"maps.status": {"$in": statuses}}
    if department_id:
        map_match["maps.department_id"] = department_id

    pipeline = [
        {"$match": {"org_id": user["org_id"]}},
        {"$unwind": "$maps"},
        {"$match": map_match},
        {"$sort": {"maps.deadline": 1}},
        {"$skip": (page - 1) * limit},
        {"$limit": limit},
        {"$project": {
            "regulation_id": 1,
            "direction_id": 1,
            "title": 1,
            "map": "$maps",
        }},
    ]

    items = []
    _cur = await db["agent_outputs"].aggregate(pipeline)
    async for doc in _cur:
        m = doc["map"]
        overdue = (
            m.get("status") not in ("approved", "rejected")
            and m.get("deadline")
            and m["deadline"] < today
        )
        if overdue and m.get("status") != "overdue":
            m["status"] = "overdue"

        items.append({
            "regulation_id": doc["regulation_id"],
            "regulation_title": doc["title"],
            "direction_id": doc["direction_id"],
            "map_code": m["id"],
            "title": m["title"],
            "department": m["department"],
            "department_id": m.get("department_id"),
            "priority": m.get("priority"),
            "deadline": m.get("deadline"),
            "status": m.get("status"),
            "map_summary": m.get("map_summary", ""),
        })

    count_pipeline = [
        {"$match": {"org_id": user["org_id"]}},
        {"$unwind": "$maps"},
        {"$match": map_match},
        {"$count": "total"},
    ]
    _ccur = await db["agent_outputs"].aggregate(count_pipeline)
    count_result = await _ccur.to_list(1)
    total = count_result[0]["total"] if count_result else 0

    return {"items": items, "total": total, "page": page, "limit": limit}


@router.get("/{regulation_id}/{map_code}")
async def get_map(
    regulation_id: str,
    map_code: str,
    user: dict = Depends(require_admin),
) -> dict:
    db = get_db()
    doc = await db["agent_outputs"].find_one(
        {"regulation_id": regulation_id, "org_id": user["org_id"]},
        {"maps": 1, "title": 1, "direction_id": 1, "overall_summary": 1, "pdf_url": 1},
    )
    if not doc:
        raise HTTPException(404, "Regulation not found")

    the_map = next((m for m in doc.get("maps", []) if m["id"] == map_code), None)
    if not the_map:
        raise HTTPException(404, "MAP not found")

    latest_submission = await db["map_submissions"].find_one(
        {"regulation_id": regulation_id, "map_code": map_code, "org_id": user["org_id"]},
        sort=[("submitted_at", -1)],
    )
    if latest_submission:
        latest_submission["_id"] = str(latest_submission["_id"])

    return {
        "regulation_id": regulation_id,
        "regulation_title": doc["title"],
        "direction_id": doc["direction_id"],
        "pdf_url": doc.get("pdf_url"),
        "map": the_map,
        "latest_submission": latest_submission,
    }


class StatusUpdate(BaseModel):
    status: str


@router.patch("/{regulation_id}/{map_code}/status")
async def update_map_status(
    regulation_id: str,
    map_code: str,
    body: StatusUpdate,
    user: dict = Depends(require_admin),
) -> dict:
    valid = {"pending", "in_progress", "submitted", "approved", "rejected", "overdue"}
    if body.status not in valid:
        raise HTTPException(400, f"Invalid status. Must be one of {valid}")

    db = get_db()
    result = await db["agent_outputs"].update_one(
        {
            "regulation_id": regulation_id,
            "org_id": user["org_id"],
            "maps.id": map_code,
        },
        {"$set": {"maps.$.status": body.status}},
    )
    if result.matched_count == 0:
        raise HTTPException(404, "MAP not found")

    return {"updated": True, "status": body.status}


@router.post("/{regulation_id}/{map_code}/remind")
async def remind_dept_head(
    regulation_id: str,
    map_code: str,
    user: dict = Depends(require_admin),
) -> dict:
    db = get_db()
    doc = await db["agent_outputs"].find_one(
        {"regulation_id": regulation_id, "org_id": user["org_id"]},
        {"maps": 1, "title": 1},
    )
    if not doc:
        raise HTTPException(404, "Regulation not found")

    the_map = next((m for m in doc.get("maps", []) if m["id"] == map_code), None)
    if not the_map:
        raise HTTPException(404, "MAP not found")

    await manager.broadcast(
        user["org_id"],
        {
            "type": "map.reminder",
            "map_code": map_code,
            "title": the_map["title"],
            "department": the_map["department"],
        },
    )
    return {"sent": True}


class ReviewBody(BaseModel):
    decision: str   # 'approved' | 'rejected'
    note: str = ""


@router.patch("/submissions/{submission_id}/review")
async def review_submission(
    submission_id: str,
    body: ReviewBody,
    user: dict = Depends(require_admin),
) -> dict:
    if body.decision not in ("approved", "rejected"):
        raise HTTPException(400, "decision must be 'approved' or 'rejected'")

    db = get_db()
    pool = await get_pool()

    result = await db["map_submissions"].find_one_and_update(
        {"_id": ObjectId(submission_id), "org_id": user["org_id"]},
        {"$set": {
            "review_status": body.decision,
            "reviewed_by": user["user_id"],
            "reviewed_at": datetime.now(timezone.utc),
            "review_note": body.note,
        }},
        return_document=True,
    )
    if not result:
        raise HTTPException(404, "Submission not found")

    # Update MAP status to match decision
    await db["agent_outputs"].update_one(
        {
            "regulation_id": result["regulation_id"],
            "org_id": user["org_id"],
            "maps.id": result["map_code"],
        },
        {"$set": {"maps.$.status": body.decision}},
    )

    # Audit log
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO audit_log (org_id, actor_id, actor_role, entity_type, entity_id, action, details)
            VALUES ($1, $2, $3, 'map', $4, $5, $6::jsonb)
            """,
            user["org_id"], user["user_id"], user["role"],
            result["map_code"], f"map.{body.decision}",
            json.dumps({"submission_id": submission_id, "note": body.note}),
        )

    # Notify submitter via WebSocket
    await manager.broadcast(
        user["org_id"],
        {
            "type": "submission.reviewed",
            "map_code": result["map_code"],
            "decision": body.decision,
            "reference_number": result.get("reference_number"),
        },
    )

    return {"updated": True, "decision": body.decision}
