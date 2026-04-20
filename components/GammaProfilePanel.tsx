"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";

import { safeFetcher } from "@/lib/swr-config";
const fetcher = safeFetcher;

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface GammaPoint {
  spotPrice: number;
  totalGamma: number;
  callGamma: number;
  putGamma: number;
  regime: "positive" | "negative" | "flip";
}

interface Wall {
  strike: number;
  totalGamma: number;
  type: "call_wall" | "put_wall";
  distance: number;
}

interface Scenario {
  condition: string;
  action: string;
  rationale: string;
}

interface GammaData {
  success: boolean;
  symbol: string;
  currentPrice: number;
  profile: {
    pricePoints: GammaPoint[];
    flipLevel: number | null;
    currentRegime: "positive" | "negative";
    currentGamma: number;
    zeroGammaLevel: number | null;
    largestConcentrations: Wall[];
  };
  interpretation: {
    summary: string;
    signals: string[];
    scenarios: Scenario[];
  };
}

const TOP_SYMBOLS = ["NVDA", "AMD", "TSM", "AVGO", "MU", "SMH", "SOXX", "INTC", "QCOM", "SPY", "QQQ"];

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function GammaProfilePanel() {
  const [symbol, setSymbol] = useState("NVDA");
  const { data, isLoading } = useSWR<GammaData>(
    `/api/gamma-profile?symbol=${symbol}`,
    fetcher,
    { refreshInterval: 300000 } // 5분
  );

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[13px]">
            📐 GAMMA PROFILE · 가격대별 감마 분포 + Flip Level
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            옵션 딜러의 헤지 규모 시각화 · Gamma Flip으로 변동성 전환점 찾기
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
        <div className="text-[10px] dim text-center py-10 kr">
          📐 감마 프로파일 계산 중...
        </div>
      ) : !data?.success ? (
        <div className="text-[10px] dim text-center py-10 kr">
          {(data as unknown as { error?: string })?.error || "데이터 없음"}
        </div>
      ) : (
        <>
          {/* ═════════ 핵심 지표 카드 ═════════ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <CoreMetric
              title="현재 레짐"
              value={data.profile.currentRegime === "positive" ? "✅ 양의 GEX" : "⚠️ 음의 GEX"}
              subtitle={`${(data.profile.currentGamma / 1e9).toFixed(2)}B`}
              color={data.profile.currentRegime === "positive" ? "green" : "red"}
              hint={data.profile.currentRegime === "positive" ? "변동성 억제" : "변동성 증폭 위험"}
            />
            <CoreMetric
              title="🎯 Gamma Flip"
              value={data.profile.flipLevel !== null ? `$${data.profile.flipLevel.toFixed(2)}` : "—"}
              subtitle={
                data.profile.flipLevel !== null
                  ? `${(((data.profile.flipLevel - data.currentPrice) / data.currentPrice) * 100).toFixed(1)}%`
                  : "없음"
              }
              color="amber"
              hint={
                data.profile.flipLevel === null
                  ? "범위 내 전환점 없음"
                  : data.profile.flipLevel > data.currentPrice
                  ? "돌파 시 추세 강화"
                  : "하락 시 변동성 증가"
              }
            />
            <CoreMetric
              title="현재가"
              value={`$${data.currentPrice.toFixed(2)}`}
              subtitle={data.symbol}
              color="blue"
              hint="실시간 스팟 가격"
            />
          </div>

          {/* ═════════ 핵심 요약 ═════════ */}
          <div
            className={`mb-3 p-3 border-l-4 rounded ${
              data.profile.currentRegime === "positive"
                ? "border-[#00ff88] bg-[rgba(0,255,136,0.05)]"
                : "border-[#ff3860] bg-[rgba(255,56,96,0.05)]"
            }`}
          >
            <div className="text-[11px] sm:text-[12px] kr font-bold">
              💡 {data.interpretation.summary}
            </div>
          </div>

          {/* ═════════ Gamma Profile 차트 ═════════ */}
          <div className="mb-3">
            <div className="text-[10px] tick kr font-bold mb-2">
              📊 Gamma Distribution · 가격대별 GEX (바 차트)
            </div>
            <div style={{ width: "100%", height: 300 }}>
              <ResponsiveContainer>
                <ComposedChart
                  data={data.profile.pricePoints}
                  margin={{ top: 10, right: 10, bottom: 5, left: 0 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
                  <XAxis
                    dataKey="spotPrice"
                    tick={{ fill: "#888", fontSize: 9 }}
                    tickFormatter={(v) => `$${v.toFixed(0)}`}
                    label={{
                      value: "주가 ($)",
                      position: "insideBottom",
                      offset: -5,
                      style: { fill: "#888", fontSize: 10 },
                    }}
                  />
                  <YAxis
                    tick={{ fill: "#888", fontSize: 9 }}
                    tickFormatter={(v) => `${(v / 1e9).toFixed(1)}B`}
                    label={{
                      value: "GEX ($B)",
                      angle: -90,
                      position: "insideLeft",
                      style: { fill: "#888", fontSize: 10 },
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(20,20,20,0.95)",
                      border: "1px solid var(--amber-dim)",
                      borderRadius: "4px",
                      fontSize: 11,
                    }}
                    formatter={(value: number, name: string) => {
                      return [`${(value / 1e9).toFixed(2)}B`, name];
                    }}
                    labelFormatter={(v) => `주가 $${Number(v).toFixed(2)}`}
                  />
                  <ReferenceLine y={0} stroke="#666" strokeWidth={1} />
                  {/* 현재가 수직선 */}
                  <ReferenceLine
                    x={data.currentPrice}
                    stroke="var(--amber)"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                    label={{
                      value: "현재",
                      fill: "var(--amber)",
                      fontSize: 9,
                      position: "top",
                    }}
                  />
                  {/* Gamma Flip 수직선 */}
                  {data.profile.flipLevel !== null && (
                    <ReferenceLine
                      x={data.profile.flipLevel}
                      stroke="#ff8844"
                      strokeWidth={2}
                      strokeDasharray="4 2"
                      label={{
                        value: "FLIP",
                        fill: "#ff8844",
                        fontSize: 9,
                        position: "top",
                      }}
                    />
                  )}
                  <Bar dataKey="totalGamma" name="Total GEX">
                    {data.profile.pricePoints.map((pt, i) => (
                      <Cell
                        key={i}
                        fill={pt.totalGamma >= 0 ? "#00ff88" : "#ff3860"}
                        opacity={Math.abs(pt.spotPrice - data.currentPrice) < 2 ? 1 : 0.5}
                      />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="text-[8px] dim kr mt-1 text-center">
              🟢 양의 GEX = 변동성 억제 · 🔴 음의 GEX = 변동성 증폭 · 🟡 현재가 · 🟠 Flip Level
            </div>
          </div>

          {/* ═════════ Call/Put Walls (지지/저항) ═════════ */}
          {data.profile.largestConcentrations.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] tick kr font-bold mb-2">
                🧱 Major Walls · 주요 지지/저항 레벨
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.profile.largestConcentrations.map((w, i) => (
                  <div
                    key={i}
                    className={`border-l-2 rounded-r p-2 ${
                      w.type === "call_wall"
                        ? "border-[#ff3860] bg-[rgba(255,56,96,0.03)]"
                        : "border-[#00ff88] bg-[rgba(0,255,136,0.03)]"
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span
                        className={`text-[10px] font-bold ${
                          w.type === "call_wall" ? "down" : "up"
                        }`}
                      >
                        {w.type === "call_wall" ? "🧱 Call Wall (저항)" : "⛰️ Put Wall (지지)"} $
                        {w.strike.toFixed(2)}
                      </span>
                      <span className="text-[8px] tick font-bold">
                        ${(w.totalGamma / 1e9).toFixed(2)}B
                      </span>
                    </div>
                    <div className="text-[8px] dim kr mt-0.5">
                      현재가 대비 {w.type === "call_wall" ? "+" : "-"}
                      {((w.distance / data.currentPrice) * 100).toFixed(1)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═════════ 시그널 ═════════ */}
          {data.interpretation.signals.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] tick kr font-bold mb-2">
                🔍 Current Signals · 현재 시그널
              </div>
              <div className="flex flex-wrap gap-1">
                {data.interpretation.signals.map((s, i) => (
                  <span
                    key={i}
                    className="text-[9px] px-2 py-1 border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded kr"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ═════════ 시나리오 ═════════ */}
          {data.interpretation.scenarios.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] tick kr font-bold mb-2">
                🎬 Action Scenarios · 시나리오별 액션
              </div>
              <div className="space-y-2">
                {data.interpretation.scenarios.map((sc, i) => (
                  <div
                    key={i}
                    className="border border-[var(--border)] rounded p-2 hover:border-[var(--amber-dim)] transition-colors"
                  >
                    <div className="flex items-start gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] dim kr">📍 조건</div>
                        <div className="text-[10px] kr mt-0.5">{sc.condition}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] text-[var(--amber)] kr font-bold">🎯 액션</div>
                        <div className="text-[10px] kr mt-0.5 font-bold">{sc.action}</div>
                      </div>
                    </div>
                    <div className="text-[8px] dim kr mt-1 border-t border-[var(--border)] pt-1">
                      💭 {sc.rationale}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═════════ 교육 섹션 ═════════ */}
          <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
            <span className="bright">📚 Gamma Profile 해석 가이드</span>:<br />
            · <span className="bright">양의 GEX 구간</span>: 딜러가 매수 포지션 → 상승 시 매도, 하락 시 매수 → <span className="up">변동성 감소</span><br />
            · <span className="bright">음의 GEX 구간</span>: 딜러가 매도 포지션 → 상승 시 추가 매수, 하락 시 추가 매도 → <span className="down">변동성 증폭</span><br />
            · <span className="bright">Gamma Flip Level</span>: 부호가 바뀌는 가격. 이 레벨이 <span className="up">지지선/저항선</span>으로 강력하게 작용<br />
            · <span className="bright">Call Wall</span>: 대량 콜 OI 집중 → 상승 저항<br />
            · <span className="bright">Put Wall</span>: 대량 풋 OI 집중 → 하락 지지
          </div>
        </>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
// 지표 카드
// ───────────────────────────────────────────────────────────
function CoreMetric({
  title,
  value,
  subtitle,
  color,
  hint,
}: {
  title: string;
  value: string;
  subtitle: string;
  color: "green" | "red" | "amber" | "blue";
  hint: string;
}) {
  const colorClass = {
    green: "text-[#00ff88] border-[#00ff88]/30",
    red: "text-[#ff3860] border-[#ff3860]/30",
    amber: "text-[var(--amber)] border-[var(--amber-dim)]",
    blue: "text-[#aaccff] border-[#aaccff]/30",
  }[color];

  return (
    <div className={`border ${colorClass.split(" ")[1]} rounded p-3 bg-[rgba(0,0,0,0.3)]`}>
      <div className="text-[9px] dim kr mb-1">{title}</div>
      <div className={`text-[18px] font-bold ${colorClass.split(" ")[0]} leading-tight`}>
        {value}
      </div>
      <div className={`text-[10px] ${colorClass.split(" ")[0]} mt-0.5`}>{subtitle}</div>
      <div className="text-[8px] dim kr mt-1 italic">{hint}</div>
    </div>
  );
}
