"use client";

import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

interface SimilarPeriod {
  date: string;
  daysAgo: number;
  vix: number;
  vix_regime: string;
  spy_regime: string;
  overall: string;
  similarity: number;
  outcome?: {
    day1_vix_change: number | null;
    day7_vix_change: number | null;
    day30_regime: string | null;
  };
}

interface Data {
  success: boolean;
  current: { vix: number; tnx: number; krw: number; regime: string } | null;
  dataDepth: number;
  similar: SimilarPeriod[];
  insights: string[];
}

// ═══════════════════════════════════════════════════════════
export function TimeMachinePanel() {
  const { data, isLoading } = useSWR<Data>(
    "/api/time-machine",
    fetcher,
    { refreshInterval: 900000 } // 15분
  );

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[11px] dim kr">⏰ 과거 유사 국면 검색 중...</div>
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
            ⏰ TIME MACHINE · 유사 국면 검색
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            과거 비슷한 상황에서 시장이 어떻게 움직였나?
          </div>
        </div>
      </div>

      {/* 현재 상태 */}
      {data.current && (
        <div className="mb-3 p-3 border border-[var(--amber)] bg-[rgba(255,176,0,0.05)] rounded">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-[9px] dim kr">📍 현재 시장</div>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-[14px] tick font-bold">
                  VIX {data.current.vix.toFixed(2)}
                </span>
                <span className="text-[11px] dim kr">
                  10Y {data.current.tnx?.toFixed(2)}%
                </span>
                <span className="text-[11px] dim kr">
                  KRW ₩{data.current.krw.toLocaleString()}
                </span>
              </div>
            </div>
            <div className="text-[9px] dim kr text-right">
              축적 데이터: {data.dataDepth}일
            </div>
          </div>
        </div>
      )}

      {/* 인사이트 */}
      {(data.insights ?? []).length > 0 && (
        <div className="mb-3 border border-[#aaccff]/30 bg-[rgba(170,204,255,0.03)] rounded p-3">
          <div className="text-[10px] font-bold kr mb-2" style={{ color: "#aaccff" }}>
            💡 역사적 맥락
          </div>
          {(data.insights ?? []).map((i, k) => (
            <div key={k} className="text-[10px] kr leading-relaxed mb-1">{i}</div>
          ))}
        </div>
      )}

      {/* 유사 기간 */}
      {(data.similar ?? []).length === 0 ? (
        <div className="text-center py-10 border border-dashed border-[var(--border)] rounded">
          <div className="text-[32px] mb-2">🌱</div>
          <div className="text-[11px] dim kr">
            축적 데이터 부족 (오늘 첫 스냅샷 완료!)
          </div>
          <div className="text-[9px] dim kr mt-1">
            매일 00:30 KST 자동 축적 · 30일 후 의미있는 분석 가능
          </div>
        </div>
      ) : (
        <div>
          <div className="text-[10px] tick font-bold kr mb-2">
            🎯 유사한 과거 국면 ({data.similar.length})
          </div>
          <div className="space-y-2">
            {data.similar.map((s, i) => (
              <SimilarCard key={i} period={s} rank={i + 1} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        💡 VIX(50%) + 10Y(25%) + 환율(25%) 가중 유사도<br />
        📊 축적될수록 더 정확한 과거 매칭 가능
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
function SimilarCard({ period, rank }: { period: SimilarPeriod; rank: number }) {
  const simPct = Math.round(period.similarity * 100);
  const simColor = simPct >= 80 ? "#00ff88" : simPct >= 60 ? "#ffaa44" : "#aaaaaa";
  
  return (
    <div
      className="border-l-4 rounded-r p-2"
      style={{ borderLeftColor: simColor, background: `${simColor}08` }}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold kr" style={{ color: simColor }}>
              #{rank}
            </span>
            <span className="tick font-bold text-[11px]">{period.date}</span>
            <span className="text-[9px] dim kr">({period.daysAgo}일 전)</span>
            <span
              className="text-[8px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: simColor, color: "white" }}
            >
              유사도 {simPct}%
            </span>
          </div>
          <div className="text-[10px] kr mt-1">
            <span className="dim">VIX</span> <span className="tick font-bold">{period.vix.toFixed(1)}</span>
            <span className="dim mx-2">·</span>
            <span className="dim">SPY</span> <span>{period.spy_regime}</span>
            <span className="dim mx-2">·</span>
            <span>{period.overall}</span>
          </div>
        </div>
      </div>
      
      {/* 결과 추적 */}
      {period.outcome && (
        <div className="mt-2 pt-2 border-t border-[var(--border)]/50 grid grid-cols-3 gap-2 text-[9px] kr">
          <div>
            <div className="dim">1일 후 VIX</div>
            <div className={`font-bold ${period.outcome.day1_vix_change === null ? "" : period.outcome.day1_vix_change > 0 ? "down" : "up"}`}>
              {period.outcome.day1_vix_change === null 
                ? "-" 
                : `${period.outcome.day1_vix_change > 0 ? "+" : ""}${period.outcome.day1_vix_change}%`}
            </div>
          </div>
          <div>
            <div className="dim">7일 후 VIX</div>
            <div className={`font-bold ${period.outcome.day7_vix_change === null ? "" : period.outcome.day7_vix_change > 0 ? "down" : "up"}`}>
              {period.outcome.day7_vix_change === null 
                ? "-" 
                : `${period.outcome.day7_vix_change > 0 ? "+" : ""}${period.outcome.day7_vix_change}%`}
            </div>
          </div>
          <div>
            <div className="dim">30일 후 국면</div>
            <div className="font-bold tick">{period.outcome.day30_regime ?? "-"}</div>
          </div>
        </div>
      )}
    </div>
  );
}
