"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";
import { fmtUsd } from "@/lib/format";
import { ExecutionFocusMode } from "@/components/ExecutionFocusMode";

const fetcher = safeFetcher;

interface TradeIdea {
  id: string;
  action: "BUY" | "SELL";
  symbol: string;
  name: string;
  shares?: number;
  estimatedAmount: number;
  currentPrice: number;
  urgency: "today" | "this_week" | "next_week";
  confidence: number;
  reasoning: string;
  sourceLabel: string;
}

interface Data {
  success: boolean;
  ideas: TradeIdea[];
  summary: {
    totalIdeas: number;
    todayCount: number;
    sellCount: number;
    buyCount: number;
    netCashFlow: number;
  };
  executionSummary: string;
}

const STORAGE_KEY = "semi_execution_";

type ExecStatus = "pending" | "doing" | "done" | "skip";

interface ExecState {
  status: ExecStatus;
  executedAt?: string;
  executedPrice?: number;
  note?: string;
}

export function ExecutionTracker() {
  const { data, isLoading } = useSWR<Data>(
    "/api/trade-ideas",
    fetcher,
    { refreshInterval: 2 * 60 * 1000 }
  );
  
  const [states, setStates] = useState<Record<string, ExecState>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [focusModeOpen, setFocusModeOpen] = useState(false);
  
  const today = new Date().toISOString().split("T")[0];
  
  // localStorage 로드
  useEffect(() => {
    try {
      const key = `${STORAGE_KEY}${today}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        setStates(JSON.parse(stored));
      } else {
        setStates({});
      }
    } catch {}
  }, [today]);
  
  const saveStates = (next: Record<string, ExecState>) => {
    try {
      localStorage.setItem(`${STORAGE_KEY}${today}`, JSON.stringify(next));
    } catch {}
  };
  
  const setStatus = async (ideaId: string, status: ExecStatus, executedPrice?: number, note?: string) => {
    // 로컬 상태 먼저 업데이트 (빠른 UI 반응)
    setStates(prev => {
      const next = { ...prev };
      next[ideaId] = {
        status,
        executedAt: status === "done" ? new Date().toISOString() : undefined,
        executedPrice: status === "done" ? executedPrice : undefined,
        note: note ?? prev[ideaId]?.note,
      };
      saveStates(next);
      return next;
    });
    
    // ═══════════════════════════════════════
    // "done" 상태 시 → Trade Journal 자동 POST
    // ═══════════════════════════════════════
    if (status === "done" && data) {
      const idea = data.ideas.find(i => i.id === ideaId);
      if (idea && executedPrice) {
        try {
          const today = new Date().toISOString().split("T")[0];
          const res = await fetch("/api/trade-journal-v2", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              trade_date: today,
              symbol: idea.symbol,
              action: idea.action,
              shares: idea.shares,
              price: executedPrice,
              currency: "USD",
              source: "trade_ideas",
              reasoning: `Trade Ideas 추천 따라 실행 · 원 추천: ${idea.reasoning?.substring(0, 80)}`,
              emotion: "neutral",
              tags: ["auto_from_execution_tracker"],
            }),
          });
          const result = await res.json();
          if (result.success && result.linkedRecommendationId) {
            // 추천과 연결됨 - 조용히 성공
            console.log("[ExecutionTracker] Trade Journal 자동 기록 + 추천 연결됨");
          }
        } catch (e) {
          console.error("Trade Journal 자동 POST 실패:", e);
        }
      }
    }
  };
  
  if (isLoading || !data) {
    return (
      <div className="p-4 border border-[var(--border)] rounded bg-black/20">
        <div className="text-[10px] dim kr">실행 목록 로딩 중...</div>
      </div>
    );
  }
  
  const ideas = data.ideas ?? [];
  const todayIdeas = ideas.filter(i => i.urgency === "today");
  const weekIdeas = ideas.filter(i => i.urgency === "this_week");
  
  const doneCount = Object.values(states).filter(s => s.status === "done").length;
  const totalCount = ideas.length;
  const progress = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;
  
  return (
    <>
    <div className="space-y-3">
      {/* 진행 상황 */}
      <div className="p-3 border border-[var(--amber)] rounded bg-[rgba(255,176,0,0.05)]">
        <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
          <div>
            <div className="text-[11px] tick font-bold kr">📋 오늘의 실행 목록</div>
            <div className="text-[9px] dim kr mt-0.5">
              {data.executionSummary}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {todayIdeas.length > 0 && (
              <button
                onClick={() => setFocusModeOpen(true)}
                className="text-[10px] px-3 py-1.5 border-2 rounded font-bold kr"
                style={{
                  borderColor: "#ff3860",
                  color: "#ff3860",
                  background: "rgba(255,56,96,0.1)",
                }}
                title="풀스크린 실행 모드"
              >
                ⚡ 실행 모드
              </button>
            )}
            <div className="text-right">
              <div className="text-[9px] dim kr">진행률</div>
              <div
                className="text-[20px] font-bold"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  color: progress === 100 ? "#00ff88" : "var(--amber-bright)",
                }}
              >
                {doneCount}/{totalCount}
              </div>
            </div>
          </div>
        </div>
        
        <div className="h-2 bg-black/40 rounded overflow-hidden">
          <div
            className="h-full transition-all"
            style={{
              width: `${progress}%`,
              background: progress === 100 
                ? "linear-gradient(90deg, #00ff88, #00dd77)"
                : "linear-gradient(90deg, var(--amber), var(--amber-bright))",
            }}
          />
        </div>
      </div>
      
      {/* 오늘 해야 할 것 */}
      {todayIdeas.length > 0 && (
        <div>
          <div className="text-[10px] down font-bold kr mb-2">🚨 오늘 실행 ({todayIdeas.length}건)</div>
          <div className="space-y-2">
            {todayIdeas.map(idea => (
              <ExecutionCard
                key={idea.id}
                idea={idea}
                state={states[idea.id] ?? { status: "pending" }}
                onStatusChange={(status, price, note) => setStatus(idea.id, status, price, note)}
                expanded={expanded === idea.id}
                onToggleExpanded={() => setExpanded(expanded === idea.id ? null : idea.id)}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* 이번 주 */}
      {weekIdeas.length > 0 && (
        <div>
          <div className="text-[10px] warn font-bold kr mb-2">⚠️ 이번 주 ({weekIdeas.length}건)</div>
          <div className="space-y-2">
            {weekIdeas.map(idea => (
              <ExecutionCard
                key={idea.id}
                idea={idea}
                state={states[idea.id] ?? { status: "pending" }}
                onStatusChange={(status, price, note) => setStatus(idea.id, status, price, note)}
                expanded={expanded === idea.id}
                onToggleExpanded={() => setExpanded(expanded === idea.id ? null : idea.id)}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* 완료 축하 */}
      {progress === 100 && totalCount > 0 && (
        <div className="p-3 text-center border-2 border-[#00ff88] rounded bg-[rgba(0,255,136,0.08)]">
          <div className="text-[14px] up font-bold kr">🎉 오늘의 매매 완료!</div>
          <div className="text-[10px] dim kr mt-1">Trade Journal에 기록 잊지 마세요</div>
        </div>
      )}
      
      <div className="text-[9px] dim kr p-2 border border-[var(--border)]/50 rounded bg-black/10">
        💡 실행 후 체크 · 상태는 로컬 저장 · 자정에 초기화 · "⚡ 실행 모드" 풀스크린
      </div>
    </div>
    
    <ExecutionFocusMode isOpen={focusModeOpen} onClose={() => setFocusModeOpen(false)} />
    </>
  );
}

function ExecutionCard({
  idea,
  state,
  onStatusChange,
  expanded,
  onToggleExpanded,
}: {
  idea: TradeIdea;
  state: ExecState;
  onStatusChange: (status: ExecStatus, price?: number, note?: string) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const [priceInput, setPriceInput] = useState("");
  const [noteInput, setNoteInput] = useState(state.note ?? "");
  
  const isDone = state.status === "done";
  const isSkipped = state.status === "skip";
  const isDoing = state.status === "doing";
  
  const actionColor = idea.action === "BUY" ? "#00ff88" : "#ff3860";
  
  const statusColors = {
    pending: { border: "var(--border)", bg: "var(--bg-card)", badge: "#aaa" },
    doing: { border: "var(--amber)", bg: "rgba(255,176,0,0.06)", badge: "#ffb000" },
    done: { border: "#00ff88", bg: "rgba(0,255,136,0.05)", badge: "#00ff88" },
    skip: { border: "rgba(255,255,255,0.1)", bg: "rgba(0,0,0,0.2)", badge: "#555" },
  };
  const c = statusColors[state.status];
  
  return (
    <div
      className="border rounded transition-all overflow-hidden"
      style={{
        borderColor: c.border,
        background: c.bg,
        opacity: isSkipped ? 0.5 : 1,
      }}
    >
      <div
        className="p-3 cursor-pointer"
        onClick={onToggleExpanded}
      >
        <div className="flex items-start gap-3 flex-wrap">
          {/* 상태 뱃지 */}
          <div
            className="w-8 h-8 flex items-center justify-center rounded-full text-[14px] font-bold flex-shrink-0"
            style={{ background: c.badge, color: "#000" }}
          >
            {state.status === "done" ? "✓" :
             state.status === "doing" ? "⚡" :
             state.status === "skip" ? "×" : "○"}
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
                showName={false}
              />
              <span className="text-[10px] dim kr">{idea.shares}주</span>
              <span className="text-[10px] tick font-bold">{fmtUsd(idea.estimatedAmount)}</span>
            </div>
            {!isDone && (
              <div className="text-[9px] kr dim leading-relaxed">
                {idea.reasoning?.substring(0, 100)}
                {(idea.reasoning?.length ?? 0) > 100 ? "..." : ""}
              </div>
            )}
            {isDone && (
              <div className="text-[9px] up kr">
                ✅ 실행 완료 {state.executedPrice ? `@ $${state.executedPrice}` : ""}
                {state.executedAt && ` · ${new Date(state.executedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`}
              </div>
            )}
            {isSkipped && (
              <div className="text-[9px] dim kr">건너뜀</div>
            )}
          </div>
          
          {/* 신뢰도 */}
          <div className="text-right flex-shrink-0">
            <div
              className="text-[14px] font-bold"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                color: idea.confidence >= 75 ? "#00ff88" : "#ffd93d",
              }}
            >
              {idea.confidence}
            </div>
            <div className="text-[8px] dim kr">신뢰</div>
          </div>
        </div>
      </div>
      
      {/* 확장 영역 - 실행 */}
      {expanded && (
        <div className="border-t border-[var(--border)] p-3 bg-black/20 space-y-3">
          <div className="text-[10px] kr" style={{ color: "var(--text)" }}>
            💭 {idea.reasoning}
          </div>
          
          {/* 액션 버튼들 */}
          {state.status === "pending" && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => onStatusChange("doing")}
                className="flex-1 text-[10px] px-3 py-2 border border-[var(--amber)] rounded bg-[rgba(255,176,0,0.1)] tick font-bold kr"
              >
                ⚡ 실행 시작
              </button>
              <button
                onClick={() => onStatusChange("skip")}
                className="text-[10px] px-3 py-2 border border-[var(--border)] rounded dim kr"
              >
                건너뜀
              </button>
            </div>
          )}
          
          {state.status === "doing" && (
            <div className="space-y-2">
              <div>
                <label className="text-[9px] dim kr block mb-1">체결가 ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  placeholder={idea.currentPrice.toFixed(2)}
                  className="w-full text-[10px] px-2 py-1.5 bg-black/40 border border-[var(--border)] rounded"
                />
              </div>
              <div>
                <label className="text-[9px] dim kr block mb-1">메모 (선택)</label>
                <input
                  type="text"
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="예: 시장가 체결, 상승 중 진입"
                  className="w-full text-[10px] px-2 py-1.5 bg-black/40 border border-[var(--border)] rounded kr"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onStatusChange("done", priceInput ? Number(priceInput) : undefined, noteInput)}
                  className="flex-1 text-[10px] px-3 py-2 border border-[#00ff88] rounded bg-[rgba(0,255,136,0.1)] up font-bold kr"
                >
                  ✓ 완료 기록
                </button>
                <button
                  onClick={() => onStatusChange("pending")}
                  className="text-[10px] px-3 py-2 border border-[var(--border)] rounded dim kr"
                >
                  취소
                </button>
              </div>
            </div>
          )}
          
          {state.status === "done" && (
            <button
              onClick={() => onStatusChange("pending")}
              className="w-full text-[10px] px-3 py-2 border border-[var(--border)] rounded dim kr"
            >
              ↺ 상태 되돌리기
            </button>
          )}
          
          {state.status === "skip" && (
            <button
              onClick={() => onStatusChange("pending")}
              className="w-full text-[10px] px-3 py-2 border border-[var(--border)] rounded tick kr"
            >
              복원
            </button>
          )}
        </div>
      )}
    </div>
  );
}
