import type { TrackRef } from "./types";

// Self-managed dedupe history. Spec §8: exclude current + last N tracks.
export interface QueueState {
  recent: string[]; // played track ids, oldest -> newest
}

export function createQueueState(): QueueState {
  return { recent: [] };
}

export function isAllowed(
  state: QueueState,
  currentId: string | null,
  candidate: TrackRef,
  dedupeLastN: number
): boolean {
  if (currentId && candidate.id === currentId) return false;
  return !state.recent.slice(-dedupeLastN).includes(candidate.id);
}

export function markPlayed(
  state: QueueState,
  id: string,
  dedupeLastN: number
): QueueState {
  // keep a little more history than the dedupe window for safety
  const recent = [...state.recent, id].slice(-(dedupeLastN * 2 + 1));
  return { recent };
}
