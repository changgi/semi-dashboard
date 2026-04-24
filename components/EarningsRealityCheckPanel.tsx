"use client";

import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";
import { fmtUsd } from "@/lib/format";

/**
 * EarningsRealityCheckPanel
 *
 * 최근 5일 내 실적 발표 이후 시스템이 사후 판정.
 * - 어떤 시나리오가 실현되었는지 자동 분류
 * - 카일 포지션 영향 실측
 * - 사전 시나리오 카드와 대조하여 학습 포인트 추출
 */

type RealityData = any;

export default function EarningsRealityCheckPanel() {
  const { data, isLoading, error, mutate } = useSWR<RealityData>(
    "/api/earnings-reality-check",
    safeFetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );

  const analyses = data?.analyses ?? [];

  const scenarioColor: Record<string, string> = {
    big_beat: "emerald",
    beat: "blue",
    in_line: "amber",
    miss: "orange",
    big_miss: "rose",
  };

  const scenarioBgClass: Record<string, string> = {
    big_beat: "bg-emerald-500/10 border-emerald-500/40",
    beat: "bg-blue-500/10 border-blue-500/40",
    in_line: "bg-amber-500/10 border-amber-500/40",
    miss: "bg-orange-500/10 border-orange-500/40",
    big_miss: "bg-rose-500/10 border-rose-500/40",
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-amber-400 font-bold tracking-wider uppercase">
            🔍 Earnings Reality Check
          </div>
          <h3 className="text-lg font-bold text-white mt-1">실적 발표 사후 자동 검증</h3>
          <div className="text-[11px] text-slate-500 mt-1">
            사전 시나리오 vs 실제 결과 · 학습 인사이트 자동 추출
          </div>
        </div>
        <button
          onClick={() => mutate()}
          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700"
        >
          ↻
        </button>
      </div>

      {/* 철학 */}
      {data?.philosophy && (
        <div className="mb-4 bg-purple-500/5 border-l-4 border-purple-500 rounded-r-lg p-3 text-[12px]">
          <div className="text-purple-400 font-bold mb-1">💡 {data.philosophy.quote}</div>
          <div className="text-slate-400 italic">{data.philosophy.note}</div>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-12 text-slate-500">
          최근 실적 대조 중...
        </div>
      )}

      {error && <div className="text-center py-12 text-rose-400">로드 실패</div>}

      {data?.empty && (
        <div className="text-center py-12 text-slate-500 text-sm">
          📊 {data.message}
        </div>
      )}

      {data?.success && !data.empty && analyses.length > 0 && (
        <>
          {/* 종합 요약 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <SummaryCard
              label="분석 실적"
              value={String(data.summary.analyzed)}
              sub={`전체 ${data.summary.totalEarnings}건 중`}
            />
            <SummaryCard
              label="카일 관련"
              value={String(data.summary.relevantEarnings)}
              sub="기초자산 보유"
            />
            <SummaryCard
              label="추정 영향"
              value={fmtUsd(data.summary.totalEstimatedImpact)}
              sub={data.summary.totalEstimatedImpact >= 0 ? "📈 순이익" : "📉 순손실"}
              color={data.summary.totalEstimatedImpact >= 0 ? "emerald" : "rose"}
            />
            <SummaryCard
              label="최대 영향"
              value={data.summary.mostImpactfulSymbol ?? "-"}
              sub="주목 종목"
            />
          </div>

          {/* 각 실적별 분석 */}
          <div className="space-y-3">
            {analyses.map((a: any, idx: number) => (
              <div
                key={idx}
                className={`border-2 rounded-xl p-4 ${scenarioBgClass[a.scenario.id]}`}
              >
                {/* 헤더 */}
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{a.scenario.emoji}</span>
                      <span className="text-lg font-bold text-white">
                        {a.event.symbol}
                      </span>
                      <span className="text-xs text-slate-400">
                        {a.event.companyName}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      실적일: {a.event.earningsDate} · {a.event.timing}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xs font-bold px-2 py-0.5 rounded bg-${scenarioColor[a.scenario.id]}-500 text-white`}>
                      {a.scenario.label}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      시나리오 자동 분류
                    </div>
                  </div>
                </div>

                {/* 가격 변동 */}
                <div className="bg-slate-900/50 rounded-lg p-3 mb-3 grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <div className="text-slate-500 text-[10px]">발표 직전</div>
                    <div className="text-white font-bold">${a.preEarningsPrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[10px]">발표 직후</div>
                    <div className="text-white font-bold">
                      ${a.postEarningsPrice.toFixed(2)}
                      <span className={`ml-1 text-[10px] ${a.underlyingImmediateChangePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        ({a.underlyingImmediateChangePct >= 0 ? "+" : ""}{a.underlyingImmediateChangePct.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 text-[10px]">현재가</div>
                    <div className="text-white font-bold">
                      ${a.currentPrice.toFixed(2)}
                      <span className={`ml-1 text-[10px] ${a.underlyingTotalChangePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        ({a.underlyingTotalChangePct >= 0 ? "+" : ""}{a.underlyingTotalChangePct.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>

                {/* 카일 포지션 영향 */}
                {a.kyleImpact.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[11px] font-bold text-amber-400 mb-1 uppercase">
                      💼 카일 포지션 영향
                    </div>
                    {a.kyleImpact.map((k: any) => (
                      <div key={k.symbol} className="bg-slate-800/50 rounded-lg p-2 mb-1 text-[11px]">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-bold text-white">{k.symbol}</span>
                            {k.leverage > 1 && (
                              <span className="ml-1 bg-rose-500/20 text-rose-400 px-1 rounded text-[9px]">
                                {k.leverage}x
                              </span>
                            )}
                            <span className="text-slate-500 ml-2 text-[10px]">
                              {k.shares}주 @ ${k.avgCost.toFixed(2)}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className={k.estimatedImmediateChangePct >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                              추정 {k.estimatedImmediateChangePct >= 0 ? "+" : ""}
                              {k.estimatedImmediateChangePct.toFixed(1)}%
                            </div>
                            <div className="text-[9px] text-slate-500">
                              현재 {k.unrealizedPnlPct >= 0 ? "+" : ""}{k.unrealizedPnlPct.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 시나리오 권고 액션 */}
                {a.recommendedActions.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[11px] font-bold text-blue-400 mb-1 uppercase">
                      🎯 {a.scenario.label} 시나리오 권고
                    </div>
                    <ul className="space-y-0.5 text-[11px] text-slate-300 pl-2">
                      {a.recommendedActions.map((act: string, i: number) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-slate-500">▸</span>
                          <span>{act}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 학습 인사이트 */}
                {a.learnings.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold text-purple-400 mb-1 uppercase">
                      📚 학습 인사이트
                    </div>
                    <ul className="space-y-0.5 text-[11px] text-slate-300 pl-2">
                      {a.learnings.map((l: string, i: number) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-slate-500">💡</span>
                          <span>{l}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  color = "slate",
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    slate: "text-white",
  };
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`text-base font-bold ${colorMap[color]}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
    </div>
  );
}
