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
  confidence: number;
  agentConsensus: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  };
}

interface AgentResult {
  symbol: string;
  currentPrice: number;
  opinions: AgentOpinion[];
  decision: PortfolioDecision;
}

const VOTE_META: Record<Vote, { icon: string; color: string; label: string; bg: string }> = {
  STRONG_BUY:  { icon: "🚀", color: "text-[#00ff88]",       label: "강력매수", bg: "bg-[rgba(0,255,136,0.1)]" },
  BUY:         { icon: "✅", color: "text-[#88dd99]",       label: "매수",     bg: "bg-[rgba(0,255,136,0.05)]" },
  HOLD:        { icon: "⚖️", color: "text-[var(--amber)]", label: "보유",     bg: "bg-[rgba(255,176,0,0.05)]" },
  SELL:        { icon: "⚠️", color: "text-[#ff8888]",       label: "매도",     bg: "bg-[rgba(255,56,96,0.05)]" },
  STRONG_SELL: { icon: "🛑", color: "text-[#ff3860]",       label: "강력매도", bg: "bg-[rgba(255,56,96,0.1)]" },
};

export function AgentDetailTable() {
  const [selectedSymbol, setSelectedSymbol] = useState("NVDA");
  const [sortBy, setSortBy] = useState<"score" | "category" | "name">("score");

  const { data } = useSWR(
    `/api/agents?symbol=${selectedSymbol}`,
    fetcher,
    { refreshInterval: 600000 }
  );

  const result: AgentResult | null =
    data?.success && data.results?.[0] ? data.results[0] : null;

  const symbols = ["NVDA", "AMD", "AVGO", "TSM", "MU", "ASML", "LRCX", "KLAC", "ARM", "MRVL", "INTC"];

  // 정렬된 에이전트 리스트
  const sortedOpinions = result
    ? [...result.opinions].sort((a, b) => {
        if (sortBy === "score") return b.score - a.score;
        if (sortBy === "category") {
          if (a.category !== b.category) return a.category === "legendary" ? -1 : 1;
          return b.score - a.score;
        }
        return a.agentKr.localeCompare(b.agentKr);
      })
    : [];

  return (
    <div className="panel p-3 sm:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[12px]">
            🔬 AGENT DETAIL TABLE · 종목별 상세 판단
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            한 종목에 대한 19 에이전트의 점수·투표·근거 한눈에
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="dim text-[10px]">SYMBOL:</span>
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--border)] text-[var(--amber)] px-2 py-1 text-[10px] sm:text-[11px]"
          >
            {symbols.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span className="dim text-[10px]">SORT:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "score" | "category" | "name")}
            className="bg-[var(--bg)] border border-[var(--border)] dim px-2 py-1 text-[10px] sm:text-[11px]"
          >
            <option value="score">점수순</option>
            <option value="category">카테고리</option>
            <option value="name">이름순</option>
          </select>
        </div>
      </div>

      {!data ? (
        <div className="text-[10px] dim py-6 text-center kr">분석 중...</div>
      ) : !result ? (
        <div className="text-[10px] dim py-6 text-center kr">데이터 없음</div>
      ) : (
        <>
          {/* 종목 정보 헤더 */}
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-[var(--border)]">
            <div>
              <span className="text-[18px] sm:text-[24px] font-bold bright">{result.symbol}</span>
              <span className="text-[14px] sm:text-[18px] tick ml-2">
                ${fmtPrice(result.currentPrice)}
              </span>
            </div>
            <div className="text-right">
              <div
                className={`text-[16px] sm:text-[20px] font-bold ${
                  VOTE_META[result.decision.finalVote].color
                }`}
              >
                {VOTE_META[result.decision.finalVote].icon}{" "}
                {VOTE_META[result.decision.finalVote].label}
              </div>
              <div className="text-[9px] sm:text-[10px] dim">
                종합 {result.decision.finalScore > 0 ? "+" : ""}
                {result.decision.finalScore} · 합의 {result.decision.agreementLevel}%
              </div>
            </div>
          </div>

          {/* 투표 분포 바 */}
          <div className="mb-3">
            <div className="text-[9px] dim kr mb-1">19 에이전트 투표 분포</div>
            <div className="h-2 w-full flex rounded overflow-hidden border border-[var(--border)]">
              {result.decision.agentConsensus.strongBuy > 0 && (
                <div
                  className="bg-[#00ff88]"
                  style={{ width: `${(result.decision.agentConsensus.strongBuy / 19) * 100}%` }}
                  title={`강력매수 ${result.decision.agentConsensus.strongBuy}`}
                />
              )}
              {result.decision.agentConsensus.buy > 0 && (
                <div
                  className="bg-[#88dd99]"
                  style={{ width: `${(result.decision.agentConsensus.buy / 19) * 100}%` }}
                  title={`매수 ${result.decision.agentConsensus.buy}`}
                />
              )}
              {result.decision.agentConsensus.hold > 0 && (
                <div
                  className="bg-[var(--amber)]"
                  style={{ width: `${(result.decision.agentConsensus.hold / 19) * 100}%` }}
                  title={`보유 ${result.decision.agentConsensus.hold}`}
                />
              )}
              {result.decision.agentConsensus.sell > 0 && (
                <div
                  className="bg-[#ff8888]"
                  style={{ width: `${(result.decision.agentConsensus.sell / 19) * 100}%` }}
                  title={`매도 ${result.decision.agentConsensus.sell}`}
                />
              )}
              {result.decision.agentConsensus.strongSell > 0 && (
                <div
                  className="bg-[#ff3860]"
                  style={{ width: `${(result.decision.agentConsensus.strongSell / 19) * 100}%` }}
                  title={`강력매도 ${result.decision.agentConsensus.strongSell}`}
                />
              )}
            </div>
            <div className="flex justify-between text-[7px] sm:text-[8px] mt-1">
              <span className="text-[#00ff88]">
                🚀{result.decision.agentConsensus.strongBuy} ✅{result.decision.agentConsensus.buy}
              </span>
              <span className="text-[var(--amber)]">⚖️{result.decision.agentConsensus.hold}</span>
              <span className="text-[#ff3860]">
                ⚠️{result.decision.agentConsensus.sell} 🛑{result.decision.agentConsensus.strongSell}
              </span>
            </div>
          </div>

          {/* 상세 표 */}
          <div className="overflow-x-auto">
            <table className="w-full text-[9px] sm:text-[10px]">
              <thead>
                <tr className="border-b border-[var(--border)]">
                  <th className="text-left py-2 px-1 tick">에이전트</th>
                  <th className="text-center py-2 px-1 tick kr">카테고리</th>
                  <th className="text-right py-2 px-2 tick">점수</th>
                  <th className="text-center py-2 px-2 tick kr">투표</th>
                  <th className="text-center py-2 px-2 tick kr">신뢰</th>
                  <th className="text-left py-2 px-2 tick kr">판단 근거</th>
                </tr>
              </thead>
              <tbody>
                {sortedOpinions.map((op) => {
                  const meta = VOTE_META[op.vote];
                  return (
                    <tr
                      key={op.agent}
                      className={`border-b border-[var(--border)] data-row ${meta.bg}`}
                    >
                      {/* 에이전트 이름 */}
                      <td className="py-1.5 px-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[14px]">{op.icon}</span>
                          <div>
                            <div className="kr font-bold bright text-[9px] sm:text-[10px]">
                              {op.agentKr}
                            </div>
                            <div className="text-[7px] sm:text-[8px] dim truncate max-w-[100px]">
                              {op.agent}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 카테고리 */}
                      <td className="text-center px-1">
                        <span
                          className={`text-[7px] sm:text-[8px] px-1.5 py-0.5 rounded border ${
                            op.category === "legendary"
                              ? "border-[var(--amber-dim)] text-[var(--amber)]"
                              : "border-[#aabbff] text-[#aabbff]"
                          } kr`}
                        >
                          {op.category === "legendary" ? "레전드" : "전문가"}
                        </span>
                      </td>

                      {/* 점수 */}
                      <td className={`text-right px-2 font-bold ${meta.color}`}>
                        {op.score > 0 ? "+" : ""}
                        {op.score}
                      </td>

                      {/* 투표 */}
                      <td className="text-center px-2">
                        <span className={`${meta.color} font-bold kr text-[8px] sm:text-[9px]`}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>

                      {/* 신뢰도 */}
                      <td className="text-center px-2 dim">{op.confidence}%</td>

                      {/* 근거 */}
                      <td className="py-1.5 px-2 kr dim text-[8px] sm:text-[9px] leading-tight">
                        {op.reasoning || "—"}
                      </td>
                    </tr>
                  );
                })}

                {/* Portfolio Manager 마지막 행 (강조) */}
                <tr className="border-t-2 border-[var(--amber)] bg-[rgba(255,176,0,0.1)]">
                  <td className="py-2 px-1">
                    <div className="flex items-center gap-1">
                      <span className="text-[16px]">🎯</span>
                      <div>
                        <div className="font-bold bright text-[10px] sm:text-[11px] kr">
                          Portfolio Manager
                        </div>
                        <div className="text-[7px] sm:text-[8px] dim">종합 판단</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-center px-1">
                    <span className="text-[7px] sm:text-[8px] px-1.5 py-0.5 rounded border border-[var(--amber)] text-[var(--amber)] kr">
                      최종
                    </span>
                  </td>
                  <td
                    className={`text-right px-2 font-bold text-[12px] sm:text-[14px] ${
                      VOTE_META[result.decision.finalVote].color
                    }`}
                  >
                    {result.decision.finalScore > 0 ? "+" : ""}
                    {result.decision.finalScore}
                  </td>
                  <td className="text-center px-2">
                    <span
                      className={`${
                        VOTE_META[result.decision.finalVote].color
                      } font-bold kr text-[10px] sm:text-[11px]`}
                    >
                      {VOTE_META[result.decision.finalVote].icon}{" "}
                      {VOTE_META[result.decision.finalVote].label}
                    </span>
                  </td>
                  <td className="text-center px-2 dim">{result.decision.confidence}%</td>
                  <td className="py-2 px-2 kr text-[8px] sm:text-[9px] leading-tight">
                    <span className={VOTE_META[result.decision.finalVote].color}>
                      합의율 {result.decision.agreementLevel}%
                    </span>
                    <span className="dim"> · 19명 중 다수 의견 종합 (신뢰도 × 카테고리 가중)</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 상단 3명 의견 요약 */}
          <div className="mt-4 pt-3 border-t border-[var(--border)]">
            <div className="text-[9px] sm:text-[10px] tick mb-2">
              🏆 TOP 3 STRONGEST VIEWS · 가장 강한 3대 의견
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[...result.opinions]
                .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
                .slice(0, 3)
                .map((op) => {
                  const meta = VOTE_META[op.vote];
                  return (
                    <div
                      key={op.agent}
                      className={`border rounded p-2 ${meta.bg} border-[var(--border)]`}
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-[14px]">{op.icon}</span>
                        <span className="font-bold bright kr text-[9px] sm:text-[10px]">
                          {op.agentKr}
                        </span>
                      </div>
                      <div className={`font-bold ${meta.color} text-[11px] sm:text-[12px]`}>
                        {op.score > 0 ? "+" : ""}
                        {op.score} · {meta.label}
                      </div>
                      <div className="text-[8px] sm:text-[9px] dim kr mt-1 leading-tight">
                        {op.reasoning}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
