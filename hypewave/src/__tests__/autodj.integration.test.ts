import { describe, it, expect, vi } from "vitest";
import { AutoDjController } from "../lib/autodj";
import { DEFAULT_CONFIG } from "../lib/config";
import { makeMockSearch } from "../lib/mock";
import type { TrackRef } from "../lib/types";

// 10s of baseline @100ms then a sustained roar past sustainMs (fires HYPE).
function warmAndRoar(
  c: AutoDjController,
  setClock: (t: number) => void,
  baseDb = 50,
  roarDb = 68
): void {
  for (let t = 0; t <= 9900; t += 100) {
    setClock(t);
    c.onSample(baseDb, t);
  }
  for (let t = 10_000; t <= 11_000; t += 100) {
    setClock(t);
    c.onSample(roarDb, t);
  }
}

describe("AutoDjController — full service loop (mock)", () => {
  it("start(): recommends -> resolves URI -> plays first track", async () => {
    const played: TrackRef[] = [];
    const c = new AutoDjController({
      config: DEFAULT_CONFIG,
      getCurrentTrack: () => null,
      recommend: async () => [
        { title: "Levels", artist: "Avicii" },
        { title: "Titanium", artist: "David Guetta" },
      ],
      search: makeMockSearch(),
      play: async (t) => void played.push(t),
    });
    await c.start("house");
    expect(played).toHaveLength(1);
    expect(played[0].uri).toMatch(/^spotify:track:/);
    expect(c.getSnapshot().currentTrack).not.toBeNull();
    expect(c.getSnapshot().phase).toBe("playing");
  });

  it("sustained roar -> HYPE -> fallback (primary missing -> secondary) -> queue -> auto-play", async () => {
    let clock = 0;
    const played: TrackRef[] = [];
    const c = new AutoDjController({
      config: { ...DEFAULT_CONFIG },
      getCurrentTrack: () => c.getSnapshot().currentTrack,
      recommend: async (args) => {
        if (args.genre && !args.title) return [{ title: "Seed", artist: "Z" }];
        return [
          { title: "First", artist: "A" },
          { title: "Second", artist: "B" },
        ];
      },
      search: makeMockSearch(["First"]), // primary not found -> forces secondary
      play: async (t) => void played.push(t),
      now: () => clock,
    });

    await c.start("house");
    warmAndRoar(c, (t) => (clock = t));

    await vi.waitFor(() => {
      expect(c.getSnapshot().nextTrack).not.toBeNull();
    });
    const next = c.getSnapshot().nextTrack!;
    expect(next.uri).toMatch(/^spotify:track:/);
    expect(next.title.toLowerCase()).toContain("second");

    await c.onTrackEnded();
    expect(played.length).toBeGreaterThanOrEqual(2);
  });

  it("cooldown: no re-trigger within 30s of a sustained roar", async () => {
    let clock = 0;
    const c = new AutoDjController({
      config: { ...DEFAULT_CONFIG },
      getCurrentTrack: () => c.getSnapshot().currentTrack,
      recommend: async () => [{ title: "X", artist: "Y" }],
      search: makeMockSearch(),
      play: async () => {},
      now: () => clock,
    });
    await c.start("pop");
    for (let t = 0; t <= 9900; t += 100) {
      clock = t;
      c.onSample(50, t);
    }
    for (let t = 10_000; t <= 11_000; t += 100) {
      clock = t;
      c.onSample(68, t);
    }
    const triggers1 = c.getSnapshot().events.filter((e) => e.kind === "trigger").length;
    for (let t = 15_000; t <= 16_000; t += 100) {
      clock = t;
      c.onSample(68, t);
    }
    const triggers2 = c.getSnapshot().events.filter((e) => e.kind === "trigger").length;
    expect(triggers1).toBe(1);
    expect(triggers2).toBe(1);
  });

  it("excludes the current + queued tracks from the LLM request (no repeats)", async () => {
    const excludes: (string[] | undefined)[] = [];
    const c = new AutoDjController({
      config: DEFAULT_CONFIG,
      getCurrentTrack: () => c.getSnapshot().currentTrack,
      recommend: async (args) => {
        excludes.push(args.exclude);
        const n = excludes.length;
        return [
          { title: `Song ${n}`, artist: "Artist" },
          { title: `Alt ${n}`, artist: "Artist" },
        ];
      },
      search: makeMockSearch(),
      play: async () => {},
    });
    await c.start("house"); // recommend #1 (genre)
    await c.queueNext(); // recommend #2 -> must exclude the current track
    const last = excludes[excludes.length - 1];
    expect(Array.isArray(last)).toBe(true);
    expect((last ?? []).length).toBeGreaterThan(0);
  });
});
