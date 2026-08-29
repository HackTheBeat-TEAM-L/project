import type { SongSuggestion, TrackRef } from "./types";

// Spec §7 fallback chain: primary -> secondary -> genre re-recommend -> genre keyword.
// Guarantees the next track is never empty when any candidate resolves + is allowed.
export type SearchFn = (query: string) => Promise<TrackRef | null>;
export type GenreRecommendFn = (genre: string) => Promise<SongSuggestion[]>;

export type FallbackVia = "primary" | "secondary" | "genre" | "none";

export interface FallbackResult {
  track: TrackRef | null;
  via: FallbackVia;
  attempts: string[];
}

function toQuery(s: SongSuggestion): string {
  return `${s.title} ${s.artist}`.trim();
}

export async function resolveNextTrack(params: {
  suggestions: SongSuggestion[];
  genre: string;
  search: SearchFn;
  reRecommendByGenre: GenreRecommendFn;
  isAllowed: (t: TrackRef) => boolean;
}): Promise<FallbackResult> {
  const attempts: string[] = [];
  const { suggestions, genre, search, reRecommendByGenre, isAllowed } = params;
  const [primary, secondary] = suggestions;

  const tryQuery = async (
    label: string,
    query: string,
    via: FallbackVia
  ): Promise<FallbackResult | null> => {
    attempts.push(`${label}: ${query}`);
    const t = await search(query);
    if (t && isAllowed(t)) return { track: t, via, attempts };
    return null;
  };

  if (primary) {
    const r = await tryQuery("primary", toQuery(primary), "primary");
    if (r) return r;
  }
  if (secondary) {
    const r = await tryQuery("secondary", toQuery(secondary), "secondary");
    if (r) return r;
  }

  const genreSugs = await reRecommendByGenre(genre);
  for (const gs of genreSugs) {
    const r = await tryQuery("genre-rec", toQuery(gs), "genre");
    if (r) return r;
  }

  const last = await tryQuery("genre-keyword", genre, "genre");
  if (last) return last;

  return { track: null, via: "none", attempts };
}
