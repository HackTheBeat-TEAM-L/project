"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AutoDjController } from "@/lib/autodj";
import { DEFAULT_CONFIG } from "@/lib/config";
import { makeMockLlm, makeMockSearch } from "@/lib/mock";
import { fetchAccessToken, playTrackUri, searchTrack } from "@/lib/spotify-client";
import { requestRecommendations } from "@/lib/llm-client";
import { useAutoDjSnapshot } from "@/hooks/useAutoDj";
import { useMicDbMeter } from "@/hooks/useDbMeter";
import { useSpotifyPlayer } from "@/hooks/useSpotifyPlayer";
import { DbMeter } from "@/components/DbMeter";
import { TrackCard } from "@/components/TrackCard";
import { HypeBanner } from "@/components/HypeBanner";
import { EventLog } from "@/components/EventLog";

type Mode = "mock" | "live";

export default function Page() {
  const [mode, setMode] = useState<Mode>("mock");
  const [connected, setConnected] = useState(false);
  const [started, setStarted] = useState(false);
  const [genre, setGenre] = useState("");
  const [banner, setBanner] = useState<string | null>(null);
  const [controller, setController] = useState<AutoDjController | null>(null);
  const controllerRef = useRef<AutoDjController | null>(null);

  const player = useSpotifyPlayer(
    mode === "live" && connected,
    fetchAccessToken,
    () => void controllerRef.current?.onTrackEnded()
  );

  // Detect an existing Spotify session + surface OAuth redirect params.
  useEffect(() => {
    fetchAccessToken().then((t) => setConnected(!!t));
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) setBanner("Spotify connected ✓");
    const err = params.get("auth_error");
    if (err) setBanner(`Spotify auth error: ${err}`);
    if (params.get("connected") || err) {
      window.history.replaceState({}, "", "/");
    }
  }, []);

  // Live mode: real microphone. Mock mode: synthetic ambient dB.
  useMicDbMeter(mode === "live" && started, (db) => controllerRef.current?.onSample(db));
  useEffect(() => {
    if (mode !== "mock" || !started) return;
    const id = setInterval(
      () => controllerRef.current?.onSample(48 + Math.random() * 4),
      200
    );
    return () => clearInterval(id);
  }, [mode, started]);

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
          if (tok && player.deviceId) await playTrackUri(player.deviceId, t.uri, tok);
        },
      });
    }
    // Mock mode: real LLM via /api/llm (falls back to canned), mock Search + player.
    return new AutoDjController({
      config: DEFAULT_CONFIG,
      getCurrentTrack: () => null,
      recommend: async (args) => {
        try {
          const r = await requestRecommendations(args);
          if (r.length) return r;
        } catch {
          /* fall through to canned suggestions */
        }
        return makeMockLlm()(args.genre ?? "");
      },
      search: makeMockSearch(),
      play: async () => {},
    });
  }, [mode, player]);

  const handleStart = useCallback(async () => {
    if (!genre.trim()) return;
    if (mode === "live" && !player.ready) {
      setBanner("Spotify player not ready yet — connect first.");
      return;
    }
    const c = buildController();
    controllerRef.current = c;
    setController(c);
    setStarted(true);
    await c.start(genre.trim());
  }, [genre, mode, player.ready, buildController]);

  const injectHype = useCallback(() => {
    const c = controllerRef.current;
    if (!c) return;
    // Self-contained: seed a baseline, then a spike. Independent of the ambient
    // timer (browsers throttle setInterval in background tabs). Explicit, spaced
    // timestamps guarantee the 10s window has a baseline before the spike.
    const base = Date.now();
    const seq = [50, 50, 50, 50, 50, 50, 70, 71, 70, 72, 71];
    seq.forEach((db, i) => c.onSample(db, base + i * 120));
  }, []);

  return (
    <main className="app">
      <header className="app__header">
        <div className="brand">
          <span className="brand__wave" aria-hidden />
          <h1 className="brand__name">HYPEWAVE</h1>
          <span className="brand__tag">crowd-reactive auto DJ</span>
        </div>
        <div className="mode-switch" role="group" aria-label="Mode">
          <button
            className={mode === "mock" ? "is-on" : ""}
            onClick={() => !started && setMode("mock")}
            disabled={started}
          >
            Mock / Demo
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
            Drop a genre. The crowd picks the rest.
          </h2>
          <p className="start-panel__sub">
            {mode === "mock"
              ? "Mock mode runs the full loop with no Spotify login — synthetic dB, real LLM, simulated deck."
              : "Live mode plays real tracks on a Spotify Premium account in this browser."}
          </p>

          {mode === "live" && !connected && (
            <a className="btn btn--spotify" href="/api/auth/login">
              Connect Spotify (Premium)
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
              placeholder="e.g. afro house, y2k hip-hop, city pop"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              aria-label="Genre keyword"
            />
            <button
              className="btn btn--primary"
              type="submit"
              disabled={!genre.trim() || (mode === "live" && !player.ready)}
            >
              Start set ▶
            </button>
          </form>
          {mode === "live" && (
            <p className="start-panel__hint">
              {connected
                ? player.ready
                  ? "Deck ready ✓"
                  : "Initializing deck…"
                : "Connect Spotify first."}
              {player.error && <span className="is-error"> · {player.error}</span>}
            </p>
          )}
        </section>
      ) : (
        controller && (
          <Dashboard
            controller={controller}
            mode={mode}
            onInjectHype={injectHype}
            onSongEnded={() => void controllerRef.current?.onTrackEnded()}
          />
        )
      )}

      <footer className="app__footer">
        <span>+{DEFAULT_CONFIG.spikeThresholdDb} dB spike · {DEFAULT_CONFIG.rollingWindowSec}s window · {DEFAULT_CONFIG.cooldownSec}s cooldown</span>
      </footer>
    </main>
  );
}

function Dashboard({
  controller,
  mode,
  onInjectHype,
  onSongEnded,
}: {
  controller: AutoDjController;
  mode: Mode;
  onInjectHype: () => void;
  onSongEnded: () => void;
}) {
  const snap = useAutoDjSnapshot(controller);
  return (
    <div className="dash">
      <HypeBanner active={snap.hype} />
      <div className="dash__grid">
        <DbMeter db={snap.currentDb} baseline={snap.baseline} inCooldown={snap.inCooldown} config={DEFAULT_CONFIG} />
        <TrackCard label="NOW PLAYING" track={snap.currentTrack} variant="now" />
        <TrackCard label="NEXT UP" track={snap.nextTrack} variant="next" />
      </div>

      {mode === "mock" && (
        <div className="dash__controls">
          <button className="btn btn--hype" onClick={onInjectHype}>
            🔊 Inject HYPE spike
          </button>
          <button className="btn btn--ghost" onClick={onSongEnded} data-testid="song-ended">
            ⏭ Song ended → play next
          </button>
        </div>
      )}

      <EventLog events={snap.events} />
    </div>
  );
}
