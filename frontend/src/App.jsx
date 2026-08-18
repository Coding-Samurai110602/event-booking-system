import BookingForm       from './components/BookingForm.jsx';
import LiveEventStatus   from './components/LiveEventStatus.jsx';
import BookingLookup     from './components/BookingLookup.jsx';

export default function App() {
  return (
    <>
      <header className="site-header">
        <h1>Event Ticket Booking System</h1>
        <p>Demo UI — local testing only</p>
      </header>

      <section className="section">
        <h2>Create a Booking</h2>
        <BookingForm />
      </section>

      <section className="section">
        <h2>Watch Live Event Status</h2>
        <LiveEventStatus />
      </section>

      <section className="section">
        <h2>Look Up a Booking</h2>
        <BookingLookup />
      </section>
    </>
  );
}
