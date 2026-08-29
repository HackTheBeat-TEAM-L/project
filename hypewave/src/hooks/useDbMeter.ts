"use client";
import { useEffect, useRef } from "react";

// Real microphone dB meter (Web Audio). Emits a relative dB value (0..100).
export function useMicDbMeter(
  active: boolean,
  onSample: (db: number) => void,
  intervalMs = 100
): void {
  const onSampleRef = useRef(onSample);
  onSampleRef.current = onSample;

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) return;
        ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);
        timer = setInterval(() => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          const db = Math.max(0, Math.min(100, 20 * Math.log10(rms + 1e-8) + 100));
          onSampleRef.current(db);
        }, intervalMs);
      } catch {
        // mic denied — caller should fall back to mock mode
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close().catch(() => {});
    };
  }, [active, intervalMs]);
}
