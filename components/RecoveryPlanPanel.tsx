"use client";

import useSWR, { mutate } from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";
import { fmtUsd } from "@/lib/format";

const fetcher = safeFetcher;

interface Task {
  id: string;
  week_number: number;
  week_title: string;
  week_theme: string;
  task_order: number;
  task_type: "sell" | "buy" | "check" | "record" | "wait" | "decision";
  day_of_week: string;
  icon: string;
  title: string;
  detail: string;
  related_symbol: string | null;
  related_panel: string | null;
  status: "pending" | "in_progress" | "completed" | "skipped" | "cancelled";
  completed_at: string | null;
  completed_note: string | null;
  target_cash_usd: number | null;
  target_health_change: number | null;
}

interface WeekGroup {
  number: number;
  title: string;
  theme: string;
  tasks: Task[];
  completedCount: number;
  totalCount: number;
}

interface Plan {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  totalWeeks: number;
  currentWeek: number;
  initialValue: number;
  initialLossPct: number;
  initialHealth: number;
  targetValue: number;
  targetHealth: number;
  motto: string;
  principles: string[];
}

interface Data {
  success: boolean;
  hasPlan: boolean;
  plan?: Plan;
  progress?: {
    overallPct: number;
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    skippedTasks: number;
    pendingTasks: number;
  };
  weeks?: WeekGroup[];
  nextTask?: Task | null;
  message?: string;
}

const WEEK_THEME_COLORS: Record<string, { border: string; bg: string; label: string }> = {
  stop_bleeding: { border: "#ff3860", bg: "rgba(255,56,96,0.04)", label: "출혈 멈추기" },
  big_decision: { border: "#ffd93d", bg: "rgba(255,217,61,0.04)", label: "큰 결단" },
  rebuild: { border: "#ffb000", bg: "rgba(255,176,0,0.04)", label: "재건축 (기초)" },
  rebuild_growth: { border: "#00ff88", bg: "rgba(0,255,136,0.04)", label: "재건축 (성장)" },
  stabilize: { border: "#7ec8ff", bg: "rgba(126,200,255,0.04)", label: "안정화" },
  reflect: { border: "#c084fc", bg: "rgba(192,132,252,0.04)", label: "리뷰 + 계획" },
};

const TASK_TYPE_COLORS: Record<string, string> = {
  sell: "#ff3860",
  buy: "#00ff88",
  check: "#7ec8ff",
  record: "#ffb000",
  wait: "#888",
  decision: "#c084fc",
};

const STATUS_CONFIG: Record<string, { color: string; icon: string; label: string }> = {
  pending: { color: "#aaa", icon: "○", label: "대기" },
  in_progress: { color: "#ffb000", icon: "⚡", label: "진행 중" },
  completed: { color: "#00ff88", icon: "✓", label: "완료" },
  skipped: { color: "#555", icon: "–", label: "건너뜀" },
  cancelled: { color: "#ff3860", icon: "×", label: "취소" },
};

export function RecoveryPlanPanel() {
  const { data, isLoading } = useSWR<Data>(
    "/api/recovery-plan",
    fetcher,
    { refreshInterval: 60 * 1000 }
  );
  
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<"timeline" | "detail" | "principles">("timeline");
  const [updating, setUpdating] = useState<string | null>(null);
  
  if (isLoading) {
    return (
      <div className="p-4 border border-[var(--border)] rounded bg-black/20">
        <div className="text-[10px] dim kr">복구 플랜 로딩...</div>
      </div>
    );
  }
  
  // 플랜 없음
  if (!data?.hasPlan || !data.plan || !data.weeks) {
    return (
      <div className="p-6 text-center border border-[var(--amber)] rounded bg-[rgba(255,176,0,0.04)]">
        <div className="text-[14px] tick font-bold kr mb-2">🚀 복구 플랜 시작하기</div>
        <div className="text-[10px] dim kr mb-3">
          Supabase에서 <code className="tick">recovery_plan_migration.sql</code> 실행
        </div>
        <div className="text-[9px] dim kr">
          자동으로 카일님 맞춤 6주 플랜이 생성됩니다
        </div>
      </div>
    );
  }
  
  const plan = data.plan;
  const progress = data.progress!;
  const nextTask = data.nextTask;
  
  // 기본값: 현재 주차 펼쳐짐
  const effectiveExpandedWeek = expandedWeek ?? plan.currentWeek;
  
  const updateTaskStatus = async (taskId: string, status: Task["status"], note?: string) => {
    setUpdating(taskId);
    try {
      await fetch("/api/recovery-plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, status, note }),
      });
      mutate("/api/recovery-plan");
    } catch (e) {
      console.error(e);
    }
    setUpdating(null);
  };
  
  const scrollToPanel = (panelId: string | null) => {
    if (!panelId) return;
    const el = document.getElementById(panelId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  
  return (
    <div className="space-y-3">
      {/* 플랜 헤더 */}
      <div className="p-4 border-2 border-[var(--amber)] rounded bg-[rgba(255,176,0,0.06)]">
        <div className="flex justify-between items-start gap-3 flex-wrap mb-3">
          <div>
            <div className="text-[9px] dim kr tracking-widest">ACTIVE RECOVERY PLAN</div>
            <div className="text-[16px] kr font-bold tick mt-0.5 leading-tight">
              {plan.title}
            </div>
            <div className="text-[9px] dim kr mt-1">
              {plan.startDate} ~ {plan.endDate} · {plan.totalWeeks}주
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] dim kr">현재 주차</div>
            <div
              className="text-[32px] font-bold leading-none"
              style={{ fontFamily: "'Bebas Neue', sans-serif", color: "var(--amber)" }}
            >
              WEEK {plan.currentWeek}
            </div>
            <div className="text-[9px] dim kr">of {plan.totalWeeks}</div>
          </div>
        </div>
        
        {/* 전체 진행률 */}
        <div className="mb-2">
          <div className="flex justify-between text-[9px] mb-1">
            <span className="dim kr">전체 진행률</span>
            <span className="tick font-bold">
              {progress.completedTasks}/{progress.totalTasks} ({progress.overallPct}%)
            </span>
          </div>
          <div className="h-2 bg-black/40 rounded overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${progress.overallPct}%`,
                background: progress.overallPct === 100
                  ? "#00ff88"
                  : "linear-gradient(90deg, #ff3860, #ffd93d, #00ff88)",
              }}
            />
          </div>
        </div>
        
        {/* 모드 전환 */}
        <div className="flex gap-1 mt-2 flex-wrap">
          <button
            onClick={() => setViewMode("timeline")}
            className={`text-[9px] px-2 py-1 border rounded kr flex-1 ${
              viewMode === "timeline" ? "border-[var(--amber)] tick font-bold bg-[rgba(255,176,0,0.1)]" : "border-[var(--border)] dim"
            }`}
          >
            📅 타임라인
          </button>
          <button
            onClick={() => setViewMode("detail")}
            className={`text-[9px] px-2 py-1 border rounded kr flex-1 ${
              viewMode === "detail" ? "border-[var(--amber)] tick font-bold bg-[rgba(255,176,0,0.1)]" : "border-[var(--border)] dim"
            }`}
          >
            📊 상세
          </button>
          <button
            onClick={() => setViewMode("principles")}
            className={`text-[9px] px-2 py-1 border rounded kr flex-1 ${
              viewMode === "principles" ? "border-[var(--amber)] tick font-bold bg-[rgba(255,176,0,0.1)]" : "border-[var(--border)] dim"
            }`}
          >
            💎 원칙
          </button>
        </div>
      </div>
      
      {/* 다음 액션 하이라이트 */}
      {nextTask && viewMode !== "principles" && (
        <div className="p-3 border-l-4 border-l-[var(--amber)] bg-[rgba(255,176,0,0.06)] rounded">
          <div className="flex items-start gap-2 flex-wrap">
            <div className="text-[18px]">{nextTask.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="text-[9px] dim kr">NEXT ACTION · Week {nextTask.week_number} · {nextTask.day_of_week}요일</div>
              <div className="text-[12px] kr font-bold tick mt-0.5">{nextTask.title}</div>
              <div className="text-[10px] kr dim mt-1 leading-relaxed">{nextTask.detail}</div>
            </div>
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => updateTaskStatus(nextTask.id, "in_progress")}
              className="text-[9px] px-3 py-1 border border-[var(--amber)] rounded bg-[rgba(255,176,0,0.1)] tick font-bold kr"
            >
              ⚡ 시작
            </button>
            {nextTask.related_panel && (
              <button
                onClick={() => scrollToPanel(nextTask.related_panel)}
                className="text-[9px] px-3 py-1 border border-[var(--border)] rounded dim kr"
              >
                → {nextTask.related_panel}
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* 원칙 뷰 */}
      {viewMode === "principles" && (
        <div className="space-y-2">
          <div className="p-3 border-l-4 border-l-[var(--amber)] rounded bg-[rgba(255,176,0,0.04)]">
            <div className="text-[9px] dim kr tracking-widest mb-1">MOTTO</div>
            <div className="text-[12px] kr leading-relaxed tick">
              "{plan.motto}"
            </div>
          </div>
          
          <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]">
            <div className="text-[10px] tick font-bold kr mb-2">💎 7가지 투자 원칙</div>
            <ol className="space-y-1.5">
              {plan.principles.map((p, i) => (
                <li key={i} className="text-[11px] kr flex gap-2">
                  <span
                    className="font-bold"
                    style={{ fontFamily: "'Bebas Neue', sans-serif", color: "var(--amber)", minWidth: "20px" }}
                  >
                    {i + 1}.
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
      
      {/* 타임라인 뷰 */}
      {viewMode === "timeline" && data.weeks.map(w => {
        const theme = WEEK_THEME_COLORS[w.theme] ?? WEEK_THEME_COLORS.rebuild;
        const weekPct = w.totalCount > 0 ? (w.completedCount / w.totalCount) * 100 : 0;
        const isCurrent = w.number === plan.currentWeek;
        const isPast = w.number < plan.currentWeek;
        const isExpanded = effectiveExpandedWeek === w.number;
        
        return (
          <div
            key={w.number}
            className="border-l-4 rounded overflow-hidden"
            style={{
              borderLeftColor: theme.border,
              background: theme.bg,
              opacity: isPast && weekPct < 100 ? 0.7 : 1,
            }}
          >
            <div
              className="p-3 cursor-pointer"
              onClick={() => setExpandedWeek(isExpanded ? null : w.number)}
            >
              <div className="flex justify-between items-start gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span
                    className="text-[28px] font-bold leading-none"
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      color: theme.border,
                    }}
                  >
                    {w.number}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] tick font-bold kr">{w.title}</span>
                      {isCurrent && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded font-bold bg-[var(--amber)] text-black">
                          현재
                        </span>
                      )}
                    </div>
                    <div className="text-[9px] dim kr mt-0.5">{theme.label}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="text-[14px] font-bold"
                    style={{
                      fontFamily: "'Bebas Neue', sans-serif",
                      color: weekPct === 100 ? "#00ff88" : theme.border,
                    }}
                  >
                    {w.completedCount}/{w.totalCount}
                  </div>
                  <div className="text-[8px] dim">{Math.round(weekPct)}%</div>
                </div>
              </div>
              
              {/* 주차 진행률 바 */}
              <div className="h-1 bg-black/40 rounded overflow-hidden mt-2">
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${weekPct}%`,
                    background: weekPct === 100 ? "#00ff88" : theme.border,
                  }}
                />
              </div>
            </div>
            
            {/* 태스크 리스트 */}
            {isExpanded && (
              <div className="border-t border-[var(--border)] bg-black/20 p-3 space-y-2">
                {w.tasks.map(t => {
                  const status = STATUS_CONFIG[t.status];
                  const typeColor = TASK_TYPE_COLORS[t.task_type] ?? "#888";
                  const isUpdating = updating === t.id;
                  
                  return (
                    <div
                      key={t.id}
                      className="flex items-start gap-3 p-2 rounded border transition-all"
                      style={{
                        borderColor: t.status === "completed" ? "rgba(0,255,136,0.3)" : "var(--border)",
                        background: t.status === "completed" ? "rgba(0,255,136,0.04)" : "rgba(0,0,0,0.3)",
                        opacity: t.status === "completed" || t.status === "skipped" ? 0.7 : 1,
                      }}
                    >
                      {/* 상태 버튼 */}
                      <div className="flex-shrink-0 flex flex-col gap-1">
                        <button
                          onClick={() => {
                            const next = t.status === "completed" ? "pending" : "completed";
                            updateTaskStatus(t.id, next);
                          }}
                          disabled={isUpdating}
                          className="w-6 h-6 border-2 rounded flex items-center justify-center transition-all"
                          style={{
                            borderColor: status.color,
                            background: t.status === "completed" ? "rgba(0,255,136,0.15)" : "transparent",
                          }}
                        >
                          <span className="text-[12px] font-bold" style={{ color: status.color }}>
                            {status.icon}
                          </span>
                        </button>
                        {t.day_of_week && (
                          <div className="text-[8px] dim kr text-center">{t.day_of_week}</div>
                        )}
                      </div>
                      
                      {/* 내용 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-[14px]">{t.icon}</span>
                          <span
                            className="text-[8px] px-1.5 py-0.5 rounded font-bold kr"
                            style={{
                              background: `${typeColor}20`,
                              color: typeColor,
                            }}
                          >
                            {t.task_type}
                          </span>
                          {t.related_symbol && (
                            <SymbolDisplay
                              meta={{ symbol: t.related_symbol }}
                              size="xs"
                              variant="inline"
                              showBadges={false}
                              showName={false}
                            />
                          )}
                          {t.target_cash_usd && (
                            <span className="text-[8px] up font-bold">
                              {fmtUsd(t.target_cash_usd)}
                            </span>
                          )}
                        </div>
                        <div
                          className={`text-[11px] kr font-bold ${
                            t.status === "completed" ? "line-through dim" : "bright"
                          }`}
                        >
                          {t.title}
                        </div>
                        <div className="text-[9px] dim kr mt-0.5 leading-relaxed">
                          {t.detail}
                        </div>
                        
                        {/* 완료 정보 */}
                        {t.completed_at && (
                          <div className="text-[8px] up kr mt-1">
                            ✓ {new Date(t.completed_at).toLocaleDateString("ko-KR")}
                            {t.completed_note && ` · ${t.completed_note}`}
                          </div>
                        )}
                        
                        {/* 빠른 액션 */}
                        {t.status === "pending" && t.related_panel && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              scrollToPanel(t.related_panel);
                            }}
                            className="text-[9px] mt-1 tick dim hover:text-[var(--amber-bright)]"
                          >
                            → {t.related_panel} 이동
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      
      {/* 상세 뷰 */}
      {viewMode === "detail" && (
        <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]">
          <div className="text-[10px] tick font-bold kr mb-2">📊 플랜 상세</div>
          <div className="grid grid-cols-2 gap-2 text-[9px]">
            <div className="p-2 bg-black/30 rounded">
              <div className="dim kr">시작일</div>
              <div className="text-[11px] tick font-bold">{plan.startDate}</div>
            </div>
            <div className="p-2 bg-black/30 rounded">
              <div className="dim kr">종료일</div>
              <div className="text-[11px] tick font-bold">{plan.endDate}</div>
            </div>
            <div className="p-2 bg-black/30 rounded">
              <div className="dim kr">시작 평가</div>
              <div className="text-[11px] down font-bold">{fmtUsd(plan.initialValue)}</div>
            </div>
            <div className="p-2 bg-black/30 rounded">
              <div className="dim kr">목표 평가</div>
              <div className="text-[11px] up font-bold">{fmtUsd(plan.targetValue)}</div>
            </div>
            <div className="p-2 bg-black/30 rounded">
              <div className="dim kr">시작 건강도</div>
              <div className="text-[11px] down font-bold">{plan.initialHealth}</div>
            </div>
            <div className="p-2 bg-black/30 rounded">
              <div className="dim kr">목표 건강도</div>
              <div className="text-[11px] up font-bold">{plan.targetHealth}</div>
            </div>
          </div>
          
          <div className="mt-3 p-2 bg-black/30 rounded">
            <div className="text-[9px] dim kr mb-1">태스크 현황</div>
            <div className="grid grid-cols-4 gap-1">
              <div className="text-center">
                <div className="text-[14px] font-bold up" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {progress.completedTasks}
                </div>
                <div className="text-[8px] dim kr">완료</div>
              </div>
              <div className="text-center">
                <div className="text-[14px] font-bold warn" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {progress.inProgressTasks}
                </div>
                <div className="text-[8px] dim kr">진행</div>
              </div>
              <div className="text-center">
                <div className="text-[14px] font-bold tick" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {progress.pendingTasks}
                </div>
                <div className="text-[8px] dim kr">대기</div>
              </div>
              <div className="text-center">
                <div className="text-[14px] font-bold dim" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {progress.skippedTasks}
                </div>
                <div className="text-[8px] dim kr">건너뜀</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
