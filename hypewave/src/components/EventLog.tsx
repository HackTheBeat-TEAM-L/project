"use client";
import type { EventLogEntry } from "@/lib/types";

function time(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false });
}

export function EventLog({ events }: { events: EventLogEntry[] }) {
  return (
    <section className="event-log" aria-label="Event log">
      <h2 className="event-log__title">EVENT LOG</h2>
      <ol className="event-log__list">
        {events.length === 0 && <li className="event-log__empty">Waiting for action…</li>}
        {events.map((e, i) => (
          <li key={`${e.ts}-${i}`} className={`event-log__item event-log__item--${e.kind}`}>
            <span className="event-log__time">{time(e.ts)}</span>
            <span className="event-log__kind">{e.kind}</span>
            <span className="event-log__msg">{e.message}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
