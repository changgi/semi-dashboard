"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface PositionAnalysis {
  holding: {
    id: number;
    symbol: string;
    name: string | null;
    shares: number;
    currentValue: number;
    valueInUsd: number;
    weight: number;
    gainPct: number;
  };
  proxy: {
    symbol: string;
    name: string;
    proxySymbol: string;
    proxyName: string;
    relationship: string;
    correlation: number;
  };
  proxySignals: {
    currentPrice: number | null;
    maxPain: number | null;
    maxPainDistance: number | null;
    gexRegime: "positive" | "negative" | "unknown";
    gexValue: number | null;
    rsi: number | null;
    direction: "up" | "down" | "neutral" | "unknown";
    confidence: number;
    riskLevel: "low" | "medium" | "high" | "critical";
    signals: string[];
  };
}

interface RiskData {
  success: boolean;
  totalValueUsd: number;
  overallRiskScore: number;
  overallRiskLabel: string;
  overallColor: string;
  weightedBullishScore: number;
  dominantDirection: "up" | "down" | "neutral";
  positions: PositionAnalysis[];
  topRisks: Array<{ symbol: string; reason: string; weight: number }>;
  topOpportunities: Array<{ symbol: string; reason: string; weight: number }>;
  recommendedActions: Array<{
    priority: "high" | "medium" | "low";
    action: string;
    target: string;
    reason: string;
  }>;
}

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function PortfolioRiskPanel() {
  const { data, isLoading } = useSWR<RiskData>("/api/portfolio-risk", fetcher, {
    refreshInterval: 300000, // 5분
  });

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[10px] dim kr">🎯 포트폴리오 리스크 분석 중...</div>
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[10px] dim kr">데이터 로딩 실패</div>
      </div>
    );
  }

  // 방어: 배열이 undefined여도 빈 배열로 처리
  const positions = data.positions ?? [];
  const topRisks = data.topRisks ?? [];
  const topOpportunities = data.topOpportunities ?? [];
  const recommendedActions = data.recommendedActions ?? [];

  if (positions.length === 0) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[10px] dim kr">포트폴리오에 보유 종목이 없습니다</div>
      </div>
    );
  }

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            🎯 PORTFOLIO RISK · 내 포트폴리오 통합 리스크 분석
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            보유 종목별 옵션 시그널 · 가중 리스크 점수 · 종합 액션 추천
          </div>
        </div>
      </div>

      {/* ═════════ 종합 리스크 게이지 ═════════ */}
      <div
        className="mb-3 border-2 rounded-lg p-3 sm:p-4"
        style={{
          borderColor: data.overallColor,
          background: `linear-gradient(135deg, ${data.overallColor}15, transparent)`,
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-[9px] dim kr">포트폴리오 종합 리스크</div>
            <div
              className="text-[36px] sm:text-[48px] font-bold leading-none"
              style={{ color: data.overallColor }}
            >
              {data.overallRiskLabel}
            </div>
            <div className="text-[10px] kr mt-1">
              리스크 점수: <span className="tick font-bold">{data.overallRiskScore}/100</span>
              <span className="dim mx-2">│</span>
              방향성: <span
                className={
                  data.dominantDirection === "up" ? "up" :
                  data.dominantDirection === "down" ? "down" :
                  "dim"
                }
              >
                {data.dominantDirection === "up" ? "📈 상승 우세" :
                 data.dominantDirection === "down" ? "📉 하락 우세" :
                 "➖ 중립"}
              </span>
              <span className="text-[8px] dim ml-2">
                ({data.weightedBullishScore > 0 ? "+" : ""}{data.weightedBullishScore})
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] dim kr">총 평가액</div>
            <div className="text-[20px] tick font-bold">
              ${data.totalValueUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[8px] dim kr">{positions.length}개 포지션</div>
          </div>
        </div>

        {/* 리스크 게이지 바 */}
        <div className="mt-3">
          <div className="relative h-3 bg-[var(--border)] rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full transition-all"
              style={{
                width: `${data.overallRiskScore}%`,
                background: `linear-gradient(90deg, #00ff88 0%, #ffcc00 30%, #ffaa44 50%, #ff3860 80%)`,
              }}
            />
            <div
              className="absolute top-0 w-0.5 h-full bg-white"
              style={{ left: `${data.overallRiskScore}%` }}
            />
          </div>
          <div className="flex justify-between text-[8px] dim kr mt-1">
            <span>안전 (0)</span>
            <span>보통 (30)</span>
            <span>높음 (50)</span>
            <span>긴급 (70+)</span>
          </div>
        </div>
      </div>

      {/* ═════════ 추천 액션 ═════════ */}
      {recommendedActions.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] tick kr font-bold mb-2">
            🎯 Recommended Actions · 추천 액션 ({recommendedActions.length})
          </div>
          <div className="space-y-1.5">
            {recommendedActions.map((a, i) => (
              <div
                key={i}
                className={`border-l-4 rounded-r p-2 ${
                  a.priority === "high"
                    ? "border-[#ff3860] bg-[rgba(255,56,96,0.05)]"
                    : a.priority === "medium"
                    ? "border-[var(--amber)] bg-[rgba(255,176,0,0.03)]"
                    : "border-[#aaccff] bg-[rgba(170,204,255,0.03)]"
                }`}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold ${
                      a.priority === "high" ? "text-[#ff3860]" :
                      a.priority === "medium" ? "text-[var(--amber)]" :
                      "text-[#aaccff]"
                    }`}>
                      {a.action}
                    </span>
                    <span className="text-[9px] dim">→</span>
                    <span className="text-[10px] tick font-bold">{a.target}</span>
                    {a.priority === "high" && (
                      <span className="text-[8px] px-1.5 py-0.5 bg-[#ff3860] text-white rounded kr animate-pulse">
                        긴급
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-[9px] dim kr mt-1">💭 {a.reason}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═════════ 리스크/기회 2단 ═════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        {/* Top Risks */}
        <div>
          <div className="text-[10px] text-[#ff3860] font-bold kr mb-2">
            ⚠️ Top Risks ({topRisks.length})
          </div>
          {topRisks.length === 0 ? (
            <div className="text-[9px] dim kr p-2 border border-[var(--border)] rounded">
              ✅ 현재 주요 리스크 없음
            </div>
          ) : (
            <div className="space-y-1">
              {topRisks.map((r, i) => (
                <div
                  key={i}
                  className="border-l-2 border-[#ff3860] bg-[rgba(255,56,96,0.03)] rounded-r p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] tick font-bold">{r.symbol}</span>
                    <span className="text-[8px] dim">비중 {r.weight.toFixed(1)}%</span>
                  </div>
                  <div className="text-[9px] dim kr mt-0.5">{r.reason}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Opportunities */}
        <div>
          <div className="text-[10px] text-[#00ff88] font-bold kr mb-2">
            💎 Top Opportunities ({topOpportunities.length})
          </div>
          {topOpportunities.length === 0 ? (
            <div className="text-[9px] dim kr p-2 border border-[var(--border)] rounded">
              명확한 강세 시그널 없음
            </div>
          ) : (
            <div className="space-y-1">
              {topOpportunities.map((o, i) => (
                <div
                  key={i}
                  className="border-l-2 border-[#00ff88] bg-[rgba(0,255,136,0.03)] rounded-r p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] tick font-bold">{o.symbol}</span>
                    <span className="text-[8px] dim">비중 {o.weight.toFixed(1)}%</span>
                  </div>
                  <div className="text-[9px] dim kr mt-0.5">{o.reason}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═════════ 포지션별 상세 ═════════ */}
      <div>
        <div className="text-[10px] tick kr font-bold mb-2">
          📊 Position Analysis · 포지션별 분석
        </div>
        <div className="space-y-2">
          {positions.map((p) => (
            <PositionRow key={p.holding.id} position={p} />
          ))}
        </div>
      </div>

      {/* 해석 */}
      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        <span className="bright">💡 분석 방법</span>: 한국 ETF는 미국 옵션 proxy로 자동 매핑<br />
        <span className="bright">예시</span>: TIGER S&P500 (360750.KS) → SPY 옵션으로 분석<br />
        <span className="bright">리스크 점수</span>: 각 종목 리스크를 포트폴리오 비중으로 가중평균
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 포지션 행
// ═══════════════════════════════════════════════════════════
function PositionRow({ position }: { position: PositionAnalysis }) {
  const { holding, proxy, proxySignals } = position;

  const directionIcon =
    proxySignals.direction === "up" ? "📈" :
    proxySignals.direction === "down" ? "📉" :
    proxySignals.direction === "neutral" ? "➖" :
    "❓";

  const directionColor =
    proxySignals.direction === "up" ? "text-[#00ff88]" :
    proxySignals.direction === "down" ? "text-[#ff3860]" :
    "text-[#aaccff]";

  const riskColor = {
    low: "#00ff88",
    medium: "#ffcc00",
    high: "#ffaa44",
    critical: "#ff3860",
  }[proxySignals.riskLevel];

  const riskLabel = {
    low: "안전",
    medium: "보통",
    high: "주의",
    critical: "긴급",
  }[proxySignals.riskLevel];

  return (
    <div className="border border-[var(--border)] rounded-lg p-3 hover:border-[var(--amber-dim)] transition-colors">
      {/* 상단: 종목 정보 */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] tick font-bold">{holding.symbol}</span>
              <span className="text-[9px] dim kr">{holding.name || "-"}</span>
            </div>
            <div className="text-[8px] dim kr mt-0.5">
              {holding.shares}주 · ${holding.valueInUsd.toFixed(2)}
              <span className={holding.gainPct >= 0 ? " up ml-1" : " down ml-1"}>
                ({holding.gainPct >= 0 ? "+" : ""}{holding.gainPct.toFixed(2)}%)
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <div className="text-[8px] dim kr">비중</div>
            <div className="text-[12px] tick font-bold">{holding.weight.toFixed(1)}%</div>
          </div>
          <div
            className="text-[9px] px-2 py-1 border rounded kr font-bold"
            style={{ borderColor: riskColor, color: riskColor }}
          >
            {riskLabel}
          </div>
        </div>
      </div>

      {/* 비중 바 */}
      <div className="h-1 bg-[var(--border)] rounded overflow-hidden mb-2">
        <div
          className="h-full bg-[var(--amber)]"
          style={{ width: `${Math.min(100, holding.weight)}%` }}
        />
      </div>

      {/* Proxy 매핑 */}
      <div className="flex items-center gap-2 flex-wrap mb-2 pb-2 border-b border-[var(--border)]">
        <span className="text-[9px] dim kr">옵션 분석:</span>
        <span className="text-[9px]">
          <span className="tick font-bold">{holding.symbol}</span>
          <span className="dim mx-1">→</span>
          <a
            href={`/stock/${proxy.proxySymbol}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--amber)] hover:bright font-bold"
          >
            {proxy.proxySymbol}
          </a>
          <span className="dim kr ml-1">({proxy.proxyName})</span>
        </span>
        <span className="text-[8px] dim kr">
          상관관계 {(proxy.correlation * 100).toFixed(0)}%
        </span>
      </div>

      {/* 시그널 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[9px]">
        <div>
          <div className="text-[8px] dim kr">방향</div>
          <div className={`${directionColor} font-bold`}>
            {directionIcon}{" "}
            {proxySignals.direction === "up" ? "상승" :
             proxySignals.direction === "down" ? "하락" :
             proxySignals.direction === "neutral" ? "중립" :
             "불명"}
          </div>
          <div className="text-[8px] dim kr">{proxySignals.confidence}% 신뢰도</div>
        </div>
        <div>
          <div className="text-[8px] dim kr">Max Pain</div>
          <div className="tick">
            {proxySignals.maxPain ? `$${proxySignals.maxPain.toFixed(2)}` : "—"}
          </div>
          {proxySignals.maxPainDistance !== null && (
            <div className={`text-[8px] ${proxySignals.maxPainDistance >= 0 ? "up" : "down"}`}>
              {proxySignals.maxPainDistance >= 0 ? "+" : ""}
              {proxySignals.maxPainDistance.toFixed(1)}%
            </div>
          )}
        </div>
        <div>
          <div className="text-[8px] dim kr">GEX 레짐</div>
          <div
            className={
              proxySignals.gexRegime === "positive"
                ? "up font-bold"
                : proxySignals.gexRegime === "negative"
                ? "down font-bold"
                : "dim"
            }
          >
            {proxySignals.gexRegime === "positive" ? "✅ 양수" :
             proxySignals.gexRegime === "negative" ? "⚠️ 음수" :
             "—"}
          </div>
          {proxySignals.gexValue !== null && (
            <div className="text-[8px] dim">
              {(proxySignals.gexValue / 1e9).toFixed(2)}B
            </div>
          )}
        </div>
        <div>
          <div className="text-[8px] dim kr">현재가</div>
          <div className="tick">
            {proxySignals.currentPrice ? `$${proxySignals.currentPrice.toFixed(2)}` : "—"}
          </div>
          <div className="text-[8px] dim kr">{proxy.proxySymbol}</div>
        </div>
      </div>

      {/* 시그널 태그 */}
      {proxySignals.signals.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {proxySignals.signals.map((s, i) => (
            <span
              key={i}
              className="text-[8px] px-2 py-0.5 border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded kr"
            >
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
