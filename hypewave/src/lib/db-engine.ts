import type { HypeConfig } from "./config";

// Pure, deterministic decibel trigger engine.
// Baseline = rolling average of samples in the *previous* window (excludes current).
// A trigger requires: warm-up elapsed, a >= spikeThresholdDb rise over baseline,
// and no active cooldown.
export interface DbSample {
  t: number; // epoch ms
  db: number;
}

export interface TriggerState {
  samples: DbSample[];
  lastTriggerAt: number | null;
  firstSampleAt: number | null;
}

export interface DbEngineResult {
  state: TriggerState;
  baseline: number | null;
  triggered: boolean;
  inCooldown: boolean;
  warmedUp: boolean;
}

export function createTriggerState(): TriggerState {
  return { samples: [], lastTriggerAt: null, firstSampleAt: null };
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

  // previous-window samples (strictly before current), pruned to window
  const windowSamples = prev.samples.filter((s) => s.t >= cutoff && s.t < sample.t);
  const baseline = rollingAverage(windowSamples);

  // warm-up: ignore triggers until enough baseline history has accumulated,
  // so the very first seconds of a set can't false-fire on an unstable average.
  const firstSampleAt = prev.firstSampleAt ?? sample.t;
  const warmedUp = sample.t - firstSampleAt >= config.warmupSec * 1000;

  const cooldownMs = config.cooldownSec * 1000;
  const inCooldown =
    prev.lastTriggerAt !== null && sample.t - prev.lastTriggerAt < cooldownMs;

  const spike =
    baseline !== null && sample.db - baseline >= config.spikeThresholdDb;
  const triggered = spike && !inCooldown && warmedUp;

  const nextState: TriggerState = {
    samples: [...windowSamples, sample],
    lastTriggerAt: triggered ? sample.t : prev.lastTriggerAt,
    firstSampleAt,
  };

  return { state: nextState, baseline, triggered, inCooldown, warmedUp };
}
