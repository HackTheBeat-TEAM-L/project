"use client";
import type { EventKind, EventLogEntry } from "@/lib/types";

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString("ko-KR", { hour12: false });
}

const KIND_KO: Record<EventKind, string> = {
  info: "정보",
  trigger: "트리거",
  llm: "LLM",
  search: "검색",
  queue: "큐",
  play: "재생",
  error: "오류",
};

export function EventLog({ events }: { events: EventLogEntry[] }) {
  return (
    <section className="event-log" aria-label="이벤트 로그">
      <h2 className="event-log__title">이벤트 로그</h2>
      <ol className="event-log__list">
        {events.length === 0 && <li className="event-log__empty">동작 대기 중…</li>}
        {events.map((e, i) => (
          <li key={`${e.ts}-${i}`} className={`event-log__item event-log__item--${e.kind}`}>
            <span className="event-log__time">{time(e.ts)}</span>
            <span className="event-log__kind">{KIND_KO[e.kind]}</span>
            <span className="event-log__msg">{e.message}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
