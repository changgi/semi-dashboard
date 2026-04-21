"use client";

import useSWR from "swr";
import { useState } from "react";

import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";
const fetcher = safeFetcher;

// ───────────────────────────────────────────────────────────
// 타입 (기존 /api/notifications 구조)
// ───────────────────────────────────────────────────────────
interface AlertNotification {
  id: string;
  type: "macro" | "portfolio" | "price" | "news" | "signal" | "option" | "system";
  priority: number;
  severity: "critical" | "warning" | "info" | "opportunity" | "success";
  icon: string;
  title: string;
  message: string;
  symbol?: string;
  timestamp: string;
  actionUrl?: string;
}

interface AlertsData {
  success: boolean;
  notifications: AlertNotification[];
  total: number;
}

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  macro:      { icon: "🌍", label: "매크로",    color: "#aaccff" },
  portfolio:  { icon: "💼", label: "포트폴리오", color: "#ffb000" },
  price:      { icon: "💰", label: "가격",     color: "#00ff88" },
  news:       { icon: "📰", label: "뉴스",     color: "#ee99ff" },
  signal:     { icon: "🎯", label: "시그널",   color: "#ff8844" },
  option:     { icon: "📊", label: "옵션",     color: "#ffaa44" },
  system:     { icon: "⚙️", label: "시스템",   color: "#aaa" },
};

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  critical:    { label: "긴급",  color: "#ff3860", bg: "#ff386015", icon: "🔴" },
  warning:     { label: "경고",  color: "#ffaa44", bg: "#ffaa4415", icon: "🟡" },
  opportunity: { label: "기회",  color: "#00ff88", bg: "#00ff8815", icon: "💎" },
  info:        { label: "정보",  color: "#aaccff", bg: "#aaccff10", icon: "🔵" },
  success:     { label: "성공",  color: "#00cc88", bg: "#00cc8810", icon: "✅" },
};

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function AlertFeedPanel() {
  const [severityFilter, setSeverityFilter] = useState<"all" | AlertNotification["severity"]>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | AlertNotification["type"]>("all");
  
  const { data, isLoading, mutate } = useSWR<AlertsData>(
    "/api/notifications",
    fetcher,
    { refreshInterval: 120000 } // 2분
  );

  const handleRunCron = async () => {
    try {
      const res = await fetch("/api/cron/daily-alerts?manual=1");
      const result = await res.json();
      if (result.success) {
        alert(`✅ 자동 알림 체크 완료: ${result.generated}건 생성`);
      }
      await mutate();
    } catch (e) {
      alert(`❌ 에러: ${(e as Error).message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[10px] dim kr">🔔 알림 로딩 중...</div>
      </div>
    );
  }

  const notifications = data?.notifications ?? [];

  // 필터링
  let filtered = notifications;
  if (severityFilter !== "all") {
    filtered = filtered.filter(n => n.severity === severityFilter);
  }
  if (typeFilter !== "all") {
    filtered = filtered.filter(n => n.type === typeFilter);
  }

  // 우선순위별 집계
  const criticalCount = notifications.filter(n => n.severity === "critical").length;
  const warningCount = notifications.filter(n => n.severity === "warning").length;
  const opportunityCount = notifications.filter(n => n.severity === "opportunity").length;

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            🔔 ALERT FEED · 실시간 통합 알림
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            매크로 · 포트폴리오 · 옵션 · 뉴스 · 시그널 통합 피드 · 2분마다 자동 갱신
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleRunCron}
            className="text-[9px] px-2.5 py-1 border border-[var(--amber)] text-[var(--amber)] hover:bg-[rgba(255,176,0,0.1)] rounded kr"
            title="지금 일일 알림 체크 실행"
          >
            🔄 자동 체크 실행
          </button>
          <button
            onClick={() => mutate()}
            className="text-[9px] px-2.5 py-1 border border-[var(--border)] dim hover:text-[var(--amber)] rounded kr"
          >
            ↻ 새로고침
          </button>
        </div>
      </div>

      {/* 우선순위 요약 */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div
          className="border border-[#ff3860]/30 bg-[rgba(255,56,96,0.05)] rounded p-2 text-center cursor-pointer hover:bg-[rgba(255,56,96,0.1)]"
          onClick={() => setSeverityFilter("critical")}
        >
          <div className="text-[9px] dim kr">🔴 긴급</div>
          <div className="text-[18px] font-bold text-[#ff3860]">{criticalCount}</div>
          <div className="text-[8px] dim kr">Critical</div>
        </div>
        <div
          className="border border-[#ffaa44]/30 bg-[rgba(255,170,68,0.05)] rounded p-2 text-center cursor-pointer hover:bg-[rgba(255,170,68,0.1)]"
          onClick={() => setSeverityFilter("warning")}
        >
          <div className="text-[9px] dim kr">🟡 경고</div>
          <div className="text-[18px] font-bold text-[#ffaa44]">{warningCount}</div>
          <div className="text-[8px] dim kr">Warning</div>
        </div>
        <div
          className="border border-[#00ff88]/30 bg-[rgba(0,255,136,0.05)] rounded p-2 text-center cursor-pointer hover:bg-[rgba(0,255,136,0.1)]"
          onClick={() => setSeverityFilter("opportunity")}
        >
          <div className="text-[9px] dim kr">💎 기회</div>
          <div className="text-[18px] font-bold text-[#00ff88]">{opportunityCount}</div>
          <div className="text-[8px] dim kr">Opportunity</div>
        </div>
      </div>

      {/* 필터 탭 - 타입별 */}
      <div className="mb-3 flex items-center gap-1 flex-wrap border-b border-[var(--border)] pb-1">
        <FilterTab label="전체" active={typeFilter === "all"} onClick={() => setTypeFilter("all")} />
        <FilterTab label="🌍 매크로" active={typeFilter === "macro"} onClick={() => setTypeFilter("macro")} />
        <FilterTab label="💼 포트" active={typeFilter === "portfolio"} onClick={() => setTypeFilter("portfolio")} />
        <FilterTab label="💰 가격" active={typeFilter === "price"} onClick={() => setTypeFilter("price")} />
        <FilterTab label="🎯 시그널" active={typeFilter === "signal"} onClick={() => setTypeFilter("signal")} />
        <FilterTab label="📊 옵션" active={typeFilter === "option"} onClick={() => setTypeFilter("option")} />
      </div>

      {/* 알림 리스트 */}
      {filtered.length === 0 ? (
        <div className="text-[10px] dim text-center py-10 kr border border-[var(--border)] rounded">
          📭 해당 알림 없음
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 15).map((n) => (
            <NotificationCard key={n.id} notification={n} />
          ))}
        </div>
      )}

      {filtered.length > 15 && (
        <div className="mt-3 text-center text-[9px] dim kr">
          {filtered.length - 15}개의 추가 알림
        </div>
      )}

      {/* 교육 */}
      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        <span className="bright">🤖 자동화</span>: 매일 아침 9시 KST에 자동 체크 (Vercel Cron) · <span className="bright">수동 실행 가능</span><br />
        <span className="bright">📬 체크 항목</span>: OpEx 임박(D-3), 포트 집중 리스크, VIX 극단, 음의 GEX 전환, 큰 수익 달성
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 필터 탭
// ═══════════════════════════════════════════════════════════
function FilterTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[9px] px-2 py-1 border-b-2 transition-all kr ${
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
// 알림 카드
// ═══════════════════════════════════════════════════════════
function NotificationCard({ notification: n }: { notification: AlertNotification }) {
  const typeCfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.system;
  const sevCfg = SEVERITY_CONFIG[n.severity] ?? SEVERITY_CONFIG.info;

  const time = new Date(n.timestamp);
  const now = new Date();
  const diffMs = now.getTime() - time.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const timeAgo =
    diffMin < 1 ? "방금"
    : diffMin < 60 ? `${diffMin}분 전`
    : diffHour < 24 ? `${diffHour}시간 전`
    : `${diffDay}일 전`;

  return (
    <div
      className="border-l-4 rounded-r p-3 hover:bg-[rgba(255,255,255,0.02)] transition-all"
      style={{
        borderLeftColor: sevCfg.color,
        background: sevCfg.bg,
      }}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-start gap-2 flex-wrap flex-1 min-w-0">
          <span className="text-[16px]">{n.icon || typeCfg.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[11px] font-bold"
                style={{ color: sevCfg.color }}
              >
                {n.title}
              </span>
              {n.severity === "critical" && (
                <span className="text-[7px] px-1.5 py-0.5 bg-[#ff3860] text-white rounded kr animate-pulse">
                  긴급
                </span>
              )}
              {n.severity === "opportunity" && (
                <span className="text-[7px] px-1.5 py-0.5 bg-[#00ff88] text-black rounded kr">
                  💎 기회
                </span>
              )}
            </div>
            <div className="text-[10px] kr mt-1 leading-relaxed dim">
              {n.message}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {n.symbol && (
                <a
                  href={`/stock/${encodeURIComponent(n.symbol)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-80"
                >
                  <SymbolDisplay
                    meta={{ symbol: n.symbol }}
                    size="xs"
                    variant="inline"
                    showFlag={true}
                    showBadges={false}
                    showName={false}
                  />
                </a>
              )}
              {n.actionUrl && (
                <a
                  href={n.actionUrl}
                  className="text-[9px] font-bold text-[var(--amber)] hover:bright kr"
                >
                  자세히 보기 →
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <div
            className="text-[8px] px-1.5 py-0.5 rounded kr font-bold"
            style={{ borderColor: typeCfg.color, color: typeCfg.color, border: `1px solid ${typeCfg.color}40` }}
          >
            {typeCfg.label}
          </div>
          <div className="text-[8px] dim mt-1">{timeAgo}</div>
        </div>
      </div>
    </div>
  );
}
