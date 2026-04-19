"use client";

import type { DashboardRow } from "@/lib/types";
import { fmtPrice, fmtPct } from "@/lib/format";

export function TopPerformer({ rows }: { rows: DashboardRow[] }) {
  const mu = rows.find((r) => r.symbol === "MU");
  if (!mu) return null;

  const up = (mu.change_percent ?? 0) >= 0;

  return (
    <div className="panel p-5 scan relative overflow-hidden">
      <div className="section-title mb-3">02 · TOP PERFORMER</div>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] dim tracking-widest">MICRON TECHNOLOGY</div>
          <div className="tick text-[36px] font-bold mt-1">MU</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] dim">LAST PX</div>
          <div className="text-[20px] bright font-bold hex-num">
            ${fmtPrice(mu.price)}
          </div>
          <div className={`text-[11px] ${up ? "up" : "down"}`}>
            {up ? "▲" : "▼"} {fmtPct(mu.change_percent)}
          </div>
        </div>
      </div>
      <div className="divider-dashed my-4" />
      <div
        className="headline text-[88px] glow-green"
        style={{ color: "var(--green)", lineHeight: 1 }}
      >
        +240<span className="text-[36px]">%</span>
      </div>
      <div className="text-[11px] dim mt-1">1Y PRICE RETURN</div>

      {/* sparkline */}
      <svg
        viewBox="0 0 200 50"
        className="w-full mt-4"
        preserveAspectRatio="none"
        style={{ height: 50 }}
      >
        <defs>
          <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00ff88" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#00ff88" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path
          d="M0,42 L20,40 L40,38 L60,36 L80,28 L100,25 L120,20 L140,15 L160,12 L180,8 L200,5 L200,50 L0,50 Z"
          fill="url(#spark-grad)"
        />
        <path
          d="M0,42 L20,40 L40,38 L60,36 L80,28 L100,25 L120,20 L140,15 L160,12 L180,8 L200,5"
          stroke="#00ff88"
          strokeWidth="1.5"
          fill="none"
        />
      </svg>

      <div className="divider-dashed my-4" />
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <div>
          <div className="dim">FWD P/E</div>
          <div className="bright text-[14px] font-bold">18x</div>
        </div>
        <div>
          <div className="dim">REV 26E</div>
          <div className="bright text-[14px] font-bold">+51%</div>
        </div>
        <div>
          <div className="dim">MARGIN</div>
          <div style={{ color: "var(--amber)" }} className="text-[14px] font-bold">
            67%
          </div>
        </div>
      </div>
    </div>
  );
}
