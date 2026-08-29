import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../lib/config";
import { createTriggerState, pushSample, rollingAverage } from "../lib/db-engine";

const cfg = { ...DEFAULT_CONFIG, rollingWindowSec: 10, spikeThresholdDb: 10, cooldownSec: 30 };

describe("db-engine", () => {
  it("computes rolling average of samples", () => {
    expect(rollingAverage([])).toBeNull();
    expect(rollingAverage([{ t: 0, db: 40 }, { t: 1, db: 60 }])).toBe(50);
  });

  it("does not trigger without a baseline (first sample)", () => {
    const s0 = createTriggerState();
    const r = pushSample(s0, { t: 0, db: 80 }, cfg);
    expect(r.baseline).toBeNull();
    expect(r.triggered).toBe(false);
  });

  it("triggers on a +10 spike over the previous-10s baseline", () => {
    let state = createTriggerState();
    // 10s of flat 50 dB, one sample per second
    for (let sec = 0; sec < 10; sec++) {
      state = pushSample(state, { t: sec * 1000, db: 50 }, cfg).state;
    }
    const spike = pushSample(state, { t: 10_000, db: 61 }, cfg); // +11 over 50
    expect(spike.baseline).toBeCloseTo(50, 5);
    expect(spike.triggered).toBe(true);
  });

  it("does NOT trigger on a +9 rise (below threshold)", () => {
    let state = createTriggerState();
    for (let sec = 0; sec < 10; sec++) {
      state = pushSample(state, { t: sec * 1000, db: 50 }, cfg).state;
    }
    const r = pushSample(state, { t: 10_000, db: 59 }, cfg); // +9
    expect(r.triggered).toBe(false);
  });

  it("respects the 30s cooldown after a trigger", () => {
    let state = createTriggerState();
    for (let sec = 0; sec < 10; sec++) {
      state = pushSample(state, { t: sec * 1000, db: 50 }, cfg).state;
    }
    const first = pushSample(state, { t: 10_000, db: 65 }, cfg);
    expect(first.triggered).toBe(true);
    state = first.state;
    // another spike 5s later -> still in cooldown
    const second = pushSample(state, { t: 15_000, db: 65 }, cfg);
    expect(second.inCooldown).toBe(true);
    expect(second.triggered).toBe(false);
    // spike after cooldown expires (31s later) -> triggers again
    // keep feeding baseline samples so the window has data
    for (let sec = 16; sec < 42; sec++) {
      state = pushSample(state, { t: sec * 1000, db: 50 }, cfg).state;
    }
    const third = pushSample(state, { t: 42_000, db: 65 }, cfg);
    expect(third.inCooldown).toBe(false);
    expect(third.triggered).toBe(true);
  });

  it("prunes samples older than the rolling window", () => {
    let state = createTriggerState();
    state = pushSample(state, { t: 0, db: 50 }, cfg).state;
    const r = pushSample(state, { t: 20_000, db: 50 }, cfg); // 20s later
    // old sample at t=0 is outside 10s window -> baseline null (no prior in-window sample)
    expect(r.baseline).toBeNull();
  });
});
