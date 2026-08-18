import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from app.db import get_pool
from app.models import BookingRequest, BookingResponse
from app.redis_client import enqueue_booking

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/bookings", response_model=BookingResponse, status_code=status.HTTP_202_ACCEPTED)
async def create_booking(req: BookingRequest):
    booking_id = req.booking_id or uuid.uuid4()
    now = datetime.now(timezone.utc)

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Validate event exists
        event = await conn.fetchrow("SELECT id FROM events WHERE id = $1", req.event_id)
        if not event:
            raise HTTPException(status_code=404, detail=f"Event {req.event_id} not found")

        # Idempotent insert: ON CONFLICT DO NOTHING handles duplicate booking_id from concurrent
        # or retried requests — the PRIMARY KEY constraint is the enforcement point.
        row = await conn.fetchrow(
            """
            INSERT INTO bookings
                (booking_id, event_id, user_id, num_seats, status, created_at, updated_at)
            VALUES ($1, $2, $3, $4, 'pending', $5, $5)
            ON CONFLICT (booking_id) DO NOTHING
            RETURNING booking_id, event_id, user_id, num_seats, status, reason,
                      created_at, updated_at
            """,
            booking_id, req.event_id, req.user_id, req.num_seats, now,
        )

        if row is None:
            # booking_id already in Postgres — return existing record without re-queueing
            existing = await conn.fetchrow(
                """
                SELECT booking_id, event_id, user_id, num_seats, status, reason,
                       created_at, updated_at
                FROM bookings WHERE booking_id = $1
                """,
                booking_id,
            )
            logger.info("idempotent_request", extra={"booking_id": str(booking_id)})
            return BookingResponse(**dict(existing))

    # New booking: push to Redis queue for async processing
    payload = json.dumps({
        "booking_id": str(booking_id),
        "event_id":   str(req.event_id),
        "user_id":    req.user_id,
        "num_seats":  req.num_seats,
        "status":     "pending",
        "created_at": now.isoformat(),
    })

    try:
        await enqueue_booking(payload)
        logger.info("booking_queued", extra={
            "booking_id": str(booking_id),
            "event_id":   str(req.event_id),
        })
    except Exception as exc:
        logger.error("enqueue_failed", extra={
            "booking_id": str(booking_id),
            "error":      str(exc),
        })
        raise HTTPException(status_code=503, detail="Queue unavailable — retry shortly")

    return BookingResponse(**dict(row))


@router.get("/bookings/{booking_id}", response_model=BookingResponse)
async def get_booking(booking_id: uuid.UUID):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT booking_id, event_id, user_id, num_seats, status, reason,
                   created_at, updated_at
            FROM bookings WHERE booking_id = $1
            """,
            booking_id,
        )
    if row is None:
        raise HTTPException(status_code=404, detail=f"Booking {booking_id} not found")
    return BookingResponse(**dict(row))
