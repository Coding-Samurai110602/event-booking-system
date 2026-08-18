-- Migration 002: bookings table
CREATE TABLE IF NOT EXISTS bookings (
    booking_id  UUID        PRIMARY KEY,
    event_id    UUID        NOT NULL REFERENCES events(id),
    user_id     TEXT        NOT NULL,
    num_seats   INTEGER     NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'pending',
    reason      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bookings_num_seats_positive CHECK (num_seats > 0),
    CONSTRAINT bookings_status_valid       CHECK (status IN ('pending', 'confirmed', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_bookings_event_id ON bookings (event_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings (status);
