"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AutoDjController } from "@/lib/autodj";
import { DEFAULT_CONFIG } from "@/lib/config";
import { makeMockLlm, makeMockSearch } from "@/lib/mock";
import {
  fetchAccessToken,
  playTrackUri,
  searchTrack,
  transferPlayback,
} from "@/lib/spotify-client";
import { requestRecommendations } from "@/lib/llm-client";
import { useAutoDjSnapshot } from "@/hooks/useAutoDj";
import { useMicDbMeter } from "@/hooks/useDbMeter";
import { useSpotifyPlayer } from "@/hooks/useSpotifyPlayer";
import { DbMeter } from "@/components/DbMeter";
import { TrackCard } from "@/components/TrackCard";
import { HypeBanner } from "@/components/HypeBanner";
import { EventLog } from "@/components/EventLog";

type Mode = "mock" | "live";
type DbSource = "synthetic" | "mic";

export default function Page() {
  const [mode, setMode] = useState<Mode>("mock");
  const [connected, setConnected] = useState(false);
  const [started, setStarted] = useState(false);
  const [genre, setGenre] = useState("");
  const [micSource, setMicSource] = useState<DbSource>("synthetic");
  const [banner, setBanner] = useState<string | null>(null);
  const [controller, setController] = useState<AutoDjController | null>(null);
  const controllerRef = useRef<AutoDjController | null>(null);

  const player = useSpotifyPlayer(
    mode === "live" && connected,
    fetchAccessToken,
    () => void controllerRef.current?.onTrackEnded()
  );

  // 기존 Spotify 세션 감지 + OAuth 리다이렉트 파라미터 표시.
  useEffect(() => {
    fetchAccessToken().then((t) => setConnected(!!t));
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) {
      setConnected(true);
      setMode("live");
      setBanner("Spotify 연결됨 ✓ — 장르를 고르고 '세트 시작'을 누르면 실제 재생됩니다.");
    }
    const err = params.get("auth_error");
    if (err) setBanner(`Spotify 인증 오류: ${err}`);
    if (params.get("connected") || err) {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // 실제 마이크: Live 모드에서 시작하면 항상, Mock 모드에서는 'dB 소스=실제 마이크'일 때만
  // 사용(로그인 없이 마이크 감지를 검증할 수 있음).
  const usingRealMic = started && (mode === "live" || micSource === "mic");
  useMicDbMeter(usingRealMic, (db) => controllerRef.current?.onSample(db));

  // Mock + 합성 소스: 기준선이 형성되도록 ~50dB 앰비언트를 주입.
  useEffect(() => {
    if (mode !== "mock" || !started || micSource !== "synthetic") return;
    const id = setInterval(
      () => controllerRef.current?.onSample(48 + Math.random() * 4),
      200
    );
    return () => clearInterval(id);
  }, [mode, started, micSource]);

  const buildController = useCallback((): AutoDjController => {
    if (mode === "live") {
      return new AutoDjController({
        config: DEFAULT_CONFIG,
        getCurrentTrack: () => player.getCurrentTrack(),
        recommend: requestRecommendations,
        search: async (q) => {
          const tok = await fetchAccessToken();
          return tok ? searchTrack(q, tok) : null;
        },
        play: async (t) => {
          const tok = await fetchAccessToken();
          if (!tok || !player.deviceId) throw new Error("no token/device");
          await playTrackUri(player.deviceId, t.uri, tok);
        },
      });
    }
    // Mock 모드: 실제 LLM(/api/llm, 실패 시 canned) + 시뮬레이션 덱.
    return new AutoDjController({
      config: DEFAULT_CONFIG,
      getCurrentTrack: () => null,
      recommend: async (args) => {
        try {
          const r = await requestRecommendations(args);
          if (r.length) return r;
        } catch {
          /* canned 추천으로 폴백 */
        }
        return makeMockLlm()(args.genre ?? "");
      },
      search: makeMockSearch(),
      play: async () => {},
    });
  }, [mode, player]);

  const handleStart = useCallback(async () => {
    if (!genre.trim()) return;
    if (mode === "live") {
      if (!connected) {
        setBanner("먼저 Spotify(Premium)를 연결하세요.");
        return;
      }
      if (!player.ready || !player.deviceId) {
        setBanner("Spotify 덱이 아직 준비되지 않았습니다 — 잠시 기다려 주세요.");
        return;
      }
      // 재생 전, 이 브라우저 기기를 활성 재생 대상으로 전환.
      const tok = await fetchAccessToken();
      if (tok) await transferPlayback(player.deviceId, tok).catch(() => {});
    }
    const c = buildController();
    controllerRef.current = c;
    setController(c);
    setStarted(true);
    await c.start(genre.trim());
  }, [genre, mode, connected, player.ready, player.deviceId, buildController]);

  const injectHype = useCallback(() => {
    const c = controllerRef.current;
    if (!c) return;
    // 앰비언트 타이머(백그라운드 탭에서 throttle됨)에 의존하지 않도록, 명시적 타임스탬프로
    // 기준선 샘플 → 스파이크를 자체 주입.
    const base = Date.now();
    const seq = [50, 50, 50, 50, 50, 50, 70, 71, 70, 72, 71];
    seq.forEach((db, i) => c.onSample(db, base + i * 120));
  }, []);

  const queueNext = useCallback(() => {
    void controllerRef.current?.queueNext();
  }, []);

  return (
    <main className="app">
      <header className="app__header">
        <div className="brand">
          <span className="brand__wave" aria-hidden />
          <h1 className="brand__name">HYPEWAVE</h1>
          <span className="brand__tag">군중 반응형 오토 DJ</span>
        </div>
        <div className="mode-switch" role="group" aria-label="모드">
          <button
            className={mode === "mock" ? "is-on" : ""}
            onClick={() => !started && setMode("mock")}
            disabled={started}
          >
            Mock / 데모
          </button>
          <button
            className={mode === "live" ? "is-on" : ""}
            onClick={() => !started && setMode("live")}
            disabled={started}
          >
            Live (Spotify)
          </button>
        </div>
      </header>

      {banner && (
        <div className="app__banner" onClick={() => setBanner(null)} role="status">
          {banner}
        </div>
      )}

      {!started ? (
        <section className="start-panel" aria-labelledby="start-heading">
          <h2 id="start-heading" className="start-panel__title">
            장르만 던지세요. 다음 곡은 관중이 정합니다.
          </h2>
          <p className="start-panel__sub">
            {mode === "mock"
              ? "Mock 모드는 덱을 시뮬레이션합니다(실제 오디오 없음). Spotify 로그인 없이 관중 감지를 테스트하려면 합성 dB 또는 실제 마이크를 고르세요."
              : "Live 모드는 이 브라우저에서 Spotify Premium 계정으로 실제 곡을 재생하고, 실제 마이크로 관중을 감지합니다."}
          </p>

          {mode === "mock" && (
            <div className="source-switch" role="group" aria-label="dB 소스">
              <span className="source-switch__label">dB 소스</span>
              <button
                type="button"
                className={micSource === "synthetic" ? "is-on" : ""}
                onClick={() => setMicSource("synthetic")}
              >
                합성
              </button>
              <button
                type="button"
                className={micSource === "mic" ? "is-on" : ""}
                onClick={() => setMicSource("mic")}
              >
                🎙 실제 마이크
              </button>
            </div>
          )}

          {mode === "live" && !connected && (
            <a className="btn btn--spotify" href="/api/auth/login">
              Spotify 연결 (Premium)
            </a>
          )}

          <form
            className="start-panel__form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleStart();
            }}
          >
            <input
              className="start-panel__input"
              placeholder="예: afro house, y2k hip-hop, 시티팝"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              aria-label="장르 키워드"
            />
            <button
              className="btn btn--primary"
              type="submit"
              disabled={!genre.trim() || (mode === "live" && !player.ready)}
            >
              세트 시작 ▶
            </button>
          </form>

          {mode === "mock" && micSource === "mic" && (
            <p className="start-panel__hint">
              🎙 시작 시 브라우저가 마이크 권한을 요청합니다. 허용하면 크롬에 “마이크
              사용 중” 표시가 뜨고, 미터가 실제 주변 음량을 따라갑니다.
            </p>
          )}
          {mode === "live" && (
            <p className="start-panel__hint">
              {connected
                ? player.ready
                  ? "덱 준비 완료 ✓ — 시작 시 실제 재생 + 실제 마이크."
                  : "덱 초기화 중…"
                : "먼저 Spotify를 연결하세요 (Premium 계정)."}
              {player.error && <span className="is-error"> · {player.error}</span>}
            </p>
          )}
        </section>
      ) : (
        controller && (
          <Dashboard
            controller={controller}
            mode={mode}
            usingRealMic={usingRealMic}
            onInjectHype={injectHype}
            onQueueNext={queueNext}
            onSongEnded={() => void controllerRef.current?.onTrackEnded("스킵")}
          />
        )
      )}

      <footer className="app__footer">
        <span>
          +{DEFAULT_CONFIG.spikeThresholdDb}dB 급상승 · {DEFAULT_CONFIG.rollingWindowSec}초 윈도우 ·{" "}
          {DEFAULT_CONFIG.cooldownSec}초 쿨다운
        </span>
      </footer>
    </main>
  );
}

interface DashboardProps {
  controller: AutoDjController;
  mode: Mode;
  usingRealMic: boolean;
  onInjectHype: () => void;
  onQueueNext: () => void;
  onSongEnded: () => void;
}

function Dashboard({
  controller,
  mode,
  usingRealMic,
  onInjectHype,
  onQueueNext,
  onSongEnded,
}: DashboardProps) {
  const snap = useAutoDjSnapshot(controller);
  return (
    <div className="dash">
      <HypeBanner active={snap.hype} />
      <div className="dash__grid">
        <DbMeter
          db={snap.currentDb}
          baseline={snap.baseline}
          inCooldown={snap.inCooldown}
          warmedUp={snap.warmedUp}
          config={DEFAULT_CONFIG}
        />
        <TrackCard label="지금 재생 중" track={snap.currentTrack} variant="now" />
        <TrackCard label="다음 곡" track={snap.nextTrack} variant="next" />
      </div>

      <div className="dash__controls">
        {usingRealMic ? (
          <span className="dash__mic-live">🎙 실제 마이크 작동 중 — 함성으로 dB를 올려보세요</span>
        ) : null}
        {mode === "mock" && (
          <button className="btn btn--hype" onClick={onInjectHype}>
            🔊 HYPE 스파이크 주입
          </button>
        )}
        <button className="btn btn--ghost" onClick={onQueueNext}>
          🔮 다음 곡 추천
        </button>
        <button className="btn btn--ghost" onClick={onSongEnded} data-testid="song-ended">
          ⏭ 다음 곡 재생 (스킵)
        </button>
      </div>

      <EventLog events={snap.events} />
    </div>
  );
}
