"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";

import { safeFetcher } from "@/lib/swr-config";
const fetcher = safeFetcher;

// ═══════════════════════════════════════════════════════════
// Recommendation Ticker
// 
// 상단에 흐르는 실시간 종목 추천
// 카일님이 언제 열어봐도 기회를 놓치지 않게
// ═══════════════════════════════════════════════════════════

interface RecommendationItem {
  symbol: string;
  name: string;
  action: "buy" | "sell" | "hedge" | "hold";
  confidence: number;
  price?: number;
  changePct?: number;
  reason: string;
  color: string;
  icon: string;
}

export function RecommendationTicker() {
  const [closed, setClosed] = useState(false);

  // Agents의 매수 추천 (Top picks)
  const { data: agentsData } = useSWR<any>("/api/agents?take=25", fetcher, {
    refreshInterval: 300000,
  });

  // Investment Advisor
  const { data: advisor } = useSWR<any>("/api/advisor", fetcher, {
    refreshInterval: 300000,
  });

  if (closed) return null;

  // 추천 리스트 구성
  const recommendations: RecommendationItem[] = [];

  if (agentsData?.rows) {
    // Top 5 Strong BUY
    const buyPicks = agentsData.rows
      .filter((r: any) => r.majority === "BUY" && r.buy_ratio >= 0.7)
      .slice(0, 5);

    for (const r of buyPicks) {
      recommendations.push({
        symbol: r.ticker,
        name: r.name_kr || r.name_en || r.ticker,
        action: "buy",
        confidence: Math.round(r.buy_ratio * 100),
        price: r.current_price,
        changePct: r.change_pct,
        reason: `${Math.round(r.buy_ratio * 100)}% 에이전트 매수 추천`,
        color: "#00ff88",
        icon: "🚀",
      });
    }

    // Strong SELL 경고
    const sellPicks = agentsData.rows
      .filter((r: any) => r.majority === "SELL" && r.buy_ratio <= 0.3)
      .slice(0, 3);

    for (const r of sellPicks) {
      recommendations.push({
        symbol: r.ticker,
        name: r.name_kr || r.name_en || r.ticker,
        action: "sell",
        confidence: Math.round((1 - r.buy_ratio) * 100),
        price: r.current_price,
        changePct: r.change_pct,
        reason: `${Math.round((1 - r.buy_ratio) * 100)}% 에이전트 매도 경고`,
        color: "#ff3860",
        icon: "⚠️",
      });
    }
  }

  // Advisor 액션 추가
  if (advisor?.success && advisor.actions) {
    for (const a of (advisor.actions ?? []).slice(0, 3)) {
      if (a.priority === "high") {
        recommendations.push({
          symbol: "ACTION",
          name: a.title,
          action: "hedge",
          confidence: 80,
          reason: a.desc || a.description,
          color: "#ffaa44",
          icon: "🎯",
        });
      }
    }
  }

  if (recommendations.length === 0) return null;

  // 애니메이션을 위해 2번 복사 (seamless loop)
  const tickerItems = [...recommendations, ...recommendations];

  return (
    <div className="sticky top-0 z-30 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-[var(--amber-dim)]">
      <div className="max-w-full flex items-center">
        {/* 라벨 */}
        <div className="flex-shrink-0 px-3 py-2 border-r border-[var(--amber-dim)] bg-[var(--amber)] text-[#111]">
          <span className="text-[10px] font-bold kr">💡 실시간 추천</span>
        </div>

        {/* 티커 애니메이션 */}
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center gap-6 animate-scroll-left whitespace-nowrap py-2">
            {tickerItems.map((item, i) => (
              <a
                key={`${item.symbol}-${i}`}
                href={`/stock/${encodeURIComponent(item.symbol)}`}
                className="flex items-center gap-2 flex-shrink-0 hover:brightness-125 transition-all"
                onClick={(e) => {
                  if (item.symbol === "ACTION") e.preventDefault();
                }}
              >
                <span className="text-[14px]">{item.icon}</span>
                <span
                  className="text-[11px] font-bold"
                  style={{ color: item.color }}
                >
                  {item.symbol}
                </span>
                <span className="text-[10px] dim kr">
                  {(item.name ?? "").length > 20 ? (item.name ?? "").slice(0, 20) + "…" : (item.name ?? "-")}
                </span>
                {item.price !== undefined && (
                  <span className="text-[10px] tick">
                    ${item.price.toFixed(2)}
                  </span>
                )}
                {item.changePct !== undefined && (
                  <span
                    className={`text-[10px] font-bold ${
                      item.changePct >= 0 ? "up" : "down"
                    }`}
                  >
                    {item.changePct >= 0 ? "+" : ""}
                    {item.changePct.toFixed(2)}%
                  </span>
                )}
                <span
                  className="text-[9px] px-1.5 py-0.5 border rounded kr font-bold"
                  style={{
                    borderColor: item.color,
                    color: item.color,
                  }}
                >
                  {item.confidence}%
                </span>
                <span className="text-[9px] dim kr opacity-70">
                  · {(item.reason ?? "").slice(0, 40)}
                </span>
                <span className="text-[14px] dim ml-4">•</span>
              </a>
            ))}
          </div>
        </div>

        {/* 닫기 */}
        <button
          className="flex-shrink-0 px-3 py-2 border-l border-[var(--border)] text-[12px] dim hover:text-[#ff3860] transition-colors"
          onClick={() => setClosed(true)}
          title="숨기기"
        >
          ✕
        </button>
      </div>

      <style jsx>{`
        @keyframes scroll-left {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-scroll-left {
          animation: scroll-left 60s linear infinite;
        }
        .animate-scroll-left:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
