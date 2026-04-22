"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";
import { fmtDday } from "@/lib/format";

const fetcher = safeFetcher;

interface Focus {
  headline: string;
  headlineEmoji: string;
  severity: "critical" | "action_needed" | "attention" | "calm";
  primaryAction: {
    type: string;
    title: string;
    why: string;
    how: string;
    urgency: string;
  };
  watchOut: { what: string; impact: string } | null;
  opportunity: { symbol: string; why: string } | null;
  metrics: {
    portfolioHealth: number;
    lossPct: number;
    nextEventDaysUntil: number | null;
    nextEventTitle: string | null;
  };
}

interface Idea {
  id: string;
  action: string;
  symbol: string;
  shares?: number;
  estimatedAmount: number;
  confidence: number;
  urgency: string;
  reasoning: string;
  sourceLabel: string;
}

const SEVERITY_CONFIG = {
  critical: { bg: "rgba(255,56,96,0.1)", color: "#ff3860", label: "CRITICAL" },
  action_needed: { bg: "rgba(255,217,61,0.08)", color: "#ffd93d", label: "ACTION NEEDED" },
  attention: { bg: "rgba(255,176,0,0.06)", color: "#ffb000", label: "ATTENTION" },
  calm: { bg: "rgba(0,255,136,0.05)", color: "#00ff88", label: "CALM" },
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function ActionCardModal({ isOpen, onClose }: Props) {
  const { data: focusData } = useSWR<{ success: boolean; focus?: Focus }>(
    isOpen ? "/api/todays-focus" : null,
    fetcher,
    { refreshInterval: 2 * 60 * 1000 }
  );
  
  const { data: ideasData } = useSWR<{ success: boolean; ideas: Idea[]; executionSummary: string }>(
    isOpen ? "/api/trade-ideas" : null,
    fetcher,
    { refreshInterval: 2 * 60 * 1000 }
  );
  
  const [now, setNow] = useState(new Date());
  
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  const focus = focusData?.focus;
  const ideas = ideasData?.ideas ?? [];
  const sev = focus ? SEVERITY_CONFIG[focus.severity] : SEVERITY_CONFIG.calm;
  const todayIdeas = ideas.filter(i => i.urgency === "today");
  
  // KST 시간 계산
  const kstOffset = 9 * 60 * 60 * 1000;
  const kst = new Date(now.getTime() + kstOffset - now.getTimezoneOffset() * 60 * 1000);
  const kstTimeStr = kst.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const kstDateStr = kst.toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "long" });
  
  // 22:30 KST까지 카운트다운
  const target = new Date(kst);
  target.setHours(22, 30, 0, 0);
  if (kst >= target) {
    target.setDate(target.getDate() + 1);
    target.setHours(5, 0, 0, 0);
  }
  const diff = target.getTime() - kst.getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  
  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto"
      style={{ background: "rgba(0,0,0,0.95)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="min-h-screen p-4 md:p-8"
        style={{
          background: `radial-gradient(circle at 50% 0%, ${sev.color}15, transparent 60%)`,
        }}
      >
        {/* 상단 - 닫기 버튼 */}
        <div className="flex justify-between items-center mb-4 max-w-3xl mx-auto">
          <div className="text-[10px] dim kr tracking-widest">ACTION CARD · FULLSCREEN</div>
          <button
            onClick={onClose}
            className="text-[14px] px-3 py-1 border border-[var(--border)] rounded dim hover:text-white"
          >
            × 닫기
          </button>
        </div>
        
        <div className="max-w-3xl mx-auto space-y-4">
          {/* 현재 시간 + 카운트다운 */}
          <div
            className="p-5 rounded-lg border-2"
            style={{ borderColor: sev.color, background: sev.bg }}
          >
            <div className="flex justify-between items-center flex-wrap gap-3">
              <div>
                <div className="text-[9px] dim kr tracking-widest">CURRENT · KST</div>
                <div
                  className="text-[36px] leading-none font-bold mt-1"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", color: "#ffd56b" }}
                >
                  {kstTimeStr}
                </div>
                <div className="text-[11px] dim kr mt-1">{kstDateStr}</div>
              </div>
              
              <div className="text-center">
                <div className="text-[9px] dim kr tracking-widest">
                  {kst.getHours() < 22 || (kst.getHours() === 22 && kst.getMinutes() < 30)
                    ? "美 정규장 개장까지"
                    : "TSLA 실적까지"}
                </div>
                <div
                  className="text-[48px] leading-none font-bold"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", color: sev.color }}
                >
                  {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                </div>
              </div>
            </div>
          </div>
          
          {/* 메인 메시지 */}
          {focus && (
            <div
              className="p-6 rounded-lg border-2"
              style={{ borderColor: sev.color, background: sev.bg }}
            >
              <div className="text-center mb-4">
                <div className="text-[48px] mb-2">{focus.headlineEmoji}</div>
                <div
                  className="text-[9px] font-bold tracking-widest mb-2"
                  style={{ color: sev.color }}
                >
                  {sev.label}
                </div>
                <div className="text-[18px] kr font-bold leading-tight" style={{ color: sev.color }}>
                  {focus.headline}
                </div>
              </div>
              
              {/* 메트릭 카드 */}
              <div className="grid grid-cols-3 gap-2 mt-4">
                <div className="p-3 bg-black/30 rounded text-center">
                  <div className="text-[9px] dim kr">건강도</div>
                  <div
                    className="text-[32px] leading-none font-bold mt-1"
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      color: focus.metrics.portfolioHealth >= 50 ? "#00ff88" : "#ff3860",
                    }}
                  >
                    {focus.metrics.portfolioHealth}
                  </div>
                </div>
                <div className="p-3 bg-black/30 rounded text-center">
                  <div className="text-[9px] dim kr">손익</div>
                  <div
                    className="text-[24px] leading-none font-bold mt-1"
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      color: focus.metrics.lossPct >= 0 ? "#00ff88" : "#ff3860",
                    }}
                  >
                    {focus.metrics.lossPct >= 0 ? "+" : ""}{focus.metrics.lossPct.toFixed(1)}%
                  </div>
                </div>
                {focus.metrics.nextEventDaysUntil !== null && (
                  <div className="p-3 bg-black/30 rounded text-center">
                    <div className="text-[9px] dim kr">다음 이벤트</div>
                    <div
                      className="text-[32px] leading-none font-bold mt-1"
                      style={{
                        fontFamily: "'Bebas Neue', sans-serif",
                        color: "#ffb000",
                      }}
                    >
                      D-{focus.metrics.nextEventDaysUntil}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* 오늘 실행할 액션 카드들 */}
          {todayIdeas.length > 0 && (
            <div className="space-y-3">
              <div
                className="text-[11px] font-bold kr tracking-widest text-center py-2"
                style={{ color: sev.color }}
              >
                🚨 오늘 실행 · {todayIdeas.length}건
              </div>
              
              {todayIdeas.map((idea, i) => (
                <div
                  key={idea.id}
                  className="p-5 rounded-lg border-2"
                  style={{
                    borderColor: idea.action === "SELL" ? "#ff3860" : "#00ff88",
                    background: idea.action === "SELL" ? "rgba(255,56,96,0.08)" : "rgba(0,255,136,0.06)",
                  }}
                >
                  <div className="flex justify-between items-start gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span
                          className="text-[32px] font-bold"
                          style={{ 
                            fontFamily: "'Bebas Neue', sans-serif",
                            color: "#ffd56b",
                          }}
                        >
                          {i + 1}
                        </span>
                        <span
                          className="text-[13px] px-3 py-1 rounded font-bold"
                          style={{
                            background: idea.action === "SELL" ? "#ff3860" : "#00ff88",
                            color: "#000",
                            letterSpacing: "0.1em",
                          }}
                        >
                          {idea.action}
                        </span>
                        <span
                          className="text-[22px] font-bold"
                          style={{
                            fontFamily: "'Bebas Neue', sans-serif",
                            color: "#ffd56b",
                          }}
                        >
                          {idea.symbol}
                        </span>
                      </div>
                      
                      <div className="text-[13px] kr mb-2">
                        <b className="tick">{idea.shares ?? "?"}주</b> · <b className="up">${idea.estimatedAmount.toLocaleString()}</b>
                      </div>
                      
                      <div className="text-[11px] kr dim leading-relaxed">
                        💭 {idea.reasoning}
                      </div>
                    </div>
                    
                    <div className="text-right flex-shrink-0">
                      <div className="text-[8px] dim kr">신뢰도</div>
                      <div
                        className="text-[36px] leading-none font-bold"
                        style={{
                          fontFamily: "'Bebas Neue', sans-serif",
                          color: idea.confidence >= 80 ? "#00ff88" : idea.confidence >= 60 ? "#ffd93d" : "#ff3860",
                        }}
                      >
                        {idea.confidence}
                      </div>
                      <div className="text-[8px] dim kr mt-1">{idea.sourceLabel}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* 경계 + 기회 */}
          {focus && (focus.watchOut || focus.opportunity) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {focus.watchOut && (
                <div className="p-4 rounded-lg border-l-4 border-l-[#ff3860] bg-[rgba(255,56,96,0.05)]">
                  <div className="text-[9px] down font-bold kr tracking-widest mb-2">⚠️ 경계 사항</div>
                  <div className="text-[13px] kr font-bold down mb-1">{focus.watchOut.what}</div>
                  <div className="text-[11px] kr dim leading-relaxed">{focus.watchOut.impact}</div>
                </div>
              )}
              
              {focus.opportunity && (
                <div className="p-4 rounded-lg border-l-4 border-l-[#00ff88] bg-[rgba(0,255,136,0.05)]">
                  <div className="text-[9px] up font-bold kr tracking-widest mb-2">💎 놓치지 말 기회</div>
                  <div className="text-[20px] tick font-bold mb-1" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                    {focus.opportunity.symbol}
                  </div>
                  <div className="text-[11px] kr dim leading-relaxed">{focus.opportunity.why}</div>
                </div>
              )}
            </div>
          )}
          
          {/* 만트라 */}
          <div
            className="p-5 rounded-lg text-center"
            style={{
              background: "linear-gradient(135deg, rgba(255,176,0,0.08), rgba(0,0,0,0.3))",
              border: "1px solid rgba(255,176,0,0.3)",
            }}
          >
            <div className="text-[9px] tick tracking-widest mb-3">KYLE'S MANTRA</div>
            <div className="text-[13px] kr leading-relaxed" style={{ color: "#ffd56b" }}>
              "수익은 덜 벌 수 있어도<br/>
              <b style={{ color: "#ffb000" }}>손실은 반드시 막을 수 있다.</b><br/>
              오늘 매도는 원칙을 지키는 것."
            </div>
          </div>
          
          {/* 하단 닫기 */}
          <div className="text-center py-4">
            <button
              onClick={onClose}
              className="text-[11px] px-6 py-2 border border-[var(--amber)] rounded tick font-bold kr"
            >
              ✕ 대시보드로 돌아가기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
