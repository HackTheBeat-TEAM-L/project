"use client";
import { useEffect, useRef, useState } from "react";
import type { TrackRef } from "@/lib/types";

const SDK_SRC = "https://sdk.scdn.co/spotify-player.js";

export interface SpotifyPlayerHandle {
  deviceId: string | null;
  ready: boolean;
  error: string | null;
  getCurrentTrack: () => TrackRef | null;
}

function toTrackRef(t: Spotify.Track): TrackRef {
  return {
    uri: t.uri,
    id: t.id,
    title: t.name,
    artist: t.artists.map((a) => a.name).join(", "),
  };
}

// Loads the Web Playback SDK, creates the DJ deck device, tracks player state,
// and fires onTrackEnded when the current track finishes (Spotify pauses at 0).
export function useSpotifyPlayer(
  enabled: boolean,
  getToken: () => Promise<string | null>,
  onTrackEnded: () => void
): SpotifyPlayerHandle {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentRef = useRef<TrackRef | null>(null);
  const wasPlayingRef = useRef(false);
  const endedGuardRef = useRef(false);
  const onEndedRef = useRef(onTrackEnded);
  onEndedRef.current = onTrackEnded;

  useEffect(() => {
    if (!enabled) return;
    let player: Spotify.Player | null = null;

    const init = () => {
      player = new window.Spotify.Player({
        name: "HYPEWAVE DJ Deck",
        getOAuthToken: (cb) => {
          getToken().then((tok) => tok && cb(tok));
        },
        volume: 0.8,
      });

      player.addListener("ready", ({ device_id }) => {
        setDeviceId(device_id);
        setReady(true);
      });
      player.addListener("not_ready", () => setReady(false));
      player.addListener("authentication_error", ({ message }) => setError(message));
      player.addListener("account_error", ({ message }) =>
        setError(`account: ${message} (Premium required)`)
      );
      player.addListener("player_state_changed", (state) => {
        if (!state) return;
        const track = state.track_window.current_track;
        if (track) currentRef.current = toTrackRef(track);
        const playing = !state.paused;
        // End heuristic: was playing, now paused at position 0 with no advance.
        if (wasPlayingRef.current && state.paused && state.position === 0) {
          if (!endedGuardRef.current) {
            endedGuardRef.current = true;
            onEndedRef.current();
            setTimeout(() => (endedGuardRef.current = false), 2000);
          }
        }
        wasPlayingRef.current = playing;
      });

      player.connect();
    };

    if (window.Spotify) {
      init();
    } else {
      window.onSpotifyWebPlaybackSDKReady = init;
      if (!document.querySelector(`script[src="${SDK_SRC}"]`)) {
        const s = document.createElement("script");
        s.src = SDK_SRC;
        s.async = true;
        document.body.appendChild(s);
      }
    }

    return () => {
      player?.disconnect();
    };
  }, [enabled, getToken]);

  return { deviceId, ready, error, getCurrentTrack: () => currentRef.current };
}
