"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface MicMeter {
  micLost: boolean; // mic stream died and auto-recovery gave up
  reconnect: () => void; // re-acquire the mic (call after re-granting permission)
}

// Real microphone dB meter (Web Audio). Emits a relative dB value (0..100).
// Self-healing: if the mic track dies (permission revoked, device removed, tab
// "stop"), it auto re-acquires; if that keeps failing (site blocked), it exposes
// micLost so the UI can offer a manual reconnect after the user re-grants.
export function useMicDbMeter(
  active: boolean,
  onSample: (db: number) => void,
  intervalMs = 100
): MicMeter {
  const onSampleRef = useRef(onSample);
  onSampleRef.current = onSample;
  const [nonce, setNonce] = useState(0);
  const [micLost, setMicLost] = useState(false);
  const autoHealRef = useRef(0);

  const reconnect = useCallback(() => {
    autoHealRef.current = 0;
    setMicLost(false);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const teardown = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
      ctx?.close().catch(() => {});
      ctx = null;
    };

    // The mic track ended (revoked / device gone / tab stop): try to recover.
    const onLost = () => {
      if (cancelled) return;
      teardown();
      if (autoHealRef.current < 2) {
        autoHealRef.current += 1;
        setNonce((n) => n + 1); // one silent re-acquire attempt
      } else {
        setMicLost(true); // give up auto -> surface a reconnect button
      }
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          teardown();
          return;
        }
        autoHealRef.current = 0;
        setMicLost(false);
        ctx = new AudioContext();
        await ctx.resume().catch(() => {});
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);

        for (const track of stream.getAudioTracks()) {
          track.addEventListener("ended", onLost);
        }

        timer = setInterval(() => {
          const live = stream?.getAudioTracks().some((t) => t.readyState === "live");
          if (!live) {
            onLost();
            return;
          }
          if (ctx && ctx.state === "suspended") void ctx.resume();
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          const db = Math.max(0, Math.min(100, 20 * Math.log10(rms + 1e-8) + 100));
          onSampleRef.current(db);
        }, intervalMs);
      } catch {
        if (!cancelled) setMicLost(true); // denied/blocked -> manual reconnect
      }
    })();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [active, intervalMs, nonce]);

  return { micLost, reconnect };
}
