import { useState } from 'react';
import { createBooking } from '../api.js';

export default function BookingForm() {
  const [eventId,   setEventId]   = useState('');
  const [userId,    setUserId]    = useState('');
  const [numSeats,  setNumSeats]  = useState(1);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);   // parsed JSON response
  const [error,     setError]     = useState(null);   // error message string

  function clearResult() {
    setResult(null);
    setError(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const data = await createBooking({
        event_id:  eventId.trim(),
        user_id:   userId.trim(),
        num_seats: Number(numSeats),
      });
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="bf-event-id">Event ID</label>
      <input
        id="bf-event-id"
        type="text"
        placeholder="UUID of the event"
        value={eventId}
        onChange={(e) => { setEventId(e.target.value); clearResult(); }}
        required
      />

      <label htmlFor="bf-user-id">User ID</label>
      <input
        id="bf-user-id"
        type="text"
        placeholder="e.g. user-42"
        value={userId}
        onChange={(e) => { setUserId(e.target.value); clearResult(); }}
        required
      />

      <label htmlFor="bf-seats">Number of seats</label>
      <input
        id="bf-seats"
        type="number"
        min="1"
        value={numSeats}
        onChange={(e) => { setNumSeats(e.target.value); clearResult(); }}
        required
      />

      <button type="submit" disabled={loading}>
        {loading && <span className="spinner" />}
        {loading ? 'Submitting…' : 'Book tickets'}
      </button>

      {error && (
        <div className="error-box">{error}</div>
      )}

      {result && (
        <pre>{JSON.stringify(result, null, 2)}</pre>
      )}
    </form>
  );
}
