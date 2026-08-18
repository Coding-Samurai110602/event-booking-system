import uuid
import logging

from fastapi import APIRouter, HTTPException

from app.db import get_pool
from app.models import AvailabilityResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/events/{event_id}/availability", response_model=AvailabilityResponse)
async def get_availability(event_id: uuid.UUID):
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, remaining_seats FROM events WHERE id = $1",
            event_id,
        )
    if row is None:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
    return AvailabilityResponse(event_id=row["id"], remaining_seats=row["remaining_seats"])
