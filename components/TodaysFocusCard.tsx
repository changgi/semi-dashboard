"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";
import { fmtPct, fmtDday } from "@/lib/format";
import { ActionCardModal } from "@/components/ActionCardModal";

const fetcher = safeFetcher;

interface Focus {
  generatedAt: string;
  headline: string;
  headlineEmoji: string;
  severity: "critical" | "action_needed" | "attention" | "calm";
  primaryAction: {
    type: "execute" | "watch" | "wait" | "research";
    title: string;
    why: string;
    how: string;
    urgency: "today" | "this_week" | "monitor";
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

interface Data {
  success: boolean;
  focus?: Focus;
}

const SEVERITY_CONFIG = {
  critical: { color: "#ff3860", bg: "rgba(255,56,96,0.1)", borderWidth: "3px" },
  action_needed: { color: "#ffd93d", bg: "rgba(255,217,61,0.08)", borderWidth: "2px" },
  attention: { color: "#ffb000", bg: "rgba(255,176,0,0.06)", borderWidth: "2px" },
  calm: { color: "#00ff88", bg: "rgba(0,255,136,0.05)", borderWidth: "1px" },
};

const URGENCY_CONFIG = {
  today: { color: "#ff3860", label: "오늘" },
  this_week: { color: "#ffd93d", label: "이번주" },
  monitor: { color: "#7ec8ff", label: "모니터링" },
};

const ACTION_TYPE_ICONS = {
  execute: "⚡",
  watch: "👁",
  wait: "⏸",
  research: "🔬",
};

export function TodaysFocusCard() {
  const { data, isLoading } = useSWR<Data>(
    "/api/todays-focus",
    fetcher,
    { refreshInterval: 3 * 60 * 1000 }
  );
  
  const [modalOpen, setModalOpen] = useState(false);
  
  if (isLoading || !data?.success || !data.focus) {
    return (
      <div className="border-2 border-[var(--border)] rounded p-4 bg-black/20">
        <div className="text-[10px] dim kr">오늘의 포커스 준비 중...</div>
      </div>
    );
  }
  
  const f = data.focus;
  const sev = SEVERITY_CONFIG[f.severity];
  const urg = URGENCY_CONFIG[f.primaryAction.urgency];
  const actionIcon = ACTION_TYPE_ICONS[f.primaryAction.type];
  
  return (
    <>
      <div
        className="rounded p-5 relative"
        style={{
          border: `${sev.borderWidth} solid ${sev.color}`,
          background: sev.bg,
        }}
      >
        {/* 풀스크린 확대 버튼 */}
        <button
          onClick={() => setModalOpen(true)}
          className="absolute top-3 right-3 text-[10px] px-3 py-1.5 border rounded font-bold kr z-10"
          style={{
            borderColor: sev.color,
            color: sev.color,
            background: "rgba(0,0,0,0.3)",
          }}
          title="풀스크린 액션 카드 보기"
        >
          ⛶ 확대
        </button>
        
        {/* 헤드라인 */}
        <div className="flex items-start gap-3 mb-4">
          <div className="text-[32px] leading-none flex-shrink-0">
            {f.headlineEmoji}
          </div>
          <div className="flex-1 min-w-0 pr-20">
            <div className="text-[9px] dim kr tracking-widest">TODAY'S FOCUS</div>
            <div
              className="text-[16px] kr font-bold mt-1 leading-tight"
              style={{ color: sev.color }}
            >
              {f.headline}
            </div>
          </div>
        
        {/* 미니 메트릭 */}
        <div className="text-right flex-shrink-0">
          <div className="text-[9px] dim kr">포트 건강</div>
          <div
            className="text-[28px] leading-none font-bold"
            style={{ 
              fontFamily: "'Bebas Neue', sans-serif", 
              color: f.metrics.portfolioHealth >= 60 ? "#00ff88" : f.metrics.portfolioHealth >= 40 ? "#ffd93d" : "#ff3860",
            }}
          >
            {f.metrics.portfolioHealth}
          </div>
          <div 
            className="text-[11px] font-bold"
            style={{ color: f.metrics.lossPct >= 0 ? "#00ff88" : "#ff3860" }}
          >
            {fmtPct(f.metrics.lossPct)}
          </div>
        </div>
      </div>
      
      {/* Primary Action - 큰 카드 */}
      <div
        className="p-4 rounded border-2"
        style={{
          borderColor: urg.color,
          background: "rgba(0,0,0,0.3)",
        }}
      >
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[20px] leading-none">{actionIcon}</span>
          <span className="text-[9px] dim kr tracking-widest">ACTION</span>
          <span
            className="text-[9px] px-2 py-0.5 rounded font-bold kr"
            style={{ background: urg.color, color: "#000" }}
          >
            {urg.label}
          </span>
        </div>
        
        <div className="text-[15px] kr font-bold bright mb-2">
          {f.primaryAction.title}
        </div>
        
        <div className="text-[11px] kr dim leading-relaxed mb-2">
          <b className="tick">왜? </b>
          {f.primaryAction.why}
        </div>
        
        <div className="text-[11px] kr leading-relaxed" style={{ color: "#00ff88" }}>
          <b>▶ 방법: </b>
          {f.primaryAction.how}
        </div>
      </div>
      
      {/* Watch Out + Opportunity (2열) */}
      {(f.watchOut || f.opportunity) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
          {/* 경계 사항 */}
          {f.watchOut && (
            <div className="p-3 rounded border-l-4 border-l-[#ff3860] bg-[rgba(255,56,96,0.04)]">
              <div className="text-[9px] down font-bold kr mb-1">⚠️ 경계 사항</div>
              <div className="text-[11px] kr font-bold down mb-1">
                {f.watchOut.what}
              </div>
              <div className="text-[10px] kr dim">
                {f.watchOut.impact}
              </div>
            </div>
          )}
          
          {/* 기회 */}
          {f.opportunity && (
            <div className="p-3 rounded border-l-4 border-l-[#00ff88] bg-[rgba(0,255,136,0.04)]">
              <div className="text-[9px] up font-bold kr mb-1">💎 놓치지 말 기회</div>
              <div className="text-[13px] tick font-bold mb-1" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                {f.opportunity.symbol}
              </div>
              <div className="text-[10px] kr dim leading-relaxed">
                {f.opportunity.why}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* 다음 이벤트 (있을 때만) */}
      {f.metrics.nextEventDaysUntil !== null && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between text-[10px]">
          <div className="kr dim">
            📅 다음 중요 이벤트
          </div>
          <div className="flex items-center gap-2">
            <span className="kr tick font-bold">{f.metrics.nextEventTitle}</span>
            <span
              className="text-[14px] font-bold"
              style={{ 
                fontFamily: "'Bebas Neue', sans-serif",
                color: f.metrics.nextEventDaysUntil <= 1 ? "#ff3860" : f.metrics.nextEventDaysUntil <= 3 ? "#ffd93d" : "#ffb000",
              }}
            >
              D-{f.metrics.nextEventDaysUntil}
            </span>
          </div>
        </div>
      )}
    </div>
    
    <ActionCardModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
