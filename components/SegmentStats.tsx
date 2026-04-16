"use client";

import type { DashboardRow } from "@/lib/types";
import { SEGMENTS, type Segment } from "@/lib/types";
import { fmtPct } from "@/lib/format";

export function SegmentStats({ rows }: { rows: DashboardRow[] }) {
  const byGroup = new Map<Segment, DashboardRow[]>();
  for (const r of rows) {
    if (!r.segment || !r.change_percent) continue;
    const seg = r.segment as Segment;
    if (!byGroup.has(seg)) byGroup.set(seg, []);
    byGroup.get(seg)!.push(r);
  }

  const stats = Array.from(byGroup.entries()).map(([seg, items]) => {
    const avg =
      items.reduce((s, r) => s + (r.change_percent ?? 0), 0) / items.length;
    const totalCap = items.reduce((s, r) => s + (r.market_cap_b ?? 0), 0);
    return { segment: seg, avg, count: items.length, totalCap };
  });
  stats.sort((a, b) => b.avg - a.avg);

  return (
    <div className="panel p-5">
      <div className="section-title mb-4">SEGMENT PERFORMANCE</div>
      <div className="space-y-3">
        {stats.map((s) => {
          const info = SEGMENTS[s.segment];
          const up = s.avg >= 0;
          return (
            <div key={s.segment} className="flex items-center gap-3 text-[11px]">
              <div
                className="w-3 h-3"
                style={{ background: info?.color ?? "#666" }}
              />
              <span className="bright w-20 kr">{info?.label ?? s.segment}</span>
              <div className="flex-1 bar-track">
                <div
                  className={`bar-fill ${up ? "green" : "red"}`}
                  style={{ width: `${Math.min(100, Math.abs(s.avg) * 20)}%` }}
                />
              </div>
              <span className={`w-16 text-right font-bold ${up ? "up" : "down"}`}>
                {fmtPct(s.avg)}
              </span>
              <span className="w-12 text-right dim text-[10px]">n={s.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
