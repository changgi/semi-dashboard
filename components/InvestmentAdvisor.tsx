"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface ActionItem {
  priority: "high" | "medium" | "low";
  category: "buy" | "sell" | "hedge" | "rebalance" | "monitor" | "wait";
  title: string;
  rationale: string;
  steps: string[];
  confidence: number;
  timeHorizon: string;
  riskLevel: "low" | "medium" | "high";
  relatedSymbols?: string[];
}

interface AdvisorData {
  success: boolean;
  marketRegime: string;
  overallScore: number;
  stance: string;
  actions: ActionItem[];
  keyInsights: string[];
  riskFactors: string[];
  opportunities: string[];
  portfolioAdvice?: {
    overallHealth: "excellent" | "good" | "concerning" | "critical";
    rebalanceNeeded: boolean;
    suggestions: string[];
  };
}

// 카테고리별 스타일
const categoryStyles: Record<
  ActionItem["category"],
  { icon: string; label: string; color: string; bg: string; border: string }
> = {
  buy:       { icon: "📈", label: "매수",       color: "text-[#00ff88]", bg: "bg-[rgba(0,255,136,0.05)]",  border: "border-[#00ff88]" },
  sell:      { icon: "📉", label: "매도",       color: "text-[#ff3860]", bg: "bg-[rgba(255,56,96,0.05)]",  border: "border-[#ff3860]" },
  hedge:     { icon: "🛡️", label: "헤지",       color: "text-[var(--amber)]", bg: "bg-[rgba(255,176,0,0.05)]", border: "border-[var(--amber)]" },
  rebalance: { icon: "⚖️", label: "리밸런싱",   color: "text-[#aaccff]", bg: "bg-[rgba(170,204,255,0.05)]", border: "border-[#aaccff]" },
  monitor:   { icon: "👀", label: "모니터링",   color: "text-[#aaaa88]", bg: "bg-[rgba(170,170,136,0.05)]", border: "border-[#aaaa88]" },
  wait:      { icon: "⏸️", label: "관망",       color: "text-[#888]",    bg: "bg-[rgba(136,136,136,0.05)]", border: "border-[#888]" },
};

const priorityStyles: Record<
  ActionItem["priority"],
  { label: string; color: string }
> = {
  high:   { label: "🔴 높음", color: "text-[#ff3860] border-[#ff3860]" },
  medium: { label: "🟡 중간", color: "text-[var(--amber)] border-[var(--amber)]" },
  low:    { label: "🟢 낮음", color: "text-[#888] border-[#555]" },
};

const riskStyles: Record<
  ActionItem["riskLevel"],
  { label: string; color: string }
> = {
  low:    { label: "낮은 위험",  color: "text-[#00ff88]" },
  medium: { label: "중간 위험", color: "text-[var(--amber)]" },
  high:   { label: "높은 위험", color: "text-[#ff3860]" },
};

const healthStyles: Record<
  NonNullable<AdvisorData["portfolioAdvice"]>["overallHealth"],
  { label: string; color: string; bg: string }
> = {
  excellent:  { label: "🏆 우수",   color: "text-[#00ff88]", bg: "bg-[rgba(0,255,136,0.1)]" },
  good:       { label: "✅ 양호",   color: "text-[#00ff88]", bg: "bg-[rgba(0,255,136,0.05)]" },
  concerning: { label: "⚠️ 주의",   color: "text-[var(--amber)]", bg: "bg-[rgba(255,176,0,0.05)]" },
  critical:   { label: "🚨 심각",   color: "text-[#ff3860]", bg: "bg-[rgba(255,56,96,0.05)]" },
};

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function InvestmentAdvisor() {
  const [expandedId, setExpandedId] = useState<number | null>(0); // 첫번째 자동 확장

  const { data, isLoading } = useSWR<AdvisorData>("/api/advisor", fetcher, {
    refreshInterval: 300000, // 5분
  });

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-[10px] dim text-center py-12 kr">
        🧠 투자 자문 분석 중...
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div className="panel p-3 sm:p-5 text-[10px] dim text-center py-12 kr">
        데이터 로딩 실패
      </div>
    );
  }

  const scoreColor =
    data.overallScore >= 75 ? "text-[#00ff88]" :
    data.overallScore >= 50 ? "text-[var(--amber)]" :
    data.overallScore >= 30 ? "text-[#aaccff]" :
    "text-[#ff3860]";

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            🧠 INVESTMENT ADVISOR · 오늘의 실행 가이드
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            규칙 기반 종합 의사결정 시스템 · 매크로+AI+포트폴리오 분석 · 5분 갱신
          </div>
        </div>
        <div className="text-right">
          <div className={`text-[28px] sm:text-[36px] font-bold ${scoreColor} leading-none`}>
            {data.overallScore}
            <span className="text-[14px] dim font-normal">/100</span>
          </div>
          <div className={`text-[10px] font-bold kr ${scoreColor}`}>
            {data.marketRegime}
          </div>
        </div>
      </div>

      {/* 시장 자세 (Stance) */}
      <div className="mb-4 p-3 bg-[rgba(255,176,0,0.03)] border border-[var(--amber-dim)] rounded">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[9px] dim kr">권장 자세</span>
          <span className="text-[12px] sm:text-[14px] font-bold text-[var(--amber)] kr">
            {data.stance}
          </span>
        </div>
      </div>

      {/* 주요 통찰 / 위험 / 기회 (3열) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-4">
        {/* Key Insights */}
        <div className="border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded p-2">
          <div className="text-[10px] tick font-bold kr mb-1.5">💡 핵심 통찰</div>
          <ul className="space-y-1">
            {data.keyInsights.map((ins, i) => (
              <li key={i} className="text-[9px] dim kr leading-relaxed flex gap-1">
                <span className="text-[var(--amber)]">•</span>
                <span>{ins}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Opportunities */}
        <div className="border border-[#00ff88]/30 bg-[rgba(0,255,136,0.03)] rounded p-2">
          <div className="text-[10px] text-[#00ff88] font-bold kr mb-1.5">
            🎯 기회 요소 ({data.opportunities.length})
          </div>
          {data.opportunities.length > 0 ? (
            <ul className="space-y-1">
              {data.opportunities.map((o, i) => (
                <li key={i} className="text-[9px] dim kr leading-relaxed flex gap-1">
                  <span className="text-[#00ff88]">↗</span>
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[9px] dim kr">특이 기회 없음</div>
          )}
        </div>

        {/* Risks */}
        <div className="border border-[#ff3860]/30 bg-[rgba(255,56,96,0.03)] rounded p-2">
          <div className="text-[10px] text-[#ff3860] font-bold kr mb-1.5">
            ⚠️ 위험 요소 ({data.riskFactors.length})
          </div>
          {data.riskFactors.length > 0 ? (
            <ul className="space-y-1">
              {data.riskFactors.map((r, i) => (
                <li key={i} className="text-[9px] dim kr leading-relaxed flex gap-1">
                  <span className="text-[#ff3860]">↘</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-[9px] dim kr">특이 위험 없음</div>
          )}
        </div>
      </div>

      {/* Portfolio Advice */}
      {data.portfolioAdvice && (
        <div className={`mb-4 p-3 rounded border ${
          healthStyles[data.portfolioAdvice.overallHealth].bg
        } ${
          data.portfolioAdvice.overallHealth === "critical" ? "border-[#ff3860]/40" :
          data.portfolioAdvice.overallHealth === "concerning" ? "border-[var(--amber)]/40" :
          "border-[#00ff88]/40"
        }`}>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="text-[10px] tick font-bold kr">
              💼 내 포트폴리오 진단
            </div>
            <div className={`text-[12px] font-bold ${healthStyles[data.portfolioAdvice.overallHealth].color}`}>
              {healthStyles[data.portfolioAdvice.overallHealth].label}
            </div>
          </div>
          {data.portfolioAdvice.suggestions.length > 0 && (
            <ul className="space-y-1">
              {data.portfolioAdvice.suggestions.map((s, i) => (
                <li key={i} className="text-[9px] dim kr leading-relaxed flex gap-1">
                  <span>•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Action Items */}
      <div>
        <div className="text-[10px] tick font-bold kr mb-2">
          🎯 ACTION ITEMS · 오늘 할 일 ({data.actions.length}건)
        </div>
        <div className="space-y-2">
          {data.actions.map((action, idx) => {
            const catStyle = categoryStyles[action.category];
            const priorStyle = priorityStyles[action.priority];
            const riskStyle = riskStyles[action.riskLevel];
            const expanded = expandedId === idx;

            return (
              <div
                key={idx}
                className={`border-l-2 ${catStyle.border} ${catStyle.bg} rounded-r overflow-hidden`}
              >
                {/* 헤더 (클릭 가능) */}
                <button
                  onClick={() => setExpandedId(expanded ? null : idx)}
                  className="w-full p-3 text-left hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={`text-[8px] px-1.5 py-0.5 border rounded font-bold ${priorStyle.color}`}
                        >
                          {priorStyle.label}
                        </span>
                        <span className={`text-[8px] ${catStyle.color} font-bold kr`}>
                          {catStyle.icon} {catStyle.label}
                        </span>
                        <span className={`text-[8px] ${riskStyle.color} kr`}>
                          · {riskStyle.label}
                        </span>
                        <span className="text-[8px] dim kr">
                          · 🎯 {action.timeHorizon}
                        </span>
                        <span className="text-[8px] dim kr">
                          · 신뢰도 {action.confidence}%
                        </span>
                      </div>
                      <div className={`text-[11px] sm:text-[12px] font-bold ${catStyle.color} kr`}>
                        {action.title}
                      </div>
                      <div className="text-[9px] dim kr mt-1 leading-relaxed">
                        {action.rationale}
                      </div>
                    </div>
                    <div className="text-[var(--amber)] text-[14px] select-none">
                      {expanded ? "▼" : "▶"}
                    </div>
                  </div>
                </button>

                {/* 확장 영역 - 단계별 실행 가이드 */}
                {expanded && (
                  <div className="border-t border-[var(--border)] bg-[rgba(0,0,0,0.3)] p-3">
                    <div className="text-[9px] tick font-bold kr mb-2">🔧 실행 단계</div>
                    <ol className="space-y-1.5">
                      {action.steps.map((step, i) => (
                        <li key={i} className="text-[10px] kr flex gap-2">
                          <span className={`${catStyle.color} font-bold min-w-[20px]`}>
                            {i + 1}.
                          </span>
                          <span className="bright">{step}</span>
                        </li>
                      ))}
                    </ol>

                    {/* 관련 종목 빠른 이동 */}
                    {action.relatedSymbols && action.relatedSymbols.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-[var(--border)]">
                        <div className="text-[8px] dim kr mb-1">🔗 관련 종목 상세 분석:</div>
                        <div className="flex flex-wrap gap-1">
                          {action.relatedSymbols.map((sym) => (
                            <a
                              key={sym}
                              href={`/stock/${encodeURIComponent(sym)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`text-[9px] px-2 py-0.5 border ${catStyle.border} ${catStyle.color} hover:bg-white/5`}
                            >
                              {sym}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 면책 */}
      <div className="mt-4 pt-3 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        💡 <span className="bright">Disclaimer</span>: 본 자문은 규칙 기반 분석 결과이며, 투자 결정은 본인의 책임하에 이루어집니다.
        과거 데이터가 미래 성과를 보장하지 않습니다. 신뢰도는 참고 지표이며, 개별 종목의 펀더멘털 및 기술적 분석과 병행 검토 필요합니다.
      </div>
    </div>
  );
}
