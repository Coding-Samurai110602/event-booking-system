import type { Request, Response } from 'express';
import { getPool } from './db';
import logger from './logger';

const POLL_MS      = 2_000;   // how often to check Postgres for a changed seat count
const HEARTBEAT_MS = 15_000;  // SSE comment sent to keep the TCP connection alive through proxies

/**
 * GET /events/:event_id/live
 *
 * Opens a persistent Server-Sent Events stream.
 *
 * Protocol
 * --------
 * 1. Immediately sends a snapshot: `data: {"event_id":"…","remaining_seats":N}\n\n`
 * 2. Every 2 s polls Postgres; if remaining_seats changed since last push, sends another event.
 * 3. Every 15 s sends an SSE comment `": heartbeat"` — browsers ignore this, but it
 *    prevents upstream proxies from closing an idle connection.
 * 4. On client disconnect, both timers are cleared.
 *
 * Clients use the browser EventSource API or any SSE-aware HTTP client:
 *   const es = new EventSource('/events/<id>/live');
 *   es.onmessage = e => console.log(JSON.parse(e.data));
 */
export async function liveAvailability(req: Request, res: Response): Promise<void> {
  const { event_id } = req.params;

  // Required SSE response headers
  res.setHeader('Content-Type',    'text/event-stream');
  res.setHeader('Cache-Control',   'no-cache');
  res.setHeader('Connection',      'keep-alive');
  // Tells nginx / reverse proxies not to buffer the stream
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const pool = getPool();

  async function querySeats(): Promise<number | null> {
    const { rows } = await pool.query<{ remaining_seats: number }>(
      'SELECT remaining_seats FROM events WHERE id = $1',
      [event_id],
    );
    return rows.length > 0 ? rows[0].remaining_seats : null;
  }

  function sendEvent(payload: object): void {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  // ── Initial snapshot ─────────────────────────────────────────────────────
  let lastSeen: number;
  try {
    const seats = await querySeats();
    if (seats === null) {
      sendEvent({ error: 'event not found', event_id });
      res.end();
      return;
    }
    lastSeen = seats;
    sendEvent({ event_id, remaining_seats: lastSeen });
  } catch (err) {
    logger.error({ event_id, err: String(err) }, 'sse_initial_query_failed');
    res.end();
    return;
  }

  logger.info({ event_id }, 'sse_client_connected');

  // ── Polling loop ─────────────────────────────────────────────────────────
  // Only sends a new event when the seat count actually changes, so clients
  // receive a diff rather than a stream of identical snapshots.
  const pollTimer = setInterval(async () => {
    try {
      const current = await querySeats();
      if (current === null || current === lastSeen) return;
      lastSeen = current;
      sendEvent({ event_id, remaining_seats: current });
    } catch (err) {
      logger.error({ event_id, err: String(err) }, 'sse_poll_failed');
    }
  }, POLL_MS);

  // ── Heartbeat ────────────────────────────────────────────────────────────
  // SSE lines beginning with ':' are comments; EventSource ignores them but
  // the bytes keep the TCP connection alive across idle proxy timeouts.
  const heartbeatTimer = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, HEARTBEAT_MS);

  // ── Cleanup on disconnect ─────────────────────────────────────────────────
  req.on('close', () => {
    clearInterval(pollTimer);
    clearInterval(heartbeatTimer);
    logger.info({ event_id }, 'sse_client_disconnected');
  });
}
