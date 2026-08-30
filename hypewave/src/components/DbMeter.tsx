"use client";
import type { HypeConfig } from "@/lib/config";

interface Props {
  db: number | null;
  baseline: number | null;
  inCooldown: boolean;
  warmedUp: boolean;
  config: HypeConfig;
}

export function DbMeter({ db, baseline, inCooldown, warmedUp, config }: Props) {
  const value = db ?? 0;
  const base = baseline ?? 0;
  const triggerLine = base + config.spikeThresholdDb;
  const pct = (n: number) => `${Math.max(0, Math.min(100, n))}%`;
  const hot = warmedUp && baseline !== null && value >= triggerLine;

  const status = !warmedUp ? "워밍업" : inCooldown ? "쿨다운" : "대기";
  const statusClass = !warmedUp ? "is-warmup" : inCooldown ? "is-cooldown" : "";

  return (
    <section className="db-meter" aria-label="실시간 데시벨 미터">
      <header className="db-meter__head">
        <span className="db-meter__label">관중 dB</span>
        <span className={`db-meter__value ${hot ? "is-hot" : ""}`}>{value.toFixed(1)}</span>
      </header>
      <div className="db-meter__track">
        <div className="db-meter__fill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, value / 100))})` }} />
        {baseline !== null && (
          <>
            <div
              className="db-meter__mark db-meter__mark--base"
              style={{ left: pct(base) }}
              title={`기준선 (${config.rollingWindowSec}초 평균)`}
            />
            <div
              className="db-meter__mark db-meter__mark--trigger"
              style={{ left: pct(triggerLine) }}
              title={`트리거 (+${config.spikeThresholdDb}, ${config.sustainMs / 1000}초 지속)`}
            />
          </>
        )}
      </div>
      <footer className="db-meter__foot">
        <span>기준선 {baseline !== null ? base.toFixed(1) : "—"}</span>
        <span>트리거 +{config.spikeThresholdDb} → {baseline !== null ? triggerLine.toFixed(1) : "—"}</span>
        <span className={statusClass}>{status}</span>
      </footer>
    </section>
  );
}
