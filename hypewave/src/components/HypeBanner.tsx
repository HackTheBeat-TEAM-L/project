"use client";

export function HypeBanner({ active }: { active: boolean }) {
  return (
    <div className={`hype-banner ${active ? "is-active" : ""}`} aria-live="assertive">
      <span className="hype-banner__text">HYPE!</span>
    </div>
  );
}
