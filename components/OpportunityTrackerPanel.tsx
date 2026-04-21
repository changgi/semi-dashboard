"use client";

import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";

const fetcher = safeFetcher;

interface Data {
  success: boolean;
  empty?: boolean;
  hasData: boolean;
  message?: string;
  summary: {
    trackedSymbols: number;
    totalScans: number;
    winRate: number;
    avgReturn: number;
    avgWinner: number;
    avgLoser: number;
    confidenceScore: number;
    confidenceGrade: "high" | "medium" | "low";
  };
  bySignal: Record<string, { count: number; winRate: number; avgReturn: number }>;
  topWinners: any[];
  topLosers: any[];
  performance: any[];
}

const SIGNAL_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  momentum: { label: "모멘텀", icon: "🚀", color: "#00ff88" },
  oversold_bounce: { label: "과매도반등", icon: "💎", color: "#7ec8ff" },
  breakout: { label: "돌파", icon: "⚡", color: "#ffd93d" },
  pre_earnings: { label: "실적전", icon: "📊", color: "#ffb000" },
  value: { label: "가치", icon: "🏛️", color: "#c084fc" },
};

export function OpportunityTrackerPanel() {
  const { data, isLoading } = useSWR<Data>(
    "/api/opportunity-tracker",
    fetcher,
    { refreshInterval: 10 * 60 * 1000 }
  );
  
  if (isLoading || !data) {
    return (
      <div className="p-4 border border-[var(--border)] rounded bg-black/20">
        <div className="text-[10px] dim kr">성과 추적 로딩 중...</div>
      </div>
    );
  }
  
  if (data.empty || !data.hasData) {
    return (
      <div className="p-6 border border-[var(--border)] rounded bg-black/20 text-center">
        <div className="text-[11px] dim kr mb-2">📊 성과 추적 데이터 축적 중</div>
        <div className="text-[9px] dim kr">{data.message}</div>
        <div className="text-[9px] dim kr mt-2">
          기회 탐지기를 며칠 사용하면 시스템의 실제 정확도가 여기에 표시됩니다
        </div>
      </div>
    );
  }
  
  const s = data.summary;
  const gradeColor = s.confidenceGrade === "high" ? "#00ff88" : s.confidenceGrade === "medium" ? "#ffd93d" : "#ff3860";
  const gradeLabel = s.confidenceGrade === "high" ? "HIGH" : s.confidenceGrade === "medium" ? "MEDIUM" : "LOW";

  return (
    <div className="space-y-3">
      {/* 신뢰도 헤더 */}
      <div
        className="p-3 rounded border-2"
        style={{ borderColor: gradeColor, background: `${gradeColor}0a` }}
      >
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="text-[9px] dim kr">SYSTEM CONFIDENCE</div>
            <div className="flex items-baseline gap-2 mt-1">
              <div
                className="text-[36px] font-bold leading-none"
                style={{ color: gradeColor, fontFamily: "'Bebas Neue', sans-serif" }}
              >
                {s.confidenceScore}
              </div>
              <div className="text-[10px] dim">/100</div>
              <div
                className="text-[9px] px-2 py-0.5 font-bold kr rounded"
                style={{ background: gradeColor, color: "#000" }}
              >
                {gradeLabel}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] dim kr">승률</div>
            <div 
              className="text-[22px] font-bold leading-none mt-1"
              style={{ color: s.winRate >= 60 ? "#00ff88" : s.winRate >= 50 ? "#ffd93d" : "#ff3860", fontFamily: "'Bebas Neue', sans-serif" }}
            >
              {s.winRate.toFixed(1)}%
            </div>
            <div className="text-[9px] dim mt-1">
              {s.trackedSymbols}종목 추적
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2 text-[9px] pt-2 border-t border-[var(--border)]">
          <div>
            <div className="dim kr">평균 수익률</div>
            <div className={`text-[12px] font-bold ${s.avgReturn >= 0 ? "up" : "down"}`}>
              {s.avgReturn >= 0 ? "+" : ""}{s.avgReturn.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="dim kr">성공 종목 평균</div>
            <div className="text-[12px] up font-bold">
              +{s.avgWinner.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="dim kr">실패 종목 평균</div>
            <div className="text-[12px] down font-bold">
              {s.avgLoser.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>
      
      {/* 시그널별 성과 */}
      <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]">
        <div className="text-[10px] tick font-bold kr mb-2">📡 시그널 타입별 적중률</div>
        <div className="space-y-2">
          {Object.entries(data.bySignal).sort((a, b) => b[1].winRate - a[1].winRate).map(([sig, perf]) => {
            const cfg = SIGNAL_LABELS[sig] ?? { label: sig, icon: "📊", color: "#aaa" };
            return (
              <div key={sig}>
                <div className="flex justify-between items-center text-[10px] mb-1">
                  <div className="flex items-center gap-2">
                    <span>{cfg.icon}</span>
                    <span className="kr font-bold" style={{ color: cfg.color }}>
                      {cfg.label}
                    </span>
                    <span className="dim text-[9px]">({perf.count}건)</span>
                  </div>
                  <div className="flex gap-3 text-[9px]">
                    <span>승률 <b style={{ color: perf.winRate >= 60 ? "#00ff88" : perf.winRate >= 50 ? "#ffd93d" : "#ff3860" }}>{perf.winRate.toFixed(0)}%</b></span>
                    <span>평균 <b className={perf.avgReturn >= 0 ? "up" : "down"}>
                      {perf.avgReturn >= 0 ? "+" : ""}{perf.avgReturn.toFixed(1)}%
                    </b></span>
                  </div>
                </div>
                <div className="h-1.5 bg-black/40 rounded overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${Math.min(perf.winRate, 100)}%`, background: cfg.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* TOP 성과 */}
      {data.topWinners.length > 0 && (
        <div className="p-3 border border-[var(--border)] rounded bg-[rgba(0,255,136,0.03)]">
          <div className="text-[10px] up font-bold kr mb-2">🏆 TOP 5 성공 추천</div>
          <div className="space-y-1">
            {data.topWinners.map((p, i) => {
              const cfg = p.topSignal ? SIGNAL_LABELS[p.topSignal] : null;
              return (
                <div key={i} className="flex items-center justify-between p-1.5 rounded bg-black/30 text-[10px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold" style={{ color: "#00ff88", fontFamily: "'Bebas Neue', sans-serif" }}>
                      {i + 1}
                    </span>
                    <SymbolDisplay meta={{ symbol: p.symbol }} size="xs" variant="inline" showBadges={false} />
                    {cfg && (
                      <span className="text-[8px] px-1 rounded kr" style={{ background: `${cfg.color}20`, color: cfg.color }}>
                        {cfg.icon} {cfg.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="dim text-[8px]">{p.daysHeld}일</span>
                    <span className="up font-bold text-[12px]">+{p.returnPct.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      {data.topLosers.length > 0 && (
        <div className="p-3 border border-[var(--border)] rounded bg-[rgba(255,56,96,0.03)]">
          <div className="text-[10px] down font-bold kr mb-2">⚠️ TOP 5 실패 추천 (시스템 개선 참고)</div>
          <div className="space-y-1">
            {data.topLosers.map((p, i) => {
              const cfg = p.topSignal ? SIGNAL_LABELS[p.topSignal] : null;
              return (
                <div key={i} className="flex items-center justify-between p-1.5 rounded bg-black/30 text-[10px]">
                  <div className="flex items-center gap-2">
                    <SymbolDisplay meta={{ symbol: p.symbol }} size="xs" variant="inline" showBadges={false} />
                    {cfg && (
                      <span className="text-[8px] px-1 rounded kr" style={{ background: `${cfg.color}20`, color: cfg.color }}>
                        {cfg.icon} {cfg.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="dim text-[8px]">{p.daysHeld}일</span>
                    <span className="down font-bold text-[12px]">{p.returnPct.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      
      <div className="text-[9px] dim kr p-2 border border-[var(--border)]/50 rounded bg-black/10">
        💡 기회 탐지기 추천의 실제 성과를 추적합니다 · 샘플이 누적될수록 신뢰도 상승
      </div>
    </div>
  );
}
