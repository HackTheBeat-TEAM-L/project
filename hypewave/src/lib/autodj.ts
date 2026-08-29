import { DEFAULT_CONFIG, type HypeConfig } from "./config";
import {
  createTriggerState,
  pushSample,
  type TriggerState,
} from "./db-engine";
import {
  createQueueState,
  isAllowed,
  markPlayed,
  type QueueState,
} from "./queue";
import { resolveNextTrack, type SearchFn } from "./fallback";
import type { EventLogEntry, EventKind, SongSuggestion, TrackRef } from "./types";

export interface AutoDjDeps {
  config?: HypeConfig;
  getCurrentTrack: () => TrackRef | null;
  recommend: (args: {
    title?: string;
    artist?: string;
    genre?: string;
    count: number;
  }) => Promise<SongSuggestion[]>;
  search: SearchFn;
  play: (track: TrackRef) => Promise<void>;
  now?: () => number;
}

export type AutoDjPhase = "idle" | "playing";

export interface AutoDjSnapshot {
  phase: AutoDjPhase;
  genre: string;
  currentDb: number | null;
  baseline: number | null;
  inCooldown: boolean;
  hype: boolean;
  currentTrack: TrackRef | null;
  nextTrack: TrackRef | null;
  events: EventLogEntry[];
}

const MAX_EVENTS = 60;

export class AutoDjController {
  private cfg: HypeConfig;
  private deps: AutoDjDeps;
  private trigger: TriggerState = createTriggerState();
  private queue: QueueState = createQueueState();
  private snap: AutoDjSnapshot;
  private listeners = new Set<(s: AutoDjSnapshot) => void>();
  private resolving = false;

  constructor(deps: AutoDjDeps) {
    this.deps = deps;
    this.cfg = deps.config ?? DEFAULT_CONFIG;
    this.snap = {
      phase: "idle",
      genre: "",
      currentDb: null,
      baseline: null,
      inCooldown: false,
      hype: false,
      currentTrack: null,
      nextTrack: null,
      events: [],
    };
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  getSnapshot(): AutoDjSnapshot {
    return this.snap;
  }

  subscribe(fn: (s: AutoDjSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<AutoDjSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) fn(this.snap);
  }

  private log(kind: EventKind, message: string): void {
    const entry: EventLogEntry = { ts: this.now(), kind, message };
    this.set({ events: [entry, ...this.snap.events].slice(0, MAX_EVENTS) });
  }

  private allowed(t: TrackRef): boolean {
    return isAllowed(this.queue, this.snap.currentTrack?.id ?? null, t, this.cfg.dedupeLastN);
  }

  /** Spec §1: genre keyword -> first track -> play. */
  async start(genre: string): Promise<void> {
    this.set({ genre, phase: "playing" });
    this.log("info", `Started with genre "${genre}"`);
    const suggestions = await this.safeRecommend({ genre, count: this.cfg.recommendCount });
    const result = await resolveNextTrack({
      suggestions,
      genre,
      search: this.deps.search,
      reRecommendByGenre: (g) => this.safeRecommend({ genre: g, count: this.cfg.recommendCount }),
      isAllowed: (t) => this.allowed(t),
    });
    if (!result.track) {
      this.log("error", `No playable first track for "${genre}"`);
      return;
    }
    await this.playTrack(result.track, "first track");
  }

  /** Spec §2-4: feed a dB sample; may trigger a HYPE. */
  onSample(db: number, t?: number): void {
    if (this.snap.phase !== "playing") {
      this.set({ currentDb: db });
      return;
    }
    const res = pushSample(this.trigger, { t: t ?? this.now(), db }, this.cfg);
    this.trigger = res.state;
    this.set({ currentDb: db, baseline: res.baseline, inCooldown: res.inCooldown });
    if (res.triggered) {
      this.log("trigger", `HYPE! ${db.toFixed(1)}dB vs baseline ${res.baseline?.toFixed(1)}dB`);
      this.set({ hype: true });
      setTimeout(() => this.set({ hype: false }), 2500);
      void this.selectNext("hype");
    }
  }

  /** Spec §5-7: read current track -> LLM 2 recs -> fallback chain -> set next track. */
  private async selectNext(reason: string): Promise<void> {
    if (this.resolving) return;
    this.resolving = true;
    try {
      const current = this.deps.getCurrentTrack() ?? this.snap.currentTrack;
      this.log("llm", `Requesting 2 similar songs (${reason}) for "${current?.title ?? this.snap.genre}"`);
      const suggestions = await this.safeRecommend({
        title: current?.title,
        artist: current?.artist,
        genre: this.snap.genre,
        count: this.cfg.recommendCount,
      });
      const result = await resolveNextTrack({
        suggestions,
        genre: this.snap.genre,
        search: this.deps.search,
        reRecommendByGenre: (g) => this.safeRecommend({ genre: g, count: this.cfg.recommendCount }),
        isAllowed: (t) => this.allowed(t),
      });
      if (result.track) {
        this.set({ nextTrack: result.track });
        this.log("queue", `Next up (${result.via}): ${result.track.title} — ${result.track.artist}`);
      } else {
        this.log("error", "Fallback chain produced no playable track");
      }
    } catch (err) {
      this.log("error", `selectNext failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.resolving = false;
    }
  }

  /** Spec §8: current track ended -> play the queued next (or derive one to avoid silence). */
  async onTrackEnded(): Promise<void> {
    if (this.snap.phase !== "playing") return;
    let next = this.snap.nextTrack;
    if (!next) {
      await this.selectNext("track-ended (no queue)");
      next = this.snap.nextTrack;
    }
    if (next) {
      await this.playTrack(next, "track ended");
      this.set({ nextTrack: null });
      void this.selectNext("prefetch"); // keep the queue warm
    }
  }

  private async playTrack(track: TrackRef, reason: string): Promise<void> {
    await this.deps.play(track);
    this.queue = markPlayed(this.queue, track.id, this.cfg.dedupeLastN);
    this.set({ currentTrack: track });
    this.log("play", `Playing (${reason}): ${track.title} — ${track.artist}`);
  }

  private async safeRecommend(args: {
    title?: string;
    artist?: string;
    genre?: string;
    count: number;
  }): Promise<SongSuggestion[]> {
    try {
      return await this.deps.recommend(args);
    } catch (err) {
      this.log("error", `LLM failed, using genre fallback: ${err instanceof Error ? err.message : ""}`);
      return [];
    }
  }
}
