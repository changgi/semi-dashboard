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
  ReferenceDot,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface PricePoint {
  date: string;
  actual: number | null;
  forecast: number | null;
  upperBand: number | null;
  lowerBand: number | null;
  isToday: boolean;
  isFuture: boolean;
}

interface EventMarker {
  date: string;
  type: string;
  icon: string;
  label: string;
  importance: number;
  description: string;
}

interface PriceLevel {
  price: number;
  type: string;
  label: string;
  strength: number;
  source: string;
  color: string;
}

interface TradingSignal {
  date: string;
  targetPrice: number;
  action: "buy" | "sell" | "hold" | "hedge" | "wait";
  actionLabel: string;
  icon: string;
  color: string;
  confidence: number;
  reason: string;
  urgency: "now" | "soon" | "watch";
}

interface Decision {
  action: "buy" | "sell" | "hold" | "hedge" | "wait";
  actionLabel: string;
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  confidence: number;
  priority: "high" | "medium" | "low";
  reasons: string[];
  risks: string[];
  targetPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

interface InsightData {
  success: boolean;
  symbol: string;
  currentPrice: number;
  priceSeries: PricePoint[];
  events: EventMarker[];
  levels: PriceLevel[];
  signals: TradingSignal[];
  decision: Decision;
  technicals: {
    rsi: number | null;
    sma20: number;
    priceVsSMA20: number;
  };
  options: {
    maxPain: number | null;
    gammaFlip: number | null;
    gammaRegime: "positive" | "negative";
    nearestExpiry: string | null;
    expiryCount: number;
    walls: Array<{ strike: number; type: string; gex: number }>;
  };
  nearestOpEx: { date: string; type: string; daysUntil: number } | null;
}

const TOP_SYMBOLS = ["NVDA", "AMD", "TSM", "AVGO", "MU", "SMH", "SOXX", "INTC", "QCOM", "ARM"];

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function UnifiedInsightChart() {
  const [symbol, setSymbol] = useState("NVDA");
  const { data, isLoading } = useSWR<InsightData>(
    `/api/unified-insight?symbol=${symbol}&days=60`,
    fetcher,
    { refreshInterval: 300000 } // 5분
  );

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[12px] sm:text-[14px]">
            🎯 UNIFIED INSIGHT · 통합 매매 결정 차트
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            가격 예측 · 옵션 레벨 · 이벤트 · 매매 시점 · 하나의 차트에 모두
          </div>
        </div>
      </div>

      {/* 종목 선택 */}
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <span className="text-[9px] dim kr">종목:</span>
        {TOP_SYMBOLS.map((s) => (
          <button
            key={s}
            onClick={() => setSymbol(s)}
            className={`text-[9px] px-2 py-1 border transition-all ${
              symbol === s
                ? "border-[var(--amber)] bg-[var(--amber)] text-[#111] font-bold"
                : "border-[var(--border)] dim hover:border-[var(--amber-dim)]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-[10px] dim text-center py-16 kr">
          🎯 통합 분석 중... (가격 예측 + 옵션 + 이벤트 + 시그널)
        </div>
      ) : !data?.success ? (
        <div className="text-[10px] dim text-center py-16 kr">
          {(data as unknown as { error?: string })?.error || "데이터 로딩 실패"}
        </div>
      ) : !data.priceSeries || !data.decision ? (
        <div className="text-[10px] dim text-center py-16 kr">
          분석 데이터 수집 중... 잠시 후 다시 시도해주세요
        </div>
      ) : (
        <>
          {/* ═════════ 🎯 최종 결정 카드 (최상단) ═════════ */}
          <DecisionCard data={data} />

          {/* ═════════ 📊 통합 차트 ═════════ */}
          <div className="mt-3">
            <div className="text-[10px] tick kr font-bold mb-2">
              📈 Integrated Chart · 과거 30일 + 예측 60일 + 모든 레벨/이벤트
            </div>
            <IntegratedChart data={data} />
            <ChartLegend />
          </div>

          {/* ═════════ 📅 매매 시그널 타임라인 ═════════ */}
          {(data.signals?.length ?? 0) > 0 && (
            <div className="mt-3">
              <div className="text-[10px] tick kr font-bold mb-2">
                📅 Trading Signals Timeline · 매매 시그널 타임라인
              </div>
              <SignalTimeline signals={data.signals} currentPrice={data.currentPrice} />
            </div>
          )}

          {/* ═════════ 📊 핵심 지표 요약 ═════════ */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <SummaryBox
              title="현재가"
              value={`$${data.currentPrice.toFixed(2)}`}
              subtitle={data.symbol}
              color="amber"
            />
            <SummaryBox
              title="RSI"
              value={data.technicals.rsi !== null ? data.technicals.rsi.toFixed(0) : "—"}
              subtitle={
                data.technicals.rsi === null
                  ? "-"
                  : data.technicals.rsi > 70
                  ? "과매수"
                  : data.technicals.rsi < 30
                  ? "과매도"
                  : "정상"
              }
              color={
                data.technicals.rsi === null
                  ? "gray"
                  : data.technicals.rsi > 70
                  ? "red"
                  : data.technicals.rsi < 30
                  ? "green"
                  : "gray"
              }
            />
            <SummaryBox
              title="Gamma 레짐"
              value={data.options.gammaRegime === "positive" ? "✅ 양수" : "⚠️ 음수"}
              subtitle={data.options.gammaRegime === "positive" ? "안정적" : "변동성 위험"}
              color={data.options.gammaRegime === "positive" ? "green" : "red"}
            />
            <SummaryBox
              title="다음 OpEx"
              value={data.nearestOpEx ? `D-${data.nearestOpEx.daysUntil}` : "—"}
              subtitle={data.nearestOpEx?.type ?? "없음"}
              color={
                data.nearestOpEx && data.nearestOpEx.daysUntil <= 7 ? "amber" : "gray"
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 🎯 최종 결정 카드
// ═══════════════════════════════════════════════════════════
function DecisionCard({ data }: { data: InsightData }) {
  const d = data.decision;

  return (
    <div
      className="border-2 rounded-lg p-3 sm:p-4"
      style={{
        borderColor: d.color,
        background: `linear-gradient(135deg, ${d.color}15, transparent)`,
      }}
    >
      <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="text-[9px] dim kr mb-1">오늘의 결정</div>
          <div className="flex items-center gap-3 flex-wrap">
            <div
              className="text-[36px] sm:text-[48px] font-bold leading-none"
              style={{ color: d.color }}
            >
              {d.icon} {d.actionLabel}
            </div>
            {d.priority === "high" && (
              <span className="text-[10px] px-2 py-0.5 border border-[#ff3860] text-[#ff3860] rounded kr animate-pulse">
                ⚡ 긴급
              </span>
            )}
          </div>
          <div className="text-[12px] sm:text-[14px] font-bold kr mt-2" style={{ color: d.color }}>
            {d.title}
          </div>
          <div className="text-[10px] dim kr mt-1">{d.subtitle}</div>
        </div>

        <div className="text-right">
          <div className="text-[9px] dim kr">신뢰도</div>
          <div className="text-[28px] font-bold" style={{ color: d.color }}>
            {d.confidence}%
          </div>
          <div className="w-20 h-1.5 bg-[var(--border)] rounded overflow-hidden mt-1">
            <div
              className="h-full transition-all"
              style={{ width: `${d.confidence}%`, background: d.color }}
            />
          </div>
        </div>
      </div>

      {/* 목표가 / 손절 / 익절 */}
      {(d.targetPrice || d.stopLoss || d.takeProfit) && (
        <div className="grid grid-cols-3 gap-2 mb-3 pt-3 border-t border-[var(--border)]">
          {d.stopLoss && (
            <div>
              <div className="text-[8px] dim kr">🛑 손절가</div>
              <div className="text-[14px] font-bold down">${d.stopLoss.toFixed(2)}</div>
            </div>
          )}
          {d.targetPrice && (
            <div>
              <div className="text-[8px] dim kr">🎯 목표가</div>
              <div className="text-[14px] font-bold" style={{ color: d.color }}>
                ${d.targetPrice.toFixed(2)}
              </div>
            </div>
          )}
          {d.takeProfit && (
            <div>
              <div className="text-[8px] dim kr">💰 익절가</div>
              <div className="text-[14px] font-bold up">${d.takeProfit.toFixed(2)}</div>
            </div>
          )}
        </div>
      )}

      {/* 이유 + 리스크 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(d.reasons?.length ?? 0) > 0 && (
          <div>
            <div className="text-[10px] text-[#00ff88] font-bold kr mb-1">
              ✅ 근거 ({d.reasons.length})
            </div>
            <ul className="space-y-1">
              {(d.reasons ?? []).slice(0, 5).map((r, i) => (
                <li key={i} className="text-[9px] kr leading-relaxed">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
        {(d.risks?.length ?? 0) > 0 && (
          <div>
            <div className="text-[10px] text-[#ff3860] font-bold kr mb-1">
              ⚠️ 리스크 ({d.risks.length})
            </div>
            <ul className="space-y-1">
              {(d.risks ?? []).slice(0, 5).map((r, i) => (
                <li key={i} className="text-[9px] kr leading-relaxed">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 📊 통합 차트 (핵심!)
// ═══════════════════════════════════════════════════════════
function IntegratedChart({ data }: { data: InsightData }) {
  // 방어: 배열이 없으면 빈 배열로
  const priceSeries = data.priceSeries ?? [];
  const levels = data.levels ?? [];
  const events = data.events ?? [];
  const signals = data.signals ?? [];

  // 차트 데이터 준비
  const chartData = priceSeries.map((p) => ({
    date: p.date,
    dateShort: p.date.slice(5), // MM-DD
    actual: p.actual,
    forecast: p.isFuture ? p.forecast : null,
    upperBand: p.isFuture ? p.upperBand : null,
    lowerBand: p.isFuture ? p.lowerBand : null,
    // 밴드 높이 (Area 차트용)
    bandRange: p.isFuture && p.upperBand && p.lowerBand ? p.upperBand - p.lowerBand : null,
  }));

  // 오늘 날짜 찾기
  const todayIndex = priceSeries.findIndex((p) => p.isToday);
  const todayDate = priceSeries[todayIndex]?.date;

  // Y축 범위 계산
  const allPrices = [
    ...chartData.filter(d => d.actual !== null).map(d => d.actual as number),
    ...chartData.filter(d => d.forecast !== null).map(d => d.forecast as number),
    ...chartData.filter(d => d.upperBand !== null).map(d => d.upperBand as number),
    ...chartData.filter(d => d.lowerBand !== null).map(d => d.lowerBand as number),
    ...levels.map(l => l.price),
  ].filter((v): v is number => v !== null && !isNaN(v));

  const minY = allPrices.length > 0 ? Math.min(...allPrices) * 0.98 : 0;
  const maxY = allPrices.length > 0 ? Math.max(...allPrices) * 1.02 : 100;

  return (
    <div style={{ width: "100%", height: 440 }}>
      <ResponsiveContainer>
        <ComposedChart
          data={chartData}
          margin={{ top: 20, right: 70, bottom: 20, left: 10 }}
        >
          <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="2 3" />
          <XAxis
            dataKey="dateShort"
            tick={{ fill: "#888", fontSize: 9 }}
            interval="preserveStartEnd"
            minTickGap={30}
          />
          <YAxis
            tick={{ fill: "#888", fontSize: 9 }}
            domain={[minY, maxY]}
            tickFormatter={(v) => `$${v.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(20,20,20,0.95)",
              border: "1px solid var(--amber-dim)",
              borderRadius: 4,
              fontSize: 11,
            }}
            formatter={(value: number, name: string) => {
              if (value === null || isNaN(value)) return ["—", name];
              return [`$${value.toFixed(2)}`, name];
            }}
          />

          {/* 예측 신뢰 밴드 (상한-하한) */}
          <Area
            type="monotone"
            dataKey="upperBand"
            stroke="none"
            fill="#ffb000"
            fillOpacity={0.08}
            name="신뢰 상한"
            connectNulls
          />
          <Area
            type="monotone"
            dataKey="lowerBand"
            stroke="none"
            fill="var(--bg)"
            fillOpacity={1}
            name="신뢰 하한"
            connectNulls
          />

          {/* 실제 가격 (과거) */}
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#ffb000"
            strokeWidth={2}
            dot={false}
            name="실제 가격"
            connectNulls
          />

          {/* 예측 가격 (미래) */}
          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#ffb000"
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            name="예측"
            connectNulls
          />

          {/* 신뢰 상한선 */}
          <Line
            type="monotone"
            dataKey="upperBand"
            stroke="#ffb000"
            strokeWidth={1}
            strokeDasharray="2 2"
            strokeOpacity={0.4}
            dot={false}
            name="상한"
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="lowerBand"
            stroke="#ffb000"
            strokeWidth={1}
            strokeDasharray="2 2"
            strokeOpacity={0.4}
            dot={false}
            name="하한"
            connectNulls
          />

          {/* 오늘 수직선 */}
          {todayDate && (
            <ReferenceLine
              x={todayDate.slice(5)}
              stroke="#fff"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              label={{ value: "오늘", fill: "#fff", fontSize: 10, position: "top" }}
            />
          )}

          {/* ═════════ 옵션 레벨 가로선 ═════════ */}
          {levels.map((lvl, i) => (
            <ReferenceLine
              key={`level-${i}`}
              y={lvl.price}
              stroke={lvl.color}
              strokeWidth={1.2}
              strokeDasharray={
                lvl.type === "gamma_flip" ? "6 3" :
                lvl.type === "max_pain" ? "4 4" :
                "2 2"
              }
              label={{
                value: lvl.label,
                fill: lvl.color,
                fontSize: 9,
                position: "insideTopRight",
              }}
            />
          ))}

          {/* ═════════ 이벤트 세로선 (OpEx 등) ═════════ */}
          {events.filter(e => e.importance >= 4).map((ev, i) => (
            <ReferenceLine
              key={`event-${i}`}
              x={ev.date.slice(5)}
              stroke={ev.type === "quad_witching" ? "#ff3860" : "#ffaa44"}
              strokeWidth={1.2}
              strokeDasharray="3 3"
              label={{
                value: ev.icon + " " + ev.label,
                fill: ev.type === "quad_witching" ? "#ff3860" : "#ffaa44",
                fontSize: 9,
                position: "top",
                angle: -45,
              }}
            />
          ))}

          {/* ═════════ 매매 시그널 점 (핵심!) ═════════ */}
          {signals.map((sig, i) => {
            const seriesPoint = chartData.find(c => c.date === sig.date);
            if (!seriesPoint) return null;
            return (
              <ReferenceDot
                key={`sig-${i}`}
                x={sig.date.slice(5)}
                y={sig.targetPrice}
                r={8}
                fill={sig.color}
                stroke="#fff"
                strokeWidth={1.5}
                label={{
                  value: sig.icon,
                  fontSize: 14,
                  position: "center",
                }}
              />
            );
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 차트 범례
// ═══════════════════════════════════════════════════════════
function ChartLegend() {
  return (
    <div className="mt-2 text-[8px] dim kr leading-relaxed flex flex-wrap gap-x-3 gap-y-1">
      <span>📊 <span className="text-[#ffb000]">━━</span> 실제가</span>
      <span><span className="text-[#ffb000]">- - -</span> 예측</span>
      <span><span className="text-[#ffb000]" style={{ opacity: 0.4 }}>━━</span> 신뢰구간</span>
      <span>🟢 매수</span>
      <span>🔴 매도</span>
      <span>🛡️ 헤지</span>
      <span><span className="text-[#ee99ff]">- - -</span> Max Pain</span>
      <span><span className="text-[#ff8844]">━ ━</span> Gamma Flip</span>
      <span><span className="text-[#ff6699]">···</span> Call Wall</span>
      <span><span className="text-[#00cc88]">···</span> Put Wall</span>
      <span>🔥 쿼드 위칭</span>
      <span>📅 월간 OpEx</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 시그널 타임라인
// ═══════════════════════════════════════════════════════════
function SignalTimeline({
  signals,
  currentPrice,
}: {
  signals: TradingSignal[];
  currentPrice: number;
}) {
  const today = new Date().toISOString().split("T")[0];
  // 오늘 이후 시그널만
  const futureSignals = signals.filter(s => s.date >= today).slice(0, 10);

  if (futureSignals.length === 0) {
    return (
      <div className="text-[10px] dim text-center py-4 kr border border-[var(--border)] rounded">
        예정된 매매 시그널 없음
      </div>
    );
  }

  const today_ = new Date();
  return (
    <div className="space-y-1.5">
      {futureSignals.map((sig, i) => {
        const targetDate = new Date(sig.date);
        const daysUntil = Math.floor((targetDate.getTime() - today_.getTime()) / 86400000);
        const priceDiff = ((sig.targetPrice - currentPrice) / currentPrice) * 100;

        return (
          <div
            key={i}
            className="border-l-4 rounded-r p-2 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
            style={{ borderLeftColor: sig.color }}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                <span className="text-[14px]">{sig.icon}</span>
                <span className="text-[10px] font-bold" style={{ color: sig.color }}>
                  {sig.actionLabel}
                </span>
                <span className="text-[9px] dim kr">→ ${sig.targetPrice.toFixed(2)}</span>
                <span
                  className={`text-[9px] ${priceDiff >= 0 ? "up" : "down"}`}
                >
                  ({priceDiff >= 0 ? "+" : ""}
                  {priceDiff.toFixed(1)}%)
                </span>
                <span className="text-[8px] dim kr">신뢰도 {sig.confidence}%</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {sig.urgency === "now" && (
                  <span className="text-[8px] px-1.5 py-0.5 bg-[#ff3860] text-white rounded kr animate-pulse">
                    NOW
                  </span>
                )}
                <div className="text-right">
                  <div className="text-[9px] tick font-bold">{sig.date.slice(5)}</div>
                  <div className="text-[8px] dim">
                    {daysUntil === 0 ? "오늘" : `D-${daysUntil}`}
                  </div>
                </div>
              </div>
            </div>
            <div className="text-[8px] dim kr mt-1 pl-6">💭 {sig.reason}</div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 요약 박스
// ═══════════════════════════════════════════════════════════
function SummaryBox({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  color: "amber" | "green" | "red" | "gray";
}) {
  const colorClass = {
    amber: "text-[var(--amber)] border-[var(--amber-dim)]",
    green: "text-[#00ff88] border-[#00ff88]/30",
    red: "text-[#ff3860] border-[#ff3860]/30",
    gray: "text-[#aaa] border-[var(--border)]",
  }[color];

  return (
    <div className={`border ${colorClass.split(" ")[1]} rounded p-2 text-center bg-[rgba(0,0,0,0.3)]`}>
      <div className="text-[8px] dim kr mb-0.5">{title}</div>
      <div className={`text-[16px] font-bold ${colorClass.split(" ")[0]}`}>{value}</div>
      <div className="text-[8px] dim kr mt-0.5">{subtitle}</div>
    </div>
  );
}
