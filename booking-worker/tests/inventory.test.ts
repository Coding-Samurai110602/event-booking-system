/**
 * Unit tests for processJob inventory logic.
 *
 * The DB is fully mocked: each test controls exactly what the SELECT FOR UPDATE
 * query returns, letting us verify the confirm / reject branches and the
 * concurrent-booking scenario without a live Postgres instance.
 *
 * What these tests do NOT verify: that the database actually blocks concurrent
 * transactions at the row level — that guarantee comes from Postgres itself and
 * is validated by the integration tests in the Docker stack.  These tests verify
 * that the *application logic* correctly interprets whatever remaining_seats
 * value the DB returns after the lock is acquired.
 */

// Must be hoisted above imports so the mock is in place when worker.ts loads
jest.mock('../src/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { Pool } from 'pg';
import { processJob, BookingJob } from '../src/worker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockPool {
  pool:    Pool;
  queries: jest.Mock;
  release: jest.Mock;
}

/**
 * Build a mock pg.Pool whose single client returns `replies` in order,
 * one per query() call.  Defaults to an empty result set for any extra calls.
 */
function makePool(replies: Array<unknown>): MockPool {
  let i = 0;
  const queries = jest.fn().mockImplementation(() =>
    Promise.resolve(replies[i++] ?? { rows: [], rowCount: 0 }),
  );
  const release = jest.fn();
  const pool = {
    connect: jest.fn().mockResolvedValue({ query: queries, release }),
  } as unknown as Pool;
  return { pool, queries, release };
}

const EVENT_ID   = 'e0000000-0000-0000-0000-000000000001';
const BOOKING_ID = 'b0000000-0000-0000-0000-000000000001';

const BASE_JOB: BookingJob = {
  booking_id: BOOKING_ID,
  event_id:   EVENT_ID,
  user_id:    'user-1',
  num_seats:  2,
  status:     'pending',
  created_at: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processJob — inventory locking', () => {

  it('confirms booking and decrements remaining_seats when seats are available', async () => {
    const { pool, queries } = makePool([
      undefined,                              // BEGIN
      { rows: [{ remaining_seats: 10 }] },    // SELECT … FOR UPDATE
      { rowCount: 1 },                        // UPDATE events (decrement)
      { rowCount: 1 },                        // UPDATE bookings SET confirmed
      undefined,                              // COMMIT
    ]);

    await processJob(pool, { ...BASE_JOB, num_seats: 2 });

    const sql: string[] = queries.mock.calls.map((c) => c[0] as string);
    expect(sql.some((q) => q.includes('FOR UPDATE'))).toBe(true);
    expect(sql.some((q) => q.includes('remaining_seats - $1'))).toBe(true);
    expect(sql.some((q) => q.includes("'confirmed'"))).toBe(true);
    expect(sql.some((q) => q.includes('COMMIT'))).toBe(true);
    expect(sql.some((q) => q.includes("'rejected'"))).toBe(false);
  });

  it('rejects booking without touching inventory when remaining_seats < num_seats', async () => {
    const { pool, queries } = makePool([
      undefined,                             // BEGIN
      { rows: [{ remaining_seats: 1 }] },    // SELECT … FOR UPDATE (only 1 left)
      { rowCount: 1 },                       // UPDATE bookings SET rejected
      undefined,                             // COMMIT
    ]);

    await processJob(pool, { ...BASE_JOB, num_seats: 3 });

    const sql: string[] = queries.mock.calls.map((c) => c[0] as string);
    expect(sql.some((q) => q.includes("'rejected'"))).toBe(true);
    expect(sql.some((q) => q.includes("'confirmed'"))).toBe(false);
    // Inventory must NOT be decremented on a rejection
    expect(sql.some((q) => q.includes('remaining_seats - $1'))).toBe(false);
  });

  it('rejects booking when the event row is not found', async () => {
    const { pool, queries } = makePool([
      undefined,          // BEGIN
      { rows: [] },       // SELECT … FOR UPDATE — no matching event
      { rowCount: 1 },    // UPDATE bookings SET rejected
      undefined,          // COMMIT
    ]);

    await processJob(pool, BASE_JOB);

    const sql: string[] = queries.mock.calls.map((c) => c[0] as string);
    expect(sql.some((q) => q.includes("'rejected'"))).toBe(true);
    expect(sql.some((q) => q.includes("'confirmed'"))).toBe(false);
  });

  it('rolls back and re-throws on an unexpected DB error', async () => {
    const release = jest.fn();
    // Use SQL-aware implementation so both BEGIN and the ROLLBACK (in the
    // finally catch) get a resolved promise; only the SELECT FOR UPDATE throws.
    const queries = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) throw new Error('db exploded');
      return undefined; // BEGIN, ROLLBACK
    });

    const pool = {
      connect: jest.fn().mockResolvedValue({ query: queries, release }),
    } as unknown as Pool;

    await expect(processJob(pool, BASE_JOB)).rejects.toThrow('db exploded');

    const sql: string[] = queries.mock.calls.map((c) => c[0] as string);
    expect(sql.some((q) => q.includes('ROLLBACK'))).toBe(true);
    expect(release).toHaveBeenCalled();
  });

  it('only one of two concurrent workers succeeds for the last available seat', async () => {
    // Worker A acquires the lock first and sees 1 remaining seat
    const { pool: poolA, queries: queriesA } = makePool([
      undefined,
      { rows: [{ remaining_seats: 1 }] },   // sees 1 seat → will confirm
      { rowCount: 1 },
      { rowCount: 1 },
      undefined,
    ]);

    // Worker B acquires the lock after A commits; at that point remaining = 0.
    // SELECT FOR UPDATE returns the post-commit value, so B rejects.
    const { pool: poolB, queries: queriesB } = makePool([
      undefined,
      { rows: [{ remaining_seats: 0 }] },   // sees 0 seats → will reject
      { rowCount: 1 },
      undefined,
    ]);

    const job: BookingJob = { ...BASE_JOB, num_seats: 1 };
    await Promise.all([
      processJob(poolA, { ...job, booking_id: 'b-worker-a' }),
      processJob(poolB, { ...job, booking_id: 'b-worker-b' }),
    ]);

    const sqlA: string[] = queriesA.mock.calls.map((c) => c[0] as string);
    const sqlB: string[] = queriesB.mock.calls.map((c) => c[0] as string);

    // Exactly one confirmation, exactly one rejection
    expect(sqlA.some((q) => q.includes("'confirmed'"))).toBe(true);
    expect(sqlB.some((q) => q.includes("'rejected'"))).toBe(true);
  });
});
