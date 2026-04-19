"use client";

import { useState } from "react";
import useSWR from "swr";
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
  agentConsensus: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  };
  agreementLevel: number;
  bullishAgents: string[];
  bearishAgents: string[];
  keyReasoning: string;
  confidence: number;
}

interface AgentResult {
  symbol: string;
  currentPrice: number;
  opinions: AgentOpinion[];
  decision: PortfolioDecision;
  error?: string;
}

// ─────────────────────────────────────────────────────────
// 투표 뱃지 색상
// ─────────────────────────────────────────────────────────
function voteBadge(vote: Vote) {
  const cfg = {
    STRONG_BUY: { bg: "bg-[rgba(0,255,136,0.15)]", text: "text-[#00ff88]", border: "border-[#00ff88]", label: "강력매수" },
    BUY:        { bg: "bg-[rgba(0,255,136,0.08)]", text: "text-[#88dd99]", border: "border-[#88dd99]", label: "매수" },
    HOLD:       { bg: "bg-[rgba(255,176,0,0.08)]", text: "text-[var(--amber)]", border: "border-[var(--amber-dim)]", label: "보유" },
    SELL:       { bg: "bg-[rgba(255,56,96,0.08)]", text: "text-[#ff8888]", border: "border-[#ff8888]", label: "매도" },
    STRONG_SELL:{ bg: "bg-[rgba(255,56,96,0.15)]", text: "text-[#ff3860]", border: "border-[#ff3860]", label: "강력매도" },
  };
  return cfg[vote];
}

// 점수 바 (−100 ~ +100)
function ScoreBar({ score }: { score: number }) {
  const abs = Math.abs(score);
  const width = Math.min(100, abs);
  const pos = score >= 0 ? "right-1/2" : "left-1/2";
  const color = score >= 40 ? "#00ff88" : score >= 15 ? "#88dd99" : score >= -15 ? "#888" : score >= -40 ? "#ff8888" : "#ff3860";
  return (
    <div className="relative w-full h-1.5 bg-[rgba(255,255,255,0.06)] rounded overflow-hidden">
      <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-[rgba(255,255,255,0.2)]" />
      <div
        className={`absolute top-0 bottom-0 ${pos}`}
        style={{
          width: `${width / 2}%`,
          background: color,
          transform: score >= 0 ? "translateX(0%)" : "translateX(0%)",
        }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 에이전트 카드
// ─────────────────────────────────────────────────────────
function AgentCard({ op }: { op: AgentOpinion }) {
  const badge = voteBadge(op.vote);
  return (
    <div className={`border ${badge.border} rounded p-2 sm:p-2.5 hover:bg-[rgba(255,255,255,0.02)] transition-colors`}>
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-[14px] sm:text-[16px]">{op.icon}</span>
          <div className="min-w-0">
            <div className="text-[9px] sm:text-[10px] font-bold bright truncate kr">{op.agentKr}</div>
            <div className="text-[7px] sm:text-[8px] dim">{op.category === "legendary" ? "레전드" : "전문가"}</div>
          </div>
        </div>
        <div className={`text-[7px] sm:text-[8px] px-1 py-[1px] ${badge.bg} ${badge.text} ${badge.border} border rounded whitespace-nowrap kr`}>
          {badge.label}
        </div>
      </div>
      <ScoreBar score={op.score} />
      <div className="flex items-center justify-between mt-1">
        <span className="text-[8px] sm:text-[9px] tick">{op.score > 0 ? "+" : ""}{op.score}</span>
        <span className="text-[7px] sm:text-[8px] dim">신뢰 {op.confidence}%</span>
      </div>
      <div className="text-[7px] sm:text-[8px] dim mt-1 line-clamp-2 kr leading-tight">
        {op.reasoning}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Portfolio Manager 종합 판단 카드
// ─────────────────────────────────────────────────────────
function DecisionPanel({ result }: { result: AgentResult }) {
  const { decision } = result;
  const badge = voteBadge(decision.finalVote);
  const c = decision.agentConsensus;
  const total = c.strongBuy + c.buy + c.hold + c.sell + c.strongSell;

  return (
    <div className={`border-2 ${badge.border} rounded-lg p-3 sm:p-4 mb-4 bg-[rgba(0,0,0,0.3)]`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[18px] sm:text-[22px]">🎯</span>
          <div>
            <div className="text-[10px] sm:text-[11px] tick">PORTFOLIO MANAGER</div>
            <div className="text-[8px] sm:text-[9px] dim kr">19 에이전트 종합 판단</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-[14px] sm:text-[18px] font-bold ${badge.text} kr`}>
            {badge.label}
          </div>
          <div className="text-[9px] sm:text-[10px] dim">
            Score: {decision.finalScore > 0 ? "+" : ""}{decision.finalScore} / 100
          </div>
        </div>
      </div>

      {/* 합의 수준 */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-[8px] sm:text-[9px] mb-1">
          <span className="dim kr">에이전트 합의율</span>
          <span className={`font-bold ${decision.agreementLevel >= 60 ? "up" : decision.agreementLevel >= 40 ? "text-[var(--amber)]" : "down"}`}>
            {decision.agreementLevel}%
          </span>
        </div>
        {/* 투표 분포 바 */}
        <div className="h-2 w-full flex rounded overflow-hidden border border-[var(--border)]">
          {c.strongBuy > 0 && <div className="bg-[#00ff88]" style={{ width: `${(c.strongBuy/total)*100}%` }} title={`강력매수 ${c.strongBuy}`} />}
          {c.buy > 0 && <div className="bg-[#88dd99]" style={{ width: `${(c.buy/total)*100}%` }} title={`매수 ${c.buy}`} />}
          {c.hold > 0 && <div className="bg-[var(--amber)]" style={{ width: `${(c.hold/total)*100}%` }} title={`보유 ${c.hold}`} />}
          {c.sell > 0 && <div className="bg-[#ff8888]" style={{ width: `${(c.sell/total)*100}%` }} title={`매도 ${c.sell}`} />}
          {c.strongSell > 0 && <div className="bg-[#ff3860]" style={{ width: `${(c.strongSell/total)*100}%` }} title={`강력매도 ${c.strongSell}`} />}
        </div>
        <div className="flex items-center justify-between text-[7px] sm:text-[8px] mt-1">
          <span className="text-[#00ff88]">매수 {c.strongBuy + c.buy}</span>
          <span className="text-[var(--amber)]">보유 {c.hold}</span>
          <span className="text-[#ff3860]">매도 {c.sell + c.strongSell}</span>
        </div>
      </div>

      {/* Bull/Bear 진영 */}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <div>
          <div className="text-[8px] sm:text-[9px] up font-bold mb-1 kr">
            🐂 매수 진영 ({decision.bullishAgents.length})
          </div>
          <div className="text-[7px] sm:text-[8px] dim kr leading-relaxed">
            {decision.bullishAgents.length > 0 ? decision.bullishAgents.join(", ") : "없음"}
          </div>
        </div>
        <div>
          <div className="text-[8px] sm:text-[9px] down font-bold mb-1 kr">
            🐻 매도 진영 ({decision.bearishAgents.length})
          </div>
          <div className="text-[7px] sm:text-[8px] dim kr leading-relaxed">
            {decision.bearishAgents.length > 0 ? decision.bearishAgents.join(", ") : "없음"}
          </div>
        </div>
      </div>

      {/* 핵심 근거 */}
      <div className="mt-3 pt-2 border-t border-[var(--border)]">
        <div className="text-[8px] sm:text-[9px] tick mb-1">KEY REASONING · 핵심 근거</div>
        <div className="text-[8px] sm:text-[9px] dim kr leading-relaxed">
          {decision.keyReasoning}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 메인 컴포넌트
// ─────────────────────────────────────────────────────────
export function AgentDashboard() {
  const [selectedSymbol, setSelectedSymbol] = useState("NVDA");
  const { data, isLoading } = useSWR(
    `/api/agents?symbol=${selectedSymbol}`,
    fetcher,
    { refreshInterval: 600000 } // 10분
  );

  const result: AgentResult | null = data?.success && data.results?.[0] ? data.results[0] : null;

  // 심볼 리스트 (고정)
  const symbols = ["NVDA", "AMD", "AVGO", "QCOM", "ARM", "MRVL", "TSM", "MU", "ASML", "AMAT", "LRCX", "KLAC", "INTC", "TXN", "ADI"];

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[12px]">
            🤖 AI HEDGE FUND · 19 AGENTS COUNCIL
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            13 레전드 투자자 + 6 전문가 분석 종합 (Daniel Yoo 🇰🇷 포함)
          </div>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* 현재가 */}
      {result && (
        <div className="mb-3">
          <span className="text-[18px] sm:text-[24px] font-bold bright mr-2">{result.symbol}</span>
          <span className="text-[16px] sm:text-[20px] tick">${fmtPrice(result.currentPrice)}</span>
        </div>
      )}

      {isLoading ? (
        <div className="dim text-center py-8 text-[10px] kr">에이전트들이 분석 중...</div>
      ) : !result ? (
        <div className="dim text-center py-8 text-[10px] kr">데이터 없음</div>
      ) : result.error ? (
        <div className="dim text-center py-8 text-[10px] kr">⚠ {result.error}</div>
      ) : (
        <>
          {/* Portfolio Manager 결정 (상단) */}
          <DecisionPanel result={result} />

          {/* Legendary Investors (12명) */}
          <div className="mb-4">
            <div className="text-[9px] sm:text-[10px] tick mb-2">
              🏛️ LEGENDARY INVESTORS · 전설의 투자자 13인
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {result.opinions
                .filter((o) => o.category === "legendary")
                .map((op) => (
                  <AgentCard key={op.agent} op={op} />
                ))}
            </div>
          </div>

          {/* Specialist Agents (6명) */}
          <div className="mb-4">
            <div className="text-[9px] sm:text-[10px] tick mb-2">
              🔬 SPECIALIST AGENTS · 전문 분석가 6인
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {result.opinions
                .filter((o) => o.category === "specialist")
                .map((op) => (
                  <AgentCard key={op.agent} op={op} />
                ))}
            </div>
          </div>

          {/* 면책 */}
          <div className="mt-4 pt-3 border-t border-[var(--border)]">
            <div className="text-[9px] sm:text-[10px] tick mb-2">METHODOLOGY · 방법론</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[8px] sm:text-[9px] dim kr mb-2">
              <div>▸ Multi-Agent 아키텍처 (virattt/ai-hedge-fund 스타일)</div>
              <div>▸ 13 레전드 × 6 전문가 독립 판단</div>
              <div>▸ Portfolio Manager 가중 앙상블</div>
              <div>▸ 동의도(Agreement) 기반 신뢰도 산출</div>
            </div>
            <div className="text-[8px] sm:text-[9px] dim kr leading-relaxed">
              ⚠ 각 에이전트는 역사적 투자 철학을 코드화한 규칙 기반 시뮬레이션입니다.
              실제 투자자의 견해가 아니며, 투자 의사결정은 본인의 판단과 책임 하에 이뤄져야 합니다.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
