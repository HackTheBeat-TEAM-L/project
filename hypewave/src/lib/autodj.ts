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
import { resolveNextTrack, type FallbackVia, type SearchFn } from "./fallback";
import type { EventKind, EventLogEntry, SongSuggestion, TrackRef } from "./types";

interface RecommendArgs {
  title?: string;
  artist?: string;
  genre?: string;
  count: number;
  exclude?: string[];
}

export interface AutoDjDeps {
  config?: HypeConfig;
  getCurrentTrack: () => TrackRef | null;
  recommend: (args: RecommendArgs) => Promise<SongSuggestion[]>;
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
  warmedUp: boolean;
  hype: boolean;
  currentTrack: TrackRef | null;
  nextTrack: TrackRef | null;
  events: EventLogEntry[];
}

const MAX_EVENTS = 60;

const VIA_KO: Record<FallbackVia, string> = {
  primary: "1순위",
  secondary: "2순위",
  genre: "장르",
  none: "없음",
};

export class AutoDjController {
  private cfg: HypeConfig;
  private deps: AutoDjDeps;
  private trigger: TriggerState = createTriggerState();
  private queue: QueueState = createQueueState();
  private recent: TrackRef[] = []; // recently played tracks, newest first
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
      warmedUp: false,
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
    // never re-pick what is already queued as the next track...
    if (this.snap.nextTrack && t.id === this.snap.nextTrack.id) return false;
    // ...nor the current track or recently played ones (queue dedupe).
    return isAllowed(this.queue, this.snap.currentTrack?.id ?? null, t, this.cfg.dedupeLastN);
  }

  // "Title — Artist" list of tracks the LLM should avoid re-suggesting.
  private excludeList(current: TrackRef | null): string[] {
    const key = (t: TrackRef) => `${t.title} — ${t.artist}`;
    const refs = [current, this.snap.nextTrack, ...this.recent].filter(
      (t): t is TrackRef => Boolean(t)
    );
    return Array.from(new Set(refs.map(key)));
  }

  /** 스펙 §1: 장르 키워드 -> 첫 곡 -> 재생. */
  async start(genre: string): Promise<void> {
    this.set({ genre, phase: "playing" });
    this.log("info", `장르 "${genre}"(으)로 시작`);
    const suggestions = await this.safeRecommend({ genre, count: this.cfg.recommendCount });
    const result = await resolveNextTrack({
      suggestions,
      genre,
      search: this.deps.search,
      reRecommendByGenre: (g) => this.safeRecommend({ genre: g, count: this.cfg.recommendCount }),
      isAllowed: (t) => this.allowed(t),
    });
    if (!result.track) {
      this.log("error", `"${genre}"의 첫 곡을 찾지 못했습니다`);
      return;
    }
    await this.playTrack(result.track, "첫 곡");
  }

  /** 스펙 §2-4: dB 샘플 투입; HYPE 트리거 가능. */
  onSample(db: number, t?: number): void {
    if (this.snap.phase !== "playing") {
      this.set({ currentDb: db });
      return;
    }
    const res = pushSample(this.trigger, { t: t ?? this.now(), db }, this.cfg);
    this.trigger = res.state;
    this.set({ currentDb: db, baseline: res.baseline, inCooldown: res.inCooldown, warmedUp: res.warmedUp });
    if (res.triggered) {
      this.log("trigger", `HYPE! ${db.toFixed(1)}dB (기준선 ${res.baseline?.toFixed(1)}dB 대비)`);
      this.set({ hype: true });
      setTimeout(() => this.set({ hype: false }), 2500);
      void this.selectNext("HYPE");
    }
  }

  /** 스펙 §5-7: 현재 곡 파악 -> LLM 2곡(재생/큐 곡 제외) -> 폴백 체인 -> 다음 곡 확정. */
  private async selectNext(reason: string): Promise<void> {
    if (this.resolving) return;
    this.resolving = true;
    try {
      const current = this.deps.getCurrentTrack() ?? this.snap.currentTrack;
      const exclude = this.excludeList(current);
      this.log("llm", `유사곡 ${this.cfg.recommendCount}곡 요청 (${reason}) — "${current?.title ?? this.snap.genre}"`);
      const suggestions = await this.safeRecommend({
        title: current?.title,
        artist: current?.artist,
        genre: this.snap.genre,
        count: this.cfg.recommendCount,
        exclude,
      });
      const result = await resolveNextTrack({
        suggestions,
        genre: this.snap.genre,
        search: this.deps.search,
        reRecommendByGenre: (g) =>
          this.safeRecommend({ genre: g, count: this.cfg.recommendCount, exclude }),
        isAllowed: (t) => this.allowed(t),
      });
      if (result.track) {
        this.set({ nextTrack: result.track });
        this.log("queue", `다음 곡 (${VIA_KO[result.via]}): ${result.track.title} — ${result.track.artist}`);
      } else {
        this.log("error", "폴백 체인에서 재생 가능한 곡을 찾지 못했습니다");
      }
    } catch (err) {
      this.log("error", `다음 곡 선정 실패: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.resolving = false;
    }
  }

  /** 스펙 §8: 현재 곡 종료 -> 큐의 다음 곡 재생(없으면 즉시 선정해 무음 방지). */
  async onTrackEnded(reason = "곡 종료"): Promise<void> {
    if (this.snap.phase !== "playing") return;
    let next = this.snap.nextTrack;
    if (!next) {
      await this.selectNext("곡 종료(큐 없음)");
      next = this.snap.nextTrack;
    }
    if (next) {
      await this.playTrack(next, reason);
      this.set({ nextTrack: null });
      void this.selectNext("미리 준비"); // 큐를 미리 채워둠
    }
  }

  /** 수동: 현재 곡 기준으로 다음 곡을 다시 추천·큐잉. */
  async queueNext(): Promise<void> {
    if (this.snap.phase !== "playing") return;
    await this.selectNext("수동 추천");
  }

  private async playTrack(track: TrackRef, reason: string): Promise<void> {
    await this.deps.play(track);
    this.queue = markPlayed(this.queue, track.id, this.cfg.dedupeLastN);
    this.recent = [track, ...this.recent.filter((r) => r.id !== track.id)].slice(
      0,
      this.cfg.dedupeLastN * 2 + 1
    );
    this.set({ currentTrack: track });
    this.log("play", `재생 (${reason}): ${track.title} — ${track.artist}`);
  }

  private async safeRecommend(args: RecommendArgs): Promise<SongSuggestion[]> {
    try {
      return await this.deps.recommend(args);
    } catch (err) {
      this.log("error", `LLM 실패, 장르 폴백 사용: ${err instanceof Error ? err.message : ""}`);
      return [];
    }
  }
}
