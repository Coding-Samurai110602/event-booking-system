import { useState } from 'react';
import { getBooking } from '../api.js';

export default function BookingLookup() {
  const [bookingId, setBookingId] = useState('');
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [notFound,  setNotFound]  = useState(false);
  const [error,     setError]     = useState(null);

  async function handleLookup(e) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setNotFound(false);
    setError(null);

    try {
      const data = await getBooking(bookingId.trim());
      setResult(data);
    } catch (err) {
      if (err.status === 404) {
        setNotFound(true);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleLookup}>
      <label htmlFor="bl-booking-id">Booking ID</label>
      <input
        id="bl-booking-id"
        type="text"
        placeholder="UUID of the booking"
        value={bookingId}
        onChange={(e) => {
          setBookingId(e.target.value);
          setResult(null);
          setNotFound(false);
          setError(null);
        }}
        required
      />

      <button type="submit" disabled={loading}>
        {loading && <span className="spinner" />}
        {loading ? 'Looking up…' : 'Look up'}
      </button>

      {notFound && (
        <div className="error-box">Booking not found.</div>
      )}

      {error && (
        <div className="error-box">{error}</div>
      )}

      {result && (
        <pre>{JSON.stringify(result, null, 2)}</pre>
      )}
    </form>
  );
}
