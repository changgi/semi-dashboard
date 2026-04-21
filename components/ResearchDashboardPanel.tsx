"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";

const fetcher = safeFetcher;

interface ResearchData {
  success: boolean;
  stats: {
    totalSnapshots: number;
    regimeDays: number;
    activePatterns: number;
    totalFindings: number;
  };
  currentRegime: {
    date: string;
    vix: number;
    vix_regime: string;
    spy_regime: string;
    krw_regime: string;
    overall: string;
  } | null;
  weekAgoRegime: any;
  vixStats: {
    current: number;
    min30d: number;
    max30d: number;
    avg30d: number;
  } | null;
  regimeTimeline: Array<any>;
  topPatterns: Array<any>;
  topCorrelations: Array<any>;
  recentFindings: Array<any>;
}

// ═══════════════════════════════════════════════════════════
export function ResearchDashboardPanel() {
  const [tab, setTab] = useState<"regime" | "patterns" | "correlations" | "findings">("regime");
  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState<string | null>(null);

  const { data, isLoading, mutate } = useSWR<ResearchData>(
    "/api/research-dashboard",
    fetcher,
    { refreshInterval: 600000 }
  );

  const triggerCollection = async () => {
    if (!confirm("지금 시세/국면/상관관계를 수집하시겠습니까?\n(약 30초 소요)")) return;
    setCollecting(true);
    setCollectMsg(null);
    try {
      const res = await fetch("/api/cron/warehouse-snapshot?force=true");
      const json = await res.json();
      if (json.success) {
        setCollectMsg(
          `✅ 수집 완료! 스냅샷 ${json.summary?.snapshots_captured}건, ` +
          `상관관계 ${json.summary?.correlations_updated}쌍`
        );
        mutate(); // 화면 갱신
      } else {
        setCollectMsg(`❌ 실패: ${json.error ?? "Unknown"}`);
      }
    } catch (e) {
      setCollectMsg(`❌ 네트워크 에러: ${(e as Error).message}`);
    } finally {
      setCollecting(false);
      setTimeout(() => setCollectMsg(null), 5000);
    }
  };

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[11px] dim kr">🔬 연구 데이터 로딩 중...</div>
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
            🔬 RESEARCH DASHBOARD · 축적된 데이터 분석
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            시장 국면 · 패턴 승률 · 상관관계 · 인사이트 아카이브
          </div>
        </div>
        <button
          onClick={triggerCollection}
          disabled={collecting}
          className="text-[10px] px-3 py-1.5 border border-[var(--amber)] bg-[var(--amber)] text-[#111] rounded kr font-bold disabled:opacity-50"
        >
          {collecting ? "⏳ 수집 중..." : "🔄 지금 수집"}
        </button>
      </div>

      {/* 수집 결과 메시지 */}
      {collectMsg && (
        <div className={`mb-3 p-2 rounded text-[10px] kr ${collectMsg.startsWith("✅") ? "up bg-[rgba(0,255,136,0.1)]" : "down bg-[rgba(255,56,96,0.1)]"}`}>
          {collectMsg}
        </div>
      )}

      {/* 통계 카드 */}
      <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="📊 스냅샷" value={data.stats.totalSnapshots} color="#aaccff" unit="건" />
        <StatCard label="📅 기록 일수" value={data.stats.regimeDays} color="#00ff88" unit="일" />
        <StatCard label="🔍 활성 패턴" value={data.stats.activePatterns} color="#ffaa44" unit="개" />
        <StatCard label="💡 인사이트" value={data.stats.totalFindings} color="#ee99ff" unit="개" />
      </div>

      {/* 현재 시장 국면 */}
      {data.currentRegime && (
        <div className="mb-3 p-3 border-2 border-[var(--amber)] bg-[rgba(255,176,0,0.05)] rounded">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-[9px] dim kr">🌍 현재 시장 국면</div>
              <div className="text-[16px] tick font-bold kr mt-1">
                {getRegimeLabel(data.currentRegime.overall)}
              </div>
              <div className="text-[9px] dim kr mt-0.5">
                {data.currentRegime.date} · VIX {data.currentRegime.vix}
              </div>
            </div>
            <div className="text-right space-y-1">
              <div className="text-[10px] kr">
                <span className="dim">VIX:</span>{" "}
                <span className={vixColor(data.currentRegime.vix_regime)}>
                  {data.currentRegime.vix_regime}
                </span>
              </div>
              <div className="text-[10px] kr">
                <span className="dim">SPY:</span>{" "}
                <span className={spyColor(data.currentRegime.spy_regime)}>
                  {data.currentRegime.spy_regime}
                </span>
              </div>
              <div className="text-[10px] kr">
                <span className="dim">환율:</span>{" "}
                <span className="tick">{data.currentRegime.krw_regime}</span>
              </div>
            </div>
          </div>

          {data.vixStats && (
            <div className="mt-2 pt-2 border-t border-[var(--border)] grid grid-cols-3 gap-2 text-[9px] kr">
              <div>
                <span className="dim">최저 30d:</span>{" "}
                <span className="up font-bold">{data.vixStats.min30d.toFixed(1)}</span>
              </div>
              <div>
                <span className="dim">평균 30d:</span>{" "}
                <span className="tick font-bold">{data.vixStats.avg30d.toFixed(1)}</span>
              </div>
              <div>
                <span className="dim">최고 30d:</span>{" "}
                <span className="down font-bold">{data.vixStats.max30d.toFixed(1)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 탭 */}
      <div className="mb-3 flex items-center gap-1 flex-wrap border-b border-[var(--border)] pb-1">
        <TabBtn label={`📅 국면 (${data.regimeTimeline.length})`} active={tab === "regime"} onClick={() => setTab("regime")} />
        <TabBtn label={`🔍 패턴 (${data.topPatterns.length})`} active={tab === "patterns"} onClick={() => setTab("patterns")} />
        <TabBtn label={`🔗 상관 (${data.topCorrelations.length})`} active={tab === "correlations"} onClick={() => setTab("correlations")} />
        <TabBtn label={`💡 인사이트 (${data.recentFindings.length})`} active={tab === "findings"} onClick={() => setTab("findings")} />
      </div>

      {/* 탭 콘텐츠 */}
      {tab === "regime" && <RegimeTab timeline={data.regimeTimeline} />}
      {tab === "patterns" && <PatternsTab patterns={data.topPatterns} />}
      {tab === "correlations" && <CorrelationsTab correlations={data.topCorrelations} />}
      {tab === "findings" && <FindingsTab findings={data.recentFindings} />}

      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        💡 매일 KST 00:30 자동 수집 · 월요일 상관관계 업데이트<br />
        🔬 축적될수록 더 정확한 분석 · 백테스트 가능한 기반
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
function StatCard({ label, value, color, unit }: { label: string; value: number; color: string; unit: string }) {
  return (
    <div className="border rounded p-2 text-center" style={{ borderColor: `${color}40`, background: `${color}08` }}>
      <div className="text-[8px] dim kr">{label}</div>
      <div className="text-[16px] font-bold" style={{ color }}>{value.toLocaleString()}{unit}</div>
    </div>
  );
}

function TabBtn({ label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] px-2.5 py-1.5 border-b-2 kr ${active ? "border-[var(--amber)] text-[var(--amber)] font-bold" : "border-transparent dim"}`}
    >
      {label}
    </button>
  );
}

function getRegimeLabel(r: string): string {
  const labels: Record<string, string> = {
    risk_on: "🟢 위험 선호 (Risk-On)",
    risk_off: "🔴 위험 회피 (Risk-Off)",
    transition: "🟡 전환 중 (Transition)",
    unknown: "❓ 데이터 부족",
  };
  return labels[r] || r;
}

function vixColor(r: string): string {
  if (r === "calm") return "up";
  if (r === "normal") return "";
  if (r === "elevated") return "down";
  return "down font-bold";
}

function spyColor(r: string): string {
  if (r === "bull") return "up font-bold";
  if (r === "bear") return "down font-bold";
  return "";
}

// ─────────────────────────────────────────────────────────
function RegimeTab({ timeline }: { timeline: any[] }) {
  if (timeline.length === 0) {
    return <div className="text-center py-8 text-[10px] dim kr">데이터 축적 중... (매일 00:30 KST 자동 수집)</div>;
  }

  return (
    <div className="space-y-1 max-h-96 overflow-y-auto">
      {timeline.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-[10px] kr py-1 border-b border-[var(--border)]/50">
          <span className="dim font-mono w-20">{r.date}</span>
          <span className={`w-12 ${vixColor(r.vix_regime)}`}>VIX {r.vix?.toFixed(1) ?? "-"}</span>
          <span className={`w-16 ${spyColor(r.spy_regime)}`}>{r.spy_regime}</span>
          <span className="flex-1 tick">{getRegimeLabel(r.overall).split(" ")[0]}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
function PatternsTab({ patterns }: { patterns: any[] }) {
  if (patterns.length === 0) {
    return <div className="text-center py-8 text-[10px] dim kr">활성 패턴 없음</div>;
  }

  return (
    <div className="space-y-2">
      {patterns.map((p, i) => (
        <div key={i} className="border border-[var(--border)] rounded p-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] tick font-bold kr">{p.name}</div>
              <div className="text-[9px] dim kr mt-0.5 leading-relaxed">{p.description}</div>
            </div>
            <div className="text-right flex-shrink-0">
              {p.winRate !== null ? (
                <>
                  <div className="text-[14px] font-bold up">
                    {p.winRate.toFixed(0)}%
                  </div>
                  <div className="text-[8px] dim">승률 ({p.occurrences}회)</div>
                </>
              ) : (
                <div className="text-[9px] dim kr">관찰 중</div>
              )}
            </div>
          </div>
          {p.applicableSymbols && p.applicableSymbols.length > 0 && (
            <div className="mt-1 flex gap-1 flex-wrap">
              {p.applicableSymbols.slice(0, 5).map((s: string) => (
                <span key={s} className="text-[8px] px-1.5 py-0.5 border border-[var(--border-bright)] tick rounded">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
function CorrelationsTab({ correlations }: { correlations: any[] }) {
  if (correlations.length === 0) {
    return <div className="text-center py-8 text-[10px] dim kr">매주 월요일 자동 업데이트 (축적 중)</div>;
  }

  return (
    <div className="space-y-1">
      {correlations.map((c, i) => {
        const abs = Math.abs(c.correlation);
        const color = c.correlation > 0.4 ? "#00ff88" : c.correlation < -0.4 ? "#ff3860" : "#aaaaaa";
        const [symA, symB] = (c.pair ?? "").split(" - ");
        return (
          <div key={i} className="flex items-center gap-2 text-[10px] kr py-1.5 border-b border-[var(--border)]/50">
            <span className="flex-1 flex items-center gap-1">
              {symA && <SymbolDisplay meta={{ symbol: symA }} size="xs" variant="inline" showFlag={false} showBadges={false} showName={false} />}
              <span className="dim">↔</span>
              {symB && <SymbolDisplay meta={{ symbol: symB }} size="xs" variant="inline" showFlag={false} showBadges={false} showName={false} />}
            </span>
            <span className="w-20 text-right font-bold" style={{ color }}>
              {c.correlation > 0 ? "+" : ""}{c.correlation.toFixed(3)}
            </span>
            <span className="w-20 text-right dim">{c.strength}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
function FindingsTab({ findings }: { findings: any[] }) {
  if (findings.length === 0) {
    return (
      <div className="text-center py-8 text-[10px] dim kr">
        아직 축적된 인사이트 없음<br />
        <span className="text-[9px]">Journal에서 시그널 기록 시 자동 축적됨</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {findings.map((f, i) => (
        <div key={i} className="border border-[var(--border)] rounded p-2">
          <div className="flex items-start gap-2 flex-wrap">
            <span className="text-[10px] dim">{f.date}</span>
            <span className="text-[9px] px-1.5 py-0.5 bg-[var(--amber-dim)] text-white rounded">{f.category}</span>
          </div>
          <div className="text-[11px] tick font-bold kr mt-1">{f.title}</div>
          <div className="text-[10px] kr mt-1 leading-relaxed">{f.insight}</div>
          {f.tags && f.tags.length > 0 && (
            <div className="mt-2 flex gap-1 flex-wrap">
              {f.tags.slice(0, 5).map((t: string) => (
                <span key={t} className="text-[8px] dim kr">#{t}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
