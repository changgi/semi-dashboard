"use client";

import type { DashboardRow } from "@/lib/types";
import { fmtPrice, fmtPct, fmtMarketCap } from "@/lib/format";

function colorFor(pct: number | null): string {
    if (pct === null) return "#2a2a2a";
    const clamped = Math.max(-5, Math.min(5, pct));
    if (clamped >= 0) {
          const intensity = Math.min(1, clamped / 3);
          const r = Math.floor(0 + intensity * 0);
          const g = Math.floor(90 + intensity * 165);
          const b = Math.floor(55 + intensity * 40);
          return `rgb(${r}, ${g}, ${b})`;
    } else {
          const intensity = Math.min(1, Math.abs(clamped) / 3);
          const r = Math.floor(110 + intensity * 145);
          const g = Math.floor(35 + intensity * 25);
          const b = Math.floor(50 + intensity * 50);
          return `rgb(${r}, ${g}, ${b})`;
    }
}

function borderFor(pct: number | null): string {
    if (pct === null) return "rgba(255,255,255,0.15)";
    if (pct >= 0) return "rgba(80, 255, 170, 0.55)";
    return "rgba(255, 90, 120, 0.55)";
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

  return (
        <div className="panel p-3 sm:p-5">
              <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
                      <div className="section-title text-[11px] sm:text-[13px]">01 · SECTOR HEATMAP · LIVE</div>
                      <div className="text-[9px] dim">SIZE = MKT CAP · COLOR = % CHANGE</div>
              </div>
              <div
                        className="grid gap-1.5 sm:gap-2"
                        style={{
                                    gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
                        }}
                      >
                {sorted.slice(0, 15).map((r, idx) => {
                                  const bg = colorFor(r.change_percent);
                                  const bd = borderFor(r.change_percent);
                                  const up = (r.change_percent ?? 0) >= 0;
                                  const isLead = idx === 0;
                        
                                  return (
                                                <div
                                                                key={r.symbol}
                                                                onClick={() => onSelect(r.symbol)}
                                                                className={`heatmap-cell flex flex-col justify-between p-2.5 sm:p-3 text-white cursor-pointer transition-transform hover:-translate-y-0.5 ${isLead ? "sm:col-span-2 sm:row-span-2" : ""}`}
                                                                style={{
                                                                                  background: `linear-gradient(135deg, ${bg}, ${bg}dd)`,
                                                                                  border: `1px solid ${bd}`,
                                                                                  boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.06), 0 1px 0 rgba(0,0,0,0.4)`,
                                                                                  minHeight: isLead ? 150 : 78,
                                                                                  textShadow: "0 1px 2px rgba(0,0,0,0.7)",
                                                                }}
                                                              >
                                                              <div>
                                                                              <div className={`${isLead ? "text-[20px] sm:text-[24px]" : "text-[13px] sm:text-[15px]"} font-bold tracking-wide`}>
                                                                                {r.symbol}
                                                                              </div>
                                                                              <div className="text-[9px] sm:text-[10px] opacity-90 kr truncate">{r.name_kr}</div>
                                                              </div>
                                                              <div>
                                                                              <div className={`${isLead ? "text-[22px] sm:text-[28px]" : "text-[13px] sm:text-[15px]"} font-bold`}>
                                                                                {up ? "▲" : "▼"} {fmtPct(r.change_percent)}
                                                                              </div>
                                                                              <div className="text-[9px] opacity-85 mt-0.5">
                                                                                                ${fmtPrice(r.price)} · {fmtMarketCap(r.market_cap_b)}
                                                                              </div>
                                                              </div>
                                                </div>
                                              );
                      })}
              </div>
              <div className="flex items-center justify-between mt-3 text-[9px] dim flex-wrap gap-2">
                      <div className="flex items-center gap-3 flex-wrap">
                                <span>COLOR SCALE</span>
                                <div className="flex items-center gap-0 h-3 border border-[var(--border)]">
                                  {[-5, -3, -1, 0, 1, 3, 5].map((v) => (
                        <div
                                          key={v}
                                          style={{ width: 18, height: "100%", background: colorFor(v) }}
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
