"use client";

import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

interface Data {
  success: boolean;
  fx: {
    current: number;
    change1d: number;
    change1w: number;
    change1m: number;
    week52High: number;
    week52Low: number;
    position: "strong_dollar" | "weak_dollar" | "neutral";
    trend: "rising" | "falling" | "sideways";
    interpretation: string;
  } | null;
  kospi: {
    price: number;
    change1d: number;
    yield1m: number;
    regime: "bull" | "bear" | "consolidation";
  } | null;
  koreanEtfs: Array<{
    symbol: string;
    name: string;
    price: number;
    changePct: number;
    recommendation: string;
  }>;
  portfolioAnalysis: {
    totalValueKrw: number;
    totalValueUsd: number;
    fxImpact: "positive" | "negative" | "neutral";
    fxImpactKrw: number;
    fxImpactPct: number;
    realReturnKrw: number;
    realReturnPct: number;
  } | null;
  insights: string[];
  actions: string[];
}

// ═══════════════════════════════════════════════════════════
export function KoreaLensPanel() {
  const { data, isLoading } = useSWR<Data>(
    "/api/korea-lens",
    fetcher,
    { refreshInterval: 600000 } // 10분
  );

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[11px] dim kr">🇰🇷 한국 시장 분석 중...</div>
      </div>
    );
  }

  if (!data?.success || !data.fx) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[10px] dim kr">데이터 로드 실패</div>
      </div>
    );
  }

  const { fx, kospi, koreanEtfs, portfolioAnalysis, insights, actions } = data;

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            🇰🇷 KOREA LENS · 한국 투자자 맞춤
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            환율 + KOSPI + 한국 ETF + 환차익 분석
          </div>
        </div>
      </div>

      {/* 환율 메인 */}
      <div className="mb-3 p-3 border-2 rounded" style={{
        borderColor: fx.position === "strong_dollar" ? "#ffaa44" : fx.position === "weak_dollar" ? "#aaccff" : "#6b7a6c",
        background: fx.position === "strong_dollar" ? "rgba(255,170,68,0.05)" : fx.position === "weak_dollar" ? "rgba(170,204,255,0.05)" : "transparent",
      }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-[9px] dim kr">USD/KRW 환율</div>
            <div className="text-[28px] sm:text-[32px] font-bold tick">
              ₩{fx.current.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <ChangeBadge label="일간" value={fx.change1d} />
              <ChangeBadge label="주간" value={fx.change1w} />
              <ChangeBadge label="월간" value={fx.change1m} />
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] dim kr">52주 범위</div>
            <div className="text-[11px] kr">최고 ₩{fx.week52High.toLocaleString()}</div>
            <div className="text-[11px] kr">최저 ₩{fx.week52Low.toLocaleString()}</div>
            <div className="text-[11px] dim">
              현재: {Math.round(((fx.current - fx.week52Low) / (fx.week52High - fx.week52Low)) * 100)}% 위치
            </div>
          </div>
        </div>
        
        <div className="mt-3 p-2 bg-black/20 rounded text-[10px] kr leading-relaxed">
          {fx.interpretation}
        </div>
      </div>

      {/* 포트폴리오 환율 영향 */}
      {portfolioAnalysis && (
        <div className="mb-3 p-3 border rounded" style={{
          borderColor: portfolioAnalysis.fxImpact === "positive" ? "#00ff88" : portfolioAnalysis.fxImpact === "negative" ? "#ff3860" : "#6b7a6c",
          background: portfolioAnalysis.fxImpact === "positive" ? "rgba(0,255,136,0.05)" : portfolioAnalysis.fxImpact === "negative" ? "rgba(255,56,96,0.05)" : "transparent",
        }}>
          <div className="text-[10px] font-bold kr mb-2">💼 포트폴리오 환율 영향</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <div className="text-[8px] dim kr">원화 평가액</div>
              <div className="text-[13px] font-bold tick">₩{portfolioAnalysis.totalValueKrw.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[8px] dim kr">USD 평가액</div>
              <div className="text-[13px] font-bold tick">${portfolioAnalysis.totalValueUsd.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-[8px] dim kr">환율 영향</div>
              <div className={`text-[13px] font-bold ${portfolioAnalysis.fxImpact === "positive" ? "up" : portfolioAnalysis.fxImpact === "negative" ? "down" : ""}`}>
                {portfolioAnalysis.fxImpact === "positive" ? "+" : portfolioAnalysis.fxImpact === "negative" ? "-" : ""}
                ₩{portfolioAnalysis.fxImpactKrw.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-[8px] dim kr">실질 수익</div>
              <div className={`text-[13px] font-bold ${portfolioAnalysis.realReturnPct >= 0 ? "up" : "down"}`}>
                {portfolioAnalysis.realReturnPct >= 0 ? "+" : ""}{portfolioAnalysis.realReturnPct}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KOSPI */}
      {kospi && (
        <div className="mb-3 p-3 border border-[var(--border)] rounded">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-[10px] dim kr">🇰🇷 KOSPI</div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[18px] font-bold tick">
                  {kospi.price.toLocaleString()}
                </span>
                <ChangeBadge label="일간" value={kospi.change1d} />
                <span className="text-[10px] dim kr">
                  월간 <span className={kospi.yield1m >= 0 ? "up" : "down"}>
                    {kospi.yield1m >= 0 ? "+" : ""}{kospi.yield1m}%
                  </span>
                </span>
              </div>
            </div>
            <div>
              <span
                className="text-[10px] px-2 py-1 rounded font-bold kr"
                style={{
                  background: kospi.regime === "bull" ? "#00ff88" : kospi.regime === "bear" ? "#ff3860" : "#ffaa44",
                  color: "#111",
                }}
              >
                {kospi.regime === "bull" ? "🟢 강세장" : kospi.regime === "bear" ? "🔴 약세장" : "🟡 횡보장"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 한국 ETF */}
      {koreanEtfs.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] tick font-bold kr mb-2">📊 한국 대표 ETF</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {koreanEtfs.slice(0, 6).map(e => (
              <div key={e.symbol} className="border border-[var(--border)] rounded p-2 flex items-center justify-between gap-2 text-[10px]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="tick font-bold">{e.symbol.replace(".KS", "")}</span>
                    <span className="kr truncate">{e.name}</span>
                  </div>
                  <div className="dim kr text-[8px] mt-0.5">
                    ₩{Math.round(e.price).toLocaleString()} · 
                    <span className={e.changePct >= 0 ? "up" : "down"}>
                      {" "}{e.changePct >= 0 ? "+" : ""}{e.changePct.toFixed(2)}%
                    </span>
                  </div>
                </div>
                <span className="text-[8px] kr flex-shrink-0">{e.recommendation}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 인사이트 */}
      {(insights ?? []).length > 0 && (
        <div className="mb-3 border border-[#aaccff]/30 bg-[rgba(170,204,255,0.03)] rounded p-3">
          <div className="text-[10px] font-bold kr mb-2" style={{ color: "#aaccff" }}>💡 인사이트</div>
          {(insights ?? []).map((i, k) => (
            <div key={k} className="text-[10px] kr leading-relaxed mb-1">{i}</div>
          ))}
        </div>
      )}

      {/* 액션 */}
      {(actions ?? []).length > 0 && (
        <div className="border border-[#ffaa44]/30 bg-[rgba(255,170,68,0.03)] rounded p-3">
          <div className="text-[10px] font-bold kr mb-2" style={{ color: "#ffaa44" }}>🎯 권장 액션</div>
          {(actions ?? []).map((a, k) => (
            <div key={k} className="text-[10px] kr leading-relaxed mb-1">{k + 1}. {a}</div>
          ))}
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        💡 <strong>환율 영향 기준</strong>: 1년 평균 ₩1,350 기준 / 현재 ₩{fx.current.toLocaleString()}<br />
        📊 10분마다 자동 갱신 · Yahoo Finance 데이터
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
function ChangeBadge({ label, value }: { label: string; value: number }) {
  const color = value >= 0.5 ? "#00ff88" : value <= -0.5 ? "#ff3860" : "#aaaaaa";
  return (
    <div className="text-[9px] kr">
      <span className="dim">{label}</span>{" "}
      <span style={{ color }} className="font-bold">
        {value >= 0 ? "+" : ""}{value.toFixed(2)}%
      </span>
    </div>
  );
}
