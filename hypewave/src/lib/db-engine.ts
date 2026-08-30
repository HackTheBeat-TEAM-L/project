import type { HypeConfig } from "./config";

// Pure, deterministic decibel trigger engine.
// Baseline = rolling average of the previous window (excludes current sample).
// A trigger requires ALL of: warm-up elapsed, the spike (>= threshold over
// baseline) held continuously for at least sustainMs, and no active cooldown.
// The sustain requirement debounces transient spikes (a cough, a sudden loud
// moment) so only a held crowd roar fires HYPE.
export interface DbSample {
  t: number; // epoch ms
  db: number;
}

export interface TriggerState {
  samples: DbSample[];
  lastTriggerAt: number | null;
  firstSampleAt: number | null;
  spikeSince: number | null; // when the current above-threshold run began
}

export interface DbEngineResult {
  state: TriggerState;
  baseline: number | null;
  triggered: boolean;
  inCooldown: boolean;
  warmedUp: boolean;
  sustaining: boolean; // over threshold but not yet held long enough
}

export function createTriggerState(): TriggerState {
  return { samples: [], lastTriggerAt: null, firstSampleAt: null, spikeSince: null };
}

export function rollingAverage(samples: DbSample[]): number | null {
  if (samples.length === 0) return null;
  return samples.reduce((sum, s) => sum + s.db, 0) / samples.length;
}

export function pushSample(
  prev: TriggerState,
  sample: DbSample,
  config: HypeConfig
): DbEngineResult {
  const windowMs = config.rollingWindowSec * 1000;
  const cutoff = sample.t - windowMs;

  const windowSamples = prev.samples.filter((s) => s.t >= cutoff && s.t < sample.t);
  const baseline = rollingAverage(windowSamples);

  const firstSampleAt = prev.firstSampleAt ?? sample.t;
  const warmedUp = sample.t - firstSampleAt >= config.warmupSec * 1000;

  const cooldownMs = config.cooldownSec * 1000;
  const inCooldown =
    prev.lastTriggerAt !== null && sample.t - prev.lastTriggerAt < cooldownMs;

  const spike =
    baseline !== null && sample.db - baseline >= config.spikeThresholdDb;

  // Track the continuous above-threshold run; reset the moment it drops.
  const spikeSince = spike ? prev.spikeSince ?? sample.t : null;
  const held =
    spike && spikeSince !== null && sample.t - spikeSince >= config.sustainMs;
  const sustaining = spike && !held;

  const triggered = held && !inCooldown && warmedUp;

  const nextState: TriggerState = {
    samples: [...windowSamples, sample],
    lastTriggerAt: triggered ? sample.t : prev.lastTriggerAt,
    firstSampleAt,
    // reset the run after firing so the same continuous roar re-arms cleanly
    spikeSince: triggered ? null : spikeSince,
  };

  return { state: nextState, baseline, triggered, inCooldown, warmedUp, sustaining };
}
