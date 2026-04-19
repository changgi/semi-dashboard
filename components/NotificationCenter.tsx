"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface Notification {
  id: string;
  type: "macro" | "portfolio" | "price" | "news" | "signal" | "option" | "system";
  priority: number;
  severity: "critical" | "warning" | "info" | "opportunity" | "success";
  icon: string;
  title: string;
  message: string;
  symbol?: string;
  value?: number;
  change?: number;
  timestamp: string;
  actionUrl?: string;
  dismissable: boolean;
}

interface NotificationsData {
  success: boolean;
  notifications: Notification[];
  stats: {
    total: number;
    critical: number;
    warnings: number;
    opportunities: number;
    successes: number;
    byType: Record<string, number>;
  };
}

// 심각도별 색상
const severityStyles: Record<
  Notification["severity"],
  { bg: string; border: string; text: string; label: string }
> = {
  critical:    { bg: "bg-[rgba(255,56,96,0.08)]",  border: "border-[#ff3860]",         text: "text-[#ff3860]",         label: "긴급" },
  warning:     { bg: "bg-[rgba(255,176,0,0.08)]",  border: "border-[var(--amber)]",    text: "text-[var(--amber)]",    label: "경고" },
  opportunity: { bg: "bg-[rgba(0,255,136,0.08)]",  border: "border-[#00ff88]",         text: "text-[#00ff88]",         label: "기회" },
  success:     { bg: "bg-[rgba(0,255,136,0.05)]",  border: "border-[#00ff88]/50",      text: "text-[#00ff88]",         label: "호재" },
  info:        { bg: "bg-[rgba(170,204,255,0.05)]",border: "border-[#aaccff]/50",      text: "text-[#aaccff]",         label: "정보" },
};

const typeLabels: Record<Notification["type"], string> = {
  macro:     "매크로",
  portfolio: "포트폴리오",
  price:     "가격",
  news:      "뉴스",
  signal:    "AI 시그널",
  option:    "옵션",
  system:    "시스템",
};

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트 - 우측 고정 플로팅 버튼 + 드로어
// ═══════════════════════════════════════════════════════════
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "urgent" | "opportunity" | "portfolio">("all");
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const { data, isLoading } = useSWR<NotificationsData>("/api/notifications", fetcher, {
    refreshInterval: 60000, // 1분
  });

  // localStorage에서 dismissed 복원
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("dismissed-notifications");
      if (stored) {
        try {
          setDismissedIds(new Set(JSON.parse(stored)));
        } catch {}
      }
    }
  }, []);

  const dismiss = (id: string) => {
    const newSet = new Set(dismissedIds);
    newSet.add(id);
    setDismissedIds(newSet);
    if (typeof window !== "undefined") {
      localStorage.setItem("dismissed-notifications", JSON.stringify([...newSet]));
    }
  };

  const clearAllDismissed = () => {
    setDismissedIds(new Set());
    if (typeof window !== "undefined") {
      localStorage.removeItem("dismissed-notifications");
    }
  };

  // 필터링
  const allNotifications = data?.notifications ?? [];
  const visibleNotifications = allNotifications.filter((n) => {
    // dismiss된 항목 숨김 (dismissable만)
    if (n.dismissable && dismissedIds.has(n.id)) return false;
    // 필터 적용
    if (filter === "urgent") return n.severity === "critical" || n.priority <= 2;
    if (filter === "opportunity") return n.severity === "opportunity";
    if (filter === "portfolio") return n.type === "portfolio";
    return true;
  });

  // 긴급 알림 개수 (버튼 배지)
  const urgentCount = allNotifications.filter(
    (n) => (n.severity === "critical" || n.priority <= 2) && !dismissedIds.has(n.id)
  ).length;

  return (
    <>
      {/* 플로팅 버튼 (우측 하단 고정) */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed right-4 bottom-4 sm:right-6 sm:bottom-6 z-40 w-12 h-12 sm:w-14 sm:h-14 rounded-full shadow-xl border flex items-center justify-center transition-all hover:scale-105 ${
          open
            ? "bg-[var(--bg)] border-[var(--amber)] text-[var(--amber)]"
            : urgentCount > 0
            ? "bg-[#ff3860] border-[#ff3860] text-white animate-pulse"
            : "bg-[var(--amber)] border-[var(--amber)] text-[#111]"
        }`}
        title={open ? "알림 닫기" : `알림 ${urgentCount}개`}
      >
        <span className="text-[18px] sm:text-[20px]">
          {open ? "✕" : "🔔"}
        </span>
        {!open && urgentCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-[#111] text-white text-[9px] font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-white">
            {urgentCount}
          </span>
        )}
      </button>

      {/* 사이드 드로어 */}
      <div
        className={`fixed right-0 top-0 h-full w-full sm:w-[420px] bg-[var(--bg)] border-l-2 border-[var(--amber-dim)] z-50 transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        } overflow-y-auto shadow-2xl`}
      >
        {/* 헤더 */}
        <div className="sticky top-0 bg-[var(--bg)] border-b border-[var(--border)] p-3 z-10">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[11px] sm:text-[12px] tick font-bold">
                🔔 NOTIFICATION CENTER
              </div>
              <div className="text-[8px] dim kr">
                실시간 통합 알림 · 1분마다 갱신
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-[var(--amber)] hover:bright text-[18px]"
            >
              ✕
            </button>
          </div>

          {/* 요약 통계 */}
          {data?.success && (
            <div className="grid grid-cols-4 gap-1 mb-2">
              <div className="text-center bg-[rgba(255,56,96,0.08)] border border-[#ff3860]/40 rounded p-1">
                <div className="text-[14px] font-bold text-[#ff3860]">{data.stats.critical}</div>
                <div className="text-[7px] dim kr">긴급</div>
              </div>
              <div className="text-center bg-[rgba(255,176,0,0.08)] border border-[var(--amber)]/40 rounded p-1">
                <div className="text-[14px] font-bold text-[var(--amber)]">{data.stats.warnings}</div>
                <div className="text-[7px] dim kr">경고</div>
              </div>
              <div className="text-center bg-[rgba(0,255,136,0.08)] border border-[#00ff88]/40 rounded p-1">
                <div className="text-[14px] font-bold text-[#00ff88]">{data.stats.opportunities}</div>
                <div className="text-[7px] dim kr">기회</div>
              </div>
              <div className="text-center bg-[rgba(0,255,136,0.05)] border border-[#00ff88]/30 rounded p-1">
                <div className="text-[14px] font-bold text-[#00ff88]">{data.stats.successes}</div>
                <div className="text-[7px] dim kr">호재</div>
              </div>
            </div>
          )}

          {/* 필터 탭 */}
          <div className="flex gap-1 overflow-x-auto">
            {(["all", "urgent", "opportunity", "portfolio"] as const).map((f) => {
              const labels = {
                all: "전체",
                urgent: "🚨 긴급",
                opportunity: "🎯 기회",
                portfolio: "💼 내 포트폴리오",
              };
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2 py-1 text-[9px] whitespace-nowrap border ${
                    filter === f
                      ? "border-[var(--amber)] text-[var(--amber)] bg-[rgba(255,176,0,0.1)]"
                      : "border-[var(--border)] dim hover:border-[var(--amber-dim)]"
                  }`}
                >
                  {labels[f]}
                </button>
              );
            })}
            <button
              onClick={clearAllDismissed}
              className="px-2 py-1 text-[9px] dim hover:text-[var(--amber)] whitespace-nowrap ml-auto"
              title="숨긴 알림 복원"
            >
              🔄
            </button>
          </div>
        </div>

        {/* 알림 목록 */}
        <div className="p-3">
          {isLoading ? (
            <div className="text-[10px] dim text-center py-8 kr">
              알림 로딩 중...
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-[32px] mb-2">📭</div>
              <div className="text-[11px] dim kr mb-1">표시할 알림이 없습니다</div>
              <div className="text-[9px] dim kr">
                모든 지표가 정상이거나 모든 알림을 확인했습니다
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleNotifications.map((n) => {
                const style = severityStyles[n.severity];
                return (
                  <div
                    key={n.id}
                    className={`border-l-2 ${style.border} ${style.bg} rounded-r p-2 relative`}
                  >
                    {/* Dismiss 버튼 */}
                    {n.dismissable && (
                      <button
                        onClick={() => dismiss(n.id)}
                        className="absolute top-1 right-1 text-[10px] dim hover:text-[var(--amber)]"
                        title="숨기기"
                      >
                        ✕
                      </button>
                    )}

                    <div className="flex items-start gap-2">
                      <span className="text-[14px] mt-0.5">{n.icon}</span>
                      <div className="flex-1 min-w-0 pr-4">
                        {/* 타입 + 심각도 뱃지 */}
                        <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                          <span
                            className={`text-[7px] px-1.5 py-0.5 rounded font-bold ${style.text} bg-[rgba(255,255,255,0.05)]`}
                          >
                            {style.label}
                          </span>
                          <span className="text-[7px] dim kr">{typeLabels[n.type]}</span>
                          {n.symbol && (
                            <span className="text-[7px] tick font-bold">· {n.symbol}</span>
                          )}
                          <span className="text-[7px] dim ml-auto">
                            P{n.priority}
                          </span>
                        </div>

                        {/* 제목 */}
                        <div className={`text-[10px] font-bold ${style.text} kr leading-tight`}>
                          {n.title}
                        </div>

                        {/* 메시지 */}
                        <div className="text-[9px] dim kr leading-relaxed mt-0.5">
                          {n.message}
                        </div>

                        {/* 시간 */}
                        <div className="text-[7px] dim mt-1">
                          {new Date(n.timestamp).toLocaleString("ko-KR", {
                            month: "numeric",
                            day: "numeric",
                            hour: "numeric",
                            minute: "numeric",
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="sticky bottom-0 bg-[var(--bg)] border-t border-[var(--border)] p-2">
          <div className="text-[7px] dim kr text-center">
            💡 우선순위 1(최상) ~ 10(최하) · 심각도별 색상 구분 · 1분 자동 갱신
          </div>
          {dismissedIds.size > 0 && (
            <div className="text-[7px] dim text-center mt-1">
              {dismissedIds.size}개 알림 숨김 · 🔄 버튼으로 복원
            </div>
          )}
        </div>
      </div>

      {/* 오버레이 (모바일) */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-30 sm:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
