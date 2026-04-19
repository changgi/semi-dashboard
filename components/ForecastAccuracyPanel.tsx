"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Scatter,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ───────────────────────────────────────────────────────────
// 타입 정의
// ───────────────────────────────────────────────────────────
interface PerformanceRow {
  symbol: string;
  horizon_days: number;
  evaluation_count: number;
  mae: number;
  mape: number;
  rmse: number;
  bias_pct: number;
  coverage_pct: number;
  direction_accuracy_pct: number | null;
}

interface EvaluationRow {
  id: number;
  symbol: string;
  forecast_date: string;
  target_date: string;
  horizon_days: number;
  forecast_value: number;
  actual_value: number;
  upper_band: number;
  lower_band: number;
  absolute_error: number;
  percent_error: number;
  absolute_percent_error: number;
  in_confidence_band: boolean;
  direction_correct: boolean | null;
}

interface HistoricalForecast {
  id: number;
  forecast_date: string;
  symbol: string;
  current_value: number;
  target_date: string;
  horizon_days: number;
  forecast_value: number;
  upper_band: number;
  lower_band: number;
}

interface AccuracyData {
  success: boolean;
  symbol: string;
  performance: PerformanceRow[];
  overall: {
    total_evaluated: number;
    avg_mae: number;
    avg_mape: number;
    coverage_pct: number;
    direction_accuracy_pct: number;
  } | null;
  evaluations: EvaluationRow[];
  active_forecasts: HistoricalForecast[];
  historical_forecasts: HistoricalForecast[];
}

interface HistoryPoint {
  date: string;
  timestamp: number;
  value: number;
}

interface MacroHistoryData {
  success: boolean;
  symbol: string;
  name: string;
  unit: string;
  current: number;
  history: HistoryPoint[];
}

const TRACKED_MACROS = [
  { symbol: "CL=F",     name: "WTI 원유",       icon: "🛢️", color: "#ff9944" },
  { symbol: "^NDX",     name: "나스닥100",      icon: "📊", color: "#ffb000" },
  { symbol: "^TNX",     name: "10Y 국채",       icon: "📜", color: "#88dd99" },
  { symbol: "^VIX",     name: "VIX 공포지수",   icon: "⚡", color: "#ff6688" },
  { symbol: "DX-Y.NYB", name: "달러 인덱스",     icon: "💵", color: "#aabbff" },
  { symbol: "SOXX",     name: "반도체 SOXX",     icon: "💻", color: "#ffb000" },
];

// ───────────────────────────────────────────────────────────
// 신뢰도 점수 색상
// ───────────────────────────────────────────────────────────
function scoreColor(pct: number | null | undefined, type: "coverage" | "direction" | "mape"): string {
  if (pct === null || pct === undefined) return "dim";
  if (type === "coverage") {
    // 80%가 완벽 (80% 신뢰구간이 의도)
    const distance = Math.abs(pct - 80);
    if (distance < 10) return "text-[#00ff88]";
    if (distance < 20) return "text-[var(--amber)]";
    return "text-[#ff8888]";
  }
  if (type === "direction") {
    if (pct >= 65) return "text-[#00ff88]";
    if (pct >= 50) return "text-[var(--amber)]";
    return "text-[#ff8888]";
  }
  if (type === "mape") {
    if (pct < 5) return "text-[#00ff88]";
    if (pct < 10) return "text-[var(--amber)]";
    return "text-[#ff8888]";
  }
  return "";
}

// ───────────────────────────────────────────────────────────
// 개별 심볼의 예측 vs 실제 비교 차트
// ───────────────────────────────────────────────────────────
function ForecastVsActualChart({
  symbol,
  name,
  icon,
  color,
}: {
  symbol: string;
  name: string;
  icon: string;
  color: string;
}) {
  const { data: accuracyData } = useSWR<AccuracyData>(
    `/api/forecast-accuracy?symbol=${encodeURIComponent(symbol)}`,
    fetcher,
    { refreshInterval: 300000 }
  );

  const { data: historyData } = useSWR<MacroHistoryData>(
    `/api/macro-history?symbol=${encodeURIComponent(symbol)}&range=6mo`,
    fetcher,
    { refreshInterval: 300000 }
  );

  if (!accuracyData?.success || !historyData?.success) {
    return (
      <div className="border border-[var(--border)] rounded p-3 h-[380px] flex items-center justify-center">
        <div className="text-[10px] dim kr">
          {icon} {name} 로딩 중...
        </div>
      </div>
    );
  }

  const overall = accuracyData.overall;
  const evaluations = accuracyData.evaluations;
  const activeForecasts = accuracyData.active_forecasts;

  // 차트 데이터 조합
  // 1. 실제 히스토리
  // 2. 평가된 과거 예측 (예측값 점 + 실제값)
  // 3. 활성 예측 (미래, horizon=30일만)
  const chartDataMap = new Map<
    string,
    {
      date: string;
      actual?: number | null;
      forecasted?: number | null;        // 해당 날짜에 대해 과거에 예측했던 값
      forecast_upper?: number | null;
      forecast_lower?: number | null;
      active_forecast?: number | null;   // 미래 예측
      active_upper?: number | null;
      active_lower?: number | null;
    }
  >();

  // 히스토리
  for (const h of historyData.history) {
    chartDataMap.set(h.date, { date: h.date, actual: h.value });
  }

  // 평가된 예측 (30일 horizon만 차트 단순화)
  for (const e of evaluations) {
    if (e.horizon_days !== 30) continue;
    const existing = chartDataMap.get(e.target_date) ?? { date: e.target_date };
    existing.forecasted = e.forecast_value;
    existing.forecast_upper = e.upper_band;
    existing.forecast_lower = e.lower_band;
    if (!existing.actual) existing.actual = e.actual_value;
    chartDataMap.set(e.target_date, existing);
  }

  // 활성 예측 (최신 forecast_date 기준, 30일)
  const latestActiveByTarget = new Map<string, HistoricalForecast>();
  for (const a of activeForecasts) {
    if (a.horizon_days !== 30) continue;
    const existing = latestActiveByTarget.get(a.target_date);
    if (!existing || a.forecast_date > existing.forecast_date) {
      latestActiveByTarget.set(a.target_date, a);
    }
  }
  for (const a of latestActiveByTarget.values()) {
    const existing = chartDataMap.get(a.target_date) ?? { date: a.target_date };
    existing.active_forecast = a.forecast_value;
    existing.active_upper = a.upper_band;
    existing.active_lower = a.lower_band;
    chartDataMap.set(a.target_date, existing);
  }

  const chartData = Array.from(chartDataMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Y축 범위
  const allValues = chartData.flatMap((d) =>
    [d.actual, d.forecasted, d.forecast_upper, d.forecast_lower, d.active_upper, d.active_lower]
      .filter((v): v is number => v !== null && v !== undefined && !isNaN(v))
  );
  const yMin = allValues.length > 0 ? Math.min(...allValues) * 0.95 : 0;
  const yMax = allValues.length > 0 ? Math.max(...allValues) * 1.05 : 100;

  // 오늘 날짜 (전망 구분선)
  const today = new Date().toISOString().split("T")[0];

  // 30일 horizon 성능 추출
  const perf30d = accuracyData.performance.find((p) => p.horizon_days === 30);

  return (
    <div className="border border-[var(--border)] rounded p-3 hover:border-[var(--amber-dim)] transition-colors">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-[14px]">{icon}</span>
            <span className="text-[10px] sm:text-[11px] font-bold bright kr truncate">
              {name}
            </span>
            <span className="text-[8px] dim ml-1">({symbol})</span>
          </div>
          {overall && overall.total_evaluated > 0 ? (
            <div className="text-[7px] sm:text-[8px] dim kr">
              {overall.total_evaluated}개 예측 평가 · MAPE{" "}
              <span className={scoreColor(overall.avg_mape, "mape")}>
                {overall.avg_mape}%
              </span>
            </div>
          ) : (
            <div className="text-[7px] sm:text-[8px] dim kr">평가 데이터 수집 중...</div>
          )}
        </div>

        {/* 신뢰도 뱃지 */}
        <div className="flex flex-col items-end gap-0.5">
          {overall && overall.total_evaluated > 0 && (
            <>
              <div className="flex items-center gap-1">
                <span className="text-[7px] dim kr">구간 적중</span>
                <span
                  className={`text-[10px] font-bold ${scoreColor(
                    overall.coverage_pct,
                    "coverage"
                  )}`}
                >
                  {overall.coverage_pct}%
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[7px] dim kr">방향 적중</span>
                <span
                  className={`text-[10px] font-bold ${scoreColor(
                    overall.direction_accuracy_pct,
                    "direction"
                  )}`}
                >
                  {overall.direction_accuracy_pct}%
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 차트 */}
      <div style={{ width: "100%", height: 180 }}>
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id={`actual-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`band-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#888" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#888" stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`active-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--amber)" stopOpacity={0.15} />
                <stop offset="100%" stopColor="var(--amber)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#666", fontSize: 8 }}
              tickFormatter={(d) => {
                if (!d) return "";
                const parts = d.split("-");
                return parts.length === 3 ? `${parts[1]}/${parts[2]}` : d;
              }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "#666", fontSize: 8 }}
              domain={[yMin, yMax]}
              tickFormatter={(v) => {
                if (v >= 10000) return `${(v / 1000).toFixed(0)}k`;
                if (v >= 1000) return v.toFixed(0);
                return v.toFixed(1);
              }}
              width={40}
            />
            <Tooltip
              contentStyle={{ background: "rgba(20,20,20,0.95)", border: "1px solid var(--amber-dim)", borderRadius: "4px", fontSize: 11, padding: "8px 10px", boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }} labelStyle={{ color: "var(--amber)", fontWeight: "bold", marginBottom: "4px" }} itemStyle={{ color: "#e0e0e0", padding: "1px 0" }}
              formatter={(value: number, name: string) => {
                if (value === null || value === undefined) return [null, null];
                const labels: Record<string, string> = {
                  actual: "실제값",
                  forecasted: "30일 전 예측",
                  forecast_upper: "예측 상단",
                  forecast_lower: "예측 하단",
                  active_forecast: "현재 진행 예측",
                  active_upper: "진행 상단",
                  active_lower: "진행 하단",
                };
                return [value.toFixed(2), labels[name] ?? name];
              }}
            />

            {/* 오늘 구분선 */}
            <ReferenceLine
              x={today}
              stroke="rgba(255,176,0,0.5)"
              strokeDasharray="2 4"
              label={{ value: "TODAY", fill: "var(--amber)", fontSize: 8, position: "top" }}
            />

            {/* 과거 예측 신뢰구간 (얇은 밴드) */}
            <Area
              type="monotone"
              dataKey="forecast_upper"
              stroke="none"
              fill={`url(#band-${symbol})`}
              isAnimationActive={false}
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="forecast_lower"
              stroke="none"
              fill="var(--bg)"
              isAnimationActive={false}
              connectNulls
            />

            {/* 활성 예측 신뢰구간 */}
            <Area
              type="monotone"
              dataKey="active_upper"
              stroke="none"
              fill={`url(#active-${symbol})`}
              isAnimationActive={false}
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="active_lower"
              stroke="none"
              fill="var(--bg)"
              isAnimationActive={false}
              connectNulls
            />

            {/* 실제 (Area) */}
            <Area
              type="monotone"
              dataKey="actual"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#actual-${symbol})`}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />

            {/* 과거 30일 전 예측 (점선) */}
            <Line
              type="monotone"
              dataKey="forecasted"
              stroke="#888"
              strokeWidth={1}
              strokeDasharray="3 3"
              dot={{ r: 2, fill: "#888" }}
              isAnimationActive={false}
              connectNulls={false}
            />

            {/* 현재 진행 예측 (점선) */}
            <Line
              type="monotone"
              dataKey="active_forecast"
              stroke="var(--amber)"
              strokeWidth={1.2}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 하단 성능 통계 (30일 horizon) */}
      {perf30d && perf30d.evaluation_count > 0 && (
        <div className="mt-2 pt-2 border-t border-[var(--border)] grid grid-cols-4 gap-1 text-[7px] sm:text-[8px]">
          <div>
            <div className="dim kr">MAE</div>
            <div className="tick">{perf30d.mae}</div>
          </div>
          <div>
            <div className="dim kr">MAPE</div>
            <div className={scoreColor(perf30d.mape, "mape")}>{perf30d.mape}%</div>
          </div>
          <div>
            <div className="dim kr">편향</div>
            <div className={perf30d.bias_pct >= 0 ? "up" : "down"}>
              {perf30d.bias_pct >= 0 ? "+" : ""}
              {perf30d.bias_pct}%
            </div>
          </div>
          <div>
            <div className="dim kr">샘플</div>
            <div className="tick">{perf30d.evaluation_count}</div>
          </div>
        </div>
      )}

      {/* 범례 */}
      <div className="mt-2 flex flex-wrap gap-2 text-[7px] sm:text-[8px]">
        <span className="flex items-center gap-1">
          <span style={{ color }}>━</span>
          <span className="dim kr">실제</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[#888]">╌╌</span>
          <span className="dim kr">과거 예측 (30일 전)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="text-[var(--amber)]">╌╌</span>
          <span className="dim kr">현재 진행 예측</span>
        </span>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 메인 컴포넌트
// ───────────────────────────────────────────────────────────
export function ForecastAccuracyPanel() {
  const [view, setView] = useState<"charts" | "table">("charts");

  // 전체 성능 요약
  const { data: summaryData } = useSWR(
    `/api/forecast-accuracy`,
    fetcher,
    { refreshInterval: 300000 }
  );

  const performanceSummary: PerformanceRow[] = summaryData?.performance ?? [];

  return (
    <div className="panel p-3 sm:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[12px]">
            🎯 FORECAST ACCURACY · 예측 vs 실제 비교 분석
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            과거 예측이 얼마나 정확했는지 검증 · 다음 예측의 신뢰도 판단 근거
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setView("charts")}
            className={`px-2 py-1 text-[9px] sm:text-[10px] border ${
              view === "charts"
                ? "border-[var(--amber)] text-[var(--amber)] bg-[rgba(255,176,0,0.1)]"
                : "border-[var(--border)] dim hover:border-[var(--amber-dim)]"
            }`}
          >
            차트 비교
          </button>
          <button
            onClick={() => setView("table")}
            className={`px-2 py-1 text-[9px] sm:text-[10px] border ${
              view === "table"
                ? "border-[var(--amber)] text-[var(--amber)] bg-[rgba(255,176,0,0.1)]"
                : "border-[var(--border)] dim hover:border-[var(--amber-dim)]"
            }`}
          >
            성능 테이블
          </button>
        </div>
      </div>

      {/* 데이터 없음 경고 */}
      {performanceSummary.length === 0 && (
        <div className="border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.05)] rounded p-3 mb-3 text-[9px] sm:text-[10px] dim kr leading-relaxed">
          ℹ️ 아직 평가된 예측이 없습니다. <span className="text-[var(--amber)]">snapshot-forecasts</span>{" "}
          cron이 매일 예측을 저장하고, 시간이 경과한 예측은{" "}
          <span className="text-[var(--amber)]">evaluate-forecasts</span> cron이 실제값과 비교합니다.
          최소 1주일 후 의미 있는 데이터가 쌓입니다.
        </div>
      )}

      {/* 차트 뷰 */}
      {view === "charts" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TRACKED_MACROS.map((m) => (
            <ForecastVsActualChart
              key={m.symbol}
              symbol={m.symbol}
              name={m.name}
              icon={m.icon}
              color={m.color}
            />
          ))}
        </div>
      ) : (
        /* 테이블 뷰 */
        <div className="overflow-x-auto">
          <table className="w-full text-[9px] sm:text-[10px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-2 px-1 tick">심볼</th>
                <th className="text-center py-2 px-2 tick kr">기간</th>
                <th className="text-right py-2 px-2 tick kr">샘플</th>
                <th className="text-right py-2 px-2 tick">MAE</th>
                <th className="text-right py-2 px-2 tick">MAPE%</th>
                <th className="text-right py-2 px-2 tick">RMSE</th>
                <th className="text-right py-2 px-2 tick kr">편향</th>
                <th className="text-right py-2 px-2 tick kr">구간적중</th>
                <th className="text-right py-2 px-2 tick kr">방향적중</th>
                <th className="text-center py-2 px-2 tick kr">판정</th>
              </tr>
            </thead>
            <tbody>
              {performanceSummary.map((p, i) => {
                const verdict =
                  p.evaluation_count < 5
                    ? "insufficient"
                    : p.mape < 5 && p.direction_accuracy_pct && p.direction_accuracy_pct >= 65
                    ? "excellent"
                    : p.mape < 10 && p.direction_accuracy_pct && p.direction_accuracy_pct >= 50
                    ? "good"
                    : "poor";
                const verdictMeta = {
                  insufficient: { icon: "📊", label: "수집중", color: "dim" },
                  excellent:    { icon: "🎯", label: "우수",    color: "text-[#00ff88]" },
                  good:         { icon: "✅", label: "양호",    color: "text-[var(--amber)]" },
                  poor:         { icon: "⚠️", label: "부족",    color: "text-[#ff8888]" },
                }[verdict];

                return (
                  <tr
                    key={`${p.symbol}-${p.horizon_days}-${i}`}
                    className="border-b border-[var(--border)] data-row"
                  >
                    <td className="py-1.5 px-1 tick font-bold">{p.symbol}</td>
                    <td className="text-center px-2 dim">{p.horizon_days}일</td>
                    <td className="text-right px-2 tick">{p.evaluation_count}</td>
                    <td className="text-right px-2">{p.mae}</td>
                    <td className={`text-right px-2 ${scoreColor(p.mape, "mape")}`}>{p.mape}%</td>
                    <td className="text-right px-2 dim">{p.rmse}</td>
                    <td className={`text-right px-2 ${p.bias_pct >= 0 ? "up" : "down"}`}>
                      {p.bias_pct >= 0 ? "+" : ""}
                      {p.bias_pct}%
                    </td>
                    <td className={`text-right px-2 ${scoreColor(p.coverage_pct, "coverage")}`}>
                      {p.coverage_pct}%
                    </td>
                    <td
                      className={`text-right px-2 ${scoreColor(
                        p.direction_accuracy_pct,
                        "direction"
                      )}`}
                    >
                      {p.direction_accuracy_pct !== null ? `${p.direction_accuracy_pct}%` : "—"}
                    </td>
                    <td className="text-center px-2">
                      <span className={`kr text-[9px] ${verdictMeta.color}`}>
                        {verdictMeta.icon} {verdictMeta.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {performanceSummary.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-6 text-center dim kr">
                    데이터 수집 중...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 방법론 */}
      <div className="mt-4 pt-3 border-t border-[var(--border)]">
        <div className="text-[9px] sm:text-[10px] tick mb-2">
          📐 METRICS · 정확도 지표 해석
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[8px] sm:text-[9px] dim kr">
          <div className="border border-[var(--border)] rounded p-2">
            <div className="font-bold bright mb-1">📏 MAE / RMSE</div>
            <div className="leading-relaxed">
              평균·제곱 절대오차. 값이 작을수록 정확. 단위는 원값과 같음
            </div>
          </div>
          <div className="border border-[var(--border)] rounded p-2">
            <div className="font-bold bright mb-1">📊 MAPE (%)</div>
            <div className="leading-relaxed">
              평균 백분율 오차. 5% 미만 우수 · 10% 미만 양호 · 그 이상 개선 필요
            </div>
          </div>
          <div className="border border-[var(--border)] rounded p-2">
            <div className="font-bold bright mb-1">🎯 구간 적중률</div>
            <div className="leading-relaxed">
              80% 신뢰구간 내 실제값 포함률. <span className="bright">80% 근처</span>가 이상적
            </div>
          </div>
          <div className="border border-[var(--border)] rounded p-2">
            <div className="font-bold bright mb-1">🧭 방향 적중률</div>
            <div className="leading-relaxed">
              상승/하락 방향 일치율. 50% = 랜덤, 65%↑ 우수
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
