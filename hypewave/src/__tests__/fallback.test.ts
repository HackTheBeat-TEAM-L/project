import { describe, it, expect } from "vitest";
import { resolveNextTrack } from "../lib/fallback";
import { makeMockSearch, makeMockLlm } from "../lib/mock";
import type { SongSuggestion } from "../lib/types";

const sugs: SongSuggestion[] = [
  { title: "First", artist: "A" },
  { title: "Second", artist: "B" },
];
const allowAll = () => true;

describe("fallback chain", () => {
  it("adopts the primary suggestion when found", async () => {
    const r = await resolveNextTrack({
      suggestions: sugs,
      genre: "house",
      search: makeMockSearch(),
      reRecommendByGenre: makeMockLlm(),
      isAllowed: allowAll,
    });
    expect(r.via).toBe("primary");
    expect(r.track?.uri).toMatch(/^spotify:track:/);
  });

  it("falls back to the secondary when the primary is missing", async () => {
    const r = await resolveNextTrack({
      suggestions: sugs,
      genre: "house",
      search: makeMockSearch(["First"]), // primary not found
      reRecommendByGenre: makeMockLlm(),
      isAllowed: allowAll,
    });
    expect(r.via).toBe("secondary");
    expect(r.track?.title).toBe("Second B");
  });

  it("falls back to genre re-recommend when both are missing", async () => {
    const r = await resolveNextTrack({
      suggestions: sugs,
      genre: "techno",
      search: makeMockSearch(["First", "Second"]),
      reRecommendByGenre: makeMockLlm([{ title: "Levels", artist: "Avicii" }]),
      isAllowed: allowAll,
    });
    expect(r.via).toBe("genre");
    expect(r.track).not.toBeNull();
  });

  it("never returns null while a valid candidate exists (guarantees next track)", async () => {
    const r = await resolveNextTrack({
      suggestions: sugs,
      genre: "pop",
      search: makeMockSearch(["First", "Second", "Levels"]),
      reRecommendByGenre: makeMockLlm([{ title: "Levels", artist: "Avicii" }]),
      isAllowed: allowAll,
    });
    // final genre-keyword search ("pop") still resolves in the mock
    expect(r.track?.uri).toMatch(/^spotify:track:/);
  });
});
