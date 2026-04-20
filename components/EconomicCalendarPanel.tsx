"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface EconomicEvent {
  id: string;
  date: string;
  time?: string;
  timezone: string;
  category: "fed" | "inflation" | "employment" | "earnings" | "korea" | "other";
  importance: number;
  title: string;
  description: string;
  expectedImpact: string;
  affectedSymbols: string[];
  tradingGuide: {
    before: string;
    during: string;
    after: string;
  };
  daysUntil: number;
}

interface CalendarData {
  success: boolean;
  totalEvents: number;
  byCategory: {
    fed: number;
    inflation: number;
    employment: number;
    earnings: number;
    korea: number;
  };
  todayEvents: EconomicEvent[];
  nextWeek: EconomicEvent[];
  nextMonth: EconomicEvent[];
  highImpact: EconomicEvent[];
  nextMajor: EconomicEvent | null;
  allEvents: EconomicEvent[];
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  fed:        { label: "연준",       color: "#ff3860", icon: "🏛️" },
  inflation:  { label: "인플레이션",  color: "#ffaa44", icon: "📊" },
  employment: { label: "고용",       color: "#aaccff", icon: "👔" },
  earnings:   { label: "실적",       color: "#00ff88", icon: "💼" },
  korea:      { label: "한국",       color: "#ee99ff", icon: "🇰🇷" },
  other:      { label: "기타",       color: "#aaa",    icon: "📌" },
};

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function EconomicCalendarPanel() {
  const [filter, setFilter] = useState<"all" | "high" | "week" | "month" | EconomicEvent["category"]>("high");
  
  const { data, isLoading } = useSWR<CalendarData>(
    "/api/economic-calendar",
    fetcher,
    { refreshInterval: 3600000 } // 1시간
  );

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-16">
        <div className="text-[11px] dim kr">📅 경제 이벤트 캘린더 로딩 중...</div>
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[10px] dim kr">데이터 로드 실패</div>
      </div>
    );
  }

  // 필터링
  let filtered: EconomicEvent[] = [];
  if (filter === "all") filtered = data.allEvents;
  else if (filter === "high") filtered = data.highImpact;
  else if (filter === "week") filtered = data.nextWeek;
  else if (filter === "month") filtered = data.nextMonth;
  else filtered = (data.allEvents ?? []).filter((e) => e.category === filter);

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            📅 ECONOMIC CALENDAR · 경제/실적 이벤트
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            FOMC · CPI · NFP · 주요 기업 실적 · 한국 금통위
          </div>
        </div>
      </div>

      {/* ═════════ 오늘 + 다음 주요 이벤트 ═════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
        {/* 오늘 이벤트 */}
        {data.todayEvents.length > 0 ? (
          <div className="border border-[#ff3860]/50 bg-[rgba(255,56,96,0.05)] rounded p-3">
            <div className="text-[10px] tick kr font-bold mb-2 text-[#ff3860]">
              🚨 오늘 발표 ({data.todayEvents.length}건)
            </div>
            {(data.todayEvents ?? []).map((e) => (
              <div key={e.id} className="text-[10px] kr mb-1">
                • {e.title} {e.time && <span className="dim">({e.time} {e.timezone})</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-[var(--border)] rounded p-3">
            <div className="text-[10px] dim kr font-bold mb-2">
              ✅ 오늘 주요 이벤트 없음
            </div>
            <div className="text-[9px] dim kr">평상시 전략 가능</div>
          </div>
        )}

        {/* 다음 주요 이벤트 */}
        {data.nextMajor && (
          <div
            className="border rounded p-3"
            style={{
              borderColor: data.nextMajor.daysUntil <= 3 ? "#ff3860" : "var(--amber-dim)",
              background: data.nextMajor.daysUntil <= 3
                ? "rgba(255,56,96,0.05)"
                : "rgba(255,176,0,0.03)",
            }}
          >
            <div className="text-[10px] dim kr mb-1">⏰ 다음 주요 이벤트</div>
            <div className="text-[14px] font-bold kr">{data.nextMajor.title}</div>
            <div className="text-[10px] kr mt-1">
              {data.nextMajor.date}{data.nextMajor.time && ` · ${data.nextMajor.time} ${data.nextMajor.timezone}`}
              {" · "}
              <span
                className="font-bold"
                style={{ color: data.nextMajor.daysUntil <= 3 ? "#ff3860" : "var(--amber)" }}
              >
                D-{data.nextMajor.daysUntil}
              </span>
            </div>
            <div className="text-[9px] dim kr mt-1 leading-relaxed">
              {data.nextMajor.description}
            </div>
          </div>
        )}
      </div>

      {/* ═════════ 카테고리 통계 ═════════ */}
      <div className="grid grid-cols-5 gap-1.5 mb-3">
        <CategoryBadge
          icon="🏛️"
          label="연준"
          count={data.byCategory.fed}
          color="#ff3860"
          onClick={() => setFilter("fed")}
        />
        <CategoryBadge
          icon="📊"
          label="인플레이션"
          count={data.byCategory.inflation}
          color="#ffaa44"
          onClick={() => setFilter("inflation")}
        />
        <CategoryBadge
          icon="👔"
          label="고용"
          count={data.byCategory.employment}
          color="#aaccff"
          onClick={() => setFilter("employment")}
        />
        <CategoryBadge
          icon="💼"
          label="실적"
          count={data.byCategory.earnings}
          color="#00ff88"
          onClick={() => setFilter("earnings")}
        />
        <CategoryBadge
          icon="🇰🇷"
          label="한국"
          count={data.byCategory.korea}
          color="#ee99ff"
          onClick={() => setFilter("korea")}
        />
      </div>

      {/* ═════════ 필터 ═════════ */}
      <div className="mb-3 flex items-center gap-1 flex-wrap border-b border-[var(--border)] pb-1">
        <FilterBtn label="🔥 중요" active={filter === "high"} onClick={() => setFilter("high")} />
        <FilterBtn label="📆 이번 주" active={filter === "week"} onClick={() => setFilter("week")} />
        <FilterBtn label="📅 이번 달" active={filter === "month"} onClick={() => setFilter("month")} />
        <FilterBtn label="전체" active={filter === "all"} onClick={() => setFilter("all")} />
      </div>

      {/* ═════════ 이벤트 리스트 ═════════ */}
      {filtered.length === 0 ? (
        <div className="text-[10px] dim text-center py-10 kr border border-[var(--border)] rounded">
          해당 기간 이벤트 없음
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 20).map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}

      {/* 하단 설명 */}
      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        <span className="bright">💡 활용</span>: 주요 이벤트 2-3일 전 포지션 축소, 당일 관망, 이후 방향성 확립 시 진입<br />
        <span className="bright">⚠️ 주의</span>: 실적 발표는 시간외 ±10% 변동 가능 - 보유 중이면 미리 헤지 검토
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 카테고리 배지
// ═══════════════════════════════════════════════════════════
function CategoryBadge({
  icon,
  label,
  count,
  color,
  onClick,
}: {
  icon: string;
  label: string;
  count: number;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="border rounded p-2 text-center hover:brightness-110 transition-all"
      style={{
        borderColor: `${color}40`,
        background: count > 0 ? `${color}10` : "transparent",
      }}
    >
      <div className="text-[16px]">{icon}</div>
      <div className="text-[8px] dim kr">{label}</div>
      <div className="text-[12px] font-bold" style={{ color }}>{count}</div>
    </button>
  );
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] px-2.5 py-1.5 border-b-2 kr ${
        active
          ? "border-[var(--amber)] text-[var(--amber)] font-bold"
          : "border-transparent dim hover:text-[var(--amber)]"
      }`}
    >
      {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// 이벤트 카드
// ═══════════════════════════════════════════════════════════
function EventCard({ event: e }: { event: EconomicEvent }) {
  const cat = CATEGORY_CONFIG[e.category] ?? CATEGORY_CONFIG.other;
  const urgency =
    e.daysUntil === 0 ? "critical" :
    e.daysUntil <= 3 ? "high" :
    e.daysUntil <= 7 ? "medium" :
    "low";
  const urgencyColor =
    urgency === "critical" ? "#ff3860" :
    urgency === "high" ? "#ffaa44" :
    urgency === "medium" ? "#aaccff" :
    "#aaaaaa";

  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="border-l-4 rounded-r p-3 hover:bg-[rgba(255,255,255,0.02)] transition-all cursor-pointer"
      style={{
        borderLeftColor: cat.color,
        background: e.daysUntil <= 3 && e.importance >= 4 ? `${urgencyColor}08` : "transparent",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-start gap-2 flex-wrap flex-1 min-w-0">
          <span className="text-[16px]">{cat.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold kr" style={{ color: cat.color }}>
                {e.title}
              </span>
              {e.importance === 5 && (
                <span className="text-[7px] px-1.5 py-0.5 bg-[#ff3860] text-white rounded kr font-bold">
                  최고
                </span>
              )}
              {e.importance === 4 && (
                <span className="text-[7px] px-1.5 py-0.5 bg-[#ffaa44] text-[#111] rounded kr font-bold">
                  중요
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[9px]">
              <span className="tick">{e.date}</span>
              {e.time && <span className="dim">{e.time} {e.timezone}</span>}
              <span className="dim">·</span>
              <span className="kr">
                관련: {(e.affectedSymbols ?? []).slice(0, 3).join(", ")}
                {(e.affectedSymbols ?? []).length > 3 && ` 외 ${(e.affectedSymbols ?? []).length - 3}개`}
              </span>
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <div
            className="text-[14px] font-bold"
            style={{ color: urgencyColor }}
          >
            D-{e.daysUntil}
          </div>
          {e.daysUntil === 0 && (
            <div className="text-[8px] font-bold" style={{ color: "#ff3860" }}>오늘!</div>
          )}
        </div>
      </div>

      {/* 상세 (클릭 시 펼쳐짐) */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <div className="text-[9px] kr leading-relaxed dim mb-2">
            {e.description}
          </div>
          <div
            className="text-[10px] kr font-bold mb-2 p-2 rounded"
            style={{ color: urgencyColor, background: `${urgencyColor}10` }}
          >
            💥 예상 영향: {e.expectedImpact}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[9px]">
            <div className="p-2 border border-[var(--border)] rounded">
              <div className="text-[8px] dim kr">📍 이벤트 전</div>
              <div className="kr leading-relaxed">{e.tradingGuide.before}</div>
            </div>
            <div className="p-2 border border-[var(--border)] rounded">
              <div className="text-[8px] dim kr">📍 당일</div>
              <div className="kr leading-relaxed">{e.tradingGuide.during}</div>
            </div>
            <div className="p-2 border border-[var(--border)] rounded">
              <div className="text-[8px] dim kr">📍 이벤트 후</div>
              <div className="kr leading-relaxed">{e.tradingGuide.after}</div>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-[8px] dim kr">영향 종목:</span>
            {(e.affectedSymbols ?? []).map((sym) => (
              <a
                key={sym}
                href={`/stock/${encodeURIComponent(sym)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(ev) => ev.stopPropagation()}
                className="text-[8px] px-2 py-0.5 border border-[var(--border)] rounded tick hover:bright"
              >
                {sym}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
