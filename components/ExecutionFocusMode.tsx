"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

interface Idea {
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
}

interface Data {
  success: boolean;
  ideas: Idea[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// 실행 체크리스트 기본 항목 (매도 시나리오)
const DEFAULT_SELL_STEPS = [
  { time: "22:20", text: "증권사 앱 로그인" },
  { time: "22:25", text: "종목 및 수량 확인" },
  { time: "22:30", text: "시장 개장 · 시장가 매도 주문" },
  { time: "22:35", text: "체결 확인" },
  { time: "23:00", text: "Execution Tracker에서 완료 체크" },
  { time: "23:05", text: "Trade Journal 기록 (감정 포함)" },
];

export function ExecutionFocusMode({ isOpen, onClose }: Props) {
  const { data } = useSWR<Data>(
    isOpen ? "/api/trade-ideas" : null,
    fetcher,
    { refreshInterval: 30 * 1000 }
  );
  
  const [now, setNow] = useState(new Date());
  const [stepStates, setStepStates] = useState<Record<string, boolean>>({});
  const [selectedIdeaId, setSelectedIdeaId] = useState<string | null>(null);
  
  const today = new Date().toISOString().split("T")[0];
  const STORAGE_KEY = `exec_focus_${today}`;
  
  // 시간 업데이트
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [isOpen]);
  
  // localStorage 복원
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setStepStates(JSON.parse(stored));
      }
    } catch {}
  }, [STORAGE_KEY]);
  
  const toggleStep = (key: string) => {
    setStepStates(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };
  
  if (!isOpen) return null;
  
  const ideas = data?.ideas ?? [];
  const todayIdeas = ideas.filter(i => i.urgency === "today");
  
  // 자동 선택: 첫 번째 today 아이디어
  const activeIdea = selectedIdeaId
    ? ideas.find(i => i.id === selectedIdeaId)
    : todayIdeas[0];
  
  // KST 시간
  const kstOffset = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + kstOffset - now.getTimezoneOffset() * 60 * 1000);
  const kstTime = kst.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  
  // 다음 이벤트까지
  let target = new Date(kst);
  let label = "美 정규장 개장";
  if (kst.getHours() < 22 || (kst.getHours() === 22 && kst.getMinutes() < 30)) {
    target.setHours(22, 30, 0, 0);
  } else if (kst.getHours() < 5) {
    target.setHours(5, 0, 0, 0);
    label = "美 정규장 마감 · TSLA 실적";
  } else {
    target.setDate(target.getDate() + 1);
    target.setHours(22, 30, 0, 0);
  }
  
  const diff = target.getTime() - kst.getTime();
  const hours = Math.max(0, Math.floor(diff / 3600000));
  const minutes = Math.max(0, Math.floor((diff % 3600000) / 60000));
  const seconds = Math.max(0, Math.floor((diff % 60000) / 1000));
  
  const isImminent = diff < 60 * 60 * 1000; // 1시간 이내
  const completedSteps = Object.values(stepStates).filter(Boolean).length;
  const progress = (completedSteps / DEFAULT_SELL_STEPS.length) * 100;
  
  const actionColor = activeIdea?.action === "SELL" ? "#ff3860" : "#00ff88";
  
  return (
    <div
      className="fixed inset-0 z-[110] overflow-y-auto"
      style={{
        background: "rgba(0,0,0,0.97)",
        backdropFilter: "blur(12px)",
      }}
    >
      <div
        className="min-h-screen p-4 md:p-6"
        style={{
          background: isImminent
            ? `radial-gradient(circle at 50% 0%, rgba(255,56,96,0.15), transparent 60%)`
            : `radial-gradient(circle at 50% 0%, ${actionColor}15, transparent 60%)`,
        }}
      >
        {/* 상단 */}
        <div className="flex justify-between items-center mb-4 max-w-xl mx-auto">
          <div className="text-[10px] kr tracking-widest" style={{ color: isImminent ? "#ff3860" : "#ffd93d" }}>
            ⚡ EXECUTION FOCUS MODE
          </div>
          <button
            onClick={onClose}
            className="text-[12px] px-3 py-1 border border-[var(--border)] rounded dim hover:text-white"
          >
            × 종료
          </button>
        </div>
        
        <div className="max-w-xl mx-auto space-y-4">
          {/* 카운트다운 */}
          <div
            className="p-5 rounded-lg border-2 text-center"
            style={{
              borderColor: isImminent ? "#ff3860" : "#ffd93d",
              background: isImminent ? "rgba(255,56,96,0.08)" : "rgba(255,217,61,0.05)",
              animation: isImminent ? "pulseBorder 2s infinite" : "none",
            }}
          >
            <style>{`
              @keyframes pulseBorder {
                0%, 100% { box-shadow: 0 0 20px rgba(255,56,96,0.3); }
                50% { box-shadow: 0 0 40px rgba(255,56,96,0.6); }
              }
            `}</style>
            <div className="text-[9px] dim kr tracking-widest">{label}까지</div>
            <div
              className="text-[56px] leading-none font-bold my-2"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                color: isImminent ? "#ff3860" : "#ffd56b",
              }}
            >
              {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </div>
            <div className="text-[11px] dim kr">현재 {kstTime} KST</div>
          </div>
          
          {/* 아이디어 선택 탭 (여러 개일 때) */}
          {todayIdeas.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {todayIdeas.map((idea, i) => (
                <button
                  key={idea.id}
                  onClick={() => setSelectedIdeaId(idea.id)}
                  className="text-[10px] px-3 py-2 border rounded font-bold kr flex-1"
                  style={{
                    borderColor: activeIdea?.id === idea.id
                      ? (idea.action === "SELL" ? "#ff3860" : "#00ff88")
                      : "var(--border)",
                    background: activeIdea?.id === idea.id
                      ? (idea.action === "SELL" ? "rgba(255,56,96,0.1)" : "rgba(0,255,136,0.1)")
                      : "transparent",
                    color: activeIdea?.id === idea.id
                      ? (idea.action === "SELL" ? "#ff3860" : "#00ff88")
                      : "#aaa",
                  }}
                >
                  {i + 1}. {idea.action} {idea.symbol}
                </button>
              ))}
            </div>
          )}
          
          {/* 액션 카드 */}
          {activeIdea ? (
            <div
              className="p-6 rounded-lg border-2"
              style={{
                borderColor: actionColor,
                background: activeIdea.action === "SELL" ? "rgba(255,56,96,0.06)" : "rgba(0,255,136,0.06)",
              }}
            >
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <div
                  className="text-[44px] font-bold leading-none"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", color: "#ffd56b" }}
                >
                  {activeIdea.symbol}
                </div>
                <div
                  className="px-3 py-1.5 rounded font-bold"
                  style={{
                    background: actionColor,
                    color: "#000",
                    fontSize: "14px",
                    letterSpacing: "0.15em",
                  }}
                >
                  {activeIdea.action === "SELL" ? "🔴 SELL" : "🟢 BUY"}
                </div>
              </div>
              
              <div className="text-center py-4 border-y border-[var(--border)] mb-4">
                <div className="text-[10px] dim kr">매도 주수</div>
                <div
                  className="text-[56px] leading-none font-bold my-1"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", color: "#ffd56b" }}
                >
                  {activeIdea.shares ?? "?"}
                </div>
                <div className="text-[10px] dim kr">주 전량</div>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-black/30 rounded text-center">
                  <div className="text-[9px] dim kr">현재가</div>
                  <div
                    className="text-[22px] font-bold"
                    style={{ fontFamily: "'Bebas Neue', sans-serif", color: "#ffd56b" }}
                  >
                    ${activeIdea.currentPrice.toFixed(2)}
                  </div>
                </div>
                <div className="p-3 bg-black/30 rounded text-center">
                  <div className="text-[9px] dim kr">예상 현금흐름</div>
                  <div
                    className="text-[22px] font-bold"
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      color: activeIdea.action === "SELL" ? "#00ff88" : "#ff3860",
                    }}
                  >
                    {activeIdea.action === "SELL" ? "+" : "-"}${activeIdea.estimatedAmount.toLocaleString()}
                  </div>
                </div>
              </div>
              
              {/* 이유 */}
              <div className="mt-4 p-3 bg-black/40 rounded border-l-4" style={{ borderLeftColor: actionColor }}>
                <div className="text-[9px] kr" style={{ color: actionColor }}>
                  💭 WHY · 이유
                </div>
                <div className="text-[11px] kr mt-1 leading-relaxed">
                  {activeIdea.reasoning}
                </div>
              </div>
              
              {/* 신뢰도 */}
              <div className="mt-3 text-center">
                <div className="text-[9px] dim kr">신뢰도</div>
                <div
                  className="text-[28px] font-bold"
                  style={{
                    fontFamily: "'Bebas Neue', sans-serif",
                    color: activeIdea.confidence >= 75 ? "#00ff88" : "#ffd93d",
                  }}
                >
                  {activeIdea.confidence}%
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center border border-[var(--border)] rounded">
              <div className="text-[11px] dim kr">현재 오늘 실행할 액션 없음</div>
              <div className="text-[9px] dim kr mt-1">Trade Ideas를 확인하세요</div>
            </div>
          )}
          
          {/* 실행 체크리스트 */}
          <div
            className="p-4 rounded-lg border"
            style={{
              borderColor: "var(--amber)",
              background: "rgba(255,176,0,0.04)",
            }}
          >
            <div className="flex justify-between items-center mb-3">
              <div className="text-[11px] tick font-bold kr tracking-widest">
                ✓ 실행 체크리스트
              </div>
              <div
                className="text-[14px] font-bold tick"
                style={{ fontFamily: "'Bebas Neue', sans-serif" }}
              >
                {completedSteps}/{DEFAULT_SELL_STEPS.length}
              </div>
            </div>
            
            {/* 진행률 */}
            <div className="h-1.5 bg-black/40 rounded overflow-hidden mb-3">
              <div
                className="h-full transition-all"
                style={{
                  width: `${progress}%`,
                  background: progress === 100 ? "#00ff88" : "var(--amber)",
                }}
              />
            </div>
            
            {/* 체크박스들 */}
            <div className="space-y-2">
              {DEFAULT_SELL_STEPS.map((step, i) => {
                const key = `step_${i}`;
                const checked = stepStates[key];
                return (
                  <div
                    key={key}
                    onClick={() => toggleStep(key)}
                    className="flex items-center gap-3 p-2.5 rounded border cursor-pointer transition-all"
                    style={{
                      borderColor: checked ? "rgba(0,255,136,0.3)" : "var(--border)",
                      background: checked ? "rgba(0,255,136,0.05)" : "rgba(0,0,0,0.3)",
                      opacity: checked ? 0.7 : 1,
                    }}
                  >
                    <div
                      className="w-6 h-6 flex-shrink-0 border-2 rounded flex items-center justify-center"
                      style={{
                        borderColor: checked ? "#00ff88" : "var(--border)",
                        background: checked ? "rgba(0,255,136,0.15)" : "transparent",
                      }}
                    >
                      {checked && <span className="text-[12px] up">✓</span>}
                    </div>
                    <span
                      className="text-[13px] font-bold min-w-[48px]"
                      style={{ fontFamily: "'Bebas Neue', sans-serif", color: "#ffb000" }}
                    >
                      {step.time}
                    </span>
                    <span
                      className={`text-[11px] kr flex-1 ${checked ? "line-through dim" : ""}`}
                    >
                      {step.text}
                    </span>
                  </div>
                );
              })}
            </div>
            
            {progress === 100 && (
              <div className="mt-3 p-3 text-center border-2 border-[#00ff88] rounded bg-[rgba(0,255,136,0.1)]">
                <div className="text-[14px] up font-bold kr">🎉 매매 완료!</div>
                <div className="text-[9px] dim kr mt-1">수고하셨습니다</div>
              </div>
            )}
          </div>
          
          {/* 만트라 */}
          <div
            className="p-4 rounded-lg text-center"
            style={{
              background: "linear-gradient(135deg, rgba(255,176,0,0.08), rgba(0,0,0,0.3))",
              border: "1px solid rgba(255,176,0,0.3)",
            }}
          >
            <div className="text-[9px] tick tracking-widest mb-2">KYLE'S MANTRA</div>
            <div className="text-[12px] kr leading-relaxed" style={{ color: "#ffd56b" }}>
              "수익은 덜 벌 수 있어도<br/>
              <b style={{ color: "#ffb000" }}>손실은 반드시 막을 수 있다.</b>"
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
