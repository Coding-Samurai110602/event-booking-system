import type { Pool } from 'pg';
import type { Redis } from 'ioredis';

import { DEAD_LETTER_KEY, QUEUE_KEY } from './redis';
import logger from './logger';

export interface BookingJob {
  booking_id: string;
  event_id:   string;
  user_id:    string;
  num_seats:  number;
  status:     string;
  created_at: string;
}

/**
 * Process a single booking job inside one Postgres transaction.
 *
 * The SELECT … FOR UPDATE acquires a row-level lock on the event row.
 * Any concurrent worker that tries to process a booking for the same event
 * will block at that line until this transaction commits or rolls back.
 * This makes the inventory check + decrement atomic, preventing two workers
 * from each seeing "seats available" and both confirming, which would overbook.
 */
export async function processJob(pool: Pool, job: BookingJob): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{ remaining_seats: number }>(
      'SELECT remaining_seats FROM events WHERE id = $1 FOR UPDATE',
      [job.event_id],
    );

    if (rows.length === 0) {
      await client.query(
        `UPDATE bookings
            SET status     = 'rejected',
                reason     = $1,
                updated_at = NOW()
          WHERE booking_id = $2`,
        ['event not found', job.booking_id],
      );
      await client.query('COMMIT');
      logger.warn({ booking_id: job.booking_id, event_id: job.event_id }, 'booking_rejected_event_missing');
      return;
    }

    const { remaining_seats } = rows[0];

    if (remaining_seats >= job.num_seats) {
      // Decrement inventory and mark confirmed — both changes land in the same commit
      await client.query(
        'UPDATE events SET remaining_seats = remaining_seats - $1 WHERE id = $2',
        [job.num_seats, job.event_id],
      );
      await client.query(
        `UPDATE bookings
            SET status     = 'confirmed',
                updated_at = NOW()
          WHERE booking_id = $1`,
        [job.booking_id],
      );
      await client.query('COMMIT');
      logger.info({ booking_id: job.booking_id, seats: job.num_seats }, 'booking_confirmed');
    } else {
      await client.query(
        `UPDATE bookings
            SET status     = 'rejected',
                reason     = $1,
                updated_at = NOW()
          WHERE booking_id = $2`,
        [
          `insufficient seats: requested ${job.num_seats}, available ${remaining_seats}`,
          job.booking_id,
        ],
      );
      await client.query('COMMIT');
      logger.info(
        { booking_id: job.booking_id, requested: job.num_seats, available: remaining_seats },
        'booking_rejected_insufficient_seats',
      );
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function runWorker(redis: Redis, pool: Pool): Promise<void> {
  logger.info('worker_started');

  for (;;) {
    let raw: [string, string] | null = null;

    try {
      // BLPOP blocks up to 5 s waiting for a job, then returns null.
      // This keeps the loop alive without burning CPU in a tight spin.
      raw = await redis.blpop(QUEUE_KEY, 5);
      if (!raw) continue;

      const [, payload] = raw;
      const job = JSON.parse(payload) as BookingJob;
      logger.info({ booking_id: job.booking_id }, 'job_dequeued');
      await processJob(pool, job);
    } catch (err) {
      logger.error({ err: String(err) }, 'job_error');

      if (raw !== null) {
        // Never silently drop a failed job — push to dead-letter so it can be
        // inspected and replayed rather than lost forever.
        await redis.rpush(DEAD_LETTER_KEY, raw[1]).catch((dlErr) =>
          logger.error({ err: String(dlErr) }, 'dead_letter_push_failed'),
        );
        const id = (() => {
          try { return (JSON.parse(raw[1]) as BookingJob).booking_id; }
          catch { return 'unknown'; }
        })();
        logger.warn({ booking_id: id }, 'job_dead_lettered');
      }
    }
  }
}
