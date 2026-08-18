"""
Unit tests for booking-api idempotency.

Scope: verifies that POST /bookings with a pre-supplied booking_id:
  1. Enqueues and returns 202 when the booking is new.
  2. Returns the existing record WITHOUT re-enqueuing when the booking_id
     is already present in Postgres (ON CONFLICT path).

Real DB and Redis are never touched — both are replaced by thin async mocks.
"""

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_booking_row(booking_id: uuid.UUID, event_id: uuid.UUID) -> dict:
    now = datetime.now(timezone.utc)
    return {
        "booking_id": booking_id,
        "event_id":   event_id,
        "user_id":    "user-42",
        "num_seats":  2,
        "status":     "pending",
        "reason":     None,
        "created_at": now,
        "updated_at": now,
    }


class _MockAcquire:
    """Async context manager that yields a mock asyncpg connection."""
    def __init__(self, conn):
        self._conn = conn

    async def __aenter__(self):
        return self._conn

    async def __aexit__(self, *_):
        pass


def _build_pool(conn) -> MagicMock:
    pool = MagicMock()
    pool.acquire = MagicMock(return_value=_MockAcquire(conn))
    return pool


# ---------------------------------------------------------------------------
# Test 1: new booking — INSERT succeeds, job is enqueued
# ---------------------------------------------------------------------------

async def test_new_booking_enqueues_job():
    bid = uuid.uuid4()
    eid = uuid.uuid4()
    booking_row = _make_booking_row(bid, eid)

    mock_conn = AsyncMock()
    # fetchrow call order: (1) event check, (2) INSERT RETURNING → new row
    mock_conn.fetchrow = AsyncMock(side_effect=[
        {"id": eid},  # event EXISTS
        booking_row,  # INSERT succeeds
    ])

    enqueue_mock = AsyncMock()

    with patch("app.routes.bookings.get_pool", AsyncMock(return_value=_build_pool(mock_conn))), \
         patch("app.routes.bookings.enqueue_booking", enqueue_mock):

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/bookings", json={
                "booking_id": str(bid),
                "event_id":   str(eid),
                "user_id":    "user-42",
                "num_seats":  2,
            })

    assert resp.status_code == 202
    assert uuid.UUID(resp.json()["booking_id"]) == bid
    assert resp.json()["status"] == "pending"

    # Job must be pushed to Redis exactly once
    enqueue_mock.assert_called_once()
    payload = json.loads(enqueue_mock.call_args[0][0])
    assert payload["booking_id"] == str(bid)
    assert payload["event_id"]   == str(eid)
    assert payload["status"]     == "pending"


# ---------------------------------------------------------------------------
# Test 2: duplicate booking_id — INSERT conflicts, no second enqueue
# ---------------------------------------------------------------------------

async def test_duplicate_booking_id_not_reenqueued():
    bid = uuid.uuid4()
    eid = uuid.uuid4()
    existing_row = _make_booking_row(bid, eid)

    mock_conn = AsyncMock()
    # fetchrow call order:
    #   (1) event check → event found
    #   (2) INSERT ON CONFLICT → returns None  (conflict, row already exists)
    #   (3) SELECT existing → returns the existing booking
    mock_conn.fetchrow = AsyncMock(side_effect=[
        {"id": eid},  # event EXISTS
        None,         # INSERT conflict — booking_id already in DB
        existing_row, # SELECT the already-existing row
    ])

    enqueue_mock = AsyncMock()

    with patch("app.routes.bookings.get_pool", AsyncMock(return_value=_build_pool(mock_conn))), \
         patch("app.routes.bookings.enqueue_booking", enqueue_mock):

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/bookings", json={
                "booking_id": str(bid),
                "event_id":   str(eid),
                "user_id":    "user-42",
                "num_seats":  2,
            })

    assert resp.status_code == 202
    assert uuid.UUID(resp.json()["booking_id"]) == bid
    assert resp.json()["status"] == "pending"

    # The job must NOT be pushed to Redis a second time
    enqueue_mock.assert_not_called()


# ---------------------------------------------------------------------------
# Test 3: unknown event_id → 404, no enqueue
# ---------------------------------------------------------------------------

async def test_unknown_event_returns_404():
    bid = uuid.uuid4()
    eid = uuid.uuid4()

    mock_conn = AsyncMock()
    mock_conn.fetchrow = AsyncMock(return_value=None)  # event NOT found

    enqueue_mock = AsyncMock()

    with patch("app.routes.bookings.get_pool", AsyncMock(return_value=_build_pool(mock_conn))), \
         patch("app.routes.bookings.enqueue_booking", enqueue_mock):

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/bookings", json={
                "booking_id": str(bid),
                "event_id":   str(eid),
                "user_id":    "user-42",
                "num_seats":  2,
            })

    assert resp.status_code == 404
    enqueue_mock.assert_not_called()
