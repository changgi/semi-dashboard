"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface PendingSignal {
  id: number;
  signal_date: string;
  symbol: string;
  direction: "up" | "down" | "neutral";
  action: string;
  confidence: number;
  source: string;
  reason: string | null;
  entry_price: number;
  price_1d: number | null;
  price_7d: number | null;
  hit_1d: boolean | null;
  hit_7d: boolean | null;
}

interface JournalData {
  success: boolean;
  period: { days: number; since: string };
  snapshotCount: number;
  pendingSignals: PendingSignal[];
  pendingCount: number;
  verifiedCount: number;
  overallStats: {
    total: number;
    accuracy1d: number;
    accuracy7d: number;
    accuracy30d: number;
    avgMaxGain: number;
    avgMaxLoss: number;
  };
  directionStats: {
    upSignals: { total: number; accuracy: number };
    downSignals: { total: number; accuracy: number };
  };
  symbolStats: Array<{ symbol: string; total: number; correct: number; accuracy: number }>;
  confidenceStats: {
    high: { total: number; accuracy: number };
    medium: { total: number; accuracy: number };
    low: { total: number; accuracy: number };
  };
  portfolioTrend: Array<{ date: string; value: number; gainPct: number; riskScore: number }>;
  insights: string[];
}

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function JournalPanel() {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<"overview" | "pending" | "stats" | "trend">("overview");
  const [runningSnapshot, setRunningSnapshot] = useState(false);
  
  const { data, isLoading, mutate } = useSWR<JournalData>(
    `/api/journal?days=${days}`,
    fetcher,
    { refreshInterval: 300000 } // 5분
  );

  const handleRunSnapshot = async () => {
    if (runningSnapshot) return;
    setRunningSnapshot(true);
    try {
      // 1. 오늘의 스냅샷 저장
      const snap = await fetch("/api/cron/journal-snapshot").then(r => r.json());
      // 2. 기존 시그널 검증
      const verify = await fetch("/api/cron/verify-signals").then(r => r.json());
      
      if (snap?.success && verify?.success) {
        alert(`✅ 스냅샷 저장 완료\n신규 시그널: ${snap.signals_inserted}건\n검증된 시그널: ${verify.newly_verified}건`);
      } else {
        alert(`⚠️ 부분 성공 - DB 마이그레이션이 필요할 수 있습니다`);
      }
      await mutate();
    } catch (e) {
      alert(`❌ 에러: ${(e as Error).message}`);
    } finally {
      setRunningSnapshot(false);
    }
  };

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-16">
        <div className="text-[12px] dim kr">📔 투자 일지 불러오는 중...</div>
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[11px] dim kr mb-2">📔 투자 일지</div>
        <div className="text-[10px] dim kr">
          DB 마이그레이션이 필요할 수 있습니다
        </div>
        <button
          onClick={handleRunSnapshot}
          disabled={runningSnapshot}
          className="mt-3 text-[9px] px-3 py-1.5 border border-[var(--amber)] text-[var(--amber)] hover:bg-[rgba(255,176,0,0.1)] rounded kr"
        >
          {runningSnapshot ? "⏳ 실행 중..." : "🔄 첫 스냅샷 생성"}
        </button>
      </div>
    );
  }

  const stats = data.overallStats ?? { total: 0, accuracy1d: 0, accuracy7d: 0, accuracy30d: 0, avgMaxGain: 0, avgMaxLoss: 0 };
  const dirStats = data.directionStats ?? { upSignals: { total: 0, accuracy: 0 }, downSignals: { total: 0, accuracy: 0 } };
  const confStats = data.confidenceStats ?? { high: { total: 0, accuracy: 0 }, medium: { total: 0, accuracy: 0 }, low: { total: 0, accuracy: 0 } };
  const symbolStats = data.symbolStats ?? [];
  const pendingSignals = data.pendingSignals ?? [];
  const portfolioTrend = data.portfolioTrend ?? [];
  const insights = data.insights ?? [];

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            📔 INVESTMENT JOURNAL · 투자 일지 & 성과 추적
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            시그널 기록 · 자동 검증 · 승률 추적 · AI 인사이트
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="text-[9px] px-2 py-1 bg-black/30 border border-[var(--border)] text-[var(--amber)] rounded"
          >
            <option value={7}>최근 7일</option>
            <option value={30}>최근 30일</option>
            <option value={90}>최근 90일</option>
            <option value={365}>최근 1년</option>
          </select>
          <button
            onClick={handleRunSnapshot}
            disabled={runningSnapshot}
            className="text-[9px] px-2 py-1 border border-[var(--amber)] text-[var(--amber)] hover:bg-[rgba(255,176,0,0.1)] rounded kr disabled:opacity-50"
          >
            {runningSnapshot ? "⏳" : "🔄 오늘 기록"}
          </button>
        </div>
      </div>

      {/* ═════════ 핵심 지표 카드 ═════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <StatCard
          label="🎯 전체 적중률 (30일)"
          value={`${stats.accuracy30d}%`}
          subtitle={`검증 ${stats.total}건`}
          color={stats.accuracy30d >= 65 ? "green" : stats.accuracy30d >= 50 ? "amber" : "red"}
        />
        <StatCard
          label="📈 평균 최대 상승"
          value={`+${stats.avgMaxGain}%`}
          subtitle="시그널 생성 후 30일 내"
          color="green"
        />
        <StatCard
          label="📉 평균 최대 하락"
          value={`${stats.avgMaxLoss}%`}
          subtitle="최악 시나리오"
          color="red"
        />
        <StatCard
          label="⏳ 진행 중 시그널"
          value={`${data.pendingCount}건`}
          subtitle="검증 대기"
          color="amber"
        />
      </div>

      {/* ═════════ AI 인사이트 ═════════ */}
      {insights.length > 0 && (
        <div className="mb-3 p-3 border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded">
          <div className="text-[10px] tick kr font-bold mb-2">💡 AI 인사이트</div>
          <div className="space-y-1">
            {insights.map((ins, i) => (
              <div key={i} className="text-[10px] kr leading-relaxed">{ins}</div>
            ))}
          </div>
        </div>
      )}

      {/* ═════════ 탭 ═════════ */}
      <div className="mb-3 flex items-center gap-1 flex-wrap border-b border-[var(--border)] pb-1">
        <TabBtn label="🎯 요약" active={tab === "overview"} onClick={() => setTab("overview")} />
        <TabBtn label={`⏳ 진행중 (${pendingSignals.length})`} active={tab === "pending"} onClick={() => setTab("pending")} />
        <TabBtn label="📊 통계" active={tab === "stats"} onClick={() => setTab("stats")} />
        <TabBtn label="📈 추이" active={tab === "trend"} onClick={() => setTab("trend")} />
      </div>

      {/* 탭 컨텐츠 */}
      {tab === "overview" && (
        <OverviewTab stats={stats} dirStats={dirStats} confStats={confStats} symbolStats={symbolStats} />
      )}
      {tab === "pending" && (
        <PendingSignalsTab signals={pendingSignals} />
      )}
      {tab === "stats" && (
        <StatsTab dirStats={dirStats} confStats={confStats} symbolStats={symbolStats} />
      )}
      {tab === "trend" && (
        <TrendTab trend={portfolioTrend} />
      )}

      {/* 하단 설명 */}
      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        <span className="bright">🤖 자동화</span>: 매일 아침 시그널 자동 기록 + 시간 경과 후 결과 자동 검증<br />
        <span className="bright">📊 통계</span>: 방향/신뢰도/심볼별 승률 분석 → 어떤 시그널을 신뢰할지 데이터로 판단
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Stat Card
// ═══════════════════════════════════════════════════════════
function StatCard({
  label,
  value,
  subtitle,
  color,
}: {
  label: string;
  value: string;
  subtitle: string;
  color: "green" | "amber" | "red";
}) {
  const colors = {
    green: { text: "text-[#00ff88]", border: "border-[#00ff88]/30", bg: "bg-[rgba(0,255,136,0.03)]" },
    amber: { text: "text-[var(--amber)]", border: "border-[var(--amber-dim)]", bg: "bg-[rgba(255,176,0,0.03)]" },
    red:   { text: "text-[#ff3860]", border: "border-[#ff3860]/30", bg: "bg-[rgba(255,56,96,0.03)]" },
  }[color];

  return (
    <div className={`border ${colors.border} ${colors.bg} rounded p-2`}>
      <div className="text-[8px] dim kr">{label}</div>
      <div className={`text-[16px] font-bold ${colors.text} mt-0.5`}>{value}</div>
      <div className="text-[8px] dim kr mt-0.5">{subtitle}</div>
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] px-3 py-1.5 border-b-2 transition-all kr ${
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
// Overview Tab
// ═══════════════════════════════════════════════════════════
function OverviewTab({
  stats,
  dirStats,
  confStats,
  symbolStats,
}: any) {
  return (
    <div className="space-y-3">
      {/* 시간대별 적중률 */}
      <div>
        <div className="text-[10px] tick kr font-bold mb-2">⏰ 시간대별 적중률</div>
        <div className="grid grid-cols-3 gap-2">
          <AccuracyBar label="1일 후" accuracy={stats.accuracy1d} total={stats.total} />
          <AccuracyBar label="7일 후" accuracy={stats.accuracy7d} total={stats.total} />
          <AccuracyBar label="30일 후" accuracy={stats.accuracy30d} total={stats.total} />
        </div>
      </div>

      {/* 방향별 */}
      <div>
        <div className="text-[10px] tick kr font-bold mb-2">🎯 방향별 성과</div>
        <div className="grid grid-cols-2 gap-2">
          <DirectionCard
            label="📈 상승 시그널"
            color="#00ff88"
            total={dirStats.upSignals.total}
            accuracy={dirStats.upSignals.accuracy}
          />
          <DirectionCard
            label="📉 하락 시그널"
            color="#ff3860"
            total={dirStats.downSignals.total}
            accuracy={dirStats.downSignals.accuracy}
          />
        </div>
      </div>

      {/* 신뢰도별 */}
      <div>
        <div className="text-[10px] tick kr font-bold mb-2">🎚️ 신뢰도별 적중률</div>
        <div className="grid grid-cols-3 gap-2">
          <ConfidenceCard label="🔴 높음 (75%+)" total={confStats.high.total} accuracy={confStats.high.accuracy} />
          <ConfidenceCard label="🟡 중간 (60-75%)" total={confStats.medium.total} accuracy={confStats.medium.accuracy} />
          <ConfidenceCard label="🔵 낮음 (<60%)" total={confStats.low.total} accuracy={confStats.low.accuracy} />
        </div>
      </div>

      {/* TOP 성과 심볼 */}
      {symbolStats.length > 0 && (
        <div>
          <div className="text-[10px] tick kr font-bold mb-2">⭐ TOP 성과 심볼</div>
          <div className="space-y-1">
            {symbolStats.slice(0, 5).map((s: any, i: number) => (
              <div
                key={s.symbol}
                className="flex items-center gap-3 p-2 border border-[var(--border)] rounded hover:bg-[rgba(255,255,255,0.02)]"
              >
                <span className="text-[10px] dim font-bold">#{i + 1}</span>
                <a
                  href={`/stock/${s.symbol}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] tick font-bold hover:bright"
                >
                  {s.symbol}
                </a>
                <div className="flex-1 h-1.5 bg-[var(--border)] rounded overflow-hidden">
                  <div
                    className="h-full bg-[var(--amber)]"
                    style={{ width: `${s.accuracy}%` }}
                  />
                </div>
                <span className="text-[11px] tick font-bold">{s.accuracy}%</span>
                <span className="text-[9px] dim">
                  ({s.correct}/{s.total})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccuracyBar({ label, accuracy, total }: { label: string; accuracy: number; total: number }) {
  const color = accuracy >= 65 ? "#00ff88" : accuracy >= 50 ? "#ffaa44" : "#ff3860";
  return (
    <div className="border border-[var(--border)] rounded p-2">
      <div className="text-[8px] dim kr">{label}</div>
      <div className="text-[16px] font-bold" style={{ color }}>{accuracy}%</div>
      <div className="h-1.5 bg-[var(--border)] rounded overflow-hidden mt-1">
        <div className="h-full" style={{ width: `${accuracy}%`, background: color }} />
      </div>
      <div className="text-[8px] dim mt-1">{total > 0 ? `${total}건 검증` : "데이터 수집 중"}</div>
    </div>
  );
}

function DirectionCard({ label, color, total, accuracy }: { label: string; color: string; total: number; accuracy: number }) {
  return (
    <div className="border rounded p-3" style={{ borderColor: `${color}40`, background: `${color}08` }}>
      <div className="text-[9px] kr font-bold" style={{ color }}>{label}</div>
      <div className="text-[20px] font-bold tick mt-1">{total}건</div>
      <div className="text-[12px] kr">
        적중률 <span className="tick font-bold" style={{ color }}>{accuracy}%</span>
      </div>
    </div>
  );
}

function ConfidenceCard({ label, total, accuracy }: { label: string; total: number; accuracy: number }) {
  const color = accuracy >= 65 ? "#00ff88" : accuracy >= 50 ? "#ffaa44" : "#ff3860";
  return (
    <div className="border border-[var(--border)] rounded p-2">
      <div className="text-[8px] dim kr">{label}</div>
      <div className="text-[14px] font-bold tick">{total}건</div>
      <div className="text-[10px] font-bold" style={{ color }}>{accuracy}%</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Pending Signals Tab
// ═══════════════════════════════════════════════════════════
function PendingSignalsTab({ signals }: { signals: PendingSignal[] }) {
  if (signals.length === 0) {
    return (
      <div className="text-[10px] dim text-center py-10 kr border border-[var(--border)] rounded">
        진행 중인 시그널이 없습니다. 매일 아침 자동으로 기록됩니다.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] tick kr font-bold">
        ⏳ 검증 대기 중 ({signals.length}건)
      </div>
      {signals.slice(0, 10).map((s) => (
        <PendingSignalCard key={s.id} signal={s} />
      ))}
    </div>
  );
}

function PendingSignalCard({ signal: s }: { signal: PendingSignal }) {
  const dirColor = s.direction === "up" ? "#00ff88" : s.direction === "down" ? "#ff3860" : "#aaaaaa";
  const dirIcon = s.direction === "up" ? "📈" : s.direction === "down" ? "📉" : "➖";
  const daysAgo = Math.floor((Date.now() - new Date(s.signal_date).getTime()) / 86400000);

  // 현재 상태 계산
  let currentStatus = "";
  let currentStatusColor = "#aaaaaa";
  if (s.price_7d !== null && s.hit_7d !== null) {
    currentStatus = s.hit_7d ? "7일 적중 ✅" : "7일 미달 ❌";
    currentStatusColor = s.hit_7d ? "#00ff88" : "#ff3860";
  } else if (s.price_1d !== null && s.hit_1d !== null) {
    currentStatus = s.hit_1d ? "1일 적중 ✅" : "1일 미달 ❌";
    currentStatusColor = s.hit_1d ? "#00ff88" : "#ff3860";
  } else {
    currentStatus = `${daysAgo}일 경과 · 검증 대기`;
  }

  return (
    <div className="border-l-4 rounded-r p-2.5" style={{ borderLeftColor: dirColor, background: `${dirColor}08` }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[16px]">{dirIcon}</span>
          <a
            href={`/stock/${s.symbol}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] tick font-bold hover:bright"
          >
            {s.symbol}
          </a>
          <span className="text-[9px] dim kr">{s.signal_date}</span>
          <span className="text-[9px] dim kr">· 진입 ${s.entry_price.toFixed(2)}</span>
          <span className="text-[8px] px-1.5 py-0.5 border rounded kr" style={{ color: dirColor, borderColor: `${dirColor}60` }}>
            {s.source === "sector_scanner" ? "🔍 섹터 스캔" : s.source}
          </span>
        </div>
        <div className="text-right">
          <div className="text-[9px] dim kr">신뢰도</div>
          <div className="text-[11px] font-bold" style={{ color: dirColor }}>{s.confidence}%</div>
        </div>
      </div>

      {s.reason && (
        <div className="text-[9px] kr mt-1 dim leading-relaxed">{s.reason}</div>
      )}

      {/* 진행 상태 */}
      <div className="mt-2 flex items-center justify-between flex-wrap gap-2">
        <div className="text-[9px] kr font-bold" style={{ color: currentStatusColor }}>
          {currentStatus}
        </div>
        <div className="flex items-center gap-2 text-[8px]">
          <span className="dim">1일</span>
          <span className={s.hit_1d === null ? "dim" : s.hit_1d ? "up" : "down"}>
            {s.hit_1d === null ? "—" : s.price_1d !== null ? `$${s.price_1d.toFixed(2)}` : "—"}
          </span>
          <span className="dim">|</span>
          <span className="dim">7일</span>
          <span className={s.hit_7d === null ? "dim" : s.hit_7d ? "up" : "down"}>
            {s.hit_7d === null ? "—" : s.price_7d !== null ? `$${s.price_7d.toFixed(2)}` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Stats Tab
// ═══════════════════════════════════════════════════════════
function StatsTab({ dirStats, confStats, symbolStats }: any) {
  return (
    <div className="space-y-3">
      {/* 심볼별 TOP 전체 */}
      {symbolStats.length > 0 && (
        <div>
          <div className="text-[10px] tick kr font-bold mb-2">
            📊 심볼별 상세 (TOP {symbolStats.length})
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-[var(--border)] dim">
                  <th className="text-left py-1.5 px-2">#</th>
                  <th className="text-left py-1.5 px-2">심볼</th>
                  <th className="text-right py-1.5 px-2 kr">검증</th>
                  <th className="text-right py-1.5 px-2 kr">적중</th>
                  <th className="text-center py-1.5 px-2 kr">승률</th>
                </tr>
              </thead>
              <tbody>
                {symbolStats.map((s: any, i: number) => (
                  <tr key={s.symbol} className="border-b border-[var(--border)]">
                    <td className="py-1.5 px-2 dim">{i + 1}</td>
                    <td className="py-1.5 px-2">
                      <a
                        href={`/stock/${s.symbol}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tick font-bold hover:bright"
                      >
                        {s.symbol}
                      </a>
                    </td>
                    <td className="text-right py-1.5 px-2 tick">{s.total}</td>
                    <td className="text-right py-1.5 px-2 tick">{s.correct}</td>
                    <td className="text-center py-1.5 px-2 font-bold"
                        style={{ color: s.accuracy >= 65 ? "#00ff88" : s.accuracy >= 50 ? "#ffaa44" : "#ff3860" }}>
                      {s.accuracy}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="text-[9px] dim kr">
        💡 충분한 데이터가 쌓이면(30건+) 어떤 시그널이 가장 효과적인지 알 수 있어요
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Trend Tab
// ═══════════════════════════════════════════════════════════
function TrendTab({ trend }: { trend: Array<{ date: string; value: number; gainPct: number; riskScore: number }> }) {
  if (trend.length === 0) {
    return (
      <div className="text-[10px] dim text-center py-10 kr border border-[var(--border)] rounded">
        📈 포트폴리오 추이 데이터 수집 중... (매일 자동 저장)
      </div>
    );
  }

  const maxValue = Math.max(...trend.map(t => t.value || 0));
  const minValue = Math.min(...trend.map(t => t.value || 0));
  const range = maxValue - minValue || 1;

  return (
    <div>
      <div className="text-[10px] tick kr font-bold mb-2">
        📈 포트폴리오 추이 (최근 {trend.length}일)
      </div>
      <div className="border border-[var(--border)] rounded p-3">
        <div className="space-y-1.5">
          {trend.slice(0, 10).map((t) => {
            const barWidth = t.value ? ((t.value - minValue) / range) * 100 : 0;
            const gainColor = (t.gainPct ?? 0) >= 0 ? "#00ff88" : "#ff3860";
            return (
              <div key={t.date} className="flex items-center gap-2">
                <span className="text-[9px] dim w-20">{t.date.slice(5)}</span>
                <div className="flex-1 h-4 bg-[var(--border)] rounded overflow-hidden relative">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${barWidth}%`, background: gainColor }}
                  />
                </div>
                <span className="text-[10px] tick font-bold w-20 text-right">
                  ${t.value?.toFixed(0) ?? "-"}
                </span>
                <span className="text-[9px] font-bold w-14 text-right" style={{ color: gainColor }}>
                  {(t.gainPct ?? 0) >= 0 ? "+" : ""}{t.gainPct?.toFixed(2) ?? "0"}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
