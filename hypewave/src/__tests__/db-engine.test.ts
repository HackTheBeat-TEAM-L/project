import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../lib/config";
import { createTriggerState, pushSample, rollingAverage, type TriggerState } from "../lib/db-engine";

const cfg = {
  ...DEFAULT_CONFIG,
  rollingWindowSec: 10,
  spikeThresholdDb: 10,
  warmupSec: 10,
  sustainMs: 1000,
  cooldownSec: 30,
};

function feed(state: TriggerState, db: number, fromT: number, toT: number, stepMs = 100): TriggerState {
  for (let t = fromT; t <= toT; t += stepMs) state = pushSample(state, { t, db }, cfg).state;
  return state;
}

describe("db-engine baseline", () => {
  it("computes rolling average of samples", () => {
    expect(rollingAverage([])).toBeNull();
    expect(rollingAverage([{ t: 0, db: 40 }, { t: 1, db: 60 }])).toBe(50);
  });

  it("has no baseline on the very first sample", () => {
    const r = pushSample(createTriggerState(), { t: 0, db: 80 }, cfg);
    expect(r.baseline).toBeNull();
    expect(r.triggered).toBe(false);
  });

  it("prunes samples older than the rolling window", () => {
    let state = createTriggerState();
    state = pushSample(state, { t: 0, db: 50 }, cfg).state;
    const r = pushSample(state, { t: 20_000, db: 50 }, cfg);
    expect(r.baseline).toBeNull();
  });
});

describe("db-engine trigger (sustained spike)", () => {
  it("does NOT fire on a momentary spike (cough / sudden loud) under sustainMs", () => {
    let state = feed(createTriggerState(), 50, 0, 9900);
    let r = pushSample(state, { t: 10_000, db: 85 }, cfg);
    state = r.state;
    expect(r.triggered).toBe(false);
    r = pushSample(state, { t: 10_100, db: 85 }, cfg);
    state = r.state;
    expect(r.triggered).toBe(false);
    r = pushSample(state, { t: 10_300, db: 50 }, cfg);
    expect(r.triggered).toBe(false);
  });

  it("fires once a +10 spike is sustained past sustainMs", () => {
    let state = feed(createTriggerState(), 50, 0, 9900);
    let r = pushSample(state, { t: 10_000, db: 68 }, cfg);
    state = r.state;
    expect(r.triggered).toBe(false);
    for (let t = 10_100; t < 11_000; t += 100) {
      r = pushSample(state, { t, db: 68 }, cfg);
      state = r.state;
      expect(r.triggered).toBe(false);
    }
    const fire = pushSample(state, { t: 11_000, db: 68 }, cfg);
    expect(fire.triggered).toBe(true);
  });

  it("does not fire on a rise below the threshold even if sustained", () => {
    let state = feed(createTriggerState(), 50, 0, 9900);
    state = feed(state, 58, 10_000, 12_000);
    const r = pushSample(state, { t: 12_100, db: 58 }, cfg);
    expect(r.triggered).toBe(false);
  });

  it("respects the 30s cooldown after a sustained trigger", () => {
    let state = feed(createTriggerState(), 50, 0, 9900);
    let last = pushSample(state, { t: 10_000, db: 68 }, cfg);
    state = last.state;
    for (let t = 10_100; t <= 11_000; t += 100) {
      last = pushSample(state, { t, db: 68 }, cfg);
      state = last.state;
    }
    expect(last.triggered).toBe(true);
    let r = pushSample(state, { t: 15_000, db: 68 }, cfg);
    state = r.state;
    for (let t = 15_100; t <= 16_000; t += 100) {
      r = pushSample(state, { t, db: 68 }, cfg);
      state = r.state;
    }
    expect(r.inCooldown).toBe(true);
    expect(r.triggered).toBe(false);
  });
});

describe("db-engine warm-up", () => {
  it("does not trigger before the warm-up window has elapsed", () => {
    const state = feed(createTriggerState(), 50, 0, 4900);
    const held = feed(state, 85, 5000, 6600);
    const r = pushSample(held, { t: 6700, db: 85 }, cfg);
    expect(r.warmedUp).toBe(false);
    expect(r.triggered).toBe(false);
  });
});
