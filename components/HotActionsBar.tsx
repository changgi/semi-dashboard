"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface HotData {
  success: boolean;
  score: {
    value: number;
    label: string;
    color: "green" | "amber" | "red";
  };
  metrics: {
    vix: { value: number; label: string } | null;
    krw: { value: number; label: string } | null;
    soxx: { value: number; label: string; positive: boolean } | null;
  };
  portfolio: {
    totalValue: number;
    totalGain: number;
    totalGainPct: number;
    dayChange: number;
    dayChangePct: number;
    holdingCount: number;
  } | null;
  alerts: string[];
}

// ═══════════════════════════════════════════════════════════
// Hot Actions Bar - 최상단 고정 sticky bar
// 매일 보는 핵심 정보를 한 줄에 (모바일도 가로 스크롤)
// ═══════════════════════════════════════════════════════════
export function HotActionsBar() {
  const { data, isLoading } = useSWR<HotData>("/api/hot-actions", fetcher, {
    refreshInterval: 30000, // 30초
  });

  const scoreColorClass = data?.score.color === "green" ? "text-[#00ff88]"
                        : data?.score.color === "red"   ? "text-[#ff3860]"
                        : "text-[var(--amber)]";

  const scoreBgClass = data?.score.color === "green" ? "bg-[rgba(0,255,136,0.08)] border-[#00ff88]/30"
                     : data?.score.color === "red"   ? "bg-[rgba(255,56,96,0.08)] border-[#ff3860]/30"
                     : "bg-[rgba(255,176,0,0.08)] border-[var(--amber)]/40";

  return (
    <div className="sticky top-0 z-30 border-b border-[var(--border-bright)] bg-[var(--bg)]/95 backdrop-blur-md shadow-lg">
      <div className="px-2 sm:px-6 py-2 flex items-center gap-2 sm:gap-4 overflow-x-auto scrollbar-none">
        {/* 로딩 중 */}
        {isLoading && (
          <div className="flex items-center gap-2 py-1">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--amber)] animate-pulse"></span>
            <span className="text-[9px] dim kr">핫라인 로딩 중...</span>
          </div>
        )}

        {/* Today's Score (최우선) */}
        {data?.success && (
          <>
            <a
              href="#today-view"
              className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded border shrink-0 hover:scale-105 transition-transform ${scoreBgClass}`}
              title="Today's Investment View로 이동"
            >
              <span className="text-[8px] dim kr hidden sm:inline">SCORE</span>
              <span className={`text-[16px] sm:text-[18px] font-bold ${scoreColorClass}`}>
                {data.score.value}
              </span>
              <span className={`text-[9px] font-bold kr ${scoreColorClass}`}>
                {data.score.label}
              </span>
            </a>

            {/* 핵심 지표 3개 */}
            {data.metrics.vix && (
              <div className="flex items-center gap-1 shrink-0 border border-[var(--border)] rounded px-2 py-1">
                <span className="text-[8px] dim">VIX</span>
                <span className={`text-[11px] font-bold ${
                  data.metrics.vix.value > 25 ? "text-[#ff3860]" :
                  data.metrics.vix.value < 13 ? "text-[var(--amber)]" : "tick"
                }`}>
                  {data.metrics.vix.value}
                </span>
              </div>
            )}

            {data.metrics.krw && (
              <div className="flex items-center gap-1 shrink-0 border border-[var(--border)] rounded px-2 py-1">
                <span className="text-[8px] dim">₩/$</span>
                <span className={`text-[11px] font-bold ${
                  data.metrics.krw.value > 1450 ? "text-[#00ff88]" :
                  data.metrics.krw.value > 1350 ? "text-[var(--amber)]" : "tick"
                }`}>
                  {data.metrics.krw.value}
                </span>
              </div>
            )}

            {data.metrics.soxx && (
              <div className="flex items-center gap-1 shrink-0 border border-[var(--border)] rounded px-2 py-1">
                <span className="text-[8px] dim">SOXX</span>
                <span className={`text-[11px] font-bold ${
                  data.metrics.soxx.positive ? "up" : "down"
                }`}>
                  {data.metrics.soxx.positive ? "+" : ""}
                  {data.metrics.soxx.value}%
                </span>
              </div>
            )}

            {/* 포트폴리오 요약 (있을 때만) */}
            {data.portfolio && (
              <a
                href="#portfolio"
                className="flex items-center gap-1 sm:gap-2 shrink-0 border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded px-2 sm:px-3 py-1 hover:bg-[rgba(255,176,0,0.08)] transition-colors"
                title="내 포트폴리오로 이동"
              >
                <span className="text-[8px] dim kr hidden sm:inline">💼 MY PORT</span>
                <span className="text-[11px] tick font-bold sm:hidden">💼</span>
                <span className="text-[11px] font-bold tick">
                  ${data.portfolio.totalValue.toLocaleString()}
                </span>
                <span className={`text-[10px] font-bold ${
                  data.portfolio.totalGainPct >= 0 ? "up" : "down"
                }`}>
                  {data.portfolio.totalGainPct >= 0 ? "+" : ""}
                  {data.portfolio.totalGainPct.toFixed(1)}%
                </span>
                <span className="text-[8px] dim hidden sm:inline">
                  오늘 {data.portfolio.dayChangePct >= 0 ? "+" : ""}
                  {data.portfolio.dayChangePct.toFixed(2)}%
                </span>
              </a>
            )}

            {/* 알림 메시지 (스크롤로) */}
            {data.alerts.length > 0 && (
              <div className="hidden lg:flex items-center gap-3 shrink-0 ml-2 text-[10px]">
                {data.alerts.map((alert, i) => (
                  <span key={i} className="dim hover:bright kr">
                    {alert}
                  </span>
                ))}
              </div>
            )}

            {/* 우측 빠른 이동 링크 */}
            <div className="ml-auto hidden md:flex items-center gap-2 shrink-0">
              <a
                href="/report"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] dim hover:text-[var(--amber)] kr"
                title="일일 리포트 PDF"
              >
                📄 리포트
              </a>
              <span className="dim">·</span>
              <a
                href="#korea-semi"
                className="text-[9px] dim hover:text-[var(--amber)] kr"
                title="한국 반도체"
              >
                🇰🇷 KOREA
              </a>
              <span className="dim">·</span>
              <a
                href="#backtest"
                className="text-[9px] dim hover:text-[var(--amber)] kr"
                title="백테스트"
              >
                🧪 BT
              </a>
              <span className="dim">·</span>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("open-search"))}
                className="text-[9px] dim hover:text-[var(--amber)] kr flex items-center gap-1"
                title="종목 검색 (Ctrl+K)"
              >
                🔍 검색
                <kbd className="hidden md:inline text-[7px] dim border border-[var(--border)] px-1 rounded">⌘K</kbd>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
