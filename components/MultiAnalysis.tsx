"use client";

import type { DashboardRow } from "@/lib/types";
import { fmtPct } from "@/lib/format";
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
    Tooltip,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Cell,
} from "recharts";

// Min-max normalize to [0, 100]
function normalize(values: number[]): number[] {
    const finite = values.filter((v) => Number.isFinite(v));
    if (finite.length === 0) return values.map(() => 50);
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    if (max - min < 1e-9) return values.map(() => 50);
    return values.map((v) =>
          Number.isFinite(v) ? ((v - min) / (max - min)) * 100 : 50
                        );
}

const COLORS = [
    "#00d4ff",
    "#ffb000",
    "#ff00aa",
    "#00ff88",
    "#ff6600",
    "#b794f4",
  ];

export function MultiAnalysis({ rows }: { rows: DashboardRow[] }) {
    const nonEtf = rows.filter((r) => !r.is_etf && r.price && r.market_cap_b);
    const top = [...nonEtf]
      .sort((a, b) => (b.market_cap_b ?? 0) - (a.market_cap_b ?? 0))
      .slice(0, 6);

  // Axes: 5-dim radar
  // 1) Change%  (signed)
  // 2) Market Cap (larger = further out)
  // 3) Day Range % (volatility proxy)
  // 4) Position in day (where price sits between low..high, 0..1)
  // 5) Momentum (change / |prev_close| proxy)

  const changePctsRaw = top.map((r) => r.change_percent ?? 0);
    const mcapRaw = top.map((r) => r.market_cap_b ?? 0);
    const dayRangeRaw = top.map((r) => {
          if (!r.day_high || !r.day_low || !r.price) return 0;
          return ((r.day_high - r.day_low) / r.price) * 100;
    });
    const positionRaw = top.map((r) => {
          if (!r.day_high || !r.day_low || !r.price) return 0.5;
          const range = r.day_high - r.day_low;
          if (range < 1e-9) return 0.5;
          return (r.price - r.day_low) / range;
    });
    const momentumRaw = top.map((r) => {
          if (!r.change || !r.prev_close) return 0;
          return (r.change / Math.max(1, r.prev_close)) * 100;
    });

  const changeN = normalize(changePctsRaw);
    const mcapN = normalize(mcapRaw);
    const rangeN = normalize(dayRangeRaw);
    const posN = positionRaw.map((v) => v * 100);
    const momN = normalize(momentumRaw);

  const radarData = [
    { metric: "CHG %", ...Object.fromEntries(top.map((r, i) => [r.symbol, changeN[i]])) },
    { metric: "MCAP", ...Object.fromEntries(top.map((r, i) => [r.symbol, mcapN[i]])) },
    { metric: "RANGE", ...Object.fromEntries(top.map((r, i) => [r.symbol, rangeN[i]])) },
    { metric: "POSITION", ...Object.fromEntries(top.map((r, i) => [r.symbol, posN[i]])) },
    { metric: "MOMENTUM", ...Object.fromEntries(top.map((r, i) => [r.symbol, momN[i]])) },
      ];

  // Composite Sector Index: market-cap weighted avg change %
  const totalCap = nonEtf.reduce((s, r) => s + (r.market_cap_b ?? 0), 0);
    const weightedChg =
          totalCap > 0
        ? nonEtf.reduce(
                    (s, r) => s + ((r.change_percent ?? 0) * (r.market_cap_b ?? 0)) / totalCap,
                    0
                  )
            : 0;
    const equalChg =
          nonEtf.length > 0
        ? nonEtf.reduce((s, r) => s + (r.change_percent ?? 0), 0) / nonEtf.length
            : 0;
    const up = nonEtf.filter((r) => (r.change_percent ?? 0) > 0).length;
    const down = nonEtf.filter((r) => (r.change_percent ?? 0) < 0).length;
    const breadth = up + down > 0 ? (up / (up + down)) * 100 : 50;

  // Contribution bar: each ticker's weighted contribution to sector index
  const contributions = nonEtf
      .map((r) => ({
              symbol: r.symbol,
              contribution:
                        totalCap > 0
                  ? ((r.change_percent ?? 0) * (r.market_cap_b ?? 0)) / totalCap
                          : 0,
      }))
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 10);

  return (
        <div className="panel p-3 sm:p-5">
              <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
                      <div className="section-title text-[11px] sm:text-[13px]">
                                04 · MULTI-DIMENSIONAL ANALYSIS
                      </div>
                      <div className="text-[9px] dim">N={top.length} · NORMALIZED 0-100</div>
              </div>
        
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Radar */}
                      <div>
                                <div className="text-[10px] dim mb-2">RADAR · TOP 6 BY MCAP</div>
                                <div style={{ width: "100%", height: 320 }}>
                                            <ResponsiveContainer>
                                                          <RadarChart data={radarData} outerRadius="72%">
                                                                          <PolarGrid stroke="rgba(255,255,255,0.12)" />
                                                                          <PolarAngleAxis
                                                                                              dataKey="metric"
                                                                                              tick={{ fill: "#a0a0a0", fontSize: 10 }}
                                                                                            />
                                                                          <PolarRadiusAxis
                                                                                              angle={90}
                                                                                              domain={[0, 100]}
                                                                                              tick={{ fill: "#606060", fontSize: 9 }}
                                                                                              stroke="rgba(255,255,255,0.08)"
                                                                                            />
                                                            {top.map((r, i) => (
                            <Radar
                                                  key={r.symbol}
                                                  name={r.symbol}
                                                  dataKey={r.symbol}
                                                  stroke={COLORS[i % COLORS.length]}
                                                  fill={COLORS[i % COLORS.length]}
                                                  fillOpacity={0.08}
                                                  strokeWidth={1.5}
                                                />
                          ))}
                                                                          <Tooltip
                                                                                              contentStyle={{ background: "rgba(20,20,20,0.95)", border: "1px solid var(--amber-dim)", borderRadius: "4px", fontSize: 11, padding: "8px 10px", boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }} labelStyle={{ color: "var(--amber)", fontWeight: "bold", marginBottom: "4px" }} itemStyle={{ color: "#e0e0e0", padding: "1px 0" }}
                                                                                            />
                                                          </RadarChart>
                                            </ResponsiveContainer>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {top.map((r, i) => (
                        <div
                                          key={r.symbol}
                                          className="flex items-center gap-1 text-[9px]"
                                          style={{ color: COLORS[i % COLORS.length] }}
                                        >
                                        <span
                                                            className="inline-block w-2 h-2"
                                                            style={{ background: COLORS[i % COLORS.length] }}
                                                          />
                                        <span className="font-mono">{r.symbol}</span>
                        </div>
                      ))}
                                </div>
                      </div>
              
                {/* Sector Index + Contribution */}
                      <div className="flex flex-col gap-4">
                                <div>
                                            <div className="text-[10px] dim mb-2">SECTOR COMPOSITE INDEX</div>
                                            <div className="grid grid-cols-3 gap-2">
                                                          <div className="border border-[var(--border)] p-2">
                                                                          <div className="text-[9px] dim">CAP-WEIGHTED</div>
                                                                          <div
                                                                                              className={`text-[20px] sm:text-[22px] font-bold ${
                                                                                                                    weightedChg >= 0 ? "up" : "down"
                                                                                                }`}
                                                                                            >
                                                                            {fmtPct(weightedChg)}
                                                                          </div>
                                                          </div>
                                                          <div className="border border-[var(--border)] p-2">
                                                                          <div className="text-[9px] dim">EQUAL-WEIGHT</div>
                                                                          <div
                                                                                              className={`text-[20px] sm:text-[22px] font-bold ${
                                                                                                                    equalChg >= 0 ? "up" : "down"
                                                                                                }`}
                                                                                            >
                                                                            {fmtPct(equalChg)}
                                                                          </div>
                                                          </div>
                                                          <div className="border border-[var(--border)] p-2">
                                                                          <div className="text-[9px] dim">BREADTH ↑</div>
                                                                          <div
                                                                                              className={`text-[20px] sm:text-[22px] font-bold ${
                                                                                                                    breadth >= 50 ? "up" : "down"
                                                                                                }`}
                                                                                            >
                                                                            {breadth.toFixed(0)}%
                                                                          </div>
                                                                          <div className="text-[9px] dim mt-0.5">
                                                                            {up} UP · {down} DOWN
                                                                          </div>
                                                          </div>
                                            </div>
                                </div>
                      
                                <div>
                                            <div className="text-[10px] dim mb-2">
                                                          CONTRIBUTION TO INDEX · WEIGHTED %
                                            </div>
                                            <div style={{ width: "100%", height: 220 }}>
                                                          <ResponsiveContainer>
                                                                          <BarChart
                                                                                              data={contributions}
                                                                                              layout="vertical"
                                                                                              margin={{ top: 5, right: 10, left: 5, bottom: 5 }}
                                                                                            >
                                                                                            <CartesianGrid
                                                                                                                  stroke="rgba(255,255,255,0.06)"
                                                                                                                  horizontal={false}
                                                                                                                />
                                                                                            <XAxis
                                                                                                                  type="number"
                                                                                                                  tick={{ fill: "#808080", fontSize: 9 }}
                                                                                                                  stroke="rgba(255,255,255,0.15)"
                                                                                                                />
                                                                                            <YAxis
                                                                                                                  dataKey="symbol"
                                                                                                                  type="category"
                                                                                                                  tick={{ fill: "#c0c0c0", fontSize: 10 }}
                                                                                                                  stroke="rgba(255,255,255,0.15)"
                                                                                                                  width={48}
                                                                                                                />
                                                                                            <Tooltip
                                                                                                                  contentStyle={{ background: "rgba(20,20,20,0.95)", border: "1px solid var(--amber-dim)", borderRadius: "4px", fontSize: 11, padding: "8px 10px", boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }} labelStyle={{ color: "var(--amber)", fontWeight: "bold", marginBottom: "4px" }} itemStyle={{ color: "#e0e0e0", padding: "1px 0" }}
                                                                                                                  formatter={(v: number) => `${v.toFixed(3)} pp`}
                                                                                                                />
                                                                                            <Bar dataKey="contribution">
                                                                                              {contributions.map((c, i) => (
                                                                                                                    <Cell
                                                                                                                                              key={i}
                                                                                                                                              fill={c.contribution >= 0 ? "#00d468" : "#ff3b6b"}
                                                                                                                                            />
                                                                                                                  ))}
                                                                                              </Bar>
                                                                          </BarChart>
                                                          </ResponsiveContainer>
                                            </div>
                                </div>
                      </div>
              </div>
        </div>
      );
}
