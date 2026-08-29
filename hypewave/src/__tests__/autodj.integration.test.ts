import { describe, it, expect, vi } from "vitest";
import { AutoDjController } from "../lib/autodj";
import { DEFAULT_CONFIG } from "../lib/config";
import { makeMockSearch } from "../lib/mock";
import type { TrackRef } from "../lib/types";

describe("AutoDjController — full service loop (mock)", () => {
  it("start(): recommends -> resolves URI -> plays first track", async () => {
    const played: TrackRef[] = [];
    const c: AutoDjController = new AutoDjController({
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

  it("dB spike -> HYPE -> fallback (primary missing -> secondary) -> queue -> auto-play on end", async () => {
    let clock = 0;
    const played: TrackRef[] = [];
    const c: AutoDjController = new AutoDjController({
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
    for (let s = 0; s < 10; s++) {
      clock = s * 1000;
      c.onSample(50, clock);
    }
    clock = 10_000;
    c.onSample(65, clock); // +15 spike -> trigger

    await vi.waitFor(() => {
      expect(c.getSnapshot().nextTrack).not.toBeNull();
    });
    const next = c.getSnapshot().nextTrack!;
    expect(next.uri).toMatch(/^spotify:track:/);
    expect(next.title.toLowerCase()).toContain("second"); // secondary adopted

    await c.onTrackEnded();
    expect(played.length).toBeGreaterThanOrEqual(2);
    expect(played[played.length - 1].uri).toMatch(/^spotify:track:/);
  });

  it("cooldown: no re-trigger within 30s", async () => {
    let clock = 0;
    const c: AutoDjController = new AutoDjController({
      config: { ...DEFAULT_CONFIG },
      getCurrentTrack: () => c.getSnapshot().currentTrack,
      recommend: async () => [{ title: "X", artist: "Y" }],
      search: makeMockSearch(),
      play: async () => {},
      now: () => clock,
    });
    await c.start("pop");
    for (let s = 0; s < 10; s++) {
      clock = s * 1000;
      c.onSample(50, clock);
    }
    clock = 10_000;
    c.onSample(65, clock);
    const triggers1 = c.getSnapshot().events.filter((e) => e.kind === "trigger").length;
    clock = 15_000;
    c.onSample(65, clock); // still in cooldown
    const triggers2 = c.getSnapshot().events.filter((e) => e.kind === "trigger").length;
    expect(triggers1).toBe(1);
    expect(triggers2).toBe(1);
  });
});
