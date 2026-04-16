"use client";

import type { DashboardRow } from "@/lib/types";
import { fmtPrice, fmtPct, fmtMarketCap } from "@/lib/format";

function colorFor(pct: number | null): string {
  if (pct === null) return "#2a2a2a";
  const clamped = Math.max(-5, Math.min(5, pct));
  if (clamped >= 0) {
    const intensity = Math.min(1, clamped / 3);
    const r = Math.floor(0 + intensity * 0);
    const g = Math.floor(80 + intensity * 175);
    const b = Math.floor(40 + intensity * 48);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const intensity = Math.min(1, Math.abs(clamped) / 3);
    const r = Math.floor(80 + intensity * 175);
    const g = Math.floor(30 + intensity * 26);
    const b = Math.floor(40 + intensity * 56);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

export function Heatmap({
  rows,
  onSelect,
}: {
  rows: DashboardRow[];
  onSelect: (symbol: string) => void;
}) {
  const nonEtf = rows.filter((r) => !r.is_etf && r.market_cap_b);
  const sorted = [...nonEtf].sort(
    (a, b) => (b.market_cap_b ?? 0) - (a.market_cap_b ?? 0)
  );
  const totalCap = sorted.reduce((s, r) => s + (r.market_cap_b ?? 0), 0);

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="section-title">01 · SECTOR HEATMAP · LIVE</div>
        <div className="text-[9px] dim">SIZE = MKT CAP · COLOR = % CHANGE</div>
      </div>
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: "repeat(12, 1fr)",
          gridAutoRows: "80px",
        }}
      >
        {sorted.slice(0, 15).map((r, idx) => {
          const weight = (r.market_cap_b ?? 0) / totalCap;
          const cols = Math.max(2, Math.min(6, Math.round(weight * 40)));
          const rows = idx === 0 ? 2 : 1; // 가장 큰 종목은 2행
          const bg = colorFor(r.change_percent);

          return (
            <div
              key={r.symbol}
              onClick={() => onSelect(r.symbol)}
              className="heatmap-cell flex flex-col justify-between p-3 text-black"
              style={{
                background: `linear-gradient(135deg, ${bg}, ${bg}cc)`,
                gridColumn: `span ${cols}`,
                gridRow: `span ${rows}`,
              }}
            >
              <div>
                <div className={idx === 0 ? "text-[22px] font-bold" : "text-[14px] font-bold"}>
                  {r.symbol}
                </div>
                <div className="text-[9px] opacity-80 kr">{r.name_kr}</div>
              </div>
              <div>
                <div className={idx === 0 ? "text-[26px] font-bold" : "text-[14px] font-bold"}>
                  {fmtPct(r.change_percent)}
                </div>
                <div className="text-[9px] opacity-80">
                  ${fmtPrice(r.price)} · {fmtMarketCap(r.market_cap_b)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-3 text-[9px] dim">
        <div className="flex items-center gap-3">
          <span>COLOR SCALE</span>
          <div className="flex items-center gap-0 h-3">
            {[-5, -3, -1, 0, 1, 3, 5].map((v) => (
              <div
                key={v}
                style={{ width: 20, background: colorFor(v) }}
              />
            ))}
          </div>
          <span>-5% ─── 0% ─── +5%</span>
        </div>
        <div>CLICK TICKER TO DRILL DOWN ↗</div>
      </div>
    </div>
  );
}
