"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Metric {
  metric_name: string;
  metric_value: number;
  threshold_warning: number;
  threshold_critical: number;
  status: "ok" | "warning" | "critical";
}

interface CronStatus {
  job_name: string;
  last_run: string;
  last_success: boolean;
  last_count: number;
  last_duration_ms: number;
  minutes_since_last_run: number;
  status: "healthy" | "delayed" | "stale" | "failing";
}

interface RecentRun {
  id: number;
  job_name: string;
  started_at: string;
  duration_ms: number;
  success: boolean;
  records_processed: number;
  error_message: string | null;
}

// 메트릭 한글명
const METRIC_NAMES: Record<string, string> = {
  daily_bars_total: "일봉 데이터 총량",
  daily_bars_min_per_symbol: "종목당 최소 일봉 수",
  news_last_24h: "24시간 내 뉴스",
  macro_ticks_last_hour: "1시간 내 매크로 틱",
  agent_opinions_last_24h: "24시간 내 에이전트 의견",
  cron_success_rate_pct: "Cron 성공률 (%)",
  fresh_quotes_5min: "5분 내 신선 시세",
  predictions_total: "예측 데이터 총량",
  correlations_today: "오늘의 상관관계",
};

// Cron 작업 한글명
const CRON_NAMES: Record<string, string> = {
  "fetch-prices": "가격 수집 (1분)",
  "fetch-news": "뉴스 수집 (15분)",
  "fetch-macro": "매크로 수집 (5분)",
  "compute-analysis": "지표 계산 (5분)",
  "compute-signals": "시그널 생성 (10분)",
  "compute-correlation": "상관관계 (일 1회)",
  "snapshot-agents": "에이전트 스냅샷 (1시간)",
  "daily-rollup": "일별 집계 (새벽 3시)",
  "check-alerts": "알림 확인 (5분)",
};

function statusBadge(status: string) {
  const cfg: Record<string, { bg: string; text: string; label: string }> = {
    ok: { bg: "bg-[rgba(0,255,136,0.15)]", text: "text-[#00ff88]", label: "정상" },
    healthy: { bg: "bg-[rgba(0,255,136,0.15)]", text: "text-[#00ff88]", label: "정상" },
    warning: { bg: "bg-[rgba(255,176,0,0.15)]", text: "text-[var(--amber)]", label: "경고" },
    delayed: { bg: "bg-[rgba(255,176,0,0.15)]", text: "text-[var(--amber)]", label: "지연" },
    critical: { bg: "bg-[rgba(255,56,96,0.15)]", text: "text-[#ff3860]", label: "심각" },
    stale: { bg: "bg-[rgba(255,56,96,0.15)]", text: "text-[#ff3860]", label: "정체" },
    failing: { bg: "bg-[rgba(255,56,96,0.15)]", text: "text-[#ff3860]", label: "실패" },
  };
  return cfg[status] ?? cfg.ok;
}

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTimeAgo(minutes: number) {
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${Math.round(minutes)}분 전`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export function DataHealthDashboard() {
  const { data, isLoading } = useSWR("/api/health", fetcher, {
    refreshInterval: 60000, // 1분
  });

  const metrics: Metric[] = data?.metrics ?? [];
  const cronStatus: CronStatus[] = data?.cron_status ?? [];
  const recentRuns: RecentRun[] = data?.recent_runs ?? [];
  const tableCounts: Record<string, number> = data?.table_counts ?? {};
  const healthScore: number = data?.health_score ?? 0;
  const summary = data?.summary ?? { ok: 0, warning: 0, critical: 0, total: 0 };

  const scoreColor =
    healthScore >= 90 ? "up" : healthScore >= 70 ? "text-[var(--amber)]" : "down";

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div>
          <div className="section-title text-[10px] sm:text-[12px]">
            💊 DATA HEALTH · 시스템 상태 모니터링
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            데이터 수집·처리·품질 자동 추적 · 1분 자동 갱신
          </div>
        </div>
        {!isLoading && (
          <div className={`text-right`}>
            <div className={`text-[18px] sm:text-[24px] font-bold ${scoreColor}`}>
              {healthScore}/100
            </div>
            <div className="text-[8px] sm:text-[9px] dim kr">
              ✓ {summary.ok} · ⚠ {summary.warning} · ✗ {summary.critical}
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-[10px] dim py-6 text-center kr">상태 확인 중...</div>
      ) : (
        <>
          {/* 데이터 품질 메트릭 카드 그리드 */}
          <div className="mb-4">
            <div className="text-[9px] sm:text-[10px] tick mb-2">
              📊 DATA QUALITY METRICS · 데이터 품질 지표
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {metrics.map((m) => {
                const badge = statusBadge(m.status);
                return (
                  <div
                    key={m.metric_name}
                    className={`border ${badge.text.replace("text-", "border-")} rounded p-2 ${badge.bg}`}
                  >
                    <div className="text-[8px] sm:text-[9px] dim kr truncate">
                      {METRIC_NAMES[m.metric_name] ?? m.metric_name}
                    </div>
                    <div className={`text-[14px] sm:text-[16px] font-bold ${badge.text} mt-1`}>
                      {m.metric_value.toLocaleString()}
                    </div>
                    <div className="text-[7px] sm:text-[8px] dim mt-1">
                      기준 ≥{m.threshold_warning.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cron 상태 */}
          <div className="mb-4">
            <div className="text-[9px] sm:text-[10px] tick mb-2">
              ⚙️ CRON JOBS STATUS · 자동화 작업 상태
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[9px] sm:text-[10px]">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left py-1 tick">작업</th>
                    <th className="text-right py-1 dim kr">최근 실행</th>
                    <th className="text-right py-1 dim kr">레코드</th>
                    <th className="text-right py-1 dim">소요</th>
                    <th className="text-right py-1 dim kr">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {cronStatus.map((c) => {
                    const badge = statusBadge(c.status);
                    return (
                      <tr key={c.job_name} className="border-b border-[var(--border)] data-row">
                        <td className="py-1.5 tick kr">{CRON_NAMES[c.job_name] ?? c.job_name}</td>
                        <td className="text-right dim">{formatTimeAgo(c.minutes_since_last_run)}</td>
                        <td className="text-right">{c.last_count?.toLocaleString() ?? 0}</td>
                        <td className="text-right dim">{formatDuration(c.last_duration_ms)}</td>
                        <td className="text-right">
                          <span className={`px-1.5 py-0.5 ${badge.bg} ${badge.text} rounded text-[8px] kr`}>
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 테이블별 레코드 수 */}
          <div className="mb-4">
            <div className="text-[9px] sm:text-[10px] tick mb-2">
              🗄️ DATABASE · 데이터베이스 레코드 수
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {Object.entries(tableCounts).map(([table, count]) => (
                <div key={table} className="border border-[var(--border)] rounded p-2">
                  <div className="text-[7px] sm:text-[8px] dim truncate font-mono">{table}</div>
                  <div className="text-[12px] sm:text-[14px] font-bold tick mt-0.5">
                    {count.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 최근 실행 로그 */}
          {recentRuns.length > 0 && (
            <div>
              <div className="text-[9px] sm:text-[10px] tick mb-2">
                📜 RECENT RUNS · 최근 실행 로그 (최대 20건)
              </div>
              <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
                <table className="w-full text-[8px] sm:text-[9px]">
                  <thead className="sticky top-0 bg-[var(--bg)]">
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left py-1 dim">시간</th>
                      <th className="text-left py-1 dim kr">작업</th>
                      <th className="text-right py-1 dim kr">레코드</th>
                      <th className="text-right py-1 dim">소요</th>
                      <th className="text-center py-1 dim">결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.map((r) => {
                      const time = new Date(r.started_at);
                      const timeStr = time.toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      return (
                        <tr key={r.id} className="border-b border-[var(--border)]">
                          <td className="py-1 dim tick">{timeStr}</td>
                          <td className="py-1 kr">{CRON_NAMES[r.job_name] ?? r.job_name}</td>
                          <td className="py-1 text-right tick">
                            {r.records_processed?.toLocaleString() ?? 0}
                          </td>
                          <td className="py-1 text-right dim">{formatDuration(r.duration_ms)}</td>
                          <td className="py-1 text-center">
                            {r.success ? (
                              <span className="up">✓</span>
                            ) : (
                              <span className="down" title={r.error_message ?? ""}>
                                ✗
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
