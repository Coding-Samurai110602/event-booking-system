import os
import ssl
from typing import Optional

import asyncpg

_pool: Optional[asyncpg.Pool] = None


def _ssl_context() -> ssl.SSLContext | None:
    """Return an SSL context when DB_SSL=true, None otherwise.

    DB_SSL=true   → require SSL (set in k8s Secret / ECS task env for RDS).
    DB_SSL unset  → no SSL (local Docker Compose / Minikube in-cluster Postgres).

    check_hostname and verify_mode are relaxed here to avoid bundling the RDS
    CA certificate in the image.  For production, create the context with
    ssl.create_default_context() and call load_verify_locations() with the
    RDS CA bundle instead.
    """
    if os.getenv("DB_SSL") != "true":
        return None
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=os.environ["DATABASE_URL"],
            min_size=2,
            max_size=10,
            ssl=_ssl_context(),  # None → no SSL; SSLContext → require SSL
        )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
