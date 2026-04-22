"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";
import { relativeTime } from "@/lib/format";

const fetcher = safeFetcher;

interface SmartAlert {
  id: string;
  category: "market" | "portfolio" | "sector" | "earnings" | "technical";
  severity: "critical" | "warning" | "info" | "opportunity";
  title: string;
  icon: string;
  whatHappened: string;
  whyItMatters: string;
  whatToDo: string;
  affectedSymbols: string[];
  relatedToPortfolio: boolean;
  confidence: number;
  createdAt: string;
}

interface Data {
  success: boolean;
  summary: {
    total: number;
    critical: number;
    warning: number;
    opportunity: number;
    info: number;
    portfolioRelated: number;
  };
  alerts: SmartAlert[];
}

const SEVERITY_CONFIG = {
  critical: { color: "#ff3860", label: "CRITICAL", bg: "rgba(255,56,96,0.08)" },
  warning: { color: "#ffd93d", label: "WARNING", bg: "rgba(255,217,61,0.08)" },
  opportunity: { color: "#00ff88", label: "OPPORTUNITY", bg: "rgba(0,255,136,0.08)" },
  info: { color: "#7ec8ff", label: "INFO", bg: "rgba(126,200,255,0.08)" },
};

const CATEGORY_LABELS = {
  market: "📈 시장",
  portfolio: "💼 포트",
  sector: "🏭 섹터",
  earnings: "📅 실적",
  technical: "📊 기술",
};

export function SmartAlertsPanel() {
  const [viewMode, setViewMode] = useState<"live" | "history">("live");
  
  const { data, isLoading } = useSWR<Data>(
    viewMode === "live" ? "/api/smart-alerts" : null,
    fetcher,
    { refreshInterval: 2 * 60 * 1000 }  // 2분마다
  );
  
  const { data: historyData, isLoading: historyLoading } = useSWR<any>(
    viewMode === "history" ? "/api/smart-alerts-history?days=30" : null,
    fetcher
  );
  
  const [filter, setFilter] = useState<"all" | "portfolio" | "opportunity">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  
  if (viewMode === "live" && (isLoading || !data)) {
    return (
      <div className="p-4 border border-[var(--border)] rounded bg-black/20">
        <div className="text-[10px] dim kr">스마트 알림 분석 중...</div>
      </div>
    );
  }
  
  // ═══════════════════════════════════════
  // HISTORY VIEW
  // ═══════════════════════════════════════
  if (viewMode === "history") {
    const history = historyData?.records ?? [];
    const stats = historyData?.stats;
    const topFrequent = historyData?.topFrequent ?? [];
    
    return (
      <div className="space-y-3">
        {/* 모드 전환 */}
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode("live")}
            className="flex-1 text-[9px] px-2 py-1.5 border border-[var(--border)] rounded dim kr"
          >
            🔔 실시간
          </button>
          <button
            onClick={() => setViewMode("history")}
            className="flex-1 text-[9px] px-2 py-1.5 border border-[var(--amber)] rounded bg-[rgba(255,176,0,0.1)] tick font-bold kr"
          >
            📜 히스토리 (30일)
          </button>
        </div>
        
        {historyLoading ? (
          <div className="p-6 text-center dim text-[10px] kr">히스토리 로딩...</div>
        ) : !history.length ? (
          <div className="p-6 text-center dim text-[10px] kr">
            아직 히스토리 없음 (생성 후 24시간 이내)
          </div>
        ) : (
          <>
            {/* 통계 */}
            {stats && (
              <div className="p-3 border border-[var(--border)] rounded bg-[rgba(126,200,255,0.03)]">
                <div className="text-[10px] tick font-bold kr mb-2">📊 30일 통계</div>
                <div className="grid grid-cols-4 gap-2 text-[9px]">
                  <div>
                    <div className="dim kr">총 발생</div>
                    <div className="text-[14px] tick font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                      {stats.total}
                    </div>
                  </div>
                  <div>
                    <div className="dim kr">해결됨</div>
                    <div className="text-[14px] up font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                      {stats.resolved}
                    </div>
                  </div>
                  <div>
                    <div className="dim kr">확인함</div>
                    <div className="text-[14px] font-bold" style={{ color: "#7ec8ff", fontFamily: "'Bebas Neue', sans-serif" }}>
                      {stats.acknowledged}
                    </div>
                  </div>
                  <div>
                    <div className="dim kr">활성 중</div>
                    <div className="text-[14px] down font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                      {stats.active}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* 가장 자주 발생 */}
            {topFrequent.length > 0 && (
              <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]">
                <div className="text-[10px] tick font-bold kr mb-2">🔥 가장 자주 발생한 알림</div>
                <div className="space-y-1">
                  {topFrequent.map((f: any, i: number) => {
                    const sev = SEVERITY_CONFIG[f.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info;
                    return (
                      <div key={i} className="flex items-center justify-between gap-2 text-[10px] py-1 border-b border-[var(--border)]/50 last:border-b-0">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span
                            className="text-[8px] px-1.5 py-0.5 rounded font-bold"
                            style={{ background: sev.color, color: "#000" }}
                          >
                            {f.count}회
                          </span>
                          <span className="kr truncate">{f.title}</span>
                        </div>
                        <span className="text-[8px] dim kr flex-shrink-0">
                          {relativeTime(f.lastSeen)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* 리스트 */}
            <div className="space-y-1 max-h-[300px] overflow-y-auto">
              {history.slice(0, 30).map((h: any) => {
                const sev = SEVERITY_CONFIG[h.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info;
                return (
                  <div
                    key={h.id}
                    className="p-2 border rounded"
                    style={{
                      borderColor: sev.color + "40",
                      background: sev.bg,
                      opacity: h.is_resolved ? 0.6 : 1,
                    }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px]">{h.icon}</span>
                      <span
                        className="text-[8px] px-1.5 py-0.5 rounded font-bold"
                        style={{ background: sev.color, color: "#000" }}
                      >
                        {sev.label}
                      </span>
                      <span className="text-[10px] kr flex-1 truncate">{h.title}</span>
                      {h.is_resolved && (
                        <span className="text-[8px] up">✓ 해결</span>
                      )}
                      <span className="text-[8px] dim kr">
                        {relativeTime(h.first_seen_at)}
                      </span>
                    </div>
                    {h.occurrence_count > 1 && (
                      <div className="text-[8px] dim kr mt-0.5">
                        {h.occurrence_count}회 재발
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }
  
  if (!data) return null;
  
  const alerts = data.alerts ?? [];
  const filtered = alerts.filter(a => {
    if (filter === "portfolio") return a.relatedToPortfolio;
    if (filter === "opportunity") return a.severity === "opportunity";
    return true;
  });

  return (
    <div className="space-y-3">
      {/* 모드 전환 */}
      <div className="flex gap-1">
        <button
          onClick={() => setViewMode("live")}
          className="flex-1 text-[9px] px-2 py-1.5 border border-[var(--amber)] rounded bg-[rgba(255,176,0,0.1)] tick font-bold kr"
        >
          🔔 실시간
        </button>
        <button
          onClick={() => setViewMode("history")}
          className="flex-1 text-[9px] px-2 py-1.5 border border-[var(--border)] rounded dim kr"
        >
          📜 히스토리 (30일)
        </button>
      </div>
      
      {/* 요약 */}
      <div className="p-3 border border-[var(--border)] rounded bg-[rgba(126,200,255,0.04)]">
        <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
          <div>
            <div className="text-[11px] tick font-bold kr">🔔 스마트 알림</div>
            <div className="text-[9px] dim kr mt-0.5">
              뭐가 일어났고 · 왜 중요하고 · 뭘 해야 하나
            </div>
          </div>
          <div className="flex gap-1 flex-wrap">
            {[
              { id: "all", label: "전체", count: data.summary.total },
              { id: "portfolio", label: "내 포트", count: data.summary.portfolioRelated },
              { id: "opportunity", label: "기회", count: data.summary.opportunity },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as any)}
                className={`text-[9px] px-2 py-1 border rounded kr ${
                  filter === f.id
                    ? "border-[var(--amber)] tick font-bold"
                    : "border-[var(--border)] dim"
                }`}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
        </div>
        
        <div className="grid grid-cols-4 gap-2 text-[9px] pt-2 border-t border-[var(--border)]">
          <div>
            <div className="dim kr">Critical</div>
            <div className="text-[14px] down font-bold">{data.summary.critical}</div>
          </div>
          <div>
            <div className="dim kr">Warning</div>
            <div className="text-[14px] warn font-bold">{data.summary.warning}</div>
          </div>
          <div>
            <div className="dim kr">기회</div>
            <div className="text-[14px] up font-bold">{data.summary.opportunity}</div>
          </div>
          <div>
            <div className="dim kr">정보</div>
            <div className="text-[14px] tick font-bold">{data.summary.info}</div>
          </div>
        </div>
      </div>
      
      {/* 알림 리스트 */}
      {filtered.length === 0 ? (
        <div className="p-6 text-center border border-[var(--border)] rounded bg-black/20">
          <div className="text-[10px] dim kr">현재 스마트 알림 없음. 시장 평온 중.</div>
        </div>
      ) : (
        filtered.map(a => {
          const sev = SEVERITY_CONFIG[a.severity];
          const isExpanded = expanded === a.id;
          
          return (
            <div
              key={a.id}
              className="border rounded overflow-hidden transition-all cursor-pointer"
              style={{
                borderColor: sev.color + "60",
                background: sev.bg,
              }}
              onClick={() => setExpanded(isExpanded ? null : a.id)}
            >
              {/* 헤더 */}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <span className="text-[20px] leading-none flex-shrink-0">{a.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className="text-[9px] px-1.5 py-0.5 rounded font-bold kr"
                          style={{ background: sev.color, color: "#000" }}
                        >
                          {sev.label}
                        </span>
                        <span className="text-[9px] dim kr">
                          {CATEGORY_LABELS[a.category]}
                        </span>
                        {a.relatedToPortfolio && (
                          <span className="text-[8px] tick font-bold kr">⭐ 내 포트</span>
                        )}
                        <span className="text-[9px] dim ml-auto">
                          {relativeTime(a.createdAt)}
                        </span>
                      </div>
                      <div className="text-[12px] kr font-bold" style={{ color: sev.color }}>
                        {a.title}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div 
                      className="text-[14px] font-bold"
                      style={{ 
                        fontFamily: "'Bebas Neue', sans-serif",
                        color: a.confidence >= 80 ? "#00ff88" : a.confidence >= 60 ? "#ffd93d" : "#ff3860"
                      }}
                    >
                      {a.confidence}
                    </div>
                    <div className="text-[8px] dim kr">신뢰도</div>
                  </div>
                </div>
                
                {/* 영향 받는 종목 */}
                {a.affectedSymbols.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {a.affectedSymbols.slice(0, 5).map((sym, i) => (
                      <span
                        key={i}
                        className="text-[9px] px-1.5 py-0.5 rounded tick font-bold bg-black/30"
                      >
                        {sym}
                      </span>
                    ))}
                  </div>
                )}
                
                {!isExpanded && (
                  <div className="text-[10px] dim kr mt-1 italic">
                    클릭하여 상세 분석 보기 →
                  </div>
                )}
              </div>
              
              {/* 3-layer 확장 */}
              {isExpanded && (
                <div className="border-t px-3 py-3 space-y-3" style={{ borderColor: sev.color + "40" }}>
                  {/* WHAT */}
                  <div className="p-2 rounded border-l-4" style={{ borderLeftColor: "#7ec8ff", background: "rgba(126,200,255,0.06)" }}>
                    <div className="text-[9px] font-bold kr mb-1" style={{ color: "#7ec8ff" }}>
                      🔵 WHAT · 무슨 일이?
                    </div>
                    <div className="text-[10px] kr leading-relaxed">
                      {a.whatHappened}
                    </div>
                  </div>
                  
                  {/* WHY */}
                  <div className="p-2 rounded border-l-4" style={{ borderLeftColor: "#ffd93d", background: "rgba(255,217,61,0.06)" }}>
                    <div className="text-[9px] font-bold kr mb-1" style={{ color: "#ffd93d" }}>
                      🟡 WHY · 왜 중요한가?
                    </div>
                    <div className="text-[10px] kr leading-relaxed">
                      {a.whyItMatters}
                    </div>
                  </div>
                  
                  {/* WHAT TO DO */}
                  <div className="p-2 rounded border-l-4" style={{ borderLeftColor: "#00ff88", background: "rgba(0,255,136,0.06)" }}>
                    <div className="text-[9px] font-bold kr mb-1" style={{ color: "#00ff88" }}>
                      🟢 ACTION · 지금 뭘 해야?
                    </div>
                    <div className="text-[10px] kr leading-relaxed whitespace-pre-line">
                      {a.whatToDo}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
      
      <div className="text-[9px] dim kr p-2 border border-[var(--border)]/50 rounded bg-black/10 flex items-center justify-between">
        <span>💡 2분마다 자동 재분석 · 매크로 + 포트 + 섹터 통합 감지</span>
      </div>
    </div>
  );
}
