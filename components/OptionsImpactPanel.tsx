"use client";

import { useState } from "react";
import useSWR from "swr";

import { safeFetcher } from "@/lib/swr-config";
const fetcher = safeFetcher;

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface Prediction {
  direction: "up" | "down" | "neutral";
  confidence: number;
  targetPrice: number;
  targetPct: number;
  timeHorizon: string;
  rationale: string[];
  signals: string[];
}

interface ImpactData {
  success: boolean;
  symbol: string;
  currentPrice: number;
  prediction: Prediction;
  expectedMove: number;
  expectedMovePct: number;
  maxPain: number | null;
  daysToExpiry: number;
  nearestExpiry: string;
  gex: {
    total: number;
    call: number;
    put: number;
    regime: "positive" | "negative_extreme" | "neutral";
    topStrikes: Array<{ strike: number; gex: number; oi: number }>;
  };
  ivStructure: {
    atmCallIV: number;
    atmPutIV: number;
    verticalSkew: number;
    putSkew25d: number;
    interpretation: string;
  };
  putCallRatio: number;
  putCallVolRatio: number;
  totalCallOI: number;
  totalPutOI: number;
  supportResistance: Array<{
    price: number;
    strength: number;
    type: "support" | "resistance";
    source: string;
  }>;
  unusualActivity: Array<{
    strike: number;
    type: string;
    volume: number;
    oi: number;
    ratio: number;
    implication: string;
    expiry: string;
  }>;
  allExpiries: string[];
}

// 추천 종목 (반도체 섹터 핵심)
const TOP_SYMBOLS = ["NVDA", "AMD", "TSM", "AVGO", "MU", "SMH", "SOXX", "INTC", "QCOM", "ARM"];

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function OptionsImpactPanel() {
  const [symbol, setSymbol] = useState("NVDA");
  const { data, isLoading, error } = useSWR<ImpactData>(
    `/api/options-impact?symbol=${symbol}`,
    fetcher,
    { refreshInterval: 300000 } // 5분
  );

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[12px]">
            🎯 OPTIONS IMPACT · 옵션이 현물에 미칠 영향 예측
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            GEX · Max Pain · IV Skew · Unusual Activity 종합 분석 · 5분 갱신
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
          🎯 옵션 데이터 분석 중...
        </div>
      ) : !data?.success ? (
        <div className="text-[10px] dim text-center py-10 kr">
          {(error as Error)?.message ||
            (data as unknown as { error?: string })?.error ||
            "데이터 로딩 실패"}
        </div>
      ) : (
        <>
          {/* ═════════ 핵심 예측 카드 ═════════ */}
          <PredictionCard data={data} />

          {/* ═════════ 3열 주요 지표 ═════════ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
            <MetricCard
              title="🎯 Max Pain"
              value={data.maxPain ? `$${data.maxPain.toFixed(2)}` : "—"}
              subtitle={
                data.maxPain
                  ? `현재가 대비 ${(((data.maxPain - data.currentPrice) / data.currentPrice) * 100).toFixed(1)}%`
                  : "-"
              }
              hint={`만기 ${data.daysToExpiry}일 후 (${data.nearestExpiry})`}
              color={
                data.maxPain && data.maxPain > data.currentPrice ? "green" : "red"
              }
            />
            <MetricCard
              title="📊 GEX (감마 익스포저)"
              value={
                Math.abs(data.gex.total) > 1e9
                  ? `${(data.gex.total / 1e9).toFixed(1)}B`
                  : `${(data.gex.total / 1e6).toFixed(0)}M`
              }
              subtitle={
                data.gex.regime === "positive"
                  ? "양의 GEX (안정적)"
                  : data.gex.regime === "negative_extreme"
                  ? "음의 GEX (급등락 위험)"
                  : "중립"
              }
              hint="딜러 헤지 포지션 크기"
              color={
                data.gex.regime === "positive"
                  ? "green"
                  : data.gex.regime === "negative_extreme"
                  ? "red"
                  : "amber"
              }
            />
            <MetricCard
              title="⚡ 예상 변동폭"
              value={`±${data.expectedMovePct.toFixed(2)}%`}
              subtitle={`±$${data.expectedMove.toFixed(2)}`}
              hint={`ATM 스트래들 기준 (${data.daysToExpiry}일)`}
              color="amber"
            />
          </div>

          {/* ═════════ IV Skew + P/C ═════════ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
            <div className="border border-[var(--border)] rounded p-3">
              <div className="text-[9px] tick kr font-bold mb-2">
                📈 IV Structure · 변동성 편향
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <div className="text-[8px] dim kr">ATM 콜 IV</div>
                  <div className="text-[14px] tick font-bold">
                    {data.ivStructure.atmCallIV.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-[8px] dim kr">ATM 풋 IV</div>
                  <div className="text-[14px] tick font-bold">
                    {data.ivStructure.atmPutIV.toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-[8px] dim kr">수직 스큐</div>
                  <div
                    className={`text-[13px] font-bold ${
                      data.ivStructure.verticalSkew > 2
                        ? "down"
                        : data.ivStructure.verticalSkew < 0
                        ? "up"
                        : "tick"
                    }`}
                  >
                    {data.ivStructure.verticalSkew > 0 ? "+" : ""}
                    {data.ivStructure.verticalSkew.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-[8px] dim kr">25δ 풋 스큐</div>
                  <div
                    className={`text-[13px] font-bold ${
                      data.ivStructure.putSkew25d > 5
                        ? "down"
                        : data.ivStructure.putSkew25d < 0
                        ? "up"
                        : "tick"
                    }`}
                  >
                    {data.ivStructure.putSkew25d > 0 ? "+" : ""}
                    {data.ivStructure.putSkew25d.toFixed(2)}%
                  </div>
                </div>
              </div>
              <div className="text-[8px] dim kr border-l-2 border-[var(--amber-dim)] pl-2 leading-relaxed">
                💡 {data.ivStructure.interpretation}
              </div>
            </div>

            <div className="border border-[var(--border)] rounded p-3">
              <div className="text-[9px] tick kr font-bold mb-2">
                📊 Put/Call Positioning · 포지셔닝
              </div>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <div className="text-[8px] dim kr">P/C Ratio (OI)</div>
                  <div
                    className={`text-[14px] font-bold ${
                      data.putCallRatio < 0.6
                        ? "up"
                        : data.putCallRatio > 1.0
                        ? "down"
                        : "tick"
                    }`}
                  >
                    {data.putCallRatio.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[8px] dim kr">P/C Ratio (Vol)</div>
                  <div
                    className={`text-[14px] font-bold ${
                      data.putCallVolRatio < 0.6
                        ? "up"
                        : data.putCallVolRatio > 1.0
                        ? "down"
                        : "tick"
                    }`}
                  >
                    {data.putCallVolRatio.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[8px] dim kr">총 콜 OI</div>
                  <div className="text-[12px] text-[#00ff88] font-bold">
                    {data.totalCallOI.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[8px] dim kr">총 풋 OI</div>
                  <div className="text-[12px] text-[#ff3860] font-bold">
                    {data.totalPutOI.toLocaleString()}
                  </div>
                </div>
              </div>
              <div className="text-[8px] dim kr border-l-2 border-[var(--amber-dim)] pl-2 leading-relaxed">
                💡{" "}
                {data.putCallRatio < 0.5
                  ? "극도의 콜 압도 - 과열 주의"
                  : data.putCallRatio < 0.7
                  ? "콜 우위 - 강세 심리"
                  : data.putCallRatio < 1.0
                  ? "중립"
                  : data.putCallRatio < 1.3
                  ? "풋 우위 - 약세/헤지"
                  : "극도의 풋 압도 - 공포"}
              </div>
            </div>
          </div>

          {/* ═════════ 지지/저항선 ═════════ */}
          {data.supportResistance.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] tick kr font-bold mb-2">
                🧱 옵션 기반 지지/저항선 (대규모 OI 스트라이크)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.supportResistance.map((lvl, i) => (
                  <div
                    key={i}
                    className={`border-l-2 ${
                      lvl.type === "resistance"
                        ? "border-[#ff3860] bg-[rgba(255,56,96,0.03)]"
                        : "border-[#00ff88] bg-[rgba(0,255,136,0.03)]"
                    } p-2 rounded-r`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] font-bold ${
                          lvl.type === "resistance" ? "down" : "up"
                        }`}
                      >
                        {lvl.type === "resistance" ? "🧱 저항" : "⛰️ 지지"} $
                        {lvl.price.toFixed(2)}
                      </span>
                      <span className="text-[8px] dim">강도 {lvl.strength}%</span>
                    </div>
                    <div className="text-[8px] dim kr mt-0.5">{lvl.source}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═════════ Unusual Activity ═════════ */}
          {data.unusualActivity.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] tick kr font-bold mb-2">
                🔥 비정상 거래 (스마트머니 베팅)
              </div>
              <div className="space-y-1">
                {data.unusualActivity.map((u, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border border-[var(--border)] rounded p-2 text-[9px]"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span
                        className={`font-bold ${
                          u.type === "콜" ? "up" : "down"
                        }`}
                      >
                        {u.type === "콜" ? "📈" : "📉"} ${u.strike} {u.type}
                      </span>
                      <span className="dim text-[8px] kr">
                        {u.expiry.slice(5)} 만기
                      </span>
                      <span className="text-[var(--amber)] font-bold">
                        거래량 {u.volume.toLocaleString()}
                      </span>
                      <span className="dim text-[8px]">
                        vs OI {u.oi.toLocaleString()}
                      </span>
                      <span className="text-[var(--amber)] font-bold">
                        ({u.ratio}×)
                      </span>
                    </div>
                    <span className="text-[8px] dim kr truncate max-w-[200px]">
                      {u.implication}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ═════════ 해석 팁 ═════════ */}
          <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
            <span className="bright">📚 용어 설명</span>:<br />
            · <span className="bright">GEX</span> (Gamma Exposure): 옵션 딜러의 헤지 규모. 양수면 변동성 억제, 음수면 급등락 증폭<br />
            · <span className="bright">Max Pain</span>: 만기일에 옵션 보유자 총 손실이 최대가 되는 가격 (가격 자석 효과)<br />
            · <span className="bright">IV Skew</span>: OTM 풋/콜 변동성 차이. 풋 스큐가 크면 시장 불안<br />
            · <span className="bright">Unusual Activity</span>: Volume/OI &gt; 0.5 - 새로운 포지션 진입 (스마트머니 신호)
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 예측 카드 (큰 하이라이트)
// ═══════════════════════════════════════════════════════════
function PredictionCard({ data }: { data: ImpactData }) {
  const p = data.prediction;
  const isUp = p.direction === "up";
  const isDown = p.direction === "down";
  const isNeutral = p.direction === "neutral";

  const directionColor = isUp
    ? "text-[#00ff88]"
    : isDown
    ? "text-[#ff3860]"
    : "text-[var(--amber)]";
  const bgColor = isUp
    ? "bg-[rgba(0,255,136,0.05)] border-[#00ff88]/40"
    : isDown
    ? "bg-[rgba(255,56,96,0.05)] border-[#ff3860]/40"
    : "bg-[rgba(255,176,0,0.05)] border-[var(--amber-dim)]";
  const arrow = isUp ? "▲" : isDown ? "▼" : "◆";
  const label = isUp ? "상승" : isDown ? "하락" : "횡보";

  return (
    <div className={`border-2 ${bgColor} rounded p-3 sm:p-4`}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div>
          <div className="text-[9px] dim kr">🎯 옵션 기반 현물 예측</div>
          <div className={`text-[28px] sm:text-[36px] font-bold ${directionColor} leading-none mt-1`}>
            {arrow} {label}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] dim kr">목표가</div>
          <div className={`text-[22px] sm:text-[28px] font-bold ${directionColor}`}>
            ${p.targetPrice.toFixed(2)}
          </div>
          <div className={`text-[12px] ${directionColor}`}>
            ({p.targetPct >= 0 ? "+" : ""}
            {p.targetPct.toFixed(2)}%)
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-[8px] dim kr">현재가</span>
          <span className="text-[12px] tick font-bold">${data.currentPrice.toFixed(2)}</span>
        </div>
        <span className="dim">│</span>
        <div className="flex items-center gap-1">
          <span className="text-[8px] dim kr">신뢰도</span>
          <span className={`text-[12px] font-bold ${directionColor}`}>{p.confidence}%</span>
          <div className="w-16 h-1 bg-[var(--border)] rounded overflow-hidden">
            <div
              className={`h-full ${
                isUp ? "bg-[#00ff88]" : isDown ? "bg-[#ff3860]" : "bg-[var(--amber)]"
              }`}
              style={{ width: `${p.confidence}%` }}
            />
          </div>
        </div>
        <span className="dim">│</span>
        <div className="flex items-center gap-1">
          <span className="text-[8px] dim kr">기간</span>
          <span className="text-[10px] tick">{p.timeHorizon}</span>
        </div>
      </div>

      {p.signals.length > 0 && (
        <div className="mb-2">
          <div className="text-[9px] tick kr font-bold mb-1">🔍 시그널 ({p.signals.length})</div>
          <div className="flex flex-wrap gap-1">
            {p.signals.map((s, i) => (
              <span
                key={i}
                className="text-[8px] px-2 py-0.5 border border-[var(--amber-dim)] rounded bg-[rgba(255,176,0,0.05)] kr"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {p.rationale.length > 0 && (
        <div>
          <div className="text-[9px] tick kr font-bold mb-1">💭 분석 근거</div>
          <ul className="space-y-0.5">
            {p.rationale.map((r, i) => (
              <li key={i} className="text-[9px] dim kr leading-relaxed flex gap-1">
                <span className="text-[var(--amber)]">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 지표 카드 (재사용)
// ═══════════════════════════════════════════════════════════
function MetricCard({
  title,
  value,
  subtitle,
  hint,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  hint: string;
  color: "green" | "red" | "amber";
}) {
  const colorClass =
    color === "green" ? "text-[#00ff88]" : color === "red" ? "text-[#ff3860]" : "text-[var(--amber)]";
  const borderClass =
    color === "green"
      ? "border-[#00ff88]/30"
      : color === "red"
      ? "border-[#ff3860]/30"
      : "border-[var(--amber-dim)]";

  return (
    <div className={`border ${borderClass} rounded p-3 bg-[rgba(0,0,0,0.3)]`}>
      <div className="text-[9px] dim kr mb-1">{title}</div>
      <div className={`text-[20px] font-bold ${colorClass} leading-tight`}>{value}</div>
      <div className={`text-[10px] kr mt-0.5 ${colorClass}`}>{subtitle}</div>
      <div className="text-[8px] dim kr mt-1 italic">{hint}</div>
    </div>
  );
}
