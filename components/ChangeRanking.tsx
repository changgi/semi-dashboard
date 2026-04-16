"use client";

import type { DashboardRow } from "@/lib/types";
import { fmtPct, fmtPrice } from "@/lib/format";

export function ChangeRanking({ rows }: { rows: DashboardRow[] }) {
  const valid = rows.filter((r) => r.change_percent !== null && !r.is_etf);
  const sorted = [...valid].sort(
    (a, b) => (b.change_percent ?? 0) - (a.change_percent ?? 0)
  );
  const maxAbs = Math.max(
    ...sorted.map((r) => Math.abs(r.change_percent ?? 0)),
    1
  );

  return (
    <div className="panel p-5">
      <div className="section-title mb-4">DAY CHANGE RANKING</div>
      <div className="space-y-2">
        {sorted.slice(0, 10).map((r) => {
          const pct = r.change_percent ?? 0;
          const width = (Math.abs(pct) / maxAbs) * 100;
          const up = pct >= 0;
          return (
            <div key={r.symbol} className="flex items-center gap-3 text-[11px]">
              <span className="tick w-12">{r.symbol}</span>
              <div className="bar-track flex-1">
                <div
                  className={`bar-fill ${up ? "green" : "red"}`}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className={`w-20 text-right font-bold ${up ? "up" : "down"}`}>
                {fmtPct(pct)}
              </span>
              <span className="w-20 text-right dim">${fmtPrice(r.price)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
