import { useState, useEffect, useRef } from 'react';
import { subscribeToEventStatus } from '../api.js';

const MAX_LOG = 5;

export default function LiveEventStatus() {
  const [eventId,      setEventId]      = useState('');
  const [watchedId,    setWatchedId]    = useState(null);   // currently subscribed id
  const [seats,        setSeats]        = useState(null);
  const [connected,    setConnected]    = useState(false);
  const [log,          setLog]          = useState([]);      // [{ts, seats}]
  const esRef = useRef(null);

  // Clean up whenever watchedId changes or component unmounts
  useEffect(() => {
    if (!watchedId) return;

    setSeats(null);
    setConnected(false);
    setLog([]);

    const es = subscribeToEventStatus(
      watchedId,
      (data) => {
        if (data.error) return;
        setConnected(true);
        setSeats(data.remaining_seats);
        setLog((prev) => [
          { ts: new Date().toLocaleTimeString(), seats: data.remaining_seats },
          ...prev,
        ].slice(0, MAX_LOG));
      },
      () => setConnected(false),
    );

    esRef.current = es;

    return () => {
      es.close();
      esRef.current = null;
      setConnected(false);
    };
  }, [watchedId]);

  function handleWatch(e) {
    e.preventDefault();
    const id = eventId.trim();
    if (!id) return;
    // Setting a new watchedId triggers the effect cleanup + re-subscribe
    setWatchedId(id);
  }

  return (
    <div>
      <form onSubmit={handleWatch} style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Event ID"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          style={{ marginBottom: 0 }}
          required
        />
        <button type="submit">Watch</button>
      </form>

      {watchedId && (
        <>
          <span className={`status-badge ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '● Connected' : '○ Disconnected'}
          </span>

          <h3>Remaining seats</h3>
          <div className="seats-display">
            {seats === null ? '—' : seats}
          </div>

          {log.length > 0 && (
            <div className="update-log">
              <h3>Last {MAX_LOG} updates</h3>
              <ul>
                {log.map((entry, i) => (
                  <li key={i}>{entry.ts} — {entry.seats} seats remaining</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
