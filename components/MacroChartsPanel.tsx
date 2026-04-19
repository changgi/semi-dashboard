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
  ReferenceArea,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ───────────────────────────────────────────────────────────
// 추적할 매크로 지표
// ───────────────────────────────────────────────────────────
const TRACKED_MACROS = [
  { symbol: "CL=F",     name: "WTI 원유",       icon: "🛢️", color: "#ff9944" },
  { symbol: "^NDX",     name: "나스닥100",      icon: "📊", color: "#ffb000" },
  { symbol: "^TNX",     name: "10Y 국채",       icon: "📜", color: "#88dd99" },
  { symbol: "^VIX",     name: "VIX 공포지수",   icon: "⚡", color: "#ff6688" },
  { symbol: "DX-Y.NYB", name: "달러 인덱스",     icon: "💵", color: "#aabbff" },
  { symbol: "SOXX",     name: "반도체 SOXX",     icon: "💻", color: "#ffb000" },
];

interface HistoryPoint {
  date: string;
  timestamp: number;
  value: number;
}

interface ForecastPoint {
  date: string;
  day: number;
  forecast: number;
  upper: number;
  lower: number;
}

interface MacroHistoryData {
  success: boolean;
  symbol: string;
  name: string;
  unit: string;
  current: number;
  history: HistoryPoint[];
  forecast: ForecastPoint[];
  stats: {
    min: number;
    max: number;
    mean: number;
    stdDev: number;
    zScore: number;
    trend: "uptrend" | "downtrend" | "sideways";
  };
  model: {
    longRunMean?: number;
    reversionSpeed: number;
    volatility: number;
  };
  danielYooView?: string;
}

// 단일 매크로 차트
function MacroChart({
  symbol,
  name,
  icon,
  color,
  range,
}: {
  symbol: string;
  name: string;
  icon: string;
  color: string;
  range: string;
}) {
  const { data } = useSWR<MacroHistoryData>(
    `/api/macro-history?symbol=${encodeURIComponent(symbol)}&range=${range}`,
    fetcher,
    { refreshInterval: 600000 }
  );

  if (!data?.success) {
    return (
      <div className="border border-[var(--border)] rounded p-3 h-[280px] flex items-center justify-center">
        <div className="text-[10px] dim kr">
          {icon} {name} 로딩 중...
        </div>
      </div>
    );
  }

  // 히스토리 + 전망 통합 (차트용)
  const chartData = [
    ...data.history.map((h) => ({
      date: h.date,
      actual: h.value,
      forecast: null as number | null,
      upper: null as number | null,
      lower: null as number | null,
      isForecast: false,
    })),
    // 전망치 (첫 포인트는 히스토리 마지막 값과 연결)
    ...data.forecast.map((f, i) => ({
      date: f.date,
      actual: null as number | null,
      forecast: i === 0 ? data.current : f.forecast,
      upper: f.upper,
      lower: f.lower,
      isForecast: true,
    })),
  ];

  // Y축 범위: 전망치 상하단 포함
  const allValues = [
    ...data.history.map((h) => h.value),
    ...data.forecast.map((f) => f.upper),
    ...data.forecast.map((f) => f.lower),
  ];
  const yMin = Math.min(...allValues) * 0.95;
  const yMax = Math.max(...allValues) * 1.05;

  // 추세 화살표
  const trendIcon =
    data.stats.trend === "uptrend" ? "▲" : data.stats.trend === "downtrend" ? "▼" : "─";
  const trendColor =
    data.stats.trend === "uptrend"
      ? "up"
      : data.stats.trend === "downtrend"
      ? "down"
      : "dim";

  // 전망 종료 값
  const lastForecast = data.forecast[data.forecast.length - 1];
  const forecastChange =
    lastForecast && data.current > 0
      ? ((lastForecast.forecast - data.current) / data.current) * 100
      : 0;

  // 전망 경계선 (첫 전망 날짜)
  const forecastStartDate = data.forecast[0]?.date;

  return (
    <div className="border border-[var(--border)] rounded p-2 sm:p-3 hover:border-[var(--amber-dim)] transition-colors">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-2 gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-[14px]">{icon}</span>
            <span className="text-[10px] sm:text-[11px] font-bold bright kr truncate">
              {name}
            </span>
          </div>
          <div className="text-[7px] sm:text-[8px] dim">{symbol}</div>
        </div>
        <div className="text-right">
          <div className="text-[13px] sm:text-[15px] font-bold tick">
            {data.current.toFixed(2)}
            <span className="text-[8px] dim ml-0.5">{data.unit}</span>
          </div>
          <div className={`text-[8px] sm:text-[9px] ${trendColor}`}>
            {trendIcon} Z:{data.stats.zScore > 0 ? "+" : ""}
            {data.stats.zScore}σ
          </div>
        </div>
      </div>

      {/* 차트 */}
      <div style={{ width: "100%", height: 140 }}>
        <ResponsiveContainer>
          <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`fgrad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.15} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
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
                if (value === null) return [null, null];
                if (name === "actual") return [value.toFixed(2), "실제값"];
                if (name === "forecast") return [value.toFixed(2), "전망"];
                if (name === "upper") return [value.toFixed(2), "80% 상단"];
                if (name === "lower") return [value.toFixed(2), "80% 하단"];
                return [value, name];
              }}
            />

            {/* 평균값 기준선 */}
            {data.model.longRunMean !== undefined && (
              <ReferenceLine
                y={data.model.longRunMean}
                stroke="rgba(255,255,255,0.2)"
                strokeDasharray="3 3"
                label={{
                  value: `장기평균 ${data.model.longRunMean}`,
                  fill: "#666",
                  fontSize: 8,
                  position: "right",
                }}
              />
            )}

            {/* 전망 시작 구분선 */}
            {forecastStartDate && (
              <ReferenceLine
                x={forecastStartDate}
                stroke="rgba(255,176,0,0.3)"
                strokeDasharray="2 4"
                label={{
                  value: "▲ 전망",
                  fill: "var(--amber)",
                  fontSize: 8,
                  position: "top",
                }}
              />
            )}

            {/* 실제값 (라인 + 영역) */}
            <Area
              type="monotone"
              dataKey="actual"
              stroke={color}
              strokeWidth={1.5}
              fill={`url(#grad-${symbol})`}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />

            {/* 전망 신뢰구간 (shaded area) */}
            <Area
              type="monotone"
              dataKey="upper"
              stroke="none"
              fill={`url(#fgrad-${symbol})`}
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey="lower"
              stroke="none"
              fill="var(--bg)"
              isAnimationActive={false}
            />

            {/* 전망 중앙선 (점선) */}
            <Line
              type="monotone"
              dataKey="forecast"
              stroke={color}
              strokeWidth={1.2}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* 하단 통계 */}
      <div className="mt-2 pt-2 border-t border-[var(--border)] grid grid-cols-4 gap-1 text-[7px] sm:text-[8px]">
        <div>
          <div className="dim kr">6개월 min</div>
          <div className="tick">{data.stats.min}</div>
        </div>
        <div>
          <div className="dim kr">max</div>
          <div className="tick">{data.stats.max}</div>
        </div>
        <div>
          <div className="dim kr">평균</div>
          <div className="tick">{data.stats.mean}</div>
        </div>
        <div>
          <div className="dim kr">6M 전망</div>
          <div className={forecastChange >= 0 ? "up" : "down"}>
            {forecastChange >= 0 ? "+" : ""}
            {forecastChange.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Daniel Yoo 전망 */}
      {data.danielYooView && (
        <div className="mt-2 text-[7px] sm:text-[8px] dim kr leading-tight border-l-2 border-[var(--amber-dim)] pl-2">
          🇰🇷 <span className="text-[var(--amber)]">Daniel Yoo:</span> {data.danielYooView}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 메인 컴포넌트
// ───────────────────────────────────────────────────────────
export function MacroChartsPanel() {
  const [range, setRange] = useState<"1mo" | "3mo" | "6mo" | "1y">("6mo");

  return (
    <div className="panel p-3 sm:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[12px]">
            📈 MACRO CHARTS · 히스토리 + 6개월 전망
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            Ornstein-Uhlenbeck 평균회귀 모델 기반 전망 · 80% 신뢰구간
          </div>
        </div>
        <div className="flex gap-1">
          {(["1mo", "3mo", "6mo", "1y"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2 py-1 text-[9px] sm:text-[10px] border ${
                range === r
                  ? "border-[var(--amber)] text-[var(--amber)] bg-[rgba(255,176,0,0.1)]"
                  : "border-[var(--border)] dim hover:border-[var(--amber-dim)]"
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* 차트 그리드 (2x3) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TRACKED_MACROS.map((m) => (
          <MacroChart
            key={m.symbol}
            symbol={m.symbol}
            name={m.name}
            icon={m.icon}
            color={m.color}
            range={range}
          />
        ))}
      </div>

      {/* 방법론 설명 */}
      <div className="mt-4 pt-3 border-t border-[var(--border)]">
        <div className="text-[9px] sm:text-[10px] tick mb-2">
          📐 METHODOLOGY · 전망 모델
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[8px] sm:text-[9px] dim kr">
          <div className="border border-[var(--border)] rounded p-2">
            <div className="font-bold bright mb-1">🧮 Ornstein-Uhlenbeck</div>
            <div className="leading-relaxed">
              dX = κ(θ − X)dt + σ·dW<br />
              현재값 → 장기평균으로 회귀하는 경로 시뮬레이션
            </div>
          </div>
          <div className="border border-[var(--border)] rounded p-2">
            <div className="font-bold bright mb-1">📊 80% 신뢰구간</div>
            <div className="leading-relaxed">
              상·하단 밴드 = ±1.28σ<br />
              실제값이 이 범위에 들어갈 확률 80%
            </div>
          </div>
          <div className="border border-[var(--border)] rounded p-2">
            <div className="font-bold bright mb-1">🎯 Z-Score</div>
            <div className="leading-relaxed">
              현재값의 표준편차 위치<br />
              {"|Z| > 2는 극단값 경계"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
