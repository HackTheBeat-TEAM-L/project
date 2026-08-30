// HYPEWAVE tunables — spec §3 requires +10 / 10s / 30s to be config, NOT hardcoded.
export interface HypeConfig {
  spikeThresholdDb: number; // dB rise over rolling baseline that triggers HYPE
  rollingWindowSec: number; // rolling-average window ("직전 5초")
  warmupSec: number; // no triggers until this many seconds of baseline have accumulated
  sustainMs: number; // dB must hold above the trigger line this long (debounce coughs/transients)
  cooldownSec: number; // ignore re-triggers for this long after a trigger
  recommendCount: number; // how many songs the LLM returns
  dedupeLastN: number; // current + last N tracks excluded from re-selection
  dbSampleIntervalMs: number; // mic sampling cadence
}

export const DEFAULT_CONFIG: HypeConfig = {
  spikeThresholdDb: 10,
  rollingWindowSec: 5,
  warmupSec: 5,
  sustainMs: 1000,
  cooldownSec: 30,
  recommendCount: 2,
  dedupeLastN: 5,
  dbSampleIntervalMs: 100,
};

export const SPOTIFY_SCOPES = [
  "streaming",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
] as const;
