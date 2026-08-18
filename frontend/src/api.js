const BOOKING_API_URL =
  import.meta.env.VITE_BOOKING_API_URL ?? 'http://localhost:8000';

const STATUS_SERVICE_URL =
  import.meta.env.VITE_STATUS_SERVICE_URL ?? 'http://localhost:3001';

/**
 * POST /bookings
 * Throws with a human-readable message on any non-2xx response.
 */
export async function createBooking({ event_id, user_id, num_seats }) {
  const res = await fetch(`${BOOKING_API_URL}/bookings`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ event_id, user_id, num_seats }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      data?.detail ?? data?.error ?? `HTTP ${res.status} ${res.statusText}`;
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }

  return data;
}

/**
 * GET /bookings/{booking_id}
 * Returns parsed JSON; throws on network error or non-2xx.
 */
export async function getBooking(booking_id) {
  const res = await fetch(`${BOOKING_API_URL}/bookings/${booking_id}`);

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(
      data?.detail ?? `HTTP ${res.status} ${res.statusText}`,
    );
    err.status = res.status;
    throw err;
  }

  return data;
}

/**
 * Opens an EventSource to /events/{event_id}/live.
 * Calls onMessage(parsedData) for each received event.
 * Calls onError() on connection failure.
 * Returns the EventSource instance so the caller can .close() it on unmount.
 */
export function subscribeToEventStatus(event_id, onMessage, onError) {
  const es = new EventSource(
    `${STATUS_SERVICE_URL}/events/${event_id}/live`,
  );

  es.onmessage = (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {
      // malformed frame — ignore
    }
  };

  es.onerror = () => onError();

  return es;
}
