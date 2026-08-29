import { describe, it, expect } from "vitest";
import { createQueueState, isAllowed, markPlayed } from "../lib/queue";
import type { TrackRef } from "../lib/types";

const t = (id: string): TrackRef => ({ uri: `spotify:track:${id}`, id, title: id, artist: "x" });

describe("queue dedupe", () => {
  it("rejects the currently playing track", () => {
    const s = createQueueState();
    expect(isAllowed(s, "cur", t("cur"), 5)).toBe(false);
    expect(isAllowed(s, "cur", t("other"), 5)).toBe(true);
  });

  it("rejects tracks played within the last N", () => {
    let s = createQueueState();
    s = markPlayed(s, "a", 3);
    s = markPlayed(s, "b", 3);
    s = markPlayed(s, "c", 3);
    expect(isAllowed(s, null, t("b"), 3)).toBe(false); // within last 3
    expect(isAllowed(s, null, t("z"), 3)).toBe(true);
  });

  it("allows a track that has aged out of the dedupe window", () => {
    let s = createQueueState();
    s = markPlayed(s, "old", 2);
    s = markPlayed(s, "p", 2);
    s = markPlayed(s, "q", 2);
    expect(isAllowed(s, null, t("old"), 2)).toBe(true); // aged out of last 2
  });
});
