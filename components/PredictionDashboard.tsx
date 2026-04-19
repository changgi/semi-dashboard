"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, ReferenceLine,
} from "recharts";
import { fmtPrice, fmtPct } from "@/lib/format";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Prediction {
  symbol: string;
  horizon: string;
  predicted_price: number;
  confidence_low: number;
  confidence_high: number;
  confidence_pct: number;
  current_price: number;
  predicted_change_pct: number;
  method: string;
}

const HORIZON_LABELS: Record<string, string> = {
  "1d": "1일",
  "3d": "3일",
  "7d": "1주",
  "30d": "1개월",
  "90d": "3개월",
  "180d": "6개월",
  "365d": "1년",
  "1095d": "3년",
  "1825d": "5년",
};

const HORIZON_ORDER = ["1d", "3d", "7d", "30d", "90d", "180d", "365d", "1095d", "1825d"];

export function PredictionDashboard() {
  const [selectedSymbol, setSelectedSymbol] = useState("NVDA");
  const { data } = useSWR("/api/predictions", fetcher, { refreshInterval: 300000 });

  const predictions: Prediction[] = data?.success ? data.data : [];

  // 종목 목록
  const symbols = Array.from(new Set(predictions.map((p) => p.symbol))).sort();
  const filtered = predictions
    .filter((p) => p.symbol === selectedSymbol)
    .sort((a, b) => HORIZON_ORDER.indexOf(a.horizon) - HORIZON_ORDER.indexOf(b.horizon));

  const currentPrice = filtered[0]?.current_price ?? 0;

  // 차트 데이터
  const chartData = filtered.map((p) => ({
    horizon: HORIZON_LABELS[p.horizon] ?? p.horizon,
    predicted: p.predicted_price,
    low: p.confidence_low,
    high: p.confidence_high,
    change: p.predicted_change_pct,
    confidence: p.confidence_pct,
    range: [p.confidence_low, p.confidence_high],
  }));

  // Y축 스케일 계산: 예측값 범위에 맞춰 적절히 줌
  // 5년 신뢰구간이 너무 크면 차트가 압축되므로 예측값 기준 ±50% 정도만 보여줌
  const priceYDomain = (() => {
    if (chartData.length === 0) return [0, 100];
    const predicteds = chartData.map((d) => d.predicted);
    const minP = Math.min(...predicteds, currentPrice);
    const maxP = Math.max(...predicteds, currentPrice);
    // 10% 패딩
    const padding = (maxP - minP) * 0.15 || maxP * 0.1;
    return [
      Math.max(0, minP - padding),
      maxP + padding,
    ];
  })();

  return (
    <div className="panel p-3 sm:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div className="section-title text-[10px] sm:text-[12px]">
          PRICE PREDICTION ENGINE
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] dim">SYMBOL:</span>
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--border-bright)] px-2 py-1 text-[10px] sm:text-[11px] bright font-mono focus:outline-none focus:border-[var(--amber)]"
          >
            {symbols.length > 0 ? (
              symbols.map((s) => <option key={s} value={s}>{s}</option>)
            ) : (
              <option value="NVDA">NVDA</option>
            )}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="dim text-[11px] kr">
          COMPUTING PREDICTIONS... DATA WILL APPEAR AFTER ANALYSIS CYCLE (~5 min)
        </div>
      ) : (
        <>
          {/* 현재가 + 데이터 품질 배지 */}
          <div className="mb-4 flex items-baseline gap-3 flex-wrap">
            <span className="tick text-[18px] sm:text-[24px]">{selectedSymbol}</span>
            <span className="bright text-[20px] sm:text-[28px] hex-num">${fmtPrice(currentPrice)}</span>
            <span className="text-[9px] dim">CURRENT</span>
            {(() => {
              // 변화 폭이 거의 없으면 데이터 부족 경고
              const maxAbsChange = Math.max(...filtered.map((p) => Math.abs(p.predicted_change_pct)));
              if (maxAbsChange < 2) {
                return (
                  <span className="text-[9px] kr px-2 py-0.5" style={{
                    color: "var(--amber)",
                    border: "1px solid var(--amber-dim)",
                    background: "rgba(255,176,0,0.08)"
                  }}>
                    ⚠ 과거 데이터 부족 · /api/backfill 실행 권장
                  </span>
                );
              }
              return null;
            })()}
          </div>

          {/* 예측 차트 */}
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
                <defs>
                  <linearGradient id="confGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffb000" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#ffb000" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="2 3" />
                <XAxis dataKey="horizon" tick={{ fill: "#aaa", fontSize: 9 }} />
                {/* 왼쪽 Y축: 가격 (스케일 보정) */}
                <YAxis
                  yAxisId="price"
                  tick={{ fill: "#888", fontSize: 9 }}
                  width={60}
                  domain={priceYDomain}
                  tickFormatter={(v) => `$${v < 10 ? v.toFixed(2) : v < 1000 ? v.toFixed(0) : `${(v/1000).toFixed(1)}k`}`}
                />
                {/* 오른쪽 Y축: 변화율 */}
                <YAxis
                  yAxisId="change"
                  orientation="right"
                  tick={{ fill: "#666", fontSize: 9 }}
                  width={45}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{ background: "rgba(20,20,20,0.95)", border: "1px solid var(--amber-dim)", borderRadius: "4px", fontSize: 11, padding: "8px 10px", boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }}
                  labelStyle={{ color: "var(--amber)", fontWeight: "bold", marginBottom: "4px" }}
                  itemStyle={{ color: "#e0e0e0", padding: "1px 0" }}
                  formatter={(value: number, name: string) => {
                    if (name === "predicted") return [`$${fmtPrice(value)}`, "예측가"];
                    if (name === "change") return [`${value.toFixed(2)}%`, "변화율"];
                    if (name === "high") return [`$${fmtPrice(value)}`, "상단(90%)"];
                    if (name === "low") return [`$${fmtPrice(value)}`, "하단(90%)"];
                    return [value, name];
                  }}
                />
                <ReferenceLine
                  yAxisId="price"
                  y={currentPrice}
                  stroke="rgba(255,255,255,0.3)"
                  strokeDasharray="3 3"
                  label={{ value: `NOW $${fmtPrice(currentPrice)}`, fill: "#888", fontSize: 9, position: "insideBottomRight" }}
                />

                {/* 예측 라인 (가격 Y축) */}
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="predicted"
                  stroke="#ffb000"
                  strokeWidth={2.5}
                  dot={{ fill: "#ffb000", r: 4 }}
                  isAnimationActive={false}
                />

                {/* 변화율 바 (변화율 Y축) */}
                <Bar yAxisId="change" dataKey="change" barSize={18} opacity={0.5}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.change >= 0 ? "#00ff88" : "#ff3860"} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* 예측 테이블 */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[9px] sm:text-[10px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-1.5 tick">HORIZON</th>
                  <th className="text-right py-1.5 dim">PREDICTED</th>
                  <th className="text-right py-1.5 dim">CHANGE</th>
                  <th className="text-right py-1.5 dim">LOW</th>
                  <th className="text-right py-1.5 dim">HIGH</th>
                  <th className="text-right py-1.5 dim">CONF</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const up = p.predicted_change_pct >= 0;
                  return (
                    <tr key={p.horizon} className="border-b border-[var(--border)] data-row">
                      <td className="py-1.5 tick kr">{HORIZON_LABELS[p.horizon]}</td>
                      <td className="text-right bright font-bold">${fmtPrice(p.predicted_price)}</td>
                      <td className={`text-right font-bold ${up ? "up" : "down"}`}>
                        {up ? "▲" : "▼"} {fmtPct(p.predicted_change_pct)}
                      </td>
                      <td className="text-right dim">${fmtPrice(p.confidence_low)}</td>
                      <td className="text-right dim">${fmtPrice(p.confidence_high)}</td>
                      <td className="text-right">
                        <span className={p.confidence_pct >= 50 ? "up" : "down"}>
                          {p.confidence_pct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 방법론 정보 */}
          <div className="mt-4 pt-3 border-t border-[var(--border)]">
            <div className="text-[9px] sm:text-[10px] mb-2">
              <span className="tick">METHODOLOGY · 적용 기법</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[8px] sm:text-[9px] dim kr mb-3">
              <div>▸ GBM (Black-Scholes 1973)</div>
              <div>▸ GARCH(1,1) (Bollerslev 1986)</div>
              <div>▸ CAPM (Sharpe 1964)</div>
              <div>▸ Hurst Exponent (1951)</div>
              <div>▸ Monte Carlo (2000+ 경로)</div>
              <div>▸ Fama-French 팩터 (1992)</div>
              <div>▸ Black-Litterman 혼합</div>
              <div>▸ Jegadeesh 모멘텀 (1993)</div>
            </div>
            <div className="text-[8px] sm:text-[9px] dim kr leading-relaxed">
              ⚠ 본 예측은 학술적 금융 모델(GBM+GARCH+CAPM+몬테카를로 시뮬레이션)에 근거한
              통계적 추정이며, 실제 미래 가격을 보장하지 않습니다. 10~90% 신뢰구간을 참고하시고,
              투자 의사결정은 본인의 재무상황·리스크 허용도를 종합해 결정하세요.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
