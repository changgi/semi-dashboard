"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

// ═══════════════════════════════════════════════════════════
// Urgent Event Banner
// 
// D-3 이내의 중요도 4+ 이벤트를 상단에 강조 표시
// 카일님이 놓치면 안 되는 이벤트 알림
// ═══════════════════════════════════════════════════════════

interface EconomicEvent {
  id: string;
  title: string;
  date: string;
  time?: string;
  timezone: string;
  importance: number;
  daysUntil: number;
  affectedSymbols: string[];
  expectedImpact: string;
  category: string;
}

export function UrgentEventBanner() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data } = useSWR<any>(
    "/api/economic-calendar",
    fetcher,
    { refreshInterval: 3600000 } // 1시간
  );

  if (!data?.success) return null;

  // D-3 이내, 중요도 4+
  const urgentEvents: EconomicEvent[] = (data.allEvents ?? [])
    .filter((e: EconomicEvent) => e.daysUntil >= 0 && e.daysUntil <= 3 && e.importance >= 4)
    .filter((e: EconomicEvent) => !dismissed.has(e.id))
    .slice(0, 3);

  if (urgentEvents.length === 0) return null;

  return (
    <div className="mb-3 space-y-2">
      {urgentEvents.map((e) => {
        const urgentColor =
          e.daysUntil === 0 ? "#ff3860" :
          e.daysUntil <= 1 ? "#ff6644" :
          "#ffaa44";
        const urgentEmoji =
          e.daysUntil === 0 ? "🚨" :
          e.daysUntil <= 1 ? "🔥" :
          "⏰";

        return (
          <div
            key={e.id}
            className="border-l-4 rounded-r p-3 flex items-center gap-3 flex-wrap"
            style={{
              borderLeftColor: urgentColor,
              background: `${urgentColor}10`,
            }}
          >
            {/* 긴급도 아이콘 */}
            <div className="text-[28px] flex-shrink-0">{urgentEmoji}</div>
            
            {/* 이벤트 정보 */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-bold kr" style={{ color: urgentColor }}>
                  {e.title}
                </span>
                <span
                  className="text-[9px] px-2 py-0.5 rounded font-bold kr"
                  style={{
                    background: urgentColor,
                    color: "#111",
                  }}
                >
                  D-{e.daysUntil}{e.daysUntil === 0 ? " (오늘!)" : ""}
                </span>
              </div>
              <div className="text-[10px] dim mt-1 kr">
                {e.date}{e.time && ` · ${e.time} ${e.timezone}`} · 영향: <span className="tick">{(e.affectedSymbols ?? []).slice(0, 4).join(", ")}</span>
              </div>
              <div className="text-[9px] kr mt-0.5" style={{ color: urgentColor }}>
                💥 {e.expectedImpact}
              </div>
            </div>
            
            {/* 액션 버튼 */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <a
                href="#economic-calendar"
                className="text-[9px] px-2 py-1 border rounded kr hover:brightness-110"
                style={{ color: urgentColor, borderColor: `${urgentColor}60` }}
              >
                📅 자세히
              </a>
              <button
                onClick={() => setDismissed((prev) => new Set(prev).add(e.id))}
                className="text-[9px] dim hover:bright px-1"
                title="숨기기 (이 세션만)"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
