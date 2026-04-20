"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface Guide {
  urgency: "immediate" | "today" | "this_week" | "monitor";
  priority: number;
  icon: string;
  title: string;
  action: string;
  reason: string;
  targetSymbol?: string;
  targetPrice?: number;
  confidence: number;
  category: "portfolio" | "macro" | "earnings" | "news" | "sector";
}

interface PositionGuideData {
  success: boolean;
  overallState: "urgent" | "active" | "monitor" | "calm";
  stateMessage: string;
  totalGuides: number;
  counts: { immediate: number; today: number; thisWeek: number; monitor: number };
  byCategory: Record<string, number>;
  guides: Guide[];
  contextSummary: {
    portfolioValue: number;
    portfolioGainPct: number;
    riskScore: number;
    vix: number | null;
    tnx: number | null;
    krw: number | null;
    newsAvgScore: number;
    sectorDirection: string;
  };
}

const URGENCY_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  immediate:  { label: "즉시",      color: "#ff3860", emoji: "🚨" },
  today:      { label: "오늘",      color: "#ff6644", emoji: "🔴" },
  this_week:  { label: "이번 주",   color: "#ffaa44", emoji: "⏰" },
  monitor:    { label: "관찰",      color: "#aaccff", emoji: "👁️" },
};

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  portfolio: { label: "포트폴리오", color: "#ffb000", icon: "💼" },
  macro:     { label: "매크로",    color: "#aaccff", icon: "🌍" },
  earnings:  { label: "실적",      color: "#00ff88", icon: "📊" },
  news:      { label: "뉴스",      color: "#ee99ff", icon: "📰" },
  sector:    { label: "섹터",      color: "#ff8844", icon: "🔍" },
};

const STATE_CONFIG: Record<string, { bg: string; border: string; text: string }> = {
  urgent:  { bg: "rgba(255,56,96,0.15)",   border: "#ff3860", text: "#ff3860" },
  active:  { bg: "rgba(255,102,68,0.12)",  border: "#ff6644", text: "#ff6644" },
  monitor: { bg: "rgba(255,170,68,0.08)",  border: "#ffaa44", text: "#ffaa44" },
  calm:    { bg: "rgba(0,255,136,0.05)",   border: "#00aa55", text: "#00ff88" },
};

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function PositionGuidePanel() {
  const [filter, setFilter] = useState<"all" | "immediate" | "today" | "this_week">("all");

  const { data, isLoading } = useSWR<PositionGuideData>(
    "/api/position-guide",
    fetcher,
    { refreshInterval: 300000 } // 5분
  );

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-16">
        <div className="text-[12px] dim kr">🧠 AI 종합 분석 중...</div>
        <div className="text-[9px] dim mt-1 kr">포트/매크로/뉴스/실적 통합 판단</div>
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

  const state = STATE_CONFIG[data.overallState] ?? STATE_CONFIG.calm;
  
  // 필터링
  const filtered = filter === "all"
    ? data.guides
    : (data.guides ?? []).filter(g => g.urgency === filter);

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 + 종합 상태 */}
      <div
        className="mb-3 p-3 sm:p-4 rounded border-2"
        style={{
          background: state.bg,
          borderColor: state.border,
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-[9px] dim kr mb-1">🧠 AI 종합 판단</div>
            <div className="text-[20px] sm:text-[24px] font-bold kr" style={{ color: state.text }}>
              {data.stateMessage}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {data.counts.immediate > 0 && (
              <UrgencyBadge count={data.counts.immediate} label="즉시" color="#ff3860" />
            )}
            {data.counts.today > 0 && (
              <UrgencyBadge count={data.counts.today} label="오늘" color="#ff6644" />
            )}
            {data.counts.thisWeek > 0 && (
              <UrgencyBadge count={data.counts.thisWeek} label="이번주" color="#ffaa44" />
            )}
          </div>
        </div>

        {/* 컨텍스트 요약 */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
          <ContextChip label="💼 포트" value={`$${(data.contextSummary?.portfolioValue ?? 0).toFixed(0)}`} subtitle={`${(data.contextSummary?.portfolioGainPct ?? 0) >= 0 ? "+" : ""}${(data.contextSummary?.portfolioGainPct ?? 0).toFixed(2)}%`} color={(data.contextSummary?.portfolioGainPct ?? 0) >= 0 ? "#00ff88" : "#ff3860"} />
          <ContextChip label="🛡️ 리스크" value={`${data.contextSummary?.riskScore ?? 0}/100`} subtitle={(data.contextSummary?.riskScore ?? 0) > 60 ? "높음" : (data.contextSummary?.riskScore ?? 0) > 30 ? "보통" : "낮음"} color={(data.contextSummary?.riskScore ?? 0) > 60 ? "#ff3860" : (data.contextSummary?.riskScore ?? 0) > 30 ? "#ffaa44" : "#00ff88"} />
          <ContextChip label="😰 VIX" value={data.contextSummary?.vix !== null && data.contextSummary?.vix !== undefined ? data.contextSummary.vix.toFixed(1) : "-"} subtitle={data.contextSummary?.vix && data.contextSummary.vix > 25 ? "공포" : data.contextSummary?.vix && data.contextSummary.vix < 13 ? "안심" : "평상"} color={data.contextSummary?.vix && data.contextSummary.vix > 25 ? "#ff3860" : data.contextSummary?.vix && data.contextSummary.vix < 13 ? "#ffaa44" : "#00ff88"} />
          <ContextChip label="📰 뉴스" value={`${(data.contextSummary?.newsAvgScore ?? 0) >= 0 ? "+" : ""}${(data.contextSummary?.newsAvgScore ?? 0).toFixed(1)}`} subtitle={data.contextSummary?.newsAvgScore && data.contextSummary.newsAvgScore >= 5 ? "강세" : data.contextSummary?.newsAvgScore && data.contextSummary.newsAvgScore <= -5 ? "약세" : "중립"} color={data.contextSummary?.newsAvgScore && data.contextSummary.newsAvgScore >= 5 ? "#00ff88" : data.contextSummary?.newsAvgScore && data.contextSummary.newsAvgScore <= -5 ? "#ff3860" : "#aaaaaa"} />
        </div>
      </div>

      {/* 필터 */}
      {(data.guides ?? []).length > 0 && (
        <div className="mb-3 flex items-center gap-1 flex-wrap">
          <FilterBtn label={`전체 (${data.totalGuides})`} active={filter === "all"} onClick={() => setFilter("all")} />
          {data.counts.immediate > 0 && (
            <FilterBtn label={`🚨 즉시 (${data.counts.immediate})`} active={filter === "immediate"} onClick={() => setFilter("immediate")} />
          )}
          {data.counts.today > 0 && (
            <FilterBtn label={`🔴 오늘 (${data.counts.today})`} active={filter === "today"} onClick={() => setFilter("today")} />
          )}
          {data.counts.thisWeek > 0 && (
            <FilterBtn label={`⏰ 이번주 (${data.counts.thisWeek})`} active={filter === "this_week"} onClick={() => setFilter("this_week")} />
          )}
        </div>
      )}

      {/* 가이드 목록 */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-[var(--border)] rounded">
          <div className="text-[28px] mb-2">✅</div>
          <div className="text-[12px] kr font-bold up">평상 유지 가능</div>
          <div className="text-[10px] dim kr mt-1">
            현재 특별한 액션이 필요하지 않아요. 포트폴리오 관찰만 하면 됩니다.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((g, i) => (
            <GuideCard key={i} guide={g} index={i + 1} />
          ))}
        </div>
      )}

      {/* 하단 설명 */}
      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        <span className="bright">🧠 AI 종합 판단</span>: 포트폴리오 + 매크로 + 섹터 + 뉴스 + 실적 5가지 통합 분석<br />
        <span className="bright">⚠️ 참고용</span>: 최종 투자 결정은 본인 책임 · 5분마다 자동 갱신
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 긴급도 배지
// ═══════════════════════════════════════════════════════════
function UrgencyBadge({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 rounded"
      style={{ background: color, color: "white" }}
    >
      <span className="text-[11px] font-bold">{count}</span>
      <span className="text-[9px] kr">{label}</span>
    </div>
  );
}

function ContextChip({ label, value, subtitle, color }: { label: string; value: string; subtitle: string; color: string }) {
  return (
    <div className="border border-[var(--border)] rounded p-2 text-center">
      <div className="text-[8px] dim kr">{label}</div>
      <div className="text-[13px] font-bold" style={{ color }}>{value}</div>
      <div className="text-[8px] dim kr">{subtitle}</div>
    </div>
  );
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] px-2.5 py-1.5 border rounded kr ${
        active
          ? "border-[var(--amber)] bg-[rgba(255,176,0,0.1)] text-[var(--amber)] font-bold"
          : "border-[var(--border)] dim hover:text-[var(--amber)]"
      }`}
    >
      {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// Guide Card
// ═══════════════════════════════════════════════════════════
function GuideCard({ guide: g, index }: { guide: Guide; index: number }) {
  const urgency = URGENCY_CONFIG[g.urgency] ?? URGENCY_CONFIG.monitor;
  const category = CATEGORY_CONFIG[g.category] ?? CATEGORY_CONFIG.portfolio;

  return (
    <div
      className="border-l-4 rounded-r p-3 hover:bg-[rgba(255,255,255,0.02)] transition-all"
      style={{
        borderLeftColor: urgency.color,
        background: g.urgency === "immediate" ? `${urgency.color}10` : "transparent",
      }}
    >
      <div className="flex items-start gap-3 flex-wrap">
        {/* 우선순위 번호 */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[14px] flex-shrink-0"
          style={{ background: urgency.color, color: "white" }}
        >
          {index}
        </div>

        <div className="flex-1 min-w-0">
          {/* 제목 + 배지 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px]">{g.icon}</span>
            <span className="text-[12px] font-bold kr">{g.title}</span>
            <span
              className="text-[8px] px-1.5 py-0.5 rounded font-bold kr"
              style={{ background: urgency.color, color: "white" }}
            >
              {urgency.emoji} {urgency.label}
            </span>
            <span
              className="text-[8px] px-1.5 py-0.5 rounded kr"
              style={{ color: category.color, border: `1px solid ${category.color}60` }}
            >
              {category.icon} {category.label}
            </span>
            <span className="text-[9px] dim kr">
              신뢰도 <span style={{ color: g.confidence >= 75 ? "#00ff88" : g.confidence >= 60 ? "#ffaa44" : "#aaa" }}>{g.confidence}%</span>
            </span>
          </div>

          {/* 액션 */}
          <div
            className="mt-2 p-2 rounded text-[11px] kr font-bold leading-relaxed"
            style={{ background: `${urgency.color}15`, color: urgency.color }}
          >
            👉 {g.action}
          </div>

          {/* 이유 */}
          <div className="text-[10px] kr mt-1.5 leading-relaxed dim">
            💭 {g.reason}
          </div>

          {/* 심볼 링크 */}
          {g.targetSymbol && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <a
                href={`/stock/${encodeURIComponent(g.targetSymbol)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] px-2 py-1 border border-[var(--amber)] text-[var(--amber)] hover:bg-[rgba(255,176,0,0.1)] rounded tick font-bold"
              >
                📈 {g.targetSymbol} 상세보기
              </a>
              {g.targetPrice && (
                <span className="text-[9px] dim kr">
                  현재 ${g.targetPrice.toFixed(2)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
