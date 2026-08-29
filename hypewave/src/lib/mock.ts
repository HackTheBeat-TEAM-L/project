import type { SongSuggestion, TrackRef } from "./types";
import type { SearchFn, GenreRecommendFn } from "./fallback";

// Synthetic dB sequence: flat baseline -> spike -> flat. Used by mock injection mode.
export function makeMockDbSequence(opts?: {
  baselineDb?: number;
  spikeDb?: number;
  flatCount?: number;
  spikeCount?: number;
}): number[] {
  const baselineDb = opts?.baselineDb ?? 50;
  const spikeDb = opts?.spikeDb ?? 65; // +15 over baseline -> exceeds +10 threshold
  const flatCount = opts?.flatCount ?? 60;
  const spikeCount = opts?.spikeCount ?? 8;
  const jitter = (base: number) => base + (Math.sin(base) % 1);
  return [
    ...Array.from({ length: flatCount }, () => jitter(baselineDb)),
    ...Array.from({ length: spikeCount }, () => jitter(spikeDb)),
    ...Array.from({ length: flatCount }, () => jitter(baselineDb)),
  ];
}

// Deterministic mock LLM: returns two suggestions.
export function makeMockLlm(
  pairs: SongSuggestion[] = [
    { title: "Levels", artist: "Avicii" },
    { title: "Titanium", artist: "David Guetta" },
  ]
): GenreRecommendFn {
  return async () => pairs;
}

// Mock Spotify Search. Any query listed in `missing` resolves to null (forces fallback).
export function makeMockSearch(missing: string[] = []): SearchFn {
  return async (query: string): Promise<TrackRef | null> => {
    const lc = query.toLowerCase();
    if (missing.some((m) => lc.includes(m.toLowerCase()))) return null;
    const id = "q_" + lc.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24);
    return {
      uri: `spotify:track:${id}`,
      id,
      title: query,
      artist: "Mock Artist",
    };
  };
}
