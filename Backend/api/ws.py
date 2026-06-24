"""
WebSocket endpoint and in-process connection manager.

Connect: WS /ws/{user_id}?org_id=<uuid>&token=<access_jwt>

Org membership is verified against PostgreSQL (not JWT claims).
"""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from typing import DefaultDict, Set

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from db.postgres import get_pool
from services import decode_access_token

log = logging.getLogger(__name__)
router = APIRouter()


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: DefaultDict[str, Set[WebSocket]] = defaultdict(set)

    async def connect(self, ws: WebSocket, org_id: str) -> None:
        await ws.accept()
        self._connections[org_id].add(ws)
        log.info("[ws] connected  org=%s  total=%d", org_id, len(self._connections[org_id]))

    def disconnect(self, ws: WebSocket, org_id: str) -> None:
        self._connections[org_id].discard(ws)
        log.info("[ws] disconnected  org=%s  remaining=%d", org_id, len(self._connections[org_id]))

    async def broadcast(self, org_id: str, message: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self._connections.get(org_id, [])):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections[org_id].discard(ws)


manager = ConnectionManager()


@router.websocket("/ws/{user_id}")
async def websocket_endpoint(
    ws: WebSocket,
    user_id: str,
    org_id: str = Query(...),
    token: str = Query(...),
) -> None:
    # Verify our access token
    try:
        payload = decode_access_token(token)
        if payload.get("sub") != user_id:
            await ws.close(code=4001)
            return
    except Exception:
        await ws.close(code=4001)
        return

    # Verify org membership in our DB
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            member_org = await conn.fetchval(
                "SELECT org_id FROM org_members WHERE user_id = $1",
                user_id,
            )
        if not member_org or str(member_org) != org_id:
            await ws.close(code=4001)
            return
    except Exception:
        await ws.close(code=4001)
        return

    await manager.connect(ws, org_id)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws, org_id)
