"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";

const fetcher = safeFetcher;

interface TradeIdea {
  id: string;
  action: "BUY" | "SELL";
  symbol: string;
  name: string;
  shares?: number;
  estimatedAmount: number;
  currentPrice: number;
  source: string;
  sourceLabel: string;
  urgency: "today" | "this_week" | "next_week";
  urgencyLabel: string;
  confidence: number;
  reasoning: string;
  expectedImpact: string;
  risks: string[];
  rank: number;
}

interface Data {
  success: boolean;
  summary: {
    totalIdeas: number;
    sellCount: number;
    buyCount: number;
    todayCount: number;
    thisWeekCount: number;
    totalSellCash: number;
    totalBuyCost: number;
    netCashFlow: number;
  };
  ideas: TradeIdea[];
  executionSummary: string;
}

export function TradeIdeasPanel() {
  const { data, isLoading } = useSWR<Data>(
    "/api/trade-ideas",
    fetcher,
    { refreshInterval: 3 * 60 * 1000 }
  );
  
  const [expanded, setExpanded] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  
  if (isLoading || !data) {
    return (
      <div className="p-4 border border-[var(--border)] rounded bg-black/20">
        <div className="text-[10px] dim kr">매매 아이디어 생성 중...</div>
      </div>
    );
  }
  
  if (!data.success || !data.ideas || data.ideas.length === 0) {
    return (
      <div className="p-6 border border-[var(--border)] rounded bg-black/20 text-center">
        <div className="text-[11px] dim kr">현재 실행 권장 액션 없음</div>
        <div className="text-[9px] dim kr mt-1">시장 상황 변화 시 자동 업데이트됩니다</div>
      </div>
    );
  }
  
  const toggleComplete = (id: string) => {
    setCompleted(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  
  const completedCount = Array.from(completed).filter(id => data.ideas.some(i => i.id === id)).length;
  const progress = data.ideas.length > 0 ? (completedCount / data.ideas.length) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* 실행 요약 */}
      <div
        className="p-3 border-2 rounded"
        style={{
          borderColor: data.summary.todayCount > 0 ? "#ff3860" : data.summary.thisWeekCount > 0 ? "#ffd93d" : "#00ff88",
          background: data.summary.todayCount > 0 ? "rgba(255,56,96,0.05)" : data.summary.thisWeekCount > 0 ? "rgba(255,217,61,0.05)" : "rgba(0,255,136,0.05)",
        }}
      >
        <div className="text-[12px] kr font-bold bright mb-2">
          {data.executionSummary}
        </div>
        <div className="grid grid-cols-4 gap-2 text-[9px] pt-2 border-t border-[var(--border)]">
          <div>
            <div className="dim kr">총 아이디어</div>
            <div className="text-[14px] tick font-bold">{data.summary.totalIdeas}</div>
          </div>
          <div>
            <div className="dim kr">매수 / 매도</div>
            <div className="text-[12px]">
              <span className="up font-bold">{data.summary.buyCount}↑</span>
              <span className="mx-1 dim">·</span>
              <span className="down font-bold">{data.summary.sellCount}↓</span>
            </div>
          </div>
          <div>
            <div className="dim kr">순 현금흐름</div>
            <div
              className="text-[12px] font-bold"
              style={{ color: data.summary.netCashFlow >= 0 ? "#00ff88" : "#ff3860" }}
            >
              {data.summary.netCashFlow >= 0 ? "+" : ""}${data.summary.netCashFlow.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="dim kr">진행률</div>
            <div className="text-[12px] tick font-bold">{completedCount}/{data.ideas.length}</div>
          </div>
        </div>
        
        {/* 진행 바 */}
        {completedCount > 0 && (
          <div className="mt-2 h-1 bg-black/40 rounded overflow-hidden">
            <div
              className="h-full bg-[var(--amber)] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      
      {/* 아이디어 리스트 */}
      {data.ideas.map((idea, i) => {
        const isExpanded = expanded === idea.id;
        const isCompleted = completed.has(idea.id);
        const actionColor = idea.action === "BUY" ? "#00ff88" : "#ff3860";
        const urgencyColor = idea.urgency === "today" ? "#ff3860" : idea.urgency === "this_week" ? "#ffd93d" : "#7ec8ff";
        
        return (
          <div
            key={idea.id}
            className="border rounded bg-[var(--bg-card,#141414)] overflow-hidden transition-all"
            style={{
              borderLeftColor: actionColor,
              borderLeftWidth: "4px",
              opacity: isCompleted ? 0.5 : 1,
            }}
          >
            <div
              className="p-3 cursor-pointer"
              onClick={() => setExpanded(isExpanded ? null : idea.id)}
            >
              <div className="flex items-start gap-3">
                {/* 체크박스 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleComplete(idea.id);
                  }}
                  className="w-5 h-5 border-2 rounded flex items-center justify-center flex-shrink-0 mt-1"
                  style={{ borderColor: isCompleted ? "#00ff88" : "var(--border)" }}
                >
                  {isCompleted && <span className="text-[12px] up">✓</span>}
                </button>
                
                {/* 랭크 */}
                <div
                  className="font-bold leading-none flex-shrink-0"
                  style={{
                    color: "var(--amber-bright)",
                    fontFamily: "'Bebas Neue', sans-serif",
                    fontSize: "28px",
                    minWidth: "36px",
                  }}
                >
                  {i + 1}
                </div>
                
                {/* 본문 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span
                      className="text-[10px] px-2 py-0.5 rounded font-bold"
                      style={{ background: actionColor, color: "#000" }}
                    >
                      {idea.action}
                    </span>
                    <SymbolDisplay
                      meta={{ symbol: idea.symbol, displayName: idea.name }}
                      size="sm"
                      variant="inline"
                      showBadges={false}
                    />
                    <span
                      className="text-[8px] px-1.5 py-0.5 rounded kr font-bold"
                      style={{ background: `${urgencyColor}25`, color: urgencyColor }}
                    >
                      {idea.urgencyLabel}
                    </span>
                  </div>
                  
                  <div className="text-[10px] kr leading-relaxed mb-1" style={{ color: isCompleted ? "var(--dim)" : "var(--text)" }}>
                    {idea.reasoning}
                  </div>
                  
                  <div className="flex items-center gap-3 text-[9px] flex-wrap mt-1">
                    {idea.shares !== undefined && (
                      <span>
                        <span className="dim kr">주수</span>{" "}
                        <b className="tick">{idea.shares}주</b>
                      </span>
                    )}
                    <span>
                      <span className="dim kr">금액</span>{" "}
                      <b className="tick">${idea.estimatedAmount.toLocaleString()}</b>
                    </span>
                    <span>
                      <span className="dim kr">출처</span>{" "}
                      <b className="text-[var(--amber-bright)]">{idea.sourceLabel}</b>
                    </span>
                  </div>
                </div>
                
                {/* 신뢰도 */}
                <div className="text-right flex-shrink-0">
                  <div
                    className="font-bold leading-none"
                    style={{
                      color: idea.confidence >= 75 ? "#00ff88" : idea.confidence >= 60 ? "#ffd93d" : "#ffb000",
                      fontFamily: "'Bebas Neue', sans-serif",
                      fontSize: "22px",
                    }}
                  >
                    {idea.confidence}
                  </div>
                  <div className="text-[8px] dim kr">신뢰도</div>
                </div>
              </div>
            </div>
            
            {/* 확장 영역 */}
            {isExpanded && (
              <div className="border-t border-[var(--border)] p-3 bg-black/20 space-y-2">
                <div>
                  <div className="text-[9px] tick font-bold kr mb-1">📊 예상 효과</div>
                  <div className="text-[10px] kr up">{idea.expectedImpact}</div>
                </div>
                
                {idea.risks.length > 0 && (
                  <div>
                    <div className="text-[9px] down font-bold kr mb-1">⚠️ 주의사항</div>
                    {idea.risks.map((r, j) => (
                      <div key={j} className="text-[10px] kr mb-0.5 pl-3 relative">
                        <span className="absolute left-0 down">•</span>
                        {r}
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex gap-2 pt-2 border-t border-[var(--border)]">
                  <a
                    href={`/stock/${idea.symbol}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center text-[9px] px-2 py-1.5 border border-[var(--border)] rounded kr tick hover:bg-[rgba(255,176,0,0.08)]"
                  >
                    📈 상세 분석
                  </a>
                  <button
                    onClick={() => toggleComplete(idea.id)}
                    className="flex-1 text-center text-[9px] px-2 py-1.5 border rounded kr transition-all"
                    style={{
                      borderColor: isCompleted ? "#00ff88" : "var(--amber)",
                      color: isCompleted ? "#00ff88" : "var(--amber-bright)",
                      background: isCompleted ? "rgba(0,255,136,0.1)" : "rgba(255,176,0,0.1)",
                    }}
                  >
                    {isCompleted ? "✓ 완료 취소" : "완료 체크"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      
      <div className="text-[9px] dim kr p-2 border border-[var(--border)]/50 rounded bg-black/10 flex items-center justify-between">
        <span>💡 진단 + 기회 + 복구 + 실적을 종합한 TOP 액션</span>
        <span>3분마다 자동 갱신</span>
      </div>
    </div>
  );
}
