"use client";

import useSWR from "swr";
import { useState } from "react";
import { fmtPrice } from "@/lib/format";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Vote = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

interface AgentOpinion {
  agent: string;
  agentKr: string;
  category: "legendary" | "specialist";
  vote: Vote;
  score: number;
  confidence: number;
  reasoning: string;
  icon: string;
}

interface PortfolioDecision {
  finalVote: Vote;
  finalScore: number;
  agreementLevel: number;
}

interface AgentResult {
  symbol: string;
  currentPrice: number;
  opinions: AgentOpinion[];
  decision: PortfolioDecision;
}

const VOTE_META: Record<Vote, { icon: string; color: string; label: string }> = {
  STRONG_BUY:  { icon: "🚀", color: "text-[#00ff88]",   label: "강력매수" },
  BUY:         { icon: "✅", color: "text-[#88dd99]",   label: "매수" },
  HOLD:        { icon: "⚖️", color: "text-[var(--amber)]", label: "보유" },
  SELL:        { icon: "⚠️", color: "text-[#ff8888]",   label: "매도" },
  STRONG_SELL: { icon: "🛑", color: "text-[#ff3860]",   label: "강력매도" },
};

// 주요 에이전트 focus용 (컬럼 표시용)
const FOCUS_AGENTS = [
  { key: "Daniel Yoo",          label: "🇰🇷 Daniel Yoo",  priority: 1 },
  { key: "Warren Buffett",      label: "🏛️ 버핏",         priority: 2 },
  { key: "Benjamin Graham",     label: "📚 그레이엄",     priority: 3 },
  { key: "Cathie Wood",         label: "🚀 캐시 우드",     priority: 4 },
  { key: "Michael Burry",       label: "🐻 버리",         priority: 5 },
  { key: "Semiconductor Specialist", label: "💻 Semi",    priority: 6 },
];

export function AgentComparisonTable() {
  const [mode, setMode] = useState<"score" | "reasoning">("score");

  // 반도체 주요 종목 리스트
  const symbols = ["NVDA", "AMD", "AVGO", "TSM", "MU", "ASML", "LRCX", "KLAC", "ARM", "MRVL", "INTC"];

  // 각 종목에 대해 agents API 호출
  const { data } = useSWR(
    `/api/agents?symbols=all`,  // 모든 종목 가져오기
    async () => {
      const results = await Promise.all(
        symbols.map((s) =>
          fetch(`/api/agents?symbol=${s}`)
            .then((r) => r.json())
            .then((d) => (d.success && d.results?.[0]?.opinions ? d.results[0] : null))
            .catch(() => null)
        )
      );
      return results.filter((r): r is AgentResult => r !== null);
    },
    { refreshInterval: 600000 }
  );

  const results: AgentResult[] = data ?? [];

  // 각 종목의 Daniel Yoo 점수 기준 정렬
  const sortedResults = [...results].sort((a, b) => {
    const aDaniel = a.opinions.find((o) => o.agent === "Daniel Yoo")?.score ?? 0;
    const bDaniel = b.opinions.find((o) => o.agent === "Daniel Yoo")?.score ?? 0;
    return bDaniel - aDaniel;
  });

  return (
    <div className="panel p-3 sm:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[12px]">
            📊 AGENT COMPARISON MATRIX
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            여러 종목에 대한 주요 에이전트 판단 비교 (Daniel Yoo 점수 기준 정렬)
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setMode("score")}
            className={`px-2 py-1 text-[9px] sm:text-[10px] border ${
              mode === "score"
                ? "border-[var(--amber)] text-[var(--amber)] bg-[rgba(255,176,0,0.1)]"
                : "border-[var(--border)] dim hover:border-[var(--amber-dim)]"
            }`}
          >
            점수 모드
          </button>
          <button
            onClick={() => setMode("reasoning")}
            className={`px-2 py-1 text-[9px] sm:text-[10px] border ${
              mode === "reasoning"
                ? "border-[var(--amber)] text-[var(--amber)] bg-[rgba(255,176,0,0.1)]"
                : "border-[var(--border)] dim hover:border-[var(--amber-dim)]"
            }`}
          >
            근거 모드
          </button>
        </div>
      </div>

      {!data ? (
        <div className="text-[10px] dim py-6 text-center kr">
          {symbols.length}개 종목 × 19 에이전트 분석 중...
        </div>
      ) : results.length === 0 ? (
        <div className="text-[10px] dim py-6 text-center kr">데이터 없음</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[9px] sm:text-[10px]">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-2 px-1 tick sticky left-0 bg-[var(--bg)] z-10">
                  종목
                </th>
                <th className="text-right py-2 px-2 tick whitespace-nowrap">가격</th>
                <th className="text-center py-2 px-2 tick whitespace-nowrap kr">종합</th>
                {FOCUS_AGENTS.map((a) => (
                  <th
                    key={a.key}
                    className="text-center py-2 px-1 sm:px-2 tick whitespace-nowrap kr"
                  >
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedResults.map((r) => {
                const decision = r.decision;
                const decMeta = VOTE_META[decision.finalVote];
                return (
                  <tr
                    key={r.symbol}
                    className="border-b border-[var(--border)] data-row hover:bg-[rgba(255,255,255,0.02)]"
                  >
                    {/* 종목 */}
                    <td className="py-2 px-1 tick font-bold sticky left-0 bg-[var(--bg)]">
                      {r.symbol}
                    </td>

                    {/* 현재가 */}
                    <td className="text-right px-2 dim whitespace-nowrap">
                      ${fmtPrice(r.currentPrice)}
                    </td>

                    {/* 종합 판단 */}
                    <td className="text-center px-2">
                      <div className={`font-bold ${decMeta.color}`}>
                        {decMeta.icon} {decision.finalScore > 0 ? "+" : ""}
                        {decision.finalScore}
                      </div>
                      <div className="text-[7px] sm:text-[8px] dim">
                        {decMeta.label} · 합의 {decision.agreementLevel}%
                      </div>
                    </td>

                    {/* 각 focus 에이전트 */}
                    {FOCUS_AGENTS.map((fa) => {
                      const op = r.opinions.find((o) => o.agent === fa.key);
                      if (!op) {
                        return (
                          <td key={fa.key} className="text-center px-1 sm:px-2 dim">
                            —
                          </td>
                        );
                      }
                      const meta = VOTE_META[op.vote];
                      return (
                        <td
                          key={fa.key}
                          className="text-center px-1 sm:px-2"
                          title={`${op.agentKr}: ${op.reasoning}`}
                        >
                          {mode === "score" ? (
                            <>
                              <div className={`font-bold ${meta.color}`}>
                                {op.score > 0 ? "+" : ""}
                                {op.score}
                              </div>
                              <div className="text-[7px] sm:text-[8px] dim">{meta.icon}</div>
                            </>
                          ) : (
                            <div className="text-[7px] sm:text-[8px] kr leading-tight text-left">
                              <span className={meta.color}>
                                {op.score > 0 ? "+" : ""}
                                {op.score}
                              </span>{" "}
                              <span className="dim">
                                {op.reasoning.split(" · ")[0] ?? ""}
                              </span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 범례 */}
      <div className="mt-3 pt-3 border-t border-[var(--border)] flex flex-wrap gap-3 text-[8px] sm:text-[9px]">
        <span className="dim kr">범례:</span>
        <span className="text-[#00ff88]">🚀 강력매수 (+40↑)</span>
        <span className="text-[#88dd99]">✅ 매수 (+15~+40)</span>
        <span className="text-[var(--amber)]">⚖️ 보유 (-15~+15)</span>
        <span className="text-[#ff8888]">⚠️ 매도 (-40~-15)</span>
        <span className="text-[#ff3860]">🛑 강력매도 (-40↓)</span>
      </div>
      <div className="mt-2 text-[7px] sm:text-[8px] dim kr">
        💡 Tip: 표의 각 셀에 마우스를 올리면 에이전트의 상세 판단 근거가 표시됩니다. 근거 모드로
        전환하면 요약 근거를 항상 볼 수 있습니다.
      </div>
    </div>
  );
}
