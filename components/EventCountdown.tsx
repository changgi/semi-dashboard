"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

interface MarketEvent {
  id: string;
  type: string;
  label: string;
  icon: string;
  dateTimeKST: string;
  timeDisplay: string;
  relatedSymbol: string | null;
  relatedToPortfolio: boolean;
  importance: number;
  action: string | null;
  dayOffset: number;
}

interface Data {
  success: boolean;
  kstNow: string;
  nextEvent: MarketEvent;
  nextCriticalEvent: MarketEvent | null;
  events: MarketEvent[];
}

function calculateDiff(targetIso: string, fromDate: Date) {
  const target = new Date(targetIso);
  const diff = target.getTime() - fromDate.getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return { hours, minutes, seconds, total: diff };
}

export function EventCountdown() {
  const { data, isLoading } = useSWR<Data>(
    "/api/market-events?days=7",
    fetcher,
    { refreshInterval: 5 * 60 * 1000 }
  );
  
  const [now, setNow] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  if (isLoading || !data?.success) {
    return (
      <div className="border border-[var(--border)] rounded p-4 bg-black/20">
        <div className="text-[10px] dim kr">시장 이벤트 로딩...</div>
      </div>
    );
  }
  
  const events = data.events ?? [];
  const upcomingEvents = events.filter(e => new Date(e.dateTimeKST) > now);
  
  if (upcomingEvents.length === 0) {
    return (
      <div className="border border-[var(--border)] rounded p-3 bg-black/20">
        <div className="text-[10px] dim kr">예정된 이벤트 없음</div>
      </div>
    );
  }
  
  const primary = upcomingEvents[0];
  const criticalEvent = data.nextCriticalEvent && new Date(data.nextCriticalEvent.dateTimeKST) > now 
    ? data.nextCriticalEvent 
    : null;
  
  const highlightEvent = criticalEvent && criticalEvent.id !== primary.id && criticalEvent.importance >= 4
    ? criticalEvent
    : primary;
  
  const timeLeft = calculateDiff(highlightEvent.dateTimeKST, now);
  const hoursAbs = Math.max(0, timeLeft.hours);
  const isImminent = timeLeft.total < 60 * 60 * 1000;
  const isCritical = timeLeft.total < 5 * 60 * 1000;
  
  const kstOffset = 9 * 60 * 60 * 1000;
  const kstNow = new Date(now.getTime() + kstOffset - now.getTimezoneOffset() * 60 * 1000);
  const kstTime = kstNow.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const kstDate = kstNow.toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" });
  
  const borderColor = isImminent ? "#ff3860" : highlightEvent.relatedToPortfolio ? "var(--amber)" : "var(--border)";
  const bgColor = isImminent ? "rgba(255,56,96,0.06)" : highlightEvent.relatedToPortfolio ? "rgba(255,176,0,0.04)" : "rgba(0,0,0,0.2)";
  
  return (
    <div
      className="border-2 rounded p-4"
      style={{
        borderColor,
        background: bgColor,
        animation: isCritical ? "pulseBorder 1s infinite" : "none",
      }}
    >
      <style>{`
        @keyframes pulseBorder {
          0%, 100% { box-shadow: 0 0 15px rgba(255,56,96,0.3); }
          50% { box-shadow: 0 0 30px rgba(255,56,96,0.6); }
        }
      `}</style>
      
      <div className="flex justify-between items-start gap-3 flex-wrap">
        {/* 현재 시간 */}
        <div>
          <div className="text-[9px] dim kr tracking-widest">CURRENT · KST</div>
          <div
            className="text-[22px] leading-none font-bold mt-1"
            style={{ fontFamily: "'Bebas Neue', sans-serif", color: "var(--amber-bright)" }}
          >
            {kstTime}
          </div>
          <div className="text-[9px] dim kr mt-1">{kstDate}</div>
        </div>
        
        {/* 카운트다운 */}
        <div className="text-center flex-1 min-w-[200px]">
          <div className="text-[9px] dim kr tracking-widest mb-1">
            NEXT EVENT
            {highlightEvent.relatedToPortfolio && (
              <span className="ml-1 tick">⭐ 포트 관련</span>
            )}
          </div>
          <div className="mb-1 flex items-center justify-center gap-1 flex-wrap">
            <span className="text-[18px]">{highlightEvent.icon}</span>
            <span className="text-[12px] kr tick font-bold">{highlightEvent.label}</span>
          </div>
          <div
            className="flex items-baseline gap-2 justify-center"
            style={{ fontFamily: "'Bebas Neue', sans-serif" }}
          >
            <span
              className="text-[32px] font-bold leading-none"
              style={{ color: isImminent ? "#ff3860" : "var(--amber)" }}
            >
              {String(hoursAbs).padStart(2, "0")}:{String(Math.max(0, timeLeft.minutes)).padStart(2, "0")}:{String(Math.max(0, timeLeft.seconds)).padStart(2, "0")}
            </span>
          </div>
          <div className="text-[9px] dim kr mt-1">{highlightEvent.timeDisplay}</div>
        </div>
        
        {/* 액션 힌트 */}
        {highlightEvent.action && (
          <div className="text-right max-w-[180px]">
            <div className="text-[9px] dim kr tracking-widest">ACTION</div>
            <div
              className="text-[10px] kr mt-1 leading-relaxed"
              style={{ color: isImminent ? "#ff3860" : "var(--text)" }}
            >
              {highlightEvent.action}
            </div>
            {highlightEvent.relatedSymbol && (
              <div
                className="text-[10px] tick font-bold mt-1"
                style={{ fontFamily: "'Bebas Neue', sans-serif" }}
              >
                {highlightEvent.relatedSymbol}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* 다음 이벤트들 요약 */}
      {upcomingEvents.length > 1 && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--border)] text-[9px] flex-wrap">
          <span className="dim kr">다음: </span>
          {upcomingEvents.slice(1, 5).map((e) => {
            const t = calculateDiff(e.dateTimeKST, now);
            const isPortRelated = e.relatedToPortfolio;
            return (
              <span 
                key={e.id} 
                className="kr"
                style={{ color: isPortRelated ? "var(--amber)" : undefined }}
              >
                {e.icon} <b>{e.label}</b>{" "}
                <span className="dim">
                  (T-{t.hours >= 24 ? `${Math.floor(t.hours / 24)}d` : `${t.hours}h ${Math.max(0, t.minutes)}m`})
                </span>
              </span>
            );
          })}
        </div>
      )}
      
      {/* 실적 임박 경고 */}
      {criticalEvent && criticalEvent.id !== highlightEvent.id && (
        <div className="mt-3 p-2 rounded border-l-4 border-l-[#ff3860] bg-[rgba(255,56,96,0.05)]">
          <div className="text-[9px] down font-bold kr">
            🚨 {criticalEvent.icon} {criticalEvent.label}
          </div>
          <div className="text-[9px] dim kr mt-0.5">
            {criticalEvent.timeDisplay} · {criticalEvent.action ?? "포트 영향 가능"}
          </div>
        </div>
      )}
    </div>
  );
}
