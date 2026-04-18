"use client";

import type { DashboardRow } from "@/lib/types";
import { fmtPrice, fmtPct } from "@/lib/format";

export function LiveTicker({ rows }: { rows: DashboardRow[] }) {
  if (rows.length === 0) return null;

  const display = [...rows, ...rows]; // 무한 스크롤용 복제

  return (
    <div className="border-b border-[var(--border)] py-2 overflow-hidden bg-[var(--bg-panel)]">
      <div className="ticker-scroll whitespace-nowrap text-[11px] inline-block">
        {display.map((r, idx) => {
          const up = (r.change ?? 0) >= 0;
          return (
            <span key={`${r.symbol}-${idx}`} className="mx-6 inline-block">
              <span className="tick">{r.symbol}</span>{" "}
              <span className="bright">{fmtPrice(r.price)}</span>{" "}
              <span className={up ? "up" : "down"}>
                {up ? "▲" : "▼"} {fmtPct(r.change_percent)}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
