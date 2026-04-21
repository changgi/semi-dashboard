"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";

const fetcher = safeFetcher;

interface RiskFlag {
  severity: "critical" | "warning" | "info";
  type: string;
  title: string;
  description: string;
  affectedValue: number;
}

interface ActionPlan {
  priority: 1 | 2 | 3 | 4;
  title: string;
  symbol: string;
  actionType: "sell_full" | "sell_partial" | "hold_watch" | "rebalance";
  shares?: number;
  reasoning: string;
  expectedCashUsd?: number;
  lossRealized?: number;
  urgency: "today" | "this_week" | "next_week";
}

interface DiagnosisData {
  success: boolean;
  empty?: boolean;
  summary: {
    totalValueUsd: number;
    totalCostUsd: number;
    totalGainUsd: number;
    totalGainPct: number;
    positionCount: number;
    healthScore: number;
    healthGrade: "healthy" | "caution" | "warning" | "critical";
    usdKrwRate: number;
  };
  concentration: {
    byAsset: Array<{ asset: string; valueUsd: number; pct: number; effectiveExposureUsd: number; symbols: string[] }>;
    leveragePct: number;
    spotPct: number;
    byCountry: Array<{ country: string; valueUsd: number; pct: number }>;
  };
  positions: Array<any>;
  risks: RiskFlag[];
  earningsImpact: Array<{
    date: string;
    daysUntil: number;
    symbol: string;
    name: string;
    timing: string;
    importance: number;
    affectedPositions: Array<{ symbol: string; name: string; exposureType: string; multiplier: number }>;
    totalExposureUsd: number;
  }>;
  actions: ActionPlan[];
}

const GRADE_COLORS = {
  healthy: { fg: "#00ff88", bg: "rgba(0,255,136,0.08)", label: "HEALTHY", kr: "양호" },
  caution: { fg: "#ffd93d", bg: "rgba(255,217,61,0.08)", label: "CAUTION", kr: "주의" },
  warning: { fg: "#ffb000", bg: "rgba(255,176,0,0.08)", label: "WARNING", kr: "경고" },
  critical: { fg: "#ff3860", bg: "rgba(255,56,96,0.08)", label: "CRITICAL", kr: "위험" },
} as const;

const URGENCY_LABELS = {
  today: { fg: "#ff3860", label: "오늘" },
  this_week: { fg: "#ffd93d", label: "이번 주" },
  next_week: { fg: "#7ec8ff", label: "다음 주" },
} as const;

export function PortfolioDiagnosisPanel() {
  const { data, isLoading } = useSWR<DiagnosisData>(
    "/api/portfolio-diagnosis",
    fetcher,
    { refreshInterval: 60000 }
  );
  
  const [activeTab, setActiveTab] = useState<"overview" | "risks" | "actions" | "earnings">("overview");

  if (isLoading || !data) {
    return (
      <div className="p-4 border border-[var(--border)] rounded bg-black/20">
        <div className="text-[10px] dim kr">포트 진단 분석 중...</div>
      </div>
    );
  }
  
  if (data.empty) {
    return (
      <div className="p-6 border border-[var(--border)] rounded bg-black/20 text-center">
        <div className="text-[11px] dim kr">보유 중인 종목이 없습니다</div>
      </div>
    );
  }
  
  const grade = GRADE_COLORS[data.summary.healthGrade];

  return (
    <div className="space-y-3">
      {/* 헬스 스코어 헤더 */}
      <div
        className="p-4 rounded border"
        style={{ borderColor: grade.fg, background: grade.bg }}
      >
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <div className="text-[9px] dim kr mb-1">PORTFOLIO HEALTH</div>
            <div className="flex items-baseline gap-3">
              <div
                className="text-[42px] font-bold leading-none"
                style={{ color: grade.fg, fontFamily: "'Bebas Neue', sans-serif" }}
              >
                {data.summary.healthScore}
              </div>
              <div className="text-[11px] dim">/100</div>
              <div
                className="text-[10px] px-2 py-1 font-bold kr"
                style={{ background: grade.fg, color: "#000" }}
              >
                {grade.label} · {grade.kr}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] dim kr mb-1">TOTAL P&L</div>
            <div
              className="text-[22px] font-bold leading-none"
              style={{ color: data.summary.totalGainPct >= 0 ? "var(--green)" : "var(--red)", fontFamily: "'Bebas Neue', sans-serif" }}
            >
              {data.summary.totalGainPct >= 0 ? "+" : ""}{data.summary.totalGainPct.toFixed(2)}%
            </div>
            <div className="text-[10px] tick mt-1">
              ${data.summary.totalGainUsd >= 0 ? "+" : ""}{data.summary.totalGainUsd.toLocaleString()}
            </div>
          </div>
        </div>
        
        {/* 서브 통계 */}
        <div className="grid grid-cols-3 gap-2 text-[9px] pt-2 border-t border-[var(--border)]">
          <div>
            <div className="dim kr">평가액</div>
            <div className="text-[12px] tick font-bold">${data.summary.totalValueUsd.toLocaleString()}</div>
          </div>
          <div>
            <div className="dim kr">레버리지</div>
            <div className={`text-[12px] font-bold ${data.concentration.leveragePct >= 50 ? "down" : data.concentration.leveragePct >= 30 ? "warn" : "up"}`}>
              {data.concentration.leveragePct.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="dim kr">포지션</div>
            <div className="text-[12px] tick font-bold">{data.summary.positionCount}개</div>
          </div>
        </div>
      </div>

      {/* 탭 네비 */}
      <div className="flex gap-1 border-b border-[var(--border)]">
        {[
          { id: "overview", label: "📊 개요", count: null },
          { id: "risks", label: "⚠ 리스크", count: data.risks.length },
          { id: "actions", label: "🎯 액션", count: data.actions.length },
          { id: "earnings", label: "📅 실적", count: data.earningsImpact.length },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-3 py-2 text-[10px] kr border-b-2 transition-colors ${
              activeTab === t.id
                ? "border-[var(--amber)] text-[var(--amber-bright)]"
                : "border-transparent dim hover:text-[var(--text)]"
            }`}
          >
            {t.label}
            {t.count !== null && t.count > 0 && (
              <span className="ml-1 px-1 rounded text-[8px] bg-[rgba(255,176,0,0.15)] tick">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* 탭 컨텐츠 */}
      <div>
        {activeTab === "overview" && <OverviewTab data={data} />}
        {activeTab === "risks" && <RisksTab risks={data.risks} />}
        {activeTab === "actions" && <ActionsTab actions={data.actions} />}
        {activeTab === "earnings" && <EarningsTab impacts={data.earningsImpact} />}
      </div>
    </div>
  );
}

function OverviewTab({ data }: { data: DiagnosisData }) {
  return (
    <div className="space-y-3">
      {/* 기초자산별 집중도 */}
      <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]">
        <div className="text-[10px] tick font-bold kr mb-2">🎯 기초자산별 집중도</div>
        <div className="space-y-2">
          {data.concentration.byAsset.slice(0, 5).map((c, i) => {
            const barColor = c.pct >= 50 ? "#ff3860" : c.pct >= 30 ? "#ffd93d" : c.pct >= 15 ? "#ffb000" : "#00ff88";
            return (
              <div key={c.asset}>
                <div className="flex justify-between items-center text-[10px] mb-1">
                  <div className="flex items-center gap-2">
                    <span className="tick font-bold">{c.asset}</span>
                    <span className="dim">{c.symbols.length > 1 && `(${c.symbols.join("+")})`}</span>
                  </div>
                  <div className="kr" style={{ color: barColor, fontWeight: 700 }}>
                    {c.pct.toFixed(1)}%
                  </div>
                </div>
                <div className="h-2 bg-black/40 rounded overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${Math.min(c.pct, 100)}%`, background: barColor }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 레버리지 vs 본주 */}
      <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]">
        <div className="text-[10px] tick font-bold kr mb-2">⚡ 상품 유형별</div>
        <div className="flex h-5 rounded overflow-hidden border border-[var(--border)]">
          <div
            className="flex items-center justify-center text-[9px] font-bold"
            style={{ width: `${data.concentration.leveragePct}%`, background: "#ff3860", color: "#000" }}
          >
            {data.concentration.leveragePct >= 15 && `LEV ${data.concentration.leveragePct.toFixed(1)}%`}
          </div>
          <div
            className="flex items-center justify-center text-[9px] font-bold"
            style={{ width: `${data.concentration.spotPct}%`, background: "#00ff88", color: "#000" }}
          >
            {data.concentration.spotPct >= 15 && `SPOT ${data.concentration.spotPct.toFixed(1)}%`}
          </div>
        </div>
      </div>

      {/* 포지션 리스트 */}
      <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]">
        <div className="text-[10px] tick font-bold kr mb-2">📋 전체 포지션</div>
        <div className="space-y-1">
          {data.positions.map((p: any) => (
            <div
              key={p.symbol}
              className="flex justify-between items-center py-1.5 px-2 rounded text-[10px] hover:bg-[rgba(255,176,0,0.04)]"
              style={{ borderLeft: `3px solid ${p.gainPct <= -30 ? "#ff3860" : p.gainPct <= -15 ? "#ffd93d" : p.gainPct >= 0 ? "#00ff88" : "rgba(255,255,255,0.1)"}` }}
            >
              <div className="flex-1 min-w-0">
                <SymbolDisplay
                  meta={{ symbol: p.symbol, displayName: p.name, country: p.country }}
                  size="xs"
                  variant="inline"
                  showBadges={false}
                />
                <div className="text-[9px] dim kr mt-0.5">
                  {p.shares}주 @ ${p.avgCost.toFixed(2)} {p.isLeverage && `· ${p.leverageMultiplier}x`}
                </div>
              </div>
              <div className="text-right">
                <div className="tick font-bold">${p.marketValueUsd.toFixed(0)}</div>
                <div className={`text-[9px] font-bold ${p.gainPct >= 0 ? "up" : "down"}`}>
                  {p.gainPct >= 0 ? "+" : ""}{p.gainPct.toFixed(1)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RisksTab({ risks }: { risks: RiskFlag[] }) {
  if (risks.length === 0) {
    return (
      <div className="p-6 text-center border border-[var(--border)] rounded bg-[rgba(0,255,136,0.04)]">
        <div className="text-[11px] up kr">✓ 감지된 리스크 없음</div>
      </div>
    );
  }
  
  const severityConfig = {
    critical: { color: "#ff3860", bg: "rgba(255,56,96,0.08)", icon: "🚨", label: "CRITICAL" },
    warning: { color: "#ffd93d", bg: "rgba(255,217,61,0.08)", icon: "⚠️", label: "WARNING" },
    info: { color: "#7ec8ff", bg: "rgba(126,200,255,0.08)", icon: "ℹ️", label: "INFO" },
  };
  
  return (
    <div className="space-y-2">
      {risks.map((r, i) => {
        const cfg = severityConfig[r.severity];
        return (
          <div
            key={i}
            className="p-3 rounded border-l-4"
            style={{ borderLeftColor: cfg.color, background: cfg.bg, borderColor: cfg.color, border: `1px solid ${cfg.color}40`, borderLeftWidth: "4px" }}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[14px]">{cfg.icon}</span>
                <span className="text-[12px] kr font-bold" style={{ color: cfg.color }}>
                  {r.title}
                </span>
              </div>
              <span
                className="text-[8px] px-1.5 py-0.5 font-bold rounded"
                style={{ background: cfg.color, color: "#000" }}
              >
                {cfg.label}
              </span>
            </div>
            <div className="text-[11px] kr leading-relaxed" style={{ color: "var(--text)" }}>
              {r.description}
            </div>
            {r.affectedValue > 0 && (
              <div className="text-[9px] dim kr mt-2 pt-2 border-t border-[var(--border)]">
                영향 금액: <b className="tick">${r.affectedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActionsTab({ actions }: { actions: ActionPlan[] }) {
  if (actions.length === 0) {
    return (
      <div className="p-6 text-center border border-[var(--border)] rounded bg-[rgba(0,255,136,0.04)]">
        <div className="text-[11px] up kr">✓ 현재 긴급 액션 없음</div>
      </div>
    );
  }
  
  const priorityColors = {
    1: "#ff3860",
    2: "#ffd93d",
    3: "#ffb000",
    4: "#7ec8ff",
  };
  
  const actionTypeLabels = {
    sell_full: { label: "전량 매도", color: "#ff3860" },
    sell_partial: { label: "부분 매도", color: "#ffd93d" },
    hold_watch: { label: "관망 유지", color: "#7ec8ff" },
    rebalance: { label: "리밸런싱", color: "#00ff88" },
  };
  
  return (
    <div className="space-y-2">
      {actions.map((a, i) => {
        const pColor = priorityColors[a.priority];
        const typeCfg = actionTypeLabels[a.actionType];
        const urgency = URGENCY_LABELS[a.urgency];
        return (
          <div
            key={i}
            className="p-3 border rounded bg-[var(--bg-card,#141414)]"
            style={{ borderLeftColor: pColor, borderLeftWidth: "4px" }}
          >
            <div className="flex items-start gap-3 mb-2">
              <div
                className="text-[26px] font-bold leading-none"
                style={{ color: pColor, fontFamily: "'Bebas Neue', sans-serif", minWidth: "44px" }}
              >
                P{a.priority}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[12px] kr font-bold bright">
                    {a.title}
                  </span>
                  <span
                    className="text-[8px] px-1.5 py-0.5 font-bold rounded kr"
                    style={{ background: typeCfg.color + "30", color: typeCfg.color }}
                  >
                    {typeCfg.label}
                  </span>
                  <span
                    className="text-[8px] px-1.5 py-0.5 font-bold rounded kr"
                    style={{ background: urgency.fg + "30", color: urgency.fg }}
                  >
                    {urgency.label}
                  </span>
                </div>
                <div className="text-[10px] kr leading-relaxed" style={{ color: "var(--text)" }}>
                  {a.reasoning}
                </div>
              </div>
            </div>
            {(a.expectedCashUsd !== undefined || a.lossRealized !== undefined) && (
              <div className="mt-2 pt-2 border-t border-[var(--border)] grid grid-cols-3 gap-2 text-[9px]">
                {a.shares !== undefined && (
                  <div>
                    <div className="dim kr">매도 주수</div>
                    <div className="tick font-bold text-[11px]">{a.shares}주</div>
                  </div>
                )}
                {a.expectedCashUsd !== undefined && (
                  <div>
                    <div className="dim kr">확보 현금</div>
                    <div className="up font-bold text-[11px]">${a.expectedCashUsd.toFixed(0)}</div>
                  </div>
                )}
                {a.lossRealized !== undefined && (
                  <div>
                    <div className="dim kr">확정 손익</div>
                    <div className={`font-bold text-[11px] ${a.lossRealized >= 0 ? "up" : "down"}`}>
                      {a.lossRealized >= 0 ? "+" : ""}${a.lossRealized.toFixed(0)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EarningsTab({ impacts }: { impacts: DiagnosisData["earningsImpact"] }) {
  if (impacts.length === 0) {
    return (
      <div className="p-6 text-center border border-[var(--border)] rounded bg-black/20">
        <div className="text-[11px] dim kr">14일 내 실적 이벤트 없음</div>
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      {impacts.map((imp, i) => {
        const urgency = imp.daysUntil <= 1 ? "#ff3860" : imp.daysUntil <= 3 ? "#ffd93d" : "#ffb000";
        return (
          <div
            key={i}
            className="p-3 border rounded bg-[var(--bg-card,#141414)]"
            style={{ borderLeftColor: urgency, borderLeftWidth: "4px" }}
          >
            <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <div
                  className="text-[18px] font-bold leading-none"
                  style={{ color: urgency, fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  D-{imp.daysUntil}
                </div>
                <div>
                  <div className="text-[11px] kr font-bold">
                    <span className="tick font-bold">{imp.symbol}</span> · {imp.name}
                  </div>
                  <div className="text-[9px] dim">{imp.date} · {imp.timing} · ★{imp.importance}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[8px] dim kr">영향 금액</div>
                <div className="text-[12px] tick font-bold">${imp.totalExposureUsd.toFixed(0)}</div>
              </div>
            </div>
            <div className="text-[9px] dim kr mb-1 pt-2 border-t border-[var(--border)]">영향 받는 포지션:</div>
            <div className="flex flex-wrap gap-1">
              {imp.affectedPositions.map((ap, j) => (
                <span
                  key={j}
                  className="text-[9px] px-2 py-0.5 rounded kr font-bold"
                  style={{
                    background: ap.exposureType === "direct" ? "rgba(255,56,96,0.2)" :
                                ap.exposureType === "leverage" ? "rgba(255,176,0,0.2)" :
                                "rgba(126,200,255,0.2)",
                    color: ap.exposureType === "direct" ? "#ff3860" :
                           ap.exposureType === "leverage" ? "#ffb000" : "#7ec8ff",
                  }}
                >
                  {ap.symbol} {ap.multiplier > 1 && `·${ap.multiplier}x`}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
