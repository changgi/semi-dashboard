"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, ScatterChart, Scatter, XAxis, YAxis,
  CartesianGrid, ZAxis, Cell, BarChart, Bar,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface AnalysisRow {
  symbol: string;
  date: string;
  price: number;
  change_pct: number;
  volatility_20d: number | null;
  rsi_14d: number | null;
  macd: number | null;
  sma_20: number | null;
  sma_50: number | null;
  sector_correlation: number | null;
  sector_beta: number | null;
  relative_strength: number | null;
  news_sentiment_7d: number;
  news_count_7d: number;
}

const DIMS = ["1D", "2D", "3D", "4D", "5D"] as const;

const COLORS = ["#00d4ff", "#ffb000", "#ff00aa", "#00ff88", "#ff6600", "#b794f4", "#f687b3", "#4fd1c5"];

function normalize(vals: number[]): number[] {
  const min = Math.min(...vals.filter(v => isFinite(v)));
  const max = Math.max(...vals.filter(v => isFinite(v)));
  if (max - min < 0.0001) return vals.map(() => 50);
  return vals.map(v => isFinite(v) ? ((v - min) / (max - min)) * 100 : 50);
}

export function HighDimensionAnalysis() {
  const [dim, setDim] = useState<typeof DIMS[number]>("3D");
  const { data } = useSWR("/api/analysis", fetcher, { refreshInterval: 60000 });

  const rows: AnalysisRow[] = data?.success ? data.data : [];

  // 심볼별 최신 데이터만
  const latest = new Map<string, AnalysisRow>();
  for (const r of rows) {
    if (!latest.has(r.symbol) || r.date > latest.get(r.symbol)!.date) {
      latest.set(r.symbol, r);
    }
  }
  const items = Array.from(latest.values()).slice(0, 10);

  if (items.length === 0) {
    return (
      <div className="panel p-3 sm:p-5">
        <div className="section-title mb-4">HIGH-DIMENSIONAL ANALYSIS</div>
        <div className="dim text-[11px]">COMPUTING... DATA WILL APPEAR AFTER FIRST ANALYSIS CYCLE (~5 min)</div>
      </div>
    );
  }

  // 각 차원별 데이터 구성
  const radarMetrics = {
    "1D": [{ key: "price", label: "PRICE" }],
    "2D": [{ key: "price", label: "PRICE" }, { key: "change_pct", label: "CHG%" }],
    "3D": [
      { key: "price", label: "PRICE" },
      { key: "change_pct", label: "CHG%" },
      { key: "volatility_20d", label: "VOL" },
    ],
    "4D": [
      { key: "price", label: "PRICE" },
      { key: "change_pct", label: "CHG%" },
      { key: "volatility_20d", label: "VOL" },
      { key: "rsi_14d", label: "RSI" },
    ],
    "5D": [
      { key: "price", label: "PRICE" },
      { key: "change_pct", label: "CHG%" },
      { key: "volatility_20d", label: "VOL" },
      { key: "rsi_14d", label: "RSI" },
      { key: "news_sentiment_7d", label: "SENT" },
    ],
  };

  const metrics = radarMetrics[dim];

  // 레이더 차트 데이터
  const radarData = metrics.map((m) => {
    const vals = items.map((r) => (r as unknown as Record<string, number>)[m.key] ?? 0);
    const norm = normalize(vals);
    const obj: Record<string, unknown> = { metric: m.label };
    items.forEach((r, i) => { obj[r.symbol] = norm[i]; });
    return obj;
  });

  // 2D~5D 각각 다른 축 조합
  const getScatterData = () => {
    return items.map((r) => {
      let x = 0, y = 0, zValue = 100;
      let xLabel = "", yLabel = "";

      if (dim === "2D") {
        // 2D: 가격 × 변화율
        x = r.change_pct ?? 0;
        y = r.price ?? 0;
        xLabel = "변화율(%)"; yLabel = "가격($)";
        zValue = 150;
      } else if (dim === "3D") {
        // 3D: 변화율 × 변동성 (Z=가격)
        x = r.change_pct ?? 0;
        y = r.volatility_20d ?? 0;
        zValue = Math.min(400, Math.max(60, (r.price ?? 100) * 0.8));
        xLabel = "변화율(%)"; yLabel = "변동성(%)";
      } else if (dim === "4D") {
        // 4D: RSI × 변동성 (Z=변화율)
        x = r.rsi_14d ?? 50;
        y = r.volatility_20d ?? 0;
        zValue = Math.min(400, Math.max(60, Math.abs(r.change_pct ?? 0) * 50 + 80));
        xLabel = "RSI"; yLabel = "변동성(%)";
      } else if (dim === "5D") {
        // 5D: RSI × 베타 (Z=감성*크기)
        x = r.rsi_14d ?? 50;
        y = r.sector_beta ?? 1;
        zValue = Math.min(400, Math.max(60, (r.news_sentiment_7d + 1) * 150 + 60));
        xLabel = "RSI"; yLabel = "베타";
      }

      return {
        symbol: r.symbol,
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        z: zValue,
        xLabel, yLabel,
      };
    });
  };

  const scatterData = getScatterData();
  const xLabel = scatterData[0]?.xLabel ?? "";
  const yLabel = scatterData[0]?.yLabel ?? "";

  // 기술 지표 바 차트
  const indicatorData = items.map((r) => ({
    symbol: r.symbol,
    RSI: r.rsi_14d ?? 50,
    sentiment: (r.news_sentiment_7d + 1) * 50,
    strength: r.relative_strength ? r.relative_strength + 50 : 50,
  }));

  return (
    <div className="panel p-3 sm:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div className="section-title text-[10px] sm:text-[12px]">
          HIGH-DIMENSIONAL ANALYSIS
        </div>
        <div className="flex gap-1">
          {DIMS.map((d) => (
            <button
              key={d}
              onClick={() => setDim(d)}
              className={`px-2 sm:px-3 py-1 text-[9px] sm:text-[10px] border ${
                dim === d
                  ? "border-[var(--amber)] text-[var(--amber)] bg-[rgba(255,176,0,0.1)]"
                  : "border-[var(--border)] dim hover:border-[var(--amber)]"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="text-[9px] dim mb-3 kr">
        {dim === "1D" && "1차원: 가격"}
        {dim === "2D" && "2차원: 가격 × 변화율"}
        {dim === "3D" && "3차원: 가격 × 변화율 × 변동성"}
        {dim === "4D" && "4차원: 가격 × 변화율 × 변동성 × RSI(모멘텀)"}
        {dim === "5D" && "5차원: 가격 × 변화율 × 변동성 × RSI × 뉴스 감성"}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Radar */}
        <div>
          <div className="text-[9px] dim mb-2">RADAR · NORMALIZED 0-100</div>
          <div style={{ width: "100%", height: 300 }}>
            <ResponsiveContainer>
              <RadarChart data={radarData} outerRadius="70%">
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: "#a0a0a0", fontSize: 9 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#555", fontSize: 8 }} stroke="rgba(255,255,255,0.05)" />
                {items.slice(0, 6).map((r, i) => (
                  <Radar key={r.symbol} name={r.symbol} dataKey={r.symbol}
                    stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.08} strokeWidth={1.5} />
                ))}
                <Tooltip contentStyle={{ background: "rgba(20,20,20,0.95)", border: "1px solid var(--amber-dim)", borderRadius: "4px", fontSize: 11, padding: "8px 10px", boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }} labelStyle={{ color: "var(--amber)", fontWeight: "bold", marginBottom: "4px" }} itemStyle={{ color: "#e0e0e0", padding: "1px 0" }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
            {items.slice(0, 6).map((r, i) => (
              <div key={r.symbol} className="flex items-center gap-1 text-[8px]" style={{ color: COLORS[i] }}>
                <span className="w-2 h-2 inline-block" style={{ background: COLORS[i] }} />{r.symbol}
              </div>
            ))}
          </div>
        </div>

        {/* Scatter (2D+) or Bar (1D) */}
        <div>
          {dim === "1D" ? (
            <>
              <div className="text-[9px] dim mb-2">PRICE RANKING</div>
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={items.sort((a, b) => b.price - a.price)} layout="vertical">
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#888", fontSize: 9 }} />
                    <YAxis dataKey="symbol" type="category" tick={{ fill: "#ccc", fontSize: 10 }} width={45} />
                    <Tooltip contentStyle={{ background: "rgba(20,20,20,0.95)", border: "1px solid var(--amber-dim)", borderRadius: "4px", fontSize: 11, padding: "8px 10px", boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }} labelStyle={{ color: "var(--amber)", fontWeight: "bold", marginBottom: "4px" }} itemStyle={{ color: "#e0e0e0", padding: "1px 0" }} />
                    <Bar dataKey="price" fill="var(--amber)">
                      {items.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <>
              <div className="text-[9px] dim mb-2">
                SCATTER · X={xLabel} Y={yLabel}
                {dim === "3D" && " · Z=가격(원크기)"}
                {dim === "4D" && " · Z=|변화율|(원크기)"}
                {dim === "5D" && " · Z=뉴스감성(원크기)"}
              </div>
              <div style={{ width: "100%", height: 300 }}>
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="2 3" />
                    <XAxis
                      dataKey="x"
                      name={xLabel}
                      type="number"
                      tick={{ fill: "#888", fontSize: 9 }}
                      domain={["auto", "auto"]}
                    />
                    <YAxis
                      dataKey="y"
                      name={yLabel}
                      type="number"
                      tick={{ fill: "#888", fontSize: 9 }}
                      domain={["auto", "auto"]}
                      width={50}
                    />
                    <ZAxis dataKey="z" range={[60, 400]} />
                    <Tooltip
                      contentStyle={{ background: "rgba(20,20,20,0.95)", border: "1px solid var(--amber-dim)", borderRadius: "4px", fontSize: 11, padding: "8px 10px", boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }} labelStyle={{ color: "var(--amber)", fontWeight: "bold", marginBottom: "4px" }} itemStyle={{ color: "#e0e0e0", padding: "1px 0" }}
                      formatter={(v: number, name: string) => {
                        if (name === "x") return [v.toFixed(2), xLabel];
                        if (name === "y") return [v.toFixed(2), yLabel];
                        return [v.toFixed(2), name];
                      }}
                      labelFormatter={() => ""}
                    />
                    <Scatter data={scatterData}>
                      {scatterData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                {scatterData.map((d, i) => (
                  <div key={d.symbol} className="text-[8px]" style={{ color: COLORS[i % COLORS.length] }}>● {d.symbol}</div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Indicator Summary Table */}
      <div className="mt-4 overflow-x-auto">
        <div className="text-[9px] dim mb-2">TECHNICAL INDICATORS SUMMARY</div>
        <table className="w-full text-[9px] sm:text-[10px]">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left py-1 tick">SYM</th>
              <th className="text-right py-1 dim">PRICE</th>
              <th className="text-right py-1 dim">CHG%</th>
              <th className="text-right py-1 dim">VOL20</th>
              <th className="text-right py-1 dim">RSI14</th>
              <th className="text-right py-1 dim">MACD</th>
              <th className="text-right py-1 dim">BETA</th>
              <th className="text-right py-1 dim">SENT</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.symbol} className="border-b border-[var(--border)] data-row">
                <td className="py-1 tick">{r.symbol}</td>
                <td className="text-right bright">${r.price?.toFixed(2)}</td>
                <td className={`text-right ${(r.change_pct ?? 0) >= 0 ? "up" : "down"}`}>
                  {r.change_pct?.toFixed(2)}%
                </td>
                <td className="text-right">{r.volatility_20d?.toFixed(1) ?? "—"}%</td>
                <td className="text-right" style={{
                  color: (r.rsi_14d ?? 50) > 70 ? "var(--red)" : (r.rsi_14d ?? 50) < 30 ? "var(--green)" : "var(--text)"
                }}>
                  {r.rsi_14d?.toFixed(0) ?? "—"}
                </td>
                <td className={`text-right ${(r.macd ?? 0) >= 0 ? "up" : "down"}`}>
                  {r.macd?.toFixed(3) ?? "—"}
                </td>
                <td className="text-right">{r.sector_beta?.toFixed(2) ?? "—"}</td>
                <td className={`text-right ${(r.news_sentiment_7d ?? 0) >= 0 ? "up" : "down"}`}>
                  {r.news_sentiment_7d?.toFixed(2) ?? "0"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
