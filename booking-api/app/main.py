import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.db import close_pool, get_pool
from app.logging_config import setup_logging
from app.redis_client import close_redis, get_redis
from app.routes import bookings, events

setup_logging(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("booking_api_starting")
    yield
    logger.info("booking_api_stopping")
    await close_pool()
    await close_redis()


app = FastAPI(title="Booking API", lifespan=lifespan)

# Permissive CORS for local dev/demo only — tighten allow_origins before any real deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bookings.router)
app.include_router(events.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/ready")
async def ready():
    failures: dict = {}

    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1", timeout=3.0)
    except Exception as exc:
        failures["postgres"] = str(exc)

    try:
        redis = await get_redis()
        await redis.ping()
    except Exception as exc:
        failures["redis"] = str(exc)

    if failures:
        return JSONResponse(
            status_code=503,
            content={"status": "not ready", "failures": failures},
        )
    return {"status": "ready"}
