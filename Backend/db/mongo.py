"""
Async MongoDB client (pymongo 4.9+ native AsyncMongoClient).

Usage:
    from db.mongo import get_db

    db = get_db()
    await db["agent_outputs"].insert_one(doc)
"""

from __future__ import annotations

import os
from typing import Optional

from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

_client: Optional[AsyncMongoClient] = None


def init_mongo() -> None:
    global _client
    url = os.environ["MONGODB_ATLAS_URL"]
    _client = AsyncMongoClient(url)


async def close_mongo() -> None:
    global _client
    if _client:
        await _client.aclose()
        _client = None


def get_db() -> AsyncDatabase:
    if _client is None:
        raise RuntimeError("MongoDB client not initialised. Call init_mongo() first.")
    return _client["auditly"]
