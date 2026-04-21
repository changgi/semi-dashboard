"use client";

import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";

const fetcher = safeFetcher;

interface Data {
  success: boolean;
  briefing: {
    generatedAt: string;
    marketMood: {
      mood: string;
      label: string;
      emoji: string;
      reasoning: string;
    };
    portfolio: {
      healthScore: number;
      healthGrade: string;
      totalValueUsd: number;
      totalGainPct: number;
      dayChangeUsd: number;
      topWinnerToday: { symbol: string; name: string; changePct: number } | null;
      topLoserToday: { symbol: string; name: string; changePct: number } | null;
      urgentAlert: string | null;
    };
    todayActions: Array<{
      rank: number;
      action: "BUY" | "SELL" | "WATCH";
      symbol: string;
      name: string;
      reason: string;
      urgency: string;
      confidence: number;
    }>;
    marketEvents: Array<{
      type: string;
      date: string;
      daysUntil: number;
      title: string;
      impact: string;
      affectsPortfolio: boolean;
    }>;
    watchlist: Array<{
      symbol: string;
      name: string;
      currentPrice: number;
      dayChangePct: number;
      sentiment: "up" | "down" | "flat";
    }>;
    advice: string;
  };
}

const MOOD_CONFIG: Record<string, { bg: string; border: string }> = {
  bullish: { bg: "rgba(0,255,136,0.05)", border: "#00ff88" },
  bearish: { bg: "rgba(255,56,96,0.05)", border: "#ff3860" },
  neutral: { bg: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.15)" },
  volatile: { bg: "rgba(255,217,61,0.05)", border: "#ffd93d" },
  transition: { bg: "rgba(255,176,0,0.05)", border: "#ffb000" },
};

const GRADE_COLORS: Record<string, string> = {
  healthy: "#00ff88",
  caution: "#ffd93d",
  warning: "#ffb000",
  critical: "#ff3860",
};

export function DailyBriefingHero() {
  const { data, isLoading } = useSWR<Data>(
    "/api/daily-briefing-v2",
    fetcher,
    { refreshInterval: 5 * 60 * 1000 }
  );
  
  if (isLoading || !data?.success) {
    return (
      <div className="p-6 border-2 border-[var(--border)] rounded bg-black/20 text-center">
        <div className="text-[11px] dim kr">오늘의 브리핑 준비 중...</div>
      </div>
    );
  }
  
  const b = data.briefing;
  const mood = MOOD_CONFIG[b.marketMood.mood] ?? MOOD_CONFIG["neutral"];
  const gradeColor = GRADE_COLORS[b.portfolio.healthGrade] ?? "#aaa";
  const generatedTime = new Date(b.generatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  const generatedDate = new Date(b.generatedAt).toLocaleDateString("ko-KR", { month: "short", day: "numeric", weekday: "short" });
  
  return (
    <div
      className="border-2 rounded p-4 space-y-4"
      style={{ borderColor: mood.border, background: mood.bg }}
    >
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] dim kr tracking-widest">DAILY BRIEFING</span>
            <span className="text-[9px] dim">· {generatedDate} {generatedTime}</span>
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <div
              className="text-[42px] leading-none font-bold"
              style={{ fontFamily: "'Bebas Neue', sans-serif", color: mood.border }}
            >
              {b.marketMood.emoji} {b.marketMood.label}
            </div>
          </div>
          <div className="text-[11px] kr mt-2 dim">
            {b.marketMood.reasoning}
          </div>
        </div>
        
        {/* 포트 헬스 */}
        <div className="text-right flex-shrink-0">
          <div className="text-[9px] dim kr">포트 건강도</div>
          <div
            className="text-[36px] leading-none font-bold"
            style={{ fontFamily: "'Bebas Neue', sans-serif", color: gradeColor }}
          >
            {b.portfolio.healthScore}
          </div>
          <div className="text-[9px] dim">/100</div>
          <div
            className="text-[11px] font-bold mt-1"
            style={{ color: b.portfolio.totalGainPct >= 0 ? "#00ff88" : "#ff3860" }}
          >
            {b.portfolio.totalGainPct >= 0 ? "+" : ""}{b.portfolio.totalGainPct.toFixed(2)}%
          </div>
          <div className="text-[9px] dim">
            ${b.portfolio.totalValueUsd.toLocaleString()}
          </div>
        </div>
      </div>
      
      {/* 긴급 경고 */}
      {b.portfolio.urgentAlert && (
        <div
          className="p-2 rounded border-l-4"
          style={{ borderLeftColor: "#ff3860", background: "rgba(255,56,96,0.08)" }}
        >
          <div className="text-[11px] kr font-bold" style={{ color: "#ff3860" }}>
            {b.portfolio.urgentAlert}
          </div>
        </div>
      )}
      
      {/* AI 조언 */}
      <div
        className="p-3 rounded border-l-4"
        style={{ borderLeftColor: "var(--amber)", background: "rgba(255,176,0,0.05)" }}
      >
        <div className="text-[9px] tick kr mb-1 font-bold">💬 AI 조언</div>
        <div className="text-[12px] kr leading-relaxed">
          {b.advice}
        </div>
      </div>
      
      {/* 오늘 TOP 3 액션 */}
      {b.todayActions.length > 0 && (
        <div>
          <div className="text-[10px] tick font-bold kr mb-2 flex items-center justify-between">
            <span>🎯 오늘 반드시 해야 할 것</span>
            <a href="#trade-ideas" className="text-[9px] dim hover:tick">
              전체 보기 →
            </a>
          </div>
          <div className="space-y-1.5">
            {b.todayActions.map(a => (
              <div
                key={a.rank}
                className="p-2 rounded border-l-4 bg-black/20"
                style={{ borderLeftColor: a.action === "BUY" ? "#00ff88" : a.action === "SELL" ? "#ff3860" : "#7ec8ff" }}
              >
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span
                    className="text-[22px] leading-none font-bold"
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      color: a.action === "BUY" ? "#00ff88" : a.action === "SELL" ? "#ff3860" : "#7ec8ff",
                      minWidth: "28px",
                    }}
                  >
                    {a.rank}
                  </span>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded font-bold"
                    style={{
                      background: a.action === "BUY" ? "#00ff88" : a.action === "SELL" ? "#ff3860" : "#7ec8ff",
                      color: "#000",
                    }}
                  >
                    {a.action}
                  </span>
                  <SymbolDisplay
                    meta={{ symbol: a.symbol, displayName: a.name }}
                    size="sm"
                    variant="inline"
                    showBadges={false}
                  />
                  <span className="text-[9px] dim kr">{a.urgency}</span>
                  <span className="text-[9px] tick font-bold ml-auto">{a.confidence}%</span>
                </div>
                <div className="text-[10px] kr pl-7 dim leading-relaxed">
                  {a.reason}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* 시장 이벤트 + 관심 종목 (2열) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 이벤트 */}
        {b.marketEvents.length > 0 && (
          <div>
            <div className="text-[10px] tick font-bold kr mb-2">📅 다가오는 이벤트</div>
            <div className="space-y-1">
              {b.marketEvents.slice(0, 4).map((e, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 p-1.5 rounded bg-black/20 text-[10px]"
                  style={{
                    borderLeft: `3px solid ${
                      e.impact === "high" ? "#ff3860" : e.impact === "medium" ? "#ffd93d" : "rgba(255,255,255,0.15)"
                    }`,
                  }}
                >
                  <div
                    className="text-[14px] font-bold leading-none min-w-[36px]"
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      color: e.daysUntil <= 1 ? "#ff3860" : e.daysUntil <= 3 ? "#ffd93d" : "#ffb000",
                    }}
                  >
                    D-{e.daysUntil}
                  </div>
                  <div className="flex-1 min-w-0 truncate kr">{e.title}</div>
                  {e.affectsPortfolio && (
                    <span className="text-[8px] px-1 rounded kr font-bold bg-[rgba(255,176,0,0.2)] tick">
                      포트영향
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* 관심 종목 */}
        {b.watchlist.length > 0 && (
          <div>
            <div className="text-[10px] tick font-bold kr mb-2">📈 보유 종목 오늘 반응</div>
            <div className="space-y-1">
              {b.watchlist.slice(0, 5).map((w, i) => (
                <div key={i} className="flex items-center justify-between p-1.5 rounded bg-black/20 text-[10px]">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <SymbolDisplay
                      meta={{ symbol: w.symbol, displayName: w.name }}
                      size="xs"
                      variant="inline"
                      showBadges={false}
                      showName={true}
                    />
                  </div>
                  <div
                    className="text-[11px] font-bold"
                    style={{ color: w.sentiment === "up" ? "#00ff88" : w.sentiment === "down" ? "#ff3860" : "#aaa" }}
                  >
                    {w.dayChangePct > 0 ? "+" : ""}{w.dayChangePct.toFixed(2)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* 당일 포트 변화 */}
      {(b.portfolio.topWinnerToday || b.portfolio.topLoserToday) && (
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border)]">
          {b.portfolio.topWinnerToday && (
            <div className="text-[10px]">
              <div className="dim kr">🏆 오늘 베스트</div>
              <div className="flex items-center gap-2 mt-1">
                <SymbolDisplay
                  meta={{ symbol: b.portfolio.topWinnerToday.symbol }}
                  size="xs"
                  variant="inline"
                  showBadges={false}
                  showName={false}
                />
                <span className="up font-bold">+{b.portfolio.topWinnerToday.changePct.toFixed(2)}%</span>
              </div>
            </div>
          )}
          {b.portfolio.topLoserToday && (
            <div className="text-[10px] text-right">
              <div className="dim kr">😰 오늘 워스트</div>
              <div className="flex items-center gap-2 mt-1 justify-end">
                <SymbolDisplay
                  meta={{ symbol: b.portfolio.topLoserToday.symbol }}
                  size="xs"
                  variant="inline"
                  showBadges={false}
                  showName={false}
                />
                <span className="down font-bold">{b.portfolio.topLoserToday.changePct.toFixed(2)}%</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
