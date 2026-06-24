"""
Departments endpoints — list, assign heads, generate invitation tokens, send reminders.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import require_admin
from api.ws import manager
from db.mongo import get_db
from db.postgres import get_pool

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/departments", tags=["departments"])

INVITATION_SECRET = os.environ.get("INVITATION_SECRET", "change-me")
INVITATION_TTL_DAYS = 7


@router.get("")
async def list_departments(user: dict = Depends(require_admin)) -> list:
    pool = await get_pool()
    db = get_db()

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, name, objective, head_user_id, created_at FROM departments WHERE org_id = $1 ORDER BY name",
            uuid.UUID(user["org_id"]),
        )

    # MAP completion stats per dept from MongoDB
    stats_pipeline = [
        {"$match": {"org_id": user["org_id"]}},
        {"$unwind": "$maps"},
        {"$group": {
            "_id": "$maps.department_id",
            "total":    {"$sum": 1},
            "approved": {"$sum": {"$cond": [{"$eq": ["$maps.status", "approved"]}, 1, 0]}},
            "overdue":  {"$sum": {"$cond": [{"$eq": ["$maps.status", "overdue"]},  1, 0]}},
            "pending":  {"$sum": {"$cond": [{"$in": ["$maps.status", ["pending", "rejected"]]}, 1, 0]}},
        }},
    ]
    stats: dict[str, dict] = {}
    _cur = await db["agent_outputs"].aggregate(stats_pipeline)
    async for doc in _cur:
        did = doc.get("_id")
        if did:
            t = doc["total"]
            stats[did] = {
                "completion_rate": round(doc["approved"] / t * 100) if t else 0,
                "overdue_count":   doc["overdue"],
                "pending_count":   doc["pending"],
            }

    # Single most-urgent open MAP per department
    urgent_pipeline = [
        {"$match": {"org_id": user["org_id"]}},
        {"$unwind": "$maps"},
        {"$match": {"maps.status": {"$in": ["overdue", "rejected", "submitted", "pending", "in_progress"]}}},
        {"$addFields": {"urgency": {"$switch": {"branches": [
            {"case": {"$eq": ["$maps.status", "overdue"]},  "then": 0},
            {"case": {"$eq": ["$maps.status", "rejected"]}, "then": 1},
            {"case": {"$eq": ["$maps.priority", "HIGH"]},   "then": 2},
            {"case": {"$eq": ["$maps.status", "submitted"]},"then": 3},
        ], "default": 4}}}},
        {"$sort": {"maps.department_id": 1, "urgency": 1, "maps.deadline": 1}},
        {"$group": {"_id": "$maps.department_id", "map": {"$first": "$maps"}}},
    ]
    urgent: dict[str, dict] = {}
    _ucur = await db["agent_outputs"].aggregate(urgent_pipeline)
    async for doc in _ucur:
        did = doc.get("_id")
        m = doc.get("map") or {}
        if did:
            urgent[did] = {
                "title": m.get("title"),
                "status": m.get("status"),
                "deadline": m.get("deadline"),
            }

    result = []
    for r in rows:
        dept_id = str(r["id"])
        s = stats.get(dept_id, {})
        result.append({
            "id":              dept_id,
            "name":            r["name"],
            "objective":       r["objective"],
            "head_user_id":    r["head_user_id"],
            "completion_rate": s.get("completion_rate", 0),
            "overdue_count":   s.get("overdue_count", 0),
            "pending_count":   s.get("pending_count", 0),
            "urgent_item":     urgent.get(dept_id),
        })
    return result


# ---------------------------------------------------------------------------
# Create a new department (compliance officer action)
# ---------------------------------------------------------------------------

class CreateDepartmentPayload(BaseModel):
    name: str
    objective: str = ""


@router.post("", status_code=201)
async def create_department(
    body: CreateDepartmentPayload,
    user: dict = Depends(require_admin),
) -> dict:
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Department name is required")

    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO departments (org_id, name, objective)
            VALUES ($1, $2, $3)
            ON CONFLICT (org_id, name) DO NOTHING
            RETURNING id
            """,
            uuid.UUID(user["org_id"]), name, body.objective.strip(),
        )
        if not row:
            raise HTTPException(409, "A department with that name already exists")

        await conn.execute(
            """
            INSERT INTO audit_log (org_id, actor_id, actor_role, entity_type, entity_id, action, details)
            VALUES ($1, $2, $3, 'department', $4, 'department.created', $5::jsonb)
            """,
            uuid.UUID(user["org_id"]), user["user_id"], user["role"],
            str(row["id"]), json.dumps({"name": name}),
        )

    return {"id": str(row["id"]), "name": name, "objective": body.objective.strip()}


# ---------------------------------------------------------------------------
# Generate invitation token for a dept head (compliance officer action)
# ---------------------------------------------------------------------------

@router.post("/{dept_id}/generate-invite")
async def generate_invite(
    dept_id: str,
    user: dict = Depends(require_admin),
) -> dict:
    pool = await get_pool()

    async with pool.acquire() as conn:
        dept = await conn.fetchrow(
            "SELECT id, name FROM departments WHERE id = $1 AND org_id = $2",
            uuid.UUID(dept_id), uuid.UUID(user["org_id"]),
        )
    if not dept:
        raise HTTPException(404, "Department not found")

    jti = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=INVITATION_TTL_DAYS)

    token = pyjwt.encode(
        {
            "org_id":  user["org_id"],
            "dept_id": dept_id,
            "jti":     jti,
            "exp":     int(expires_at.timestamp()),
        },
        INVITATION_SECRET,
        algorithm="HS256",
    )

    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO org_invitations (org_id, dept_id, jti, expires_at) VALUES ($1, $2, $3, $4)",
            uuid.UUID(user["org_id"]), uuid.UUID(dept_id), jti, expires_at,
        )
        await conn.execute(
            """
            INSERT INTO audit_log (org_id, actor_id, actor_role, entity_type, entity_id, action, details)
            VALUES ($1, $2, $3, 'department', $4, 'department.invited', $5::jsonb)
            """,
            uuid.UUID(user["org_id"]), user["user_id"], user["role"],
            dept_id, json.dumps({"department": dept["name"]}),
        )

    return {
        "token": token,
        "dept_name": dept["name"],
        "expires_at": expires_at.isoformat(),
        "instructions": f"Send this token to your {dept['name']} head. They paste it at /onboarding to join.",
    }


# ---------------------------------------------------------------------------
# Remind dept head via WebSocket
# ---------------------------------------------------------------------------

@router.post("/{dept_id}/remind")
async def remind_head(dept_id: str, user: dict = Depends(require_admin)) -> dict:
    pool = await get_pool()
    db = get_db()

    async with pool.acquire() as conn:
        dept = await conn.fetchrow(
            "SELECT name FROM departments WHERE id = $1 AND org_id = $2",
            uuid.UUID(dept_id), uuid.UUID(user["org_id"]),
        )
    if not dept:
        raise HTTPException(404, "Department not found")

    _cur = await db["agent_outputs"].aggregate([
        {"$match": {"org_id": user["org_id"]}},
        {"$unwind": "$maps"},
        {"$match": {"maps.department_id": dept_id, "maps.status": {"$in": ["pending", "in_progress", "overdue"]}}},
        {"$sort": {"maps.deadline": 1}},
        {"$limit": 1},
        {"$project": {"map": "$maps"}},
    ])
    agg = await _cur.to_list(1)

    title = agg[0]["map"]["title"] if agg else dept["name"]

    await manager.broadcast(
        user["org_id"],
        {"type": "map.reminder", "department_id": dept_id, "department_name": dept["name"], "title": title},
    )
    return {"sent": True}
