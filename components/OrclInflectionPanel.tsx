"use client";

import { useState } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Legend, BarChart, Bar, Cell,
} from "recharts";

type TrackerData = any;

export default function OrclInflectionPanel() {
  const [tab, setTab] = useState<"overview" | "bull" | "bear" | "history" | "theta">("overview");

  const { data, isLoading, error, mutate } = useSWR<TrackerData>(
    "/api/orcl-inflection-tracker",
    safeFetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );

  const scores = data?.scores;
  const judgment = data?.judgment;
  const triggered = data?.triggered_signals ?? [];
  const positions = data?.positions ?? [];
  const theta = data?.theta_warning;
  const history = data?.score_history ?? [];

  // Bull / Bear 신호 분류
  const bullSignals = triggered.filter((s: any) => s.type === "bull");
  const bearSignals = triggered.filter((s: any) => s.type === "bear");

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs text-amber-400 font-bold tracking-wider uppercase">
            🎯 ORCL Inflection Tracker
          </div>
          <h3 className="text-lg font-bold text-white mt-1">ORCL 변곡점 검증 엔진</h3>
          <div className="text-[11px] text-slate-500 mt-1">
            카일 테제 검증 · Bull/Bear 동등 추적 · 시계열 누적
          </div>
        </div>
        <button
          onClick={() => mutate()}
          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700"
        >
          ↻
        </button>
      </div>

      {/* 두 테제 표시 */}
      {data?.thesis && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
          <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-lg p-3">
            <div className="text-[10px] font-bold text-emerald-400 uppercase mb-1">🚀 Bull 가설 (카일)</div>
            <div className="text-[11px] text-slate-300 italic leading-relaxed">{data.thesis.bull}</div>
          </div>
          <div className="bg-rose-500/5 border border-rose-500/30 rounded-lg p-3">
            <div className="text-[10px] font-bold text-rose-400 uppercase mb-1">🚨 Bear 가설 (다니엘유 외)</div>
            <div className="text-[11px] text-slate-300 italic leading-relaxed">{data.thesis.bear}</div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-12 text-slate-500">테제 검증 중...</div>
      )}
      {error && <div className="text-center py-12 text-rose-400">로드 실패</div>}
      {data?.success === false && (
        <div className="text-center py-8 text-amber-400 text-[12px]">
          ⚠️ {data.error}
          <div className="text-slate-500 text-[11px] mt-2">
            먼저 Supabase에 마이그레이션을 적용해주세요:
            <br /><code className="text-slate-300">migrations/2026-04-24-orcl-thesis-tracker.sql</code>
          </div>
        </div>
      )}

      {data?.success && scores && (
        <>
          {/* 핵심 점수 카드 */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-xl p-3 text-center">
              <div className="text-[10px] text-emerald-300 uppercase font-bold">Bull Score</div>
              <div className="text-3xl font-bold text-emerald-400 mt-1">{scores.bull.toFixed(0)}</div>
              <div className="text-[9px] text-slate-500">/ 100</div>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/40 rounded-xl p-3 text-center">
              <div className="text-[10px] text-rose-300 uppercase font-bold">Bear Score</div>
              <div className="text-3xl font-bold text-rose-400 mt-1">{scores.bear.toFixed(0)}</div>
              <div className="text-[9px] text-slate-500">/ 100</div>
            </div>
            <div className={`border rounded-xl p-3 text-center ${
              scores.net >= 15 ? "bg-emerald-500/10 border-emerald-500/40" :
              scores.net <= -15 ? "bg-rose-500/10 border-rose-500/40" :
              "bg-slate-500/10 border-slate-500/40"
            }`}>
              <div className="text-[10px] text-slate-300 uppercase font-bold">Net Score</div>
              <div className={`text-3xl font-bold mt-1 ${
                scores.net >= 15 ? "text-emerald-400" :
                scores.net <= -15 ? "text-rose-400" :
                "text-slate-400"
              }`}>
                {scores.net >= 0 ? "+" : ""}{scores.net.toFixed(0)}
              </div>
              <div className="text-[9px] text-slate-500">Bull − Bear</div>
            </div>
          </div>

          {/* 판정 */}
          {judgment && (
            <div className={`mb-4 rounded-xl p-3 border-2 ${
              scores.net >= 15 ? "bg-emerald-500/5 border-emerald-500/40" :
              scores.net <= -15 ? "bg-rose-500/5 border-rose-500/40" :
              "bg-slate-500/5 border-slate-500/40"
            }`}>
              <div className="text-sm font-bold text-white mb-1">{judgment.verdict}</div>
              <div className="text-[12px] text-slate-300">{judgment.recommendation}</div>
              <div className="text-[10px] text-slate-500 mt-1">신뢰도: {judgment.confidence}</div>
            </div>
          )}

          {/* 탭 */}
          <div className="flex gap-1 mb-3 border-b border-slate-700 overflow-x-auto">
            {[
              { id: "overview", label: "📊 단계별" },
              { id: "bull", label: `🚀 Bull (${bullSignals.length})` },
              { id: "bear", label: `🚨 Bear (${bearSignals.length})` },
              { id: "history", label: "📈 시계열" },
              { id: "theta", label: "⏳ Theta" },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`text-xs px-3 py-2 whitespace-nowrap ${
                  tab === t.id ? "text-blue-400 border-b-2 border-blue-400" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 탭: 단계별 */}
          {tab === "overview" && (
            <div className="space-y-3">
              <div>
                <div className="text-[11px] font-bold text-emerald-400 mb-2 uppercase">Bull 단계별</div>
                <div className="space-y-1.5">
                  <StageBar label="Stage 1: 인프라 완성" value={scores.bull_breakdown.infra} color="emerald" weight="20%" />
                  <StageBar label="Stage 2: 데이터 활용 ⭐" value={scores.bull_breakdown.transition} color="emerald" weight="35%" />
                  <StageBar label="Stage 3: 시장 인식" value={scores.bull_breakdown.market} color="emerald" weight="25%" />
                  <StageBar label="Stage 4: 가격 모멘텀" value={scores.bull_breakdown.price} color="emerald" weight="20%" />
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-rose-400 mb-2 uppercase">Bear 단계별</div>
                <div className="space-y-1.5">
                  <StageBar label="경쟁 위협" value={scores.bear_breakdown.competition} color="rose" weight="30%" />
                  <StageBar label="펀더멘털 악화" value={scores.bear_breakdown.fundamentals} color="rose" weight="30%" />
                  <StageBar label="거시 비우호" value={scores.bear_breakdown.macro} color="rose" weight="20%" />
                  <StageBar label="가격 약세" value={scores.bear_breakdown.price} color="rose" weight="20%" />
                </div>
              </div>
            </div>
          )}

          {/* 탭: Bull 시그널 */}
          {tab === "bull" && (
            <div className="space-y-2">
              {bullSignals.length === 0 ? (
                <div className="text-slate-500 text-[12px] text-center py-6">현재 활성화된 Bull 시그널 없음</div>
              ) : bullSignals.map((s: any) => (
                <div key={s.key} className="bg-emerald-500/5 border border-emerald-500/30 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div className="text-[12px] font-bold text-white">✅ {s.name}</div>
                    <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">
                      가중치 {s.weight}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">{s.evidence}</div>
                </div>
              ))}
            </div>
          )}

          {/* 탭: Bear 시그널 */}
          {tab === "bear" && (
            <div className="space-y-2">
              {bearSignals.length === 0 ? (
                <div className="text-slate-500 text-[12px] text-center py-6">현재 활성화된 Bear 시그널 없음</div>
              ) : bearSignals.map((s: any) => (
                <div key={s.key} className="bg-rose-500/5 border border-rose-500/30 rounded-lg p-3">
                  <div className="flex justify-between items-start">
                    <div className="text-[12px] font-bold text-white">⚠ {s.name}</div>
                    <span className="text-[9px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded">
                      가중치 {s.weight}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">{s.evidence}</div>
                </div>
              ))}
            </div>
          )}

          {/* 탭: 시계열 */}
          {tab === "history" && (
            <div>
              <div className="text-[11px] text-slate-400 mb-2">
                30일 점수 추이 (사후 검증용 — 미래에 어느 가설이 옳았는지 회고 가능)
              </div>
              <div className="h-56 bg-slate-800/30 rounded-xl p-2">
                {history.length < 2 ? (
                  <div className="flex items-center justify-center h-full text-slate-500 text-[11px]">
                    데이터 누적 중... (1주 이상 후 의미 있음)
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={history.map((h: any) => ({
                      date: new Date(h.computed_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }),
                      bull: h.bull_score,
                      bear: h.bear_score,
                      net: h.net_score,
                    }))}>
                      <CartesianGrid stroke="#2a3550" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                      <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }} />
                      <ReferenceLine y={0} stroke="#475569" />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="bull" stroke="#10b981" strokeWidth={2} dot={false} name="Bull" />
                      <Line type="monotone" dataKey="bear" stroke="#ef4444" strokeWidth={2} dot={false} name="Bear" />
                      <Line type="monotone" dataKey="net" stroke="#3b82f6" strokeWidth={2} dot={false} name="Net" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          )}

          {/* 탭: Theta */}
          {tab === "theta" && theta && (
            <div className="space-y-3">
              <div className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-3">
                <div className="text-xs font-bold text-amber-400 mb-2">⏳ ORCX 시간 가치 분석</div>
                <div className="text-[11px] text-slate-300 space-y-1">
                  <div>ORCL 현재가: <b>${theta.orclCurrentPrice.toFixed(2)}</b></div>
                  <div>ORCL 목표가 (ORCX 본전): <b>${theta.orclTargetPrice.toFixed(2)}</b></div>
                  <div>ORCL 필요 상승: <b className="text-amber-400">+{theta.orclNeededPct.toFixed(1)}%</b></div>
                </div>
              </div>

              <div className="bg-slate-800/40 rounded-xl p-3">
                <div className="text-xs font-bold text-slate-300 mb-2">레버리지 ETF 시간 감가 시뮬레이션</div>
                <div className="text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-400">이상적 ORCX 회복률 (즉시 도달 시)</span>
                    <span className="text-emerald-400 font-bold">+{theta.idealOrcxPct.toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">현실적 회복률 (1년 보유 가정)</span>
                    <span className="text-amber-400 font-bold">+{theta.realisticOrcxPct.toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">ORCX 본전 도달 필요률</span>
                    <span className="text-rose-400 font-bold">+{theta.orcxBreakEvenPct.toFixed(0)}%</span>
                  </div>
                  <div className="border-t border-slate-700 pt-2 mt-2">
                    <div className="text-[11px] text-amber-300 font-bold">
                      {theta.warning}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-500/5 border border-blue-500/30 rounded-xl p-3 text-[11px]">
                <div className="font-bold text-blue-400 mb-1">💡 옵션</div>
                <div className="text-slate-300 space-y-1">
                  <div>• 변곡점 점수 60+ 도달 시: ORCX → ORCL 본주 전환 (테제 동일, 시간가치 보존)</div>
                  <div>• 점수 30 미만 6개월 지속 시: ORCX 부분 청산 검토</div>
                  <div>• 점수 -30 이하: 손절선 설정 권고</div>
                </div>
              </div>
            </div>
          )}

          {/* 포지션 표시 */}
          <div className="mt-4 bg-slate-800/30 rounded-xl p-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">📦 카일 ORCL 계열 포지션</div>
            <div className="space-y-1 text-[11px]">
              {positions.map((p: any) => (
                <div key={p.symbol} className="flex justify-between">
                  <span className="text-slate-300">
                    <b>{p.symbol}</b> {p.shares}주 @ ${p.avgCost.toFixed(2)}
                  </span>
                  <span className={p.pnlPct >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    ${p.value.toFixed(0)} ({p.pnlPct >= 0 ? "+" : ""}{p.pnlPct.toFixed(1)}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {data?.philosophy && (
            <div className="mt-3 text-[10px] text-slate-600 italic text-center">
              "{data.philosophy.moto}"
              <br />
              <span className="text-slate-700">{data.philosophy.usage}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StageBar({ label, value, color, weight }: { label: string; value: number; color: string; weight: string }) {
  const bgClass = color === "emerald" ? "bg-emerald-500" : "bg-rose-500";
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-0.5">
        <span className="text-slate-400">{label}</span>
        <span className="text-white font-bold">{value.toFixed(0)} <span className="text-slate-500 text-[9px]">({weight})</span></span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${bgClass}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
