-- Migration 001: events table
-- gen_random_uuid() is built-in from PostgreSQL 13+
CREATE TABLE IF NOT EXISTS events (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT        NOT NULL,
    total_seats     INTEGER     NOT NULL,
    remaining_seats INTEGER     NOT NULL,
    CONSTRAINT events_total_seats_positive    CHECK (total_seats     >  0),
    CONSTRAINT events_remaining_non_negative  CHECK (remaining_seats >= 0)
);
