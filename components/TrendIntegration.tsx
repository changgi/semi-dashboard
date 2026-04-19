"use client";

import { useEffect, useState, useMemo } from "react";
import type { DashboardRow, PriceHistoryPoint } from "@/lib/types";
import {
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    Area,
    ComposedChart,
} from "recharts";

const RANGES = ["1d", "7d", "1m"] as const;
type Range = (typeof RANGES)[number];

const COLORS = [
    "#00d4ff",
    "#ffb000",
    "#ff00aa",
    "#00ff88",
    "#ff6600",
    "#b794f4",
    "#f687b3",
    "#4fd1c5",
  ];

type HistoryMap = Record<string, PriceHistoryPoint[]>;

// Normalize each series to % change from first point
function normalizeSeries(
    pts: PriceHistoryPoint[]
  ): { t: number; pct: number }[] {
    if (pts.length === 0) return [];
    const base = pts[0].price;
    if (!base) return [];
    return pts.map((p) => ({
          t: new Date(p.timestamp).getTime(),
          pct: ((p.price - base) / base) * 100,
    }));
}

function formatTick(range: Range, t: number): string {
    const d = new Date(t);
    if (range === "1d") {
          return `${d.getHours().toString().padStart(2, "0")}:${d
                                                                      .getMinutes()
                                                                      .toString()
                                                                      .padStart(2, "0")}`;
    }
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function TrendIntegration({ rows }: { rows: DashboardRow[] }) {
    const [range, setRange] = useState<Range>("1d");
    const [history, setHistory] = useState<HistoryMap>({});
    const [loading, setLoading] = useState(false);

  // Pick top 6 non-ETF by market cap
  const tickers = useMemo(
        () =>
                [...rows]
            .filter((r) => !r.is_etf && r.market_cap_b)
            .sort((a, b) => (b.market_cap_b ?? 0) - (a.market_cap_b ?? 0))
            .slice(0, 6)
            .map((r) => ({
                        symbol: r.symbol,
                        mcap: r.market_cap_b ?? 0,
            })),
        [rows]
      );

  useEffect(() => {
        if (tickers.length === 0) return;
        let cancelled = false;
        setLoading(true);

                (async () => {
                        const results: HistoryMap = {};
                        await Promise.all(
                                  tickers.map(async (t) => {
                                              try {
                                                            const res = await fetch(
                                                                            `/api/history?symbol=${encodeURIComponent(t.symbol)}&range=${range}`
                                                                          );
                                                            const json = await res.json();
                                                            if (json?.success && Array.isArray(json.data)) {
                                                                            results[t.symbol] = json.data as PriceHistoryPoint[];
                                                            } else {
                                                                            results[t.symbol] = [];
                                                            }
                                              } catch {
                                                            results[t.symbol] = [];
                                              }
                                  })
                                );
                        if (!cancelled) {
                                  setHistory(results);
                                  setLoading(false);
                        }
                })();

                return () => {
                        cancelled = true;
                };
  }, [range, tickers]);

  // Build merged chart data: x=timestamp, keys = each symbol's pct change
  const chartData = useMemo(() => {
        const timeSet = new Set<number>();
        const normalized: Record<string, Map<number, number>> = {};

                                tickers.forEach((t) => {
                                        const norm = normalizeSeries(history[t.symbol] ?? []);
                                        normalized[t.symbol] = new Map();
                                        norm.forEach((p) => {
                                                  timeSet.add(p.t);
                                                  normalized[t.symbol].set(p.t, p.pct);
                                        });
                                });

                                const times = Array.from(timeSet).sort((a, b) => a - b);

                                return times.map((t) => {
                                        const row: Record<string, number> = { t };
                                        let weighted = 0;
                                        let weightUsed = 0;
                                        tickers.forEach((tk) => {
                                                  const v = normalized[tk.symbol].get(t);
                                                  if (typeof v === "number") {
                                                              row[tk.symbol] = v;
                                                              weighted += v * tk.mcap;
                                                              weightUsed += tk.mcap;
                                                  }
                                        });
                                        if (weightUsed > 0) {
                                                  row["INDEX"] = weighted / weightUsed;
                                        }
                                        return row;
                                });
  }, [tickers, history]);

  const hasData = chartData.length > 0;
    const latestIndex =
          hasData && typeof chartData[chartData.length - 1]["INDEX"] === "number"
        ? (chartData[chartData.length - 1]["INDEX"] as number)
            : null;

  return (
        <div className="panel p-3 sm:p-5">
              <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
                      <div className="section-title text-[11px] sm:text-[13px]">
                                05 · INTEGRATED TREND · NORMALIZED
                      </div>
                      <div className="flex items-center gap-1">
                        {RANGES.map((r) => (
                      <button
                                      key={r}
                                      onClick={() => setRange(r)}
                                      className={`px-2 py-1 text-[10px] border ${
                                                        range === r
                                                          ? "border-[var(--amber)] text-[var(--amber)]"
                                                          : "border-[var(--border)] dim hover:border-[var(--amber)]"
                                      }`}
                                    >
                        {r.toUpperCase()}
                      </button>
                    ))}
                      </div>
              </div>
        
              <div className="text-[10px] dim mb-2">
                      Y = % CHANGE FROM PERIOD START · COLORED LINES = TOP 6 · AMBER = CAP-WEIGHTED INDEX
                {latestIndex !== null && (
                    <span
                                  className={`ml-2 font-bold ${latestIndex >= 0 ? "up" : "down"}`}
                                >
                                · INDEX {latestIndex >= 0 ? "+" : ""}
                      {latestIndex.toFixed(2)}%
                    </span>
                      )}
              </div>
        
              <div style={{ width: "100%", height: 360 }}>
                {loading ? (
                    <div className="h-full flex items-center justify-center dim text-[11px]">
                                LOADING TRENDS...
                    </div>
                  ) : !hasData ? (
                    <div className="h-full flex items-center justify-center dim text-[11px]">
                                NO HISTORY DATA · WAIT FOR FIRST FETCH CYCLE
                    </div>
                  ) : (
                    <ResponsiveContainer>
                                <ComposedChart
                                                data={chartData}
                                                margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                                              >
                                              <defs>
                                                              <linearGradient id="indexFill" x1="0" y1="0" x2="0" y2="1">
                                                                                <stop offset="0%" stopColor="#ffb000" stopOpacity={0.22} />
                                                                                <stop offset="100%" stopColor="#ffb000" stopOpacity={0} />
                                                              </linearGradient>
                                              </defs>
                                              <CartesianGrid
                                                                stroke="rgba(255,255,255,0.06)"
                                                                strokeDasharray="2 3"
                                                              />
                                              <XAxis
                                                                dataKey="t"
                                                                type="number"
                                                                domain={["dataMin", "dataMax"]}
                                                                tickFormatter={(v) => formatTick(range, v)}
                                                                tick={{ fill: "#808080", fontSize: 9 }}
                                                                stroke="rgba(255,255,255,0.15)"
                                                              />
                                              <YAxis
                                                                tickFormatter={(v) => `${v.toFixed(1)}%`}
                                                                tick={{ fill: "#808080", fontSize: 9 }}
                                                                stroke="rgba(255,255,255,0.15)"
                                                                width={50}
                                                              />
                                              <Tooltip
                                                                contentStyle={{ background: "rgba(20,20,20,0.95)", border: "1px solid var(--amber-dim)", borderRadius: "4px", fontSize: 11, padding: "8px 10px", boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }} labelStyle={{ color: "var(--amber)", fontWeight: "bold", marginBottom: "4px" }} itemStyle={{ color: "#e0e0e0", padding: "1px 0" }}
                                                                labelFormatter={(v) =>
                                                                                    new Date(v as number).toLocaleString()
                                                                }
                                                                formatter={(val: number, name: string) => [
                                                                                    `${val.toFixed(2)}%`,
                                                                                    name,
                                                                                  ]}
                                                              />
                                              <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
                                
                                              <Area
                                                                type="monotone"
                                                                dataKey="INDEX"
                                                                stroke="#ffb000"
                                                                strokeWidth={2.5}
                                                                fill="url(#indexFill)"
                                                                isAnimationActive={false}
                                                              />
                                
                                  {tickers.map((t, i) => (
                                                                <Line
                                                                                    key={t.symbol}
                                                                                    type="monotone"
                                                                                    dataKey={t.symbol}
                                                                                    stroke={COLORS[i % COLORS.length]}
                                                                                    strokeWidth={1.3}
                                                                                    dot={false}
                                                                                    isAnimationActive={false}
                                                                                    connectNulls
                                                                                  />
                                                              ))}
                                </ComposedChart>
                    </ResponsiveContainer>
                      )}
              </div>
        
              <div className="flex flex-wrap gap-3 mt-3 text-[9px]">
                      <div className="flex items-center gap-1" style={{ color: "#ffb000" }}>
                                <span
                                              className="inline-block w-3 h-0.5"
                                              style={{ background: "#ffb000" }}
                                            />
                                <span className="font-mono">SECTOR INDEX</span>
                      </div>
                {tickers.map((t, i) => (
                    <div
                                  key={t.symbol}
                                  className="flex items-center gap-1"
                                  style={{ color: COLORS[i % COLORS.length] }}
                                >
                                <span
                                                className="inline-block w-3 h-0.5"
                                                style={{ background: COLORS[i % COLORS.length] }}
                                              />
                                <span className="font-mono">{t.symbol}</span>
                    </div>
                  ))}
              </div>
        </div>
      );
}
