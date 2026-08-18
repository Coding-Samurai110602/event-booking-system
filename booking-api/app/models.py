from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class BookingRequest(BaseModel):
    # booking_id is optional: the client may supply one as an idempotency key;
    # if omitted the server generates a fresh UUID.
    booking_id: Optional[UUID] = None
    event_id: UUID
    user_id: str = Field(..., min_length=1)
    num_seats: int = Field(..., gt=0)


class BookingResponse(BaseModel):
    booking_id: UUID
    event_id: UUID
    user_id: str
    num_seats: int
    status: str
    reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AvailabilityResponse(BaseModel):
    event_id: UUID
    remaining_seats: int
