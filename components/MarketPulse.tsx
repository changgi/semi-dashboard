"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

interface Data {
  success: boolean;
  briefing: {
    marketEvents: Array<{
      date: string;
      daysUntil: number;
      title: string;
      impact: "high" | "medium" | "low";
      affectsPortfolio: boolean;
    }>;
    portfolio: {
      totalValueUsd: number;
      totalGainPct: number;
    };
  };
}

export function MarketPulse() {
  const [now, setNow] = useState(new Date());
  
  const { data } = useSWR<Data>(
    "/api/daily-briefing-v2",
    fetcher,
    { refreshInterval: 60 * 1000 }
  );
  
  // 매초 현재 시간 업데이트
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  // 다음 중요 이벤트 (affectsPortfolio 우선)
  const events = data?.briefing?.marketEvents ?? [];
  const sortedEvents = [...events].sort((a, b) => {
    // 1. 포트 영향 종목 우선
    if (a.affectsPortfolio && !b.affectsPortfolio) return -1;
    if (!a.affectsPortfolio && b.affectsPortfolio) return 1;
    // 2. 날짜 가까운 순
    return a.daysUntil - b.daysUntil;
  });
  
  const nextEvent = sortedEvents[0];
  
  // 시장 상태
  const isOpenUS = isUSMarketOpen(now);
  const isOpenKR = isKRMarketOpen(now);
  
  // 환율 추정 (간단)
  const fxUsdKrw = 1472;
  const totalUsd = data?.briefing?.portfolio?.totalValueUsd ?? 0;
  const totalKrw = totalUsd * fxUsdKrw;
  
  return (
    <div className="border border-[var(--border)] rounded p-3 bg-[var(--bg-card,#141414)]">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 왼쪽: 현재 시간 + 시장 상태 */}
        <div>
          <div className="text-[9px] dim kr mb-1">시장 시간</div>
          <div
            className="text-[24px] leading-none font-bold"
            style={{ fontFamily: "'Bebas Neue', sans-serif", color: "var(--amber-bright)" }}
          >
            {now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
          </div>
          <div className="text-[9px] dim mt-1 kr">
            {now.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric", weekday: "short" })}
          </div>
          <div className="flex gap-2 mt-2">
            <div
              className="flex items-center gap-1.5 text-[9px] kr"
              style={{ color: isOpenUS ? "#00ff88" : "var(--dim)" }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ 
                  background: isOpenUS ? "#00ff88" : "#666",
                  boxShadow: isOpenUS ? "0 0 6px #00ff88" : "none",
                  animation: isOpenUS ? "pulse-dot 2s infinite" : "none",
                }}
              />
              🇺🇸 美 {isOpenUS ? "OPEN" : "CLOSED"}
            </div>
            <div
              className="flex items-center gap-1.5 text-[9px] kr"
              style={{ color: isOpenKR ? "#00ff88" : "var(--dim)" }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ 
                  background: isOpenKR ? "#00ff88" : "#666",
                  animation: isOpenKR ? "pulse-dot 2s infinite" : "none",
                }}
              />
              🇰🇷 韓 {isOpenKR ? "OPEN" : "CLOSED"}
            </div>
          </div>
        </div>
        
        {/* 가운데: 다음 이벤트 카운트다운 */}
        {nextEvent && (
          <div className="text-center md:border-l md:border-r border-[var(--border)] md:px-3">
            <div className="text-[9px] dim kr mb-1">
              {nextEvent.affectsPortfolio && <span className="tick font-bold">⭐ </span>}
              다음 주요 이벤트
            </div>
            <div
              className="font-bold leading-none"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: "36px",
                color: nextEvent.daysUntil <= 1 ? "#ff3860" : 
                       nextEvent.daysUntil <= 3 ? "#ffd93d" : "var(--amber)",
              }}
            >
              D{nextEvent.daysUntil === 0 ? "-DAY" : `-${nextEvent.daysUntil}`}
            </div>
            <div className="text-[10px] kr mt-1 truncate">
              {nextEvent.title}
            </div>
            <div className="text-[9px] dim mt-0.5">
              {nextEvent.date}
              {nextEvent.impact === "high" && <span className="ml-2 down font-bold">🔴 중요</span>}
              {nextEvent.affectsPortfolio && <span className="ml-2 tick font-bold">포트 영향</span>}
            </div>
          </div>
        )}
        
        {/* 오른쪽: 포트 스냅샷 */}
        <div className="text-right">
          <div className="text-[9px] dim kr mb-1">현재 포트</div>
          <div
            className="font-bold leading-none"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: "24px",
              color: (data?.briefing?.portfolio?.totalGainPct ?? 0) >= 0 ? "#00ff88" : "#ff3860",
            }}
          >
            {(data?.briefing?.portfolio?.totalGainPct ?? 0) >= 0 ? "+" : ""}
            {(data?.briefing?.portfolio?.totalGainPct ?? 0).toFixed(2)}%
          </div>
          <div className="text-[11px] tick font-bold mt-1">
            ${totalUsd.toLocaleString()}
          </div>
          <div className="text-[9px] dim mt-0.5 kr">
            ≈ ₩{(totalKrw / 10000).toFixed(0)}만
          </div>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

// US 시장: EST 09:30-16:00 = KST 22:30-익일 05:00 (서머타임 미적용 간이)
function isUSMarketOpen(now: Date): boolean {
  const utcHour = now.getUTCHours();
  const utcDay = now.getUTCDay();
  // 토(6)·일(0) 제외
  if (utcDay === 0 || utcDay === 6) return false;
  // UTC 13:30 ~ 20:00 = EST 9:30 ~ 16:00
  const utcMinute = now.getUTCMinutes();
  const totalMin = utcHour * 60 + utcMinute;
  return totalMin >= (13 * 60 + 30) && totalMin <= (20 * 60);
}

// KR 시장: KST 09:00-15:30
function isKRMarketOpen(now: Date): boolean {
  const kstDay = (now.getUTCDay() + (now.getUTCHours() + 9 >= 24 ? 1 : 0)) % 7;
  if (kstDay === 0 || kstDay === 6) return false;
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const kstTotalMin = (utcHour + 9) * 60 + utcMin;
  return kstTotalMin >= (9 * 60) && kstTotalMin <= (15 * 60 + 30);
}
