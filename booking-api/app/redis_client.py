import os
from typing import Optional

import redis.asyncio as aioredis

QUEUE_KEY = "bookings:queue"

_client: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _client
    if _client is None:
        _client = aioredis.from_url(
            os.environ["REDIS_URL"],
            decode_responses=True,
            socket_connect_timeout=3,
            socket_timeout=3,
        )
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


async def enqueue_booking(payload: str) -> None:
    client = await get_redis()
    await client.rpush(QUEUE_KEY, payload)
