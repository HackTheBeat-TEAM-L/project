"use client";
import type { TrackRef } from "@/lib/types";

interface Props {
  label: string;
  track: TrackRef | null;
  variant: "now" | "next";
}

export function TrackCard({ label, track, variant }: Props) {
  return (
    <article className={`track-card track-card--${variant}`}>
      <span className="track-card__label">{label}</span>
      {track ? (
        <>
          <h3 className="track-card__title">{track.title}</h3>
          <p className="track-card__artist">{track.artist}</p>
          <code className="track-card__uri">{track.uri}</code>
        </>
      ) : (
        <p className="track-card__empty">—</p>
      )}
    </article>
  );
}
