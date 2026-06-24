"""
FastAPI dependency functions.

Our own JWT gives us the user id (sub). Org + role come from PostgreSQL org_members.
"""

from __future__ import annotations

from fastapi import Depends, HTTPException, status

from db.postgres import get_pool
from services import verify_token


def get_auth_user(payload: dict = Depends(verify_token)) -> dict:
    """Just the authenticated user from the token — no org membership required.

    Used by auth/profile/onboarding endpoints that run before a user joins an org.
    """
    return {
        "user_id": payload["sub"],
        "username": payload.get("username"),
        "email": payload.get("email"),
    }


async def get_current_user(auth: dict = Depends(get_auth_user)) -> dict:
    """
    Authenticated user + their org and role. Raises 403 if onboarding isn't complete.
    """
    user_id = auth["user_id"]
    pool = await get_pool()

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT m.org_id, m.role, o.name AS org_name
            FROM org_members m
            JOIN organizations o ON o.id = m.org_id
            WHERE m.user_id = $1
            """,
            user_id,
        )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not part of any organization. Complete onboarding first.",
        )

    return {
        "user_id": user_id,
        "username": auth.get("username"),
        "email": auth.get("email"),
        "org_id": str(row["org_id"]),
        "role": row["role"],            # 'compliance_officer' | 'department_head'
        "org_name": row["org_name"],
    }


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "compliance_officer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires compliance officer role.",
        )
    return user


def require_head(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "department_head":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires department head role.",
        )
    return user
