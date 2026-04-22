"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";
import { fmtUsd, fmtPct, fmtDate } from "@/lib/format";

const fetcher = safeFetcher;

type ViewMode = "trend" | "list" | "performance" | "insights";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ff3860",
  action_needed: "#ffd93d",
  attention: "#ffb000",
  calm: "#00ff88",
};

export function ArchiveReviewPanel() {
  const [viewMode, setViewMode] = useState<ViewMode>("trend");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  
  const { data: trendData, isLoading: trendLoading } = useSWR<any>(
    viewMode === "trend" ? "/api/snapshot-archive?mode=trend&days=30" : null,
    fetcher
  );
  
  const { data: listData, isLoading: listLoading } = useSWR<any>(
    viewMode === "list" ? "/api/snapshot-archive?mode=list&days=30" : null,
    fetcher
  );
  
  const { data: perfData, isLoading: perfLoading } = useSWR<any>(
    viewMode === "performance" ? "/api/snapshot-archive?mode=performance" : null,
    fetcher
  );
  
  const { data: insightsData, isLoading: insightsLoading } = useSWR<any>(
    viewMode === "insights" ? "/api/snapshot-archive?mode=insights" : null,
    fetcher
  );
  
  const { data: detailData } = useSWR<any>(
    selectedDate ? `/api/snapshot-archive?mode=detail&date=${selectedDate}&time=morning` : null,
    fetcher
  );
  
  const triggerSnapshot = async () => {
    setTriggering(true);
    try {
      const res = await fetch("/api/cron/daily-snapshot?source=manual");
      const result = await res.json();
      if (result.success) {
        alert(`스냅샷 저장 완료!\n${result.snapshotDate} ${result.timeOfDay}`);
      } else {
        alert("실패: " + result.error);
      }
    } catch (e) {
      alert("오류: " + e);
    }
    setTriggering(false);
  };
  
  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="p-3 border border-[var(--border)] rounded bg-[rgba(126,200,255,0.03)]">
        <div className="flex justify-between items-center flex-wrap gap-2 mb-2">
          <div>
            <div className="text-[11px] tick font-bold kr">📂 아카이브 검토 · 자기 학습</div>
            <div className="text-[9px] dim kr mt-0.5">
              매일 자동 스냅샷 · 과거 조회 · 추천 성과 · 패턴 인사이트
            </div>
          </div>
          <button
            onClick={triggerSnapshot}
            disabled={triggering}
            className="text-[10px] px-3 py-1.5 border border-[var(--amber)] rounded bg-[rgba(255,176,0,0.1)] tick font-bold kr"
          >
            {triggering ? "저장 중..." : "📸 지금 스냅샷"}
          </button>
        </div>
        
        {/* 모드 탭 */}
        <div className="grid grid-cols-4 gap-1">
          {[
            { id: "trend", label: "📈 트렌드", desc: "30일" },
            { id: "list", label: "📅 기록", desc: "리스트" },
            { id: "performance", label: "🎯 성과", desc: "추천 따름률" },
            { id: "insights", label: "🧠 인사이트", desc: "패턴" },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setViewMode(m.id as ViewMode)}
              className={`text-[9px] px-2 py-1.5 border rounded kr ${
                viewMode === m.id
                  ? "border-[var(--amber)] tick font-bold bg-[rgba(255,176,0,0.1)]"
                  : "border-[var(--border)] dim"
              }`}
            >
              <div>{m.label}</div>
              <div className="text-[8px] opacity-60">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>
      
      {/* TREND 뷰 */}
      {viewMode === "trend" && (
        <div>
          {trendLoading ? (
            <div className="p-6 text-center dim text-[10px] kr">트렌드 로딩...</div>
          ) : !trendData?.hasData ? (
            <div className="p-6 text-center border border-[var(--border)] rounded bg-black/20">
              <div className="text-[11px] dim kr mb-2">아직 누적된 데이터 없음</div>
              <div className="text-[9px] dim kr">"📸 지금 스냅샷" 버튼으로 첫 기록 시작</div>
            </div>
          ) : (
            <TrendView data={trendData} onDateSelect={setSelectedDate} />
          )}
        </div>
      )}
      
      {/* LIST 뷰 */}
      {viewMode === "list" && (
        <div>
          {listLoading ? (
            <div className="p-6 text-center dim text-[10px] kr">로딩...</div>
          ) : !listData?.snapshots?.length ? (
            <div className="p-6 text-center dim text-[10px] kr">스냅샷 없음</div>
          ) : (
            <ListView snapshots={listData.snapshots} onDateSelect={setSelectedDate} selectedDate={selectedDate} />
          )}
        </div>
      )}
      
      {/* PERFORMANCE 뷰 */}
      {viewMode === "performance" && (
        <div>
          {perfLoading ? (
            <div className="p-6 text-center dim text-[10px] kr">성과 분석 중...</div>
          ) : !perfData?.hasData ? (
            <div className="p-6 text-center dim text-[10px] kr">추적된 추천 없음</div>
          ) : (
            <PerformanceView data={perfData} />
          )}
        </div>
      )}
      
      {/* INSIGHTS 뷰 */}
      {viewMode === "insights" && (
        <div>
          {insightsLoading ? (
            <div className="p-6 text-center dim text-[10px] kr">인사이트 분석 중...</div>
          ) : !insightsData?.hasData ? (
            <div className="p-6 text-center dim text-[10px] kr">데이터 수집 중 (7일 이상 필요)</div>
          ) : (
            <InsightsView data={insightsData} />
          )}
        </div>
      )}
      
      {/* 선택된 날짜 상세 */}
      {selectedDate && detailData?.exists && (
        <DetailView snapshot={detailData.snapshot} onClose={() => setSelectedDate(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// TREND VIEW
// ─────────────────────────────────────────
function TrendView({ data, onDateSelect }: { data: any; onDateSelect: (d: string) => void }) {
  const points = data.trendPoints ?? [];
  const s = data.summary ?? {};
  
  // 건강도 차트용 max/min
  const maxHealth = Math.max(...points.map((p: any) => p.healthScore ?? 0), 100);
  const minHealth = Math.min(...points.map((p: any) => p.healthScore ?? 100), 0);
  
  return (
    <div className="space-y-3">
      {/* 요약 */}
      <div className="grid grid-cols-3 gap-2 text-[9px]">
        <div className="p-2 bg-black/30 rounded text-center">
          <div className="dim kr">평가 변화</div>
          <div
            className="text-[14px] font-bold"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              color: s.totalChangeUsd >= 0 ? "#00ff88" : "#ff3860",
            }}
          >
            {fmtUsd(s.totalChangeUsd, { showSign: true })}
          </div>
          <div className={`text-[9px] ${s.totalChangeUsd >= 0 ? "up" : "down"}`}>
            {fmtPct(s.totalChangePct)}
          </div>
        </div>
        <div className="p-2 bg-black/30 rounded text-center">
          <div className="dim kr">건강도 변화</div>
          <div
            className="text-[14px] font-bold"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              color: s.healthChange >= 0 ? "#00ff88" : "#ff3860",
            }}
          >
            {s.healthChange >= 0 ? "+" : ""}{s.healthChange}
          </div>
          <div className="text-[9px] dim">{s.startHealth} → {s.endHealth}</div>
        </div>
        <div className="p-2 bg-black/30 rounded text-center">
          <div className="dim kr">레버리지 변화</div>
          <div
            className="text-[14px] font-bold"
            style={{
              fontFamily: "'Bebas Neue', sans-serif",
              color: s.leverageChange <= 0 ? "#00ff88" : "#ff3860",
            }}
          >
            {s.leverageChange >= 0 ? "+" : ""}{s.leverageChange?.toFixed(0)}%p
          </div>
          <div className="text-[9px] dim">{s.startLeverage?.toFixed(0)} → {s.endLeverage?.toFixed(0)}%</div>
        </div>
      </div>
      
      {/* 미니 차트 (SVG 기반) */}
      <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]">
        <div className="text-[10px] tick font-bold kr mb-2">📈 건강도 트렌드 ({points.length}일)</div>
        <svg viewBox="0 0 400 100" className="w-full h-[100px]">
          {/* 격자 */}
          {[25, 50, 75].map(y => (
            <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="rgba(255,255,255,0.05)" />
          ))}
          
          {/* 라인 차트 */}
          {points.length > 1 && (
            <polyline
              fill="none"
              stroke="#ffb000"
              strokeWidth="2"
              points={points.map((p: any, i: number) => {
                const x = (i / (points.length - 1)) * 400;
                const y = 100 - ((p.healthScore ?? 0) / 100) * 100;
                return `${x},${y}`;
              }).join(" ")}
            />
          )}
          
          {/* 포인트 */}
          {points.map((p: any, i: number) => {
            const x = points.length > 1 ? (i / (points.length - 1)) * 400 : 200;
            const y = 100 - ((p.healthScore ?? 0) / 100) * 100;
            const color = (p.healthScore ?? 0) >= 60 ? "#00ff88" : (p.healthScore ?? 0) >= 40 ? "#ffd93d" : "#ff3860";
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="3"
                fill={color}
                className="cursor-pointer"
                onClick={() => onDateSelect(p.date)}
              />
            );
          })}
        </svg>
        <div className="flex justify-between text-[8px] dim mt-1">
          <span>{points[0]?.date}</span>
          <span>{points[points.length - 1]?.date}</span>
        </div>
      </div>
      
      {/* 손익 차트 */}
      {points.length > 1 && (
        <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]">
          <div className="text-[10px] tick font-bold kr mb-2">💰 평가액 트렌드</div>
          <svg viewBox="0 0 400 60" className="w-full h-[60px]">
            {points.length > 1 && (() => {
              const values = points.map((p: any) => p.portfolioValue ?? 0);
              const max = Math.max(...values);
              const min = Math.min(...values);
              const range = max - min || 1;
              return (
                <polyline
                  fill="none"
                  stroke="#7ec8ff"
                  strokeWidth="2"
                  points={points.map((p: any, i: number) => {
                    const x = (i / (points.length - 1)) * 400;
                    const y = 60 - (((p.portfolioValue ?? 0) - min) / range) * 50 - 5;
                    return `${x},${y}`;
                  }).join(" ")}
                />
              );
            })()}
          </svg>
        </div>
      )}
      
      <div className="text-[9px] dim kr text-center">
        💡 차트 점 클릭 → 해당 날짜 상세 스냅샷 보기
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// LIST VIEW
// ─────────────────────────────────────────
function ListView({ snapshots, onDateSelect, selectedDate }: { snapshots: any[]; onDateSelect: (d: string) => void; selectedDate: string | null }) {
  return (
    <div className="space-y-1 max-h-[400px] overflow-y-auto">
      {snapshots.map((s, i) => {
        const color = SEVERITY_COLORS[s.severity ?? "calm"];
        return (
          <div
            key={s.id}
            onClick={() => onDateSelect(s.snapshot_date)}
            className="p-2 border rounded cursor-pointer transition-all"
            style={{
              borderColor: selectedDate === s.snapshot_date ? "var(--amber)" : "var(--border)",
              background: selectedDate === s.snapshot_date ? "rgba(255,176,0,0.08)" : "var(--bg-card, #141414)",
            }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[11px] font-bold kr"
                style={{ fontFamily: "'Bebas Neue', sans-serif", color: "#ffd56b" }}
              >
                {s.snapshot_date}
              </span>
              <span className="text-[8px] dim kr">{s.time_of_day}</span>
              {s.severity && (
                <span
                  className="text-[8px] px-1.5 py-0.5 rounded font-bold"
                  style={{ background: color, color: "#000" }}
                >
                  {s.severity}
                </span>
              )}
              <span className={`text-[9px] font-bold ${s.portfolio_gain_pct >= 0 ? "up" : "down"}`}>
                {fmtPct(s.portfolio_gain_pct)}
              </span>
              <span className="text-[9px] dim">건강 {s.portfolio_health_score}</span>
              {s.today_action_count > 0 && (
                <span className="text-[8px] tick font-bold">
                  ⚡{s.today_action_count}건
                </span>
              )}
              {s.critical_alerts > 0 && (
                <span className="text-[8px] down font-bold">
                  🚨{s.critical_alerts}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────
// PERFORMANCE VIEW
// ─────────────────────────────────────────
function PerformanceView({ data }: { data: any }) {
  const overall = data.overall;
  const bySource = data.bySource ?? [];
  
  return (
    <div className="space-y-3">
      {/* 전체 */}
      <div className="p-3 border-2 border-[var(--amber)] rounded bg-[rgba(255,176,0,0.05)]">
        <div className="text-[10px] tick font-bold kr mb-2">📊 전체 성과 (최근 90일)</div>
        <div className="grid grid-cols-3 gap-2 text-[9px]">
          <div className="text-center">
            <div className="dim kr">총 추천</div>
            <div className="text-[18px] tick font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              {overall.totalRecommendations}
            </div>
          </div>
          <div className="text-center">
            <div className="dim kr">실행률</div>
            <div
              className="text-[18px] font-bold"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                color: overall.executionRate >= 50 ? "#00ff88" : "#ffd93d",
              }}
            >
              {overall.executionRate.toFixed(0)}%
            </div>
          </div>
          <div className="text-center">
            <div className="dim kr">정확도</div>
            <div
              className="text-[18px] font-bold"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                color: overall.accuracy === null ? "#888" : overall.accuracy >= 60 ? "#00ff88" : "#ff3860",
              }}
            >
              {overall.accuracy === null ? "—" : `${overall.accuracy.toFixed(0)}%`}
            </div>
          </div>
        </div>
      </div>
      
      {/* 소스별 */}
      <div className="space-y-2">
        <div className="text-[10px] tick font-bold kr">📂 소스별 성과</div>
        {bySource.map((s: any) => (
          <div
            key={s.source}
            className="p-2 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]"
          >
            <div className="flex justify-between items-center mb-1 flex-wrap gap-1">
              <span className="text-[11px] kr tick font-bold">{s.source}</span>
              <span className="text-[9px] dim kr">{s.total}건</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[9px]">
              <div>
                <div className="dim kr">실행률</div>
                <div
                  className="text-[12px] font-bold"
                  style={{
                    color: s.executionRate >= 50 ? "#00ff88" : "#ffd93d",
                    fontFamily: "'Bebas Neue', sans-serif",
                  }}
                >
                  {s.executionRate.toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="dim kr">평균 신뢰도</div>
                <div className="text-[12px] tick font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                  {s.avgConfidence.toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="dim kr">정확도</div>
                <div
                  className="text-[12px] font-bold"
                  style={{
                    color: s.accuracy === null ? "#888" : s.accuracy >= 60 ? "#00ff88" : "#ff3860",
                    fontFamily: "'Bebas Neue', sans-serif",
                  }}
                >
                  {s.accuracy === null ? "평가 중" : `${s.accuracy.toFixed(0)}%`}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────
// INSIGHTS VIEW
// ─────────────────────────────────────────
function InsightsView({ data }: { data: any }) {
  const insights = data.insights ?? [];
  
  const severityColors = {
    positive: { border: "#00ff88", bg: "rgba(0,255,136,0.05)" },
    warning: { border: "#ffd93d", bg: "rgba(255,217,61,0.05)" },
    neutral: { border: "#7ec8ff", bg: "rgba(126,200,255,0.04)" },
  };
  
  return (
    <div className="space-y-2">
      <div className="text-[9px] dim kr">{data.period} 데이터 기반 패턴 분석</div>
      
      {insights.length === 0 ? (
        <div className="p-6 text-center dim text-[10px] kr">
          아직 인사이트 없음 (데이터 축적 필요)
        </div>
      ) : (
        insights.map((ins: any, i: number) => {
          const c = severityColors[ins.severity as keyof typeof severityColors] ?? severityColors.neutral;
          return (
            <div
              key={i}
              className="p-3 rounded border-l-4"
              style={{ borderLeftColor: c.border, background: c.bg }}
            >
              <div className="flex items-start gap-2">
                <span className="text-[18px] flex-shrink-0">{ins.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] kr font-bold tick">{ins.label}</div>
                  <div className="text-[10px] kr dim mt-1 leading-relaxed">{ins.detail}</div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ─────────────────────────────────────────
// DETAIL VIEW (선택한 날짜 상세)
// ─────────────────────────────────────────
function DetailView({ snapshot, onClose }: { snapshot: any; onClose: () => void }) {
  const focus = snapshot.todays_focus_data;
  const ideas = snapshot.trade_ideas_data?.ideas ?? [];
  
  return (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto p-4"
      style={{ background: "rgba(0,0,0,0.95)", backdropFilter: "blur(8px)" }}
    >
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-[10px] dim kr tracking-widest">ARCHIVED SNAPSHOT</div>
            <div
              className="text-[20px] font-bold"
              style={{ fontFamily: "'Bebas Neue', sans-serif", color: "#ffd56b" }}
            >
              {snapshot.snapshot_date}
            </div>
            <div className="text-[10px] dim kr">{snapshot.time_of_day} · {new Date(snapshot.snapshot_time).toLocaleString("ko-KR")}</div>
          </div>
          <button onClick={onClose} className="text-[12px] px-3 py-1 border border-[var(--border)] rounded dim">
            × 닫기
          </button>
        </div>
        
        {/* 핵심 수치 */}
        <div className="grid grid-cols-4 gap-2">
          <div className="p-3 bg-[var(--bg-card,#141414)] rounded text-center">
            <div className="text-[9px] dim kr">평가액</div>
            <div className="text-[16px] tick font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              {fmtUsd(snapshot.portfolio_value_usd)}
            </div>
          </div>
          <div className="p-3 bg-[var(--bg-card,#141414)] rounded text-center">
            <div className="text-[9px] dim kr">손익</div>
            <div
              className="text-[16px] font-bold"
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                color: snapshot.portfolio_gain_pct >= 0 ? "#00ff88" : "#ff3860",
              }}
            >
              {fmtPct(snapshot.portfolio_gain_pct)}
            </div>
          </div>
          <div className="p-3 bg-[var(--bg-card,#141414)] rounded text-center">
            <div className="text-[9px] dim kr">건강도</div>
            <div className="text-[16px] tick font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              {snapshot.portfolio_health_score}
            </div>
          </div>
          <div className="p-3 bg-[var(--bg-card,#141414)] rounded text-center">
            <div className="text-[9px] dim kr">레버리지</div>
            <div className="text-[16px] warn font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              {snapshot.leverage_pct?.toFixed(0)}%
            </div>
          </div>
        </div>
        
        {/* 그날의 Today's Focus */}
        {focus && (
          <div
            className="p-4 rounded border-2"
            style={{
              borderColor: SEVERITY_COLORS[focus.severity] ?? "var(--border)",
              background: "rgba(20,20,20,0.8)",
            }}
          >
            <div className="text-[9px] dim kr tracking-widest mb-2">THAT DAY'S FOCUS</div>
            <div className="flex items-start gap-3">
              <span className="text-[32px] leading-none">{focus.headlineEmoji}</span>
              <div className="flex-1">
                <div className="text-[14px] kr font-bold" style={{ color: SEVERITY_COLORS[focus.severity] }}>
                  {focus.headline}
                </div>
                {focus.primaryAction && (
                  <div className="mt-2 p-2 bg-black/40 rounded text-[11px] kr">
                    <b className="tick">{focus.primaryAction.title}</b>
                    <div className="dim mt-1">{focus.primaryAction.why}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* 그날의 Trade Ideas */}
        {ideas.length > 0 && (
          <div>
            <div className="text-[10px] tick font-bold kr mb-2">📋 그날의 추천 ({ideas.length}건)</div>
            <div className="space-y-2">
              {ideas.slice(0, 5).map((idea: any) => (
                <div
                  key={idea.id}
                  className="p-3 border rounded"
                  style={{
                    borderColor: idea.action === "SELL" ? "#ff3860" : "#00ff88",
                    background: "rgba(0,0,0,0.3)",
                  }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[9px] px-2 py-0.5 rounded font-bold"
                      style={{
                        background: idea.action === "SELL" ? "#ff3860" : "#00ff88",
                        color: "#000",
                      }}
                    >
                      {idea.action}
                    </span>
                    <span className="text-[14px] tick font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                      {idea.symbol}
                    </span>
                    <span className="text-[9px] dim kr">{idea.shares}주</span>
                    <span className="text-[9px] up font-bold">{fmtUsd(idea.estimatedAmount)}</span>
                    <span className="text-[9px] dim kr ml-auto">신뢰 {idea.confidence}%</span>
                  </div>
                  {idea.reasoning && (
                    <div className="text-[9px] kr dim mt-1 leading-relaxed">
                      💭 {idea.reasoning.substring(0, 100)}...
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
