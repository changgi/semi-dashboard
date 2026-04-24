"use client";

import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";
import { fmtUsd } from "@/lib/format";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, LabelList,
} from "recharts";

type DivergenceData = any;

export default function TechDivergencePanel() {
  const { data, isLoading, error, mutate } = useSWR<DivergenceData>(
    "/api/tech-divergence",
    safeFetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );

  const categories = data?.categoryStats ?? [];
  const winners = data?.winners ?? [];
  const losers = data?.losers ?? [];
  const kyleExposure = data?.kyleExposure;
  const insights = data?.insights ?? [];
  const actions = data?.recommendedActions ?? [];

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700 rounded-2xl p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs text-amber-400 font-bold tracking-wider uppercase">
            🔀 Tech Divergence Engine
          </div>
          <h3 className="text-lg font-bold text-white mt-1">IT 업종 승자·패자 분화</h3>
          <div className="text-[11px] text-slate-500 mt-1">
            대니얼유 관점 · AI 슈퍼사이클 내 분화 정량 분석
          </div>
        </div>
        <button
          onClick={() => mutate()}
          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700"
        >
          ↻
        </button>
      </div>

      {/* 대니얼유 인용 */}
      <div className="mb-4 bg-purple-500/5 border-l-4 border-purple-500 rounded-r-lg p-3 text-[12px]">
        <div className="text-purple-400 font-bold mb-1">💬 대니얼유</div>
        <div className="text-slate-300 italic leading-relaxed">
          "지수, 주가는 실적을 따라갑니다. IT 업종 내에서도 이번 AI 슈퍼사이클 아래 승자와 패자가 갈리기 시작하는 모습입니다."
        </div>
      </div>

      {isLoading && <div className="text-center py-12 text-slate-500">승자/패자 분화 계산 중...</div>}
      {error && <div className="text-center py-12 text-rose-400">로드 실패</div>}

      {data?.success && (
        <>
          {/* 카일 노출도 — 가장 중요 */}
          {kyleExposure && (
            <div className="mb-4 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-600 rounded-xl p-4">
              <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">
                💼 카일님 포트폴리오 노출도
              </div>
              <div className="grid grid-cols-4 gap-2">
                <ExposureCard
                  label="🚀 승자 (AI 인프라)"
                  pct={kyleExposure.winnersPct}
                  color="emerald"
                  good={true}
                />
                <ExposureCard
                  label="⚠️ 패자 (SW 앱)"
                  pct={kyleExposure.losersPct}
                  color="rose"
                  good={false}
                />
                <ExposureCard
                  label="💼 하이퍼스케일러"
                  pct={kyleExposure.hyperscalerPct}
                  color="blue"
                />
                <ExposureCard
                  label="📊 기타"
                  pct={kyleExposure.otherPct}
                  color="slate"
                />
              </div>

              {/* 각 포지션 */}
              <div className="mt-3 pt-3 border-t border-slate-700">
                <div className="text-[10px] text-slate-500 mb-2">각 포지션 분류:</div>
                <div className="space-y-1 text-[11px]">
                  {kyleExposure.details.map((d: any) => {
                    const categoryLabel =
                      d.category === "ai_infra" ? "🚀 승자" :
                      d.category === "ai_app" ? "⚠️ 패자" :
                      d.category === "hyperscaler" ? "💼 하이퍼스케일러" :
                      "❓ 분류외";
                    const categoryColor =
                      d.category === "ai_infra" ? "text-emerald-400" :
                      d.category === "ai_app" ? "text-rose-400" :
                      d.category === "hyperscaler" ? "text-blue-400" :
                      "text-slate-500";
                    return (
                      <div key={d.symbol} className="flex justify-between items-center py-1 border-b border-slate-800 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white w-14">{d.symbol}</span>
                          <span className="text-slate-500 text-[10px]">←{d.underlying}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={categoryColor}>{categoryLabel}</span>
                          <span className="text-white font-bold w-12 text-right">{d.weight.toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 핵심 인사이트 */}
          {insights.length > 0 && (
            <div className="mb-4 bg-rose-500/5 border border-rose-500/30 rounded-xl p-3">
              <div className="text-xs font-bold text-rose-400 mb-2 uppercase tracking-wider">🎯 핵심 인사이트</div>
              <ul className="space-y-1 text-[12px] text-slate-300">
                {insights.map((i: string, idx: number) => (
                  <li key={idx} className="flex gap-2">
                    <span>▸</span>
                    <span>{i}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 카테고리 비교 차트 */}
          <div className="mb-4">
            <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">📊 카테고리별 1개월 수익률</div>
            <div className="h-48 bg-slate-800/30 rounded-xl p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categories.filter((c: any) => c.category !== "legacy")}>
                  <CartesianGrid stroke="#2a3550" strokeDasharray="3 3" />
                  <XAxis dataKey="categoryLabel" tick={{ fontSize: 10, fill: "#cbd5e1" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                    formatter={(v: number) => `${v.toFixed(1)}%`}
                  />
                  <Bar dataKey="avgRet1m" name="평균 1개월 수익률">
                    {categories.filter((c: any) => c.category !== "legacy").map((c: any, i: number) => (
                      <Cell key={i} fill={
                        c.category === "ai_infra" ? "#10b981" :
                        c.category === "ai_app" ? "#ef4444" :
                        "#3b82f6"
                      } />
                    ))}
                    <LabelList dataKey="avgRet1m" position="top" formatter={(v: number) => `${v.toFixed(1)}%`} fill="#e5e7eb" fontSize={10} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 승자 vs 패자 2열 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            {/* 승자 */}
            <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-3">
              <div className="text-xs font-bold text-emerald-400 mb-2 uppercase tracking-wider">
                🚀 승자 그룹 ({winners.length})
              </div>
              {winners.length === 0 ? (
                <div className="text-slate-500 text-[12px] italic">조건 충족 종목 없음</div>
              ) : (
                <div className="space-y-1.5">
                  {winners.map((w: any) => (
                    <div key={w.symbol} className="bg-slate-800/50 rounded-lg p-2 text-[11px]">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-bold text-white">{w.symbol}</span>
                          <span className="text-slate-500 ml-2">{w.name}</span>
                        </div>
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">
                          52w {w.pos52w.toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-emerald-400 font-bold">
                          1M {w.ret1m >= 0 ? "+" : ""}{w.ret1m.toFixed(1)}%
                        </span>
                        <span className="text-slate-400">
                          SPY 대비 {w.relativeRet1m >= 0 ? "+" : ""}{w.relativeRet1m.toFixed(1)}%p
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 패자 */}
            <div className="bg-rose-500/5 border border-rose-500/30 rounded-xl p-3">
              <div className="text-xs font-bold text-rose-400 mb-2 uppercase tracking-wider">
                ⚠ 패자 그룹 ({losers.length})
              </div>
              {losers.length === 0 ? (
                <div className="text-slate-500 text-[12px] italic">조건 충족 종목 없음</div>
              ) : (
                <div className="space-y-1.5">
                  {losers.map((l: any) => (
                    <div key={l.symbol} className="bg-slate-800/50 rounded-lg p-2 text-[11px]">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-bold text-white">{l.symbol}</span>
                          <span className="text-slate-500 ml-2">{l.name}</span>
                        </div>
                        <span className="text-[9px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded">
                          52w {l.pos52w.toFixed(0)}%
                        </span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className={l.ret1m >= 0 ? "text-amber-400" : "text-rose-400"}>
                          1M {l.ret1m >= 0 ? "+" : ""}{l.ret1m.toFixed(1)}%
                        </span>
                        <span className="text-slate-400 text-[10px]">추세 {l.trend}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 권고 액션 */}
          {actions.length > 0 && (
            <div className="bg-blue-500/5 border border-blue-500/30 rounded-xl p-3">
              <div className="text-xs font-bold text-blue-400 mb-2 uppercase tracking-wider">🎯 대니얼유 관점 기반 권고</div>
              <ul className="space-y-2 text-[12px]">
                {actions.map((a: any, i: number) => (
                  <li key={i} className="bg-slate-800/50 rounded-lg p-2">
                    <div className="flex items-start gap-2">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        a.priority === "high" ? "bg-rose-500 text-white" : "bg-amber-500 text-black"
                      }`}>
                        {a.priority === "high" ? "긴급" : "중요"}
                      </span>
                      <div className="flex-1">
                        <div className="text-white font-semibold">{a.action}</div>
                        <div className="text-slate-400 text-[11px] mt-0.5">{a.reason}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ExposureCard({ label, pct, color, good }: { label: string; pct: number; color: string; good?: boolean }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    blue: "text-blue-400",
    slate: "text-slate-400",
  };
  const bgMap: Record<string, string> = {
    emerald: "bg-emerald-500",
    rose: "bg-rose-500",
    blue: "bg-blue-500",
    slate: "bg-slate-500",
  };
  // 경고 표시
  const isWarning = good === false && pct > 40;
  const isLowGood = good === true && pct < 20;
  return (
    <div className={`bg-slate-900/50 border rounded-lg p-2 ${
      isWarning ? "border-rose-500" : isLowGood ? "border-amber-500" : "border-slate-700"
    }`}>
      <div className="text-[9px] text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${colorMap[color]}`}>{pct.toFixed(0)}%</div>
      <div className="h-1 bg-slate-700 rounded-full mt-1 overflow-hidden">
        <div className={`h-full ${bgMap[color]}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {isWarning && <div className="text-[9px] text-rose-400 mt-1">🚨 과다 노출</div>}
      {isLowGood && <div className="text-[9px] text-amber-400 mt-1">⚠️ 비중 부족</div>}
    </div>
  );
}
