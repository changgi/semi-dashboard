"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

interface WeekEvent {
  time: string;
  title: string;
  importance: number;
  category: "earnings" | "macro" | "data" | "options";
  impact: string;
  affectedSymbols: string[];
}

interface WeekDay {
  date: string;
  dayName: string;
  daysUntil: number;
  events: WeekEvent[];
  expectedVolatility: "low" | "medium" | "high" | "extreme";
  recommendedStance: string;
  checklist: string[];
}

interface Scenario {
  name: string;
  probability: string;
  trigger: string;
  action: string[];
  targetReturn: string;
}

interface TopAction {
  priority: number;
  urgency: string;
  action: string;
  reason: string;
}

interface WeeklyData {
  success: boolean;
  weekSummary: {
    totalEvents: number;
    highImportance: number;
    criticalDates: Array<{ date: string; dayName: string; reason: string }>;
    overallTheme: string;
    tldr: string;
  };
  weekDays: WeekDay[];
  scenarios: Scenario[];
  topActions: TopAction[];
  contextData: any;
}

const VOLATILITY_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  extreme: { label: "극심",   color: "#ff3860", emoji: "🔥" },
  high:    { label: "높음",   color: "#ff6644", emoji: "⚡" },
  medium:  { label: "보통",   color: "#ffaa44", emoji: "📊" },
  low:     { label: "낮음",   color: "#00ff88", emoji: "😌" },
};

const CATEGORY_CONFIG: Record<string, { color: string; icon: string }> = {
  earnings: { color: "#00ff88", icon: "📊" },
  macro:    { color: "#aaccff", icon: "🏛️" },
  data:     { color: "#ffaa44", icon: "📈" },
  options:  { color: "#ee99ff", icon: "📉" },
};

// ═══════════════════════════════════════════════════════════
// 메인
// ═══════════════════════════════════════════════════════════
export function WeeklyStrategyPanel() {
  const [tab, setTab] = useState<"overview" | "daily" | "scenarios" | "actions">("overview");

  const { data, isLoading } = useSWR<WeeklyData>(
    "/api/weekly-strategy",
    fetcher,
    { refreshInterval: 600000 } // 10분
  );

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-16">
        <div className="text-[11px] dim kr">📅 주간 전략 분석 중...</div>
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

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            📅 WEEKLY STRATEGY · 주간 종합 전략
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            이번 주 이벤트별 대응 + 시나리오 + 체크리스트
          </div>
        </div>
      </div>

      {/* 주간 테마 */}
      <div className="mb-3 p-3 border-2 border-[#ff6644]/40 bg-[rgba(255,102,68,0.05)] rounded">
        <div className="flex items-start gap-2">
          <span className="text-[24px]">🔥</span>
          <div className="flex-1">
            <div className="text-[13px] font-bold kr" style={{ color: "#ff6644" }}>
              {data.weekSummary?.overallTheme}
            </div>
            <div className="text-[10px] dim kr mt-1 leading-relaxed">
              {data.weekSummary?.tldr}
            </div>
          </div>
        </div>
      </div>

      {/* 핵심 지표 */}
      <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatChip label="총 이벤트" value={data.weekSummary?.totalEvents} color="#ffaa44" />
        <StatChip label="고중요도" value={data.weekSummary?.highImportance} color="#ff3860" suffix="건" />
        <StatChip label="위험 일자" value={data.weekSummary?.criticalDates?.length} color="#ff6644" suffix="일" />
        <StatChip label="VIX" value={data.contextData?.vix?.toFixed(1) ?? "-"} color="#aaccff" />
      </div>

      {/* 탭 */}
      <div className="mb-3 flex items-center gap-1 flex-wrap border-b border-[var(--border)] pb-1">
        <TabBtn label="🎯 총평" active={tab === "overview"} onClick={() => setTab("overview")} />
        <TabBtn label={`📅 날짜별 (${(data.weekDays ?? []).length})`} active={tab === "daily"} onClick={() => setTab("daily")} />
        <TabBtn label="📊 시나리오" active={tab === "scenarios"} onClick={() => setTab("scenarios")} />
        <TabBtn label={`✅ 핵심 액션 (${(data.topActions ?? []).length})`} active={tab === "actions"} onClick={() => setTab("actions")} />
      </div>

      {tab === "overview" && <OverviewTab data={data} />}
      {tab === "daily" && <DailyTab days={data.weekDays ?? []} />}
      {tab === "scenarios" && <ScenariosTab scenarios={data.scenarios ?? []} />}
      {tab === "actions" && <ActionsTab actions={data.topActions ?? []} />}

      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        💡 10분마다 자동 갱신 · 실제 이벤트 스케줄 + 카일님 포트 기반 맞춤 전략
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
function StatChip({ label, value, color, suffix }: { label: string; value: any; color: string; suffix?: string }) {
  return (
    <div className="border rounded p-2 text-center" style={{ borderColor: `${color}40`, background: `${color}08` }}>
      <div className="text-[8px] dim kr">{label}</div>
      <div className="text-[16px] font-bold" style={{ color }}>
        {value}{suffix || ""}
      </div>
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

// ─────────────────────────────────────────────────────────
// 총평 탭
// ─────────────────────────────────────────────────────────
function OverviewTab({ data }: { data: WeeklyData }) {
  return (
    <div className="space-y-3">
      {/* 위험 날짜 */}
      {(data.weekSummary?.criticalDates ?? []).length > 0 && (
        <div className="border border-[#ff3860]/30 bg-[rgba(255,56,96,0.03)] rounded p-3">
          <div className="text-[10px] down font-bold kr mb-2">🚨 위험 일자</div>
          {(data.weekSummary?.criticalDates ?? []).map((d, i) => (
            <div key={i} className="text-[11px] kr mb-1 leading-relaxed">
              • <span className="tick font-bold">{d.date} ({d.dayName})</span>: {d.reason}
            </div>
          ))}
        </div>
      )}

      {/* 주요 이벤트 요약 */}
      <div className="border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded p-3">
        <div className="text-[10px] tick font-bold kr mb-2">⭐ 이번 주 TOP 이벤트</div>
        {(data.weekDays ?? []).flatMap(d =>
          (d.events ?? []).filter(e => e.importance >= 4).map(e => ({ ...e, date: d.date, dayName: d.dayName, daysUntil: d.daysUntil }))
        ).slice(0, 5).map((e: any, i) => {
          const cat = CATEGORY_CONFIG[e.category];
          return (
            <div key={i} className="text-[10px] kr mb-2 p-2 border-l-2 border-[var(--amber-dim)] bg-black/20 rounded-r">
              <div className="flex items-center gap-2 flex-wrap">
                <span style={{ color: cat.color }}>{cat.icon}</span>
                <span className="font-bold tick">D-{e.daysUntil}</span>
                <span className="dim">{e.date} ({e.dayName})</span>
                {e.importance >= 5 && <span className="bg-[#ff3860] text-white text-[8px] px-1 rounded">★5</span>}
              </div>
              <div className="mt-1">
                <strong>{e.title}</strong> ({e.time})
              </div>
              <div className="mt-0.5 dim">💥 {e.impact}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 날짜별 탭
// ─────────────────────────────────────────────────────────
function DailyTab({ days }: { days: WeekDay[] }) {
  if (days.length === 0) {
    return <div className="text-[10px] dim text-center py-10 kr">표시할 날짜 없음</div>;
  }

  return (
    <div className="space-y-3">
      {days.map((d, i) => {
        const vol = VOLATILITY_CONFIG[d.expectedVolatility];
        const isPast = d.daysUntil < 0;
        
        return (
          <div
            key={i}
            className="border-l-4 rounded-r p-3"
            style={{
              borderLeftColor: vol.color,
              background: isPast ? "rgba(255,255,255,0.01)" : `${vol.color}08`,
              opacity: isPast ? 0.6 : 1,
            }}
          >
            {/* 날짜 헤더 */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[14px] font-bold tick">
                {isPast ? `${Math.abs(d.daysUntil)}일 전` : d.daysUntil === 0 ? "오늘!" : `D-${d.daysUntil}`}
              </span>
              <span className="text-[12px] kr font-bold">{d.date} ({d.dayName})</span>
              <span
                className="text-[9px] px-2 py-0.5 rounded font-bold kr"
                style={{ background: vol.color, color: "white" }}
              >
                {vol.emoji} 변동성 {vol.label}
              </span>
            </div>

            {/* 권장 자세 */}
            <div
              className="text-[11px] kr font-bold mb-2 p-2 rounded"
              style={{ background: `${vol.color}15`, color: vol.color }}
            >
              👉 {d.recommendedStance}
            </div>

            {/* 이벤트 */}
            <div className="space-y-1 mb-2">
              {(d.events ?? []).map((e, j) => {
                const cat = CATEGORY_CONFIG[e.category];
                return (
                  <div key={j} className="text-[10px] kr leading-relaxed pl-3 border-l border-[var(--border)]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ color: cat.color }}>{cat.icon}</span>
                      <span className="font-bold">{e.time}</span>
                      <span>{e.title}</span>
                      {[...Array(e.importance)].map((_, k) => (
                        <span key={k} className="text-[9px]" style={{ color: "#ffb000" }}>★</span>
                      ))}
                    </div>
                    <div className="dim text-[9px] mt-0.5 ml-4">💥 {e.impact}</div>
                  </div>
                );
              })}
            </div>

            {/* 체크리스트 */}
            {(d.checklist ?? []).length > 0 && (
              <details>
                <summary className="text-[9px] dim kr cursor-pointer hover:bright">
                  📋 오늘의 체크리스트 ({d.checklist.length})
                </summary>
                <div className="mt-1 pl-3 space-y-0.5">
                  {d.checklist.map((item, k) => (
                    <div key={k} className="text-[9px] kr">
                      ☐ {item}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 시나리오 탭
// ─────────────────────────────────────────────────────────
function ScenariosTab({ scenarios }: { scenarios: Scenario[] }) {
  if (scenarios.length === 0) {
    return <div className="text-[10px] dim text-center py-10 kr">시나리오 없음</div>;
  }

  return (
    <div className="space-y-2">
      {scenarios.map((s, i) => {
        const color = s.name.includes("상승") ? "#00ff88" : s.name.includes("하락") ? "#ff3860" : "#ffaa44";
        return (
          <div
            key={i}
            className="border rounded p-3"
            style={{ borderColor: `${color}40`, background: `${color}05` }}
          >
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold kr" style={{ color }}>{s.name}</span>
                <span className="text-[9px] px-2 py-0.5 rounded kr" style={{ background: color, color: "white" }}>
                  확률 {s.probability}
                </span>
              </div>
              <div className="text-[10px] tick font-bold">
                예상: {s.targetReturn}
              </div>
            </div>
            
            <div className="text-[10px] dim kr mb-2">
              🎯 트리거: {s.trigger}
            </div>
            
            <div className="mt-2 pt-2 border-t border-[var(--border)]">
              <div className="text-[9px] dim kr mb-1">대응 액션:</div>
              {(s.action ?? []).map((a, k) => (
                <div key={k} className="text-[10px] kr mb-1 leading-relaxed">
                  {k + 1}. {a}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 핵심 액션 탭
// ─────────────────────────────────────────────────────────
function ActionsTab({ actions }: { actions: TopAction[] }) {
  if (actions.length === 0) {
    return <div className="text-[10px] dim text-center py-10 kr">현재 특별한 액션 없음</div>;
  }

  return (
    <div className="space-y-2">
      {actions.map((a) => {
        const urgencyColor =
          a.urgency === "immediate" ? "#ff3860" :
          a.urgency === "this_week" ? "#ffaa44" :
          "#aaccff";
        const urgencyLabel =
          a.urgency === "immediate" ? "즉시" :
          a.urgency === "this_week" ? "이번 주" :
          "관찰";
        
        return (
          <div
            key={a.priority}
            className="border-l-4 rounded-r p-3"
            style={{
              borderLeftColor: urgencyColor,
              background: a.urgency === "immediate" ? `${urgencyColor}10` : "transparent",
            }}
          >
            <div className="flex items-center gap-3 flex-wrap">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[14px] flex-shrink-0"
                style={{ background: urgencyColor, color: "white" }}
              >
                #{a.priority}
              </div>
              <span
                className="text-[9px] px-2 py-0.5 rounded kr font-bold"
                style={{ background: urgencyColor, color: "white" }}
              >
                {urgencyLabel}
              </span>
            </div>
            <div className="mt-2">
              <div className="text-[12px] kr font-bold">{a.action}</div>
              <div className="text-[10px] dim kr mt-1 leading-relaxed">💭 {a.reason}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
