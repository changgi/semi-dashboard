"use client";

import { useState } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";
import { fmtUsd } from "@/lib/format";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, LabelList,
} from "recharts";

/**
 * RebalancingPanel
 *
 * 리밸런싱 엔진 — 카일님 목표 비중 계산 + 실행 플랜.
 *
 * 3단계 플로우:
 * 1단계: 매도 (목표 초과 비중 축소)
 * 2단계: 현금 대기 (1-3일)
 * 3단계: 재투자 (코어 + 방어 + 현금성 분산)
 */

type RebalanceData = any;

const STRATEGIES = [
  { id: "kyle_principles", label: "카일 7원칙", desc: "기초자산 25%↓, 레버리지 30%↓" },
  { id: "conservative_recovery", label: "복구 우선", desc: "레버리지 최소, 저변동성 중심" },
  { id: "equal_weight", label: "균등 배분", desc: "모든 종목 동일 비중" },
];

export default function RebalancingPanel() {
  const [strategy, setStrategy] = useState("kyle_principles");
  const [phase, setPhase] = useState<1 | 2 | 3>(1);

  const { data, isLoading, error, mutate } = useSWR<RebalanceData>(
    `/api/rebalancing-engine?strategy=${strategy}`,
    safeFetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );

  const positions = data?.positions ?? [];
  const actions = data?.actions ?? [];
  const plan = data?.executionPlan;
  const summary = data?.summary;
  const rationale = data?.rationale ?? [];

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-amber-400 font-bold tracking-wider uppercase">⚖️ Rebalancing Engine</div>
          <h3 className="text-lg font-bold text-white mt-1">목표 비중 · 재투자 플랜</h3>
        </div>
        <button
          onClick={() => mutate()}
          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700"
        >
          ↻
        </button>
      </div>

      {/* 전략 선택 */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {STRATEGIES.map(s => (
          <button
            key={s.id}
            onClick={() => setStrategy(s.id)}
            className={`p-2.5 rounded-lg border text-left transition-all ${
              strategy === s.id
                ? "bg-blue-500/10 border-blue-500 text-white"
                : "bg-slate-800/40 border-slate-700 text-slate-400 hover:border-blue-500/50"
            }`}
          >
            <div className="text-xs font-bold">{s.label}</div>
            <div className="text-[10px] mt-0.5 opacity-70">{s.desc}</div>
          </button>
        ))}
      </div>

      {isLoading && <div className="text-center py-12 text-slate-500">전략 계산 중...</div>}
      {error && <div className="text-center py-12 text-rose-400">로드 실패</div>}
      {data?.empty && <div className="text-center py-12 text-slate-500">포트폴리오가 비어있습니다</div>}
      {data?.success === false && <div className="text-center py-12 text-rose-400">실패: {data?.error}</div>}

      {data?.success && !data.empty && (
        <>
          {/* Before/After 요약 */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-4">
            <div className="text-xs font-bold text-amber-400 mb-3 uppercase tracking-wider">🎯 리밸런싱 효과</div>
            <div className="grid grid-cols-3 gap-3 text-[11px]">
              <div>
                <div className="text-slate-500">레버리지 비중</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-rose-400 font-bold line-through text-sm">{summary?.currentLeverage}</span>
                  <span className="text-slate-500">→</span>
                  <span className="text-emerald-400 font-bold text-base">{summary?.targetLeverage}</span>
                </div>
                <div className="text-[10px] text-emerald-400 mt-0.5">↓ {summary?.leverageReduction}</div>
              </div>
              <div>
                <div className="text-slate-500">최대 집중도</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-amber-400 font-bold line-through text-sm">{summary?.currentConcentration}</span>
                  <span className="text-slate-500">→</span>
                  <span className="text-emerald-400 font-bold text-base">{summary?.targetConcentration}</span>
                </div>
              </div>
              <div>
                <div className="text-slate-500">예상 실행 기간</div>
                <div className="text-white font-bold text-base mt-1">{summary?.estimatedExecutionDays}일</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{summary?.totalActions}개 액션</div>
              </div>
            </div>
          </div>

          {/* 전략 근거 */}
          {rationale.length > 0 && (
            <div className="mb-4 bg-blue-500/5 border border-blue-500/30 rounded-xl p-3">
              <div className="text-xs font-bold text-blue-400 mb-2 uppercase tracking-wider">💡 전략 근거</div>
              <ul className="space-y-1 text-[12px] text-slate-300">
                {rationale.map((r: string, i: number) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-slate-500">▸</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 비중 격차 차트 */}
          <div className="bg-slate-800/30 rounded-xl p-3 mb-4">
            <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">📊 현재 비중 vs 목표 비중</div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={positions.map((p: any) => ({
                    symbol: p.symbol,
                    current: p.weight * 100,
                    target: p.targetWeight * 100,
                    gap: p.gap * 100,
                  }))}
                >
                  <CartesianGrid stroke="#2a3550" strokeDasharray="3 3" />
                  <XAxis dataKey="symbol" tick={{ fontSize: 10, fill: "#cbd5e1" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number) => `${v.toFixed(1)}%`}
                  />
                  <Bar dataKey="current" fill="#3b82f6" name="현재" />
                  <Bar dataKey="target" fill="#22c55e" name="목표" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3단계 실행 플랜 */}
          {plan && (
            <>
              <div className="flex gap-2 mb-3">
                {[1, 2, 3].map(p => (
                  <button
                    key={p}
                    onClick={() => setPhase(p as 1 | 2 | 3)}
                    className={`flex-1 py-2.5 rounded-lg border text-xs font-bold transition-all ${
                      phase === p
                        ? "bg-amber-500/20 border-amber-500 text-amber-400"
                        : "bg-slate-800/40 border-slate-700 text-slate-500 hover:border-slate-600"
                    }`}
                  >
                    <div>Phase {p}</div>
                    <div className="text-[10px] font-normal opacity-80 mt-0.5">
                      {p === 1 ? "매도" : p === 2 ? "대기" : "매수"}
                    </div>
                  </button>
                ))}
              </div>

              {/* Phase 1: 매도 */}
              {phase === 1 && (
                <div className="space-y-2">
                  <div className="bg-rose-500/5 border border-rose-500/30 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-bold text-rose-400 uppercase">🔻 {plan.phase1_sell.title}</div>
                      <div className="text-xs text-slate-400">
                        현금화 예상: <b className="text-white">{fmtUsd(plan.phase1_sell.totalCash)}</b>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 mb-3">{plan.phase1_sell.timing}</div>
                    {plan.phase1_sell.actions.length === 0 ? (
                      <div className="text-[12px] text-slate-500 text-center py-4">매도할 종목 없음</div>
                    ) : (
                      <div className="space-y-2">
                        {plan.phase1_sell.actions.map((a: any, i: number) => (
                          <div key={i} className="bg-slate-800/60 rounded-lg p-3 border border-slate-700">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">매도</span>
                                <span className="font-bold text-white">{a.symbol}</span>
                                {a.priority === "high" && (
                                  <span className="bg-rose-500/20 text-rose-400 text-[9px] px-1.5 py-0.5 rounded">우선</span>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold text-white">{a.sellShares}주</div>
                                <div className="text-[10px] text-slate-500">{fmtUsd(a.sellValue)}</div>
                              </div>
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2">
                              <span>{(a.currentWeight * 100).toFixed(1)}%</span>
                              <span className="text-slate-600">→</span>
                              <span className="text-emerald-400 font-semibold">{(a.targetWeight * 100).toFixed(1)}%</span>
                              <span className="text-slate-600">·</span>
                              <span>{a.reason}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Phase 2: 대기 */}
              {phase === 2 && (
                <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-6 text-center">
                  <div className="text-4xl mb-3">⏳</div>
                  <div className="text-lg font-bold text-white mb-1">{plan.phase2_wait.title}</div>
                  <div className="text-sm text-slate-400 mb-3">{plan.phase2_wait.description}</div>
                  <div className="inline-block bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">기간</div>
                    <div className="text-lg font-bold text-amber-400">{plan.phase2_wait.duration}</div>
                  </div>
                  <div className="mt-4 text-[11px] text-slate-500 leading-relaxed max-w-md mx-auto">
                    매도 체결 확인 · T+1 예수금 · 시장 변동성 체크 후 재진입 타이밍 결정
                  </div>
                  <div className="mt-4 bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 text-[11px] text-left">
                    <div className="text-blue-400 font-bold mb-1">💡 이 기간에 할 일</div>
                    <ul className="space-y-0.5 text-slate-400">
                      <li>• Trade Journal에 매도 기록 + 감정 기록</li>
                      <li>• 재투자 후보의 가격 동향 모니터링</li>
                      <li>• 시황 국면(Regime) 변화 체크</li>
                      <li>• <b className="text-rose-400">감정적 재진입 절대 금지</b> (원칙 7)</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Phase 3: 매수 */}
              {phase === 3 && (
                <div className="space-y-2">
                  <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-bold text-emerald-400 uppercase">🔺 {plan.phase3_buy.title}</div>
                      <div className="text-xs text-slate-400">
                        재투자: <b className="text-white">{fmtUsd(plan.phase3_buy.totalBuy)}</b>
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 mb-3">{plan.phase3_buy.timing}</div>
                    {plan.phase3_buy.actions.length === 0 ? (
                      <div className="text-[12px] text-slate-500 text-center py-4">매수할 대상 없음</div>
                    ) : (
                      <div className="space-y-2">
                        {plan.phase3_buy.actions.map((a: any, i: number) => (
                          <div key={i} className="bg-slate-800/60 rounded-lg p-3 border border-slate-700">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="bg-emerald-500 text-black text-[10px] font-bold px-1.5 py-0.5 rounded">매수</span>
                                <span className="font-bold text-white">{a.symbol}</span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                                  a.category === "core" ? "bg-blue-500/20 text-blue-400" :
                                  a.category === "defensive" ? "bg-purple-500/20 text-purple-400" :
                                  "bg-slate-500/20 text-slate-400"
                                }`}>
                                  {a.category === "core" ? "코어" : a.category === "defensive" ? "방어" : "현금성"}
                                </span>
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-bold text-white">{fmtUsd(a.targetValue)}</div>
                                <div className="text-[10px] text-slate-500">{(a.targetWeight * 100).toFixed(1)}%</div>
                              </div>
                            </div>
                            <div className="text-[11px] text-slate-400">{a.description}</div>
                            <div className="text-[11px] text-slate-500 mt-1">💡 {a.reason}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 분할 매수 권장 */}
                  <div className="bg-amber-500/5 border-l-4 border-amber-500 rounded-r-lg p-3 text-[11px]">
                    <div className="text-amber-400 font-bold mb-1">⚡ 분할 매수 권장</div>
                    <div className="text-slate-300 leading-relaxed">
                      재투자 전액을 한 번에 진입하지 말 것. 3일에 걸쳐 1/3씩 분할 매수 권장:
                      <br />• <b className="text-white">Day 1 (33%)</b>: 즉시 진입
                      <br />• <b className="text-white">Day 2 (33%)</b>: 하락 시 추가 (없으면 스킵)
                      <br />• <b className="text-white">Day 3 (34%)</b>: 최종 진입 완료
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
