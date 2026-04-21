"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";

const fetcher = safeFetcher;

// ───────────────────────────────────────────────────────────
// 타입
// ───────────────────────────────────────────────────────────
interface EarningsWatch {
  symbol: string;
  name: string;
  earningsDate: string;
  daysUntil: number;
  quarter: string;
  importance: number;
  currentPrice: number | null;
  dayChangePct: number | null;
  week52High: number | null;
  week52Low: number | null;
  distanceFromHigh: number | null;
  distanceFromLow: number | null;
  volatility30d: number | null;
  priceChange7d: number | null;
  priceChange30d: number | null;
  expectedMove: number | null;
  supportLevel: number | null;
  resistanceLevel: number | null;
  portfolioImpact: "direct" | "indirect" | "none";
  affectedETFs: string[];
  preEarningsAction: string;
  riskLevel: "high" | "medium" | "low";
}

interface EarningsData {
  success: boolean;
  totalWatched: number;
  thisWeek: EarningsWatch[];
  upcoming: EarningsWatch[];
  passed: EarningsWatch[];
  directImpact: EarningsWatch[];
  indirectImpact: EarningsWatch[];
  highRisk: EarningsWatch[];
  insights: string[];
  watchlist: EarningsWatch[];
}

// ═══════════════════════════════════════════════════════════
// 메인 컴포넌트
// ═══════════════════════════════════════════════════════════
export function EarningsMonitorPanel() {
  const [filter, setFilter] = useState<"all" | "week" | "direct" | "risk">("week");

  const { data, isLoading } = useSWR<EarningsData>(
    "/api/earnings-monitor",
    fetcher,
    { refreshInterval: 900000 } // 15분
  );

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-16">
        <div className="text-[11px] dim kr">📊 실적 모니터 분석 중...</div>
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

  // 필터링
  let filtered: EarningsWatch[] = [];
  if (filter === "all") filtered = data.watchlist ?? [];
  else if (filter === "week") filtered = data.thisWeek ?? [];
  else if (filter === "direct") filtered = [...(data.directImpact ?? []), ...(data.indirectImpact ?? [])];
  else if (filter === "risk") filtered = data.highRisk ?? [];

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            📊 EARNINGS MONITOR · 실적 발표 대응
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            주요 기업 실적 추적 · 포트 영향 분석 · 실적 전후 전략
          </div>
        </div>
      </div>

      {/* ═════════ 핵심 지표 ═════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <StatCard
          icon="📅"
          label="이번 주"
          value={(data.thisWeek ?? []).length}
          color="#ffaa44"
        />
        <StatCard
          icon="🎯"
          label="직접 영향"
          value={(data.directImpact ?? []).length}
          color="#ff3860"
        />
        <StatCard
          icon="🔗"
          label="간접 영향"
          value={(data.indirectImpact ?? []).length}
          color="#aaccff"
        />
        <StatCard
          icon="⚠️"
          label="고위험"
          value={(data.highRisk ?? []).length}
          color="#ff6644"
        />
      </div>

      {/* ═════════ 인사이트 ═════════ */}
      {(data.insights ?? []).length > 0 && (
        <div className="mb-3 p-3 border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded">
          <div className="text-[10px] tick kr font-bold mb-2">💡 핵심 인사이트</div>
          {(data.insights ?? []).map((ins, i) => (
            <div key={i} className="text-[10px] kr mb-1 leading-relaxed">{ins}</div>
          ))}
        </div>
      )}

      {/* ═════════ 필터 ═════════ */}
      <div className="mb-3 flex items-center gap-1 flex-wrap border-b border-[var(--border)] pb-1">
        <FilterBtn label={`📆 이번 주 (${(data.thisWeek ?? []).length})`} active={filter === "week"} onClick={() => setFilter("week")} />
        <FilterBtn label={`🎯 포트 영향 (${(data.directImpact ?? []).length + (data.indirectImpact ?? []).length})`} active={filter === "direct"} onClick={() => setFilter("direct")} />
        <FilterBtn label={`⚠️ 고위험 (${(data.highRisk ?? []).length})`} active={filter === "risk"} onClick={() => setFilter("risk")} />
        <FilterBtn label="전체" active={filter === "all"} onClick={() => setFilter("all")} />
      </div>

      {/* ═════════ 실적 카드 리스트 ═════════ */}
      {filtered.length === 0 ? (
        <div className="text-[10px] dim text-center py-10 kr border border-dashed border-[var(--border)] rounded">
          해당 조건의 실적 발표 예정 없음
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 15).map((w) => (
            <EarningsCard key={w.symbol} w={w} />
          ))}
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        <span className="bright">💡 Expected Move</span>: 30일 변동성 기반 예상 변동폭 (근사치) · <span className="bright">실적 후 실제</span>는 더 큰 경우 많음<br />
        <span className="bright">🎯 직접</span>: 내 포트에 해당 종목 보유 · <span className="bright">🔗 간접</span>: ETF 통해 영향 받음
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Stat Card
// ═══════════════════════════════════════════════════════════
function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div
      className="border rounded p-2 text-center"
      style={{ borderColor: `${color}40`, background: `${color}08` }}
    >
      <div className="text-[16px]">{icon}</div>
      <div className="text-[8px] dim kr">{label}</div>
      <div className="text-[16px] font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

// ═══════════════════════════════════════════════════════════
// Earnings Card
// ═══════════════════════════════════════════════════════════
function EarningsCard({ w }: { w: EarningsWatch }) {
  const [expanded, setExpanded] = useState(false);

  const impactColor =
    w.portfolioImpact === "direct" ? "#ff3860" :
    w.portfolioImpact === "indirect" ? "#ffaa44" :
    "#6b7a6c";
  const impactLabel =
    w.portfolioImpact === "direct" ? "🎯 직접 영향" :
    w.portfolioImpact === "indirect" ? "🔗 간접 영향" :
    "👁️ 관망";

  const urgency =
    w.daysUntil < 0 ? "passed" :
    w.daysUntil === 0 ? "today" :
    w.daysUntil <= 2 ? "immediate" :
    w.daysUntil <= 7 ? "soon" :
    "later";

  const urgencyColor =
    urgency === "today" ? "#ff3860" :
    urgency === "immediate" ? "#ff6644" :
    urgency === "soon" ? "#ffaa44" :
    "#aaaaaa";

  const riskColor =
    w.riskLevel === "high" ? "#ff3860" :
    w.riskLevel === "medium" ? "#ffaa44" :
    "#00ff88";

  return (
    <div
      className="border-l-4 rounded-r p-3 hover:bg-[rgba(255,255,255,0.02)] transition-all cursor-pointer"
      style={{
        borderLeftColor: impactColor,
        background: urgency === "today" || urgency === "immediate" ? `${urgencyColor}08` : "transparent",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* 왼쪽: 심볼 + 이름 + 날짜 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={`/stock/${w.symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hover:opacity-80"
            >
              <SymbolDisplay
                meta={{ symbol: w.symbol, displayName: w.name }}
                size="md"
                variant="inline"
                showFlag={true}
                showBadges={false}
              />
            </a>
            <span
              className="text-[8px] px-1.5 py-0.5 rounded kr font-bold"
              style={{ background: impactColor, color: "white" }}
            >
              {impactLabel}
            </span>
            {w.importance >= 5 && (
              <span className="text-[8px] px-1.5 py-0.5 bg-[#ff3860] text-white rounded kr font-bold">
                ★ 5
              </span>
            )}
            {w.riskLevel === "high" && (
              <span className="text-[8px] px-1.5 py-0.5 rounded kr font-bold" style={{ background: riskColor, color: "#111" }}>
                🚨 고위험
              </span>
            )}
          </div>
          <div className="text-[9px] dim kr mt-1">
            {w.earningsDate} · {w.quarter}
          </div>
        </div>

        {/* 오른쪽: 가격 + D-Day */}
        <div className="flex-shrink-0 text-right">
          {w.currentPrice !== null && (
            <div className="text-[13px] tick font-bold">${w.currentPrice.toFixed(2)}</div>
          )}
          {w.dayChangePct !== null && (
            <div className={`text-[10px] font-bold ${w.dayChangePct >= 0 ? "up" : "down"}`}>
              {w.dayChangePct >= 0 ? "+" : ""}{w.dayChangePct.toFixed(2)}%
            </div>
          )}
          <div
            className="text-[13px] font-bold mt-1"
            style={{ color: urgencyColor }}
          >
            {w.daysUntil < 0 ? `${Math.abs(w.daysUntil)}일 전` : w.daysUntil === 0 ? "오늘!" : `D-${w.daysUntil}`}
          </div>
        </div>
      </div>

      {/* 추천 액션 */}
      <div
        className="mt-2 p-2 rounded text-[10px] kr leading-relaxed"
        style={{ background: `${riskColor}10`, color: riskColor }}
      >
        {w.preEarningsAction}
      </div>

      {/* 상세 정보 (클릭 시) */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px]">
            <StatMini label="52주 최고" value={w.week52High !== null ? `$${w.week52High.toFixed(2)}` : "-"} subtitle={w.distanceFromHigh !== null ? `${w.distanceFromHigh.toFixed(1)}%` : ""} color={w.distanceFromHigh && w.distanceFromHigh > -5 ? "#ffaa44" : undefined} />
            <StatMini label="52주 최저" value={w.week52Low !== null ? `$${w.week52Low.toFixed(2)}` : "-"} subtitle={w.distanceFromLow !== null ? `+${w.distanceFromLow.toFixed(1)}%` : ""} />
            <StatMini label="30일 변동성" value={w.volatility30d !== null ? `${w.volatility30d.toFixed(1)}%` : "-"} color={w.volatility30d && w.volatility30d > 40 ? "#ff6644" : undefined} />
            <StatMini label="예상 변동" value={w.expectedMove !== null ? `±$${w.expectedMove.toFixed(2)}` : "-"} subtitle="실적 후" />
            <StatMini label="7일 변화" value={w.priceChange7d !== null ? `${w.priceChange7d >= 0 ? "+" : ""}${w.priceChange7d.toFixed(1)}%` : "-"} color={w.priceChange7d && w.priceChange7d >= 0 ? "#00ff88" : "#ff3860"} />
            <StatMini label="30일 변화" value={w.priceChange30d !== null ? `${w.priceChange30d >= 0 ? "+" : ""}${w.priceChange30d.toFixed(1)}%` : "-"} color={w.priceChange30d && w.priceChange30d >= 0 ? "#00ff88" : "#ff3860"} />
            <StatMini label="지지선" value={w.supportLevel !== null ? `$${w.supportLevel.toFixed(2)}` : "-"} color="#00ff88" />
            <StatMini label="저항선" value={w.resistanceLevel !== null ? `$${w.resistanceLevel.toFixed(2)}` : "-"} color="#ff3860" />
          </div>
          
          {/* 영향 받는 ETF */}
          {(w.affectedETFs ?? []).length > 0 && (
            <div className="mt-2 text-[9px] dim kr">
              📌 연관 ETF: {(w.affectedETFs ?? []).map((etf) => (
                <a
                  key={etf}
                  href={`/stock/${etf}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="mx-1 tick hover:bright"
                >
                  {etf}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatMini({ label, value, subtitle, color }: { label: string; value: string; subtitle?: string; color?: string }) {
  return (
    <div className="border border-[var(--border)] rounded p-1.5">
      <div className="text-[8px] dim kr">{label}</div>
      <div className="text-[11px] font-bold" style={{ color: color || "inherit" }}>{value}</div>
      {subtitle && <div className="text-[8px] dim">{subtitle}</div>}
    </div>
  );
}
