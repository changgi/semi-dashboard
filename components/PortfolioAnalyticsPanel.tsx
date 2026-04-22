"use client";

import { useState } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";
import { fmtUsd } from "@/lib/format";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell,
} from "recharts";

/**
 * PortfolioAnalyticsPanel
 *
 * 카일님 포트폴리오 전체를 하나의 단위로 분석.
 * - 상관행렬 (5종목)
 * - 리스크 기여도
 * - 30일 몬테카를로 분포
 * - What-If 시나리오 (매도 시 변화)
 */

type AnalyticsData = any;

export default function PortfolioAnalyticsPanel() {
  const [tab, setTab] = useState<"overview" | "correlation" | "risk" | "montecarlo" | "whatif">("overview");
  const { data, isLoading, error, mutate } = useSWR<AnalyticsData>(
    "/api/portfolio-analytics",
    safeFetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );

  const port = data?.portfolio;
  const positions = data?.positions ?? [];
  const corr = data?.correlationMatrix;
  const mc = data?.monteCarlo;
  const whatIfs = data?.whatIfScenarios ?? [];
  const diagnosis = data?.diagnosis ?? [];

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-amber-400 font-bold tracking-wider uppercase">📐 Portfolio Analytics Engine</div>
          <h3 className="text-lg font-bold text-white mt-1">포트폴리오 정량 분석</h3>
        </div>
        <button
          onClick={() => mutate()}
          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700"
        >
          ↻ 재계산
        </button>
      </div>

      {isLoading && <div className="text-center py-12 text-slate-500">분석 중... (몬테카를로 3000회 + 상관 계산)</div>}
      {error && <div className="text-center py-12 text-rose-400">로드 실패</div>}
      {data?.success === false && <div className="text-center py-12 text-rose-400">실패: {data?.error}</div>}
      {data?.empty && <div className="text-center py-12 text-slate-500">포트폴리오가 비어있습니다</div>}

      {data?.success && !data.empty && (
        <>
          {/* 상단 핵심 지표 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <StatCard
              label="총 평가액"
              value={fmtUsd(port?.totalValue)}
              sub={`손익 ${port?.totalPnl >= 0 ? "+" : ""}${fmtUsd(port?.totalPnl)}`}
              subColor={port?.totalPnl >= 0 ? "emerald" : "rose"}
            />
            <StatCard
              label="연환산 변동성"
              value={`${port?.annualVol?.toFixed(1)}%`}
              sub={port?.annualVol > 40 ? "고위험" : port?.annualVol > 25 ? "중위험" : "정상"}
              subColor={port?.annualVol > 40 ? "rose" : port?.annualVol > 25 ? "amber" : "emerald"}
            />
            <StatCard
              label="집중도 (HHI)"
              value={`${(port?.hhi * 100).toFixed(1)}`}
              sub={port?.hhi > 0.4 ? "집중됨" : port?.hhi > 0.25 ? "보통" : "분산됨"}
              subColor={port?.hhi > 0.4 ? "rose" : port?.hhi > 0.25 ? "amber" : "emerald"}
            />
            <StatCard
              label="레버리지 익스포저"
              value={`${port?.leveragedExposure?.toFixed(2)}x`}
              sub={port?.leveragedExposure > 1.5 ? "과도" : port?.leveragedExposure > 1.2 ? "높음" : "정상"}
              subColor={port?.leveragedExposure > 1.5 ? "rose" : port?.leveragedExposure > 1.2 ? "amber" : "emerald"}
            />
          </div>

          {/* 진단 */}
          {diagnosis.length > 0 && (
            <div className="mb-4 bg-rose-500/5 border border-rose-500/30 rounded-xl p-3">
              <div className="text-xs font-bold text-rose-400 mb-2 uppercase tracking-wider">🚨 종합 진단</div>
              <ul className="space-y-1 text-[12px] text-slate-300">
                {diagnosis.map((d: string, i: number) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-rose-400">▸</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 탭 */}
          <div className="flex gap-1 mb-3 border-b border-slate-700 overflow-x-auto">
            {[
              { id: "overview", label: "🎯 개요" },
              { id: "correlation", label: "🔗 상관행렬" },
              { id: "risk", label: "📊 리스크 기여도" },
              { id: "montecarlo", label: "🎲 몬테카를로" },
              { id: "whatif", label: "🔮 What-If" },
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

          {/* 개요 탭 */}
          {tab === "overview" && (
            <div className="space-y-2">
              {positions.map((p: any) => (
                <div key={p.symbol} className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{p.symbol}</span>
                      {p.leverage > 1 && (
                        <span className="bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded text-[9px] font-bold">
                          {p.leverage}x
                        </span>
                      )}
                      <span className="text-[11px] text-slate-500">← {p.underlying}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-white">{fmtUsd(p.marketValue)}</div>
                      <div className={`text-[10px] ${p.pnlPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {p.pnlPct >= 0 ? "+" : ""}{p.pnlPct.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div>
                      <div className="text-slate-500">비중</div>
                      <div className="text-white font-bold">{(p.weight * 100).toFixed(1)}%</div>
                      <div className="h-1 bg-slate-700 rounded-full mt-0.5 overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: `${p.weight * 100}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">연환산 변동성</div>
                      <div className={`font-bold ${p.annualVol > 60 ? "text-rose-400" : p.annualVol > 40 ? "text-amber-400" : "text-emerald-400"}`}>
                        {p.annualVol?.toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">리스크 기여도</div>
                      <div className={`font-bold ${p.riskContribution > 0.4 ? "text-rose-400" : "text-white"}`}>
                        {(p.riskContribution * 100).toFixed(1)}%
                      </div>
                      <div className="h-1 bg-slate-700 rounded-full mt-0.5 overflow-hidden">
                        <div className={`h-full ${p.riskContribution > 0.4 ? "bg-rose-500" : "bg-amber-500"}`} style={{ width: `${p.riskContribution * 100}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 상관행렬 탭 */}
          {tab === "correlation" && corr && (
            <div>
              <div className="text-[11px] text-slate-400 mb-3">
                60일 일간 수익률 기반 피어슨 상관계수. 1에 가까울수록 함께 움직임.
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr>
                      <th className="bg-slate-800 text-slate-400 p-2 text-left"></th>
                      {corr.symbols.map((s: string) => (
                        <th key={s} className="bg-slate-800 text-slate-300 p-2 font-bold text-xs">{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {corr.matrix.map((row: number[], i: number) => (
                      <tr key={i}>
                        <td className="bg-slate-800 text-slate-300 p-2 font-bold text-xs">{corr.symbols[i]}</td>
                        {row.map((val, j) => {
                          const bgStyle = getCorrColor(val);
                          return (
                            <td key={j} className="p-2 text-center font-mono font-bold" style={bgStyle}>
                              {val.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 bg-slate-800/30 border border-slate-700 rounded-lg p-3 text-[11px]">
                <div className="font-bold text-amber-400 mb-1">💡 해석</div>
                <ul className="space-y-1 text-slate-400">
                  <li>• ORCL/ORCX/ORCU 간 상관 ≈ 1.00 → <b className="text-rose-400">동일 기초자산 3중 노출</b></li>
                  <li>• 동일 섹터 (XLK) 주식은 일반적으로 0.5~0.8 상관</li>
                  <li>• 상관 높은 종목 다량 보유 시 <b>체감 리스크는 합산값보다 훨씬 큼</b></li>
                </ul>
              </div>
            </div>
          )}

          {/* 리스크 기여도 탭 */}
          {tab === "risk" && (
            <div>
              <div className="text-[11px] text-slate-400 mb-3">
                각 종목이 전체 포트폴리오 변동성에 기여하는 비율. 비중과 달라질 수 있음 (변동성·상관 반영).
              </div>
              <div className="h-64 bg-slate-800/30 rounded-xl p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={positions.map((p: any) => ({
                      symbol: p.symbol,
                      weight: p.weight * 100,
                      risk: p.riskContribution * 100,
                    }))}
                    layout="vertical"
                  >
                    <CartesianGrid stroke="#2a3550" strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#64748b" }} />
                    <YAxis type="category" dataKey="symbol" tick={{ fontSize: 11, fill: "#cbd5e1" }} width={50} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                      formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name === "weight" ? "비중" : "리스크 기여"]}
                    />
                    <Bar dataKey="weight" fill="#3b82f6" name="weight" />
                    <Bar dataKey="risk" fill="#ef4444" name="risk" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 bg-slate-800/30 border border-slate-700 rounded-lg p-3 text-[11px]">
                <div className="font-bold text-amber-400 mb-1">💡 해석</div>
                <ul className="space-y-1 text-slate-400">
                  <li>• <b className="text-blue-400">파란색</b> = 비중, <b className="text-rose-400">빨간색</b> = 리스크 기여도</li>
                  <li>• 빨간색이 파란색보다 길다 = <b>변동성이 비중보다 크다 (위험 응축)</b></li>
                  <li>• 레버리지 ETF는 일반적으로 이 격차가 큼</li>
                </ul>
              </div>
            </div>
          )}

          {/* 몬테카를로 탭 */}
          {tab === "montecarlo" && mc && (
            <div>
              <div className="text-[11px] text-slate-400 mb-3">
                30일 후 포트폴리오 가치 분포 (3,000회 시뮬레이션, 상관 반영 다변량 정규).
              </div>

              <div className="grid grid-cols-5 gap-2 mb-4">
                <PctCard label="5% 최악" value={mc.percentiles.p5} current={mc.currentValue} color="rose" />
                <PctCard label="25%" value={mc.percentiles.p25} current={mc.currentValue} color="amber" />
                <PctCard label="중앙값" value={mc.percentiles.p50} current={mc.currentValue} color="slate" highlight />
                <PctCard label="75%" value={mc.percentiles.p75} current={mc.currentValue} color="blue" />
                <PctCard label="95% 최고" value={mc.percentiles.p95} current={mc.currentValue} color="emerald" />
              </div>

              <div className="h-48 bg-slate-800/30 rounded-xl p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mc.histogramBins}>
                    <CartesianGrid stroke="#2a3550" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="value"
                      tick={{ fontSize: 9, fill: "#64748b" }}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                    />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                      formatter={(v: number) => [`${v}회`, "빈도"]}
                      labelFormatter={(v) => `$${Number(v).toFixed(0)}`}
                    />
                    <ReferenceLine x={mc.currentValue} stroke="#fbbf24" strokeDasharray="5 5" label={{ value: "현재", fill: "#fbbf24", fontSize: 10 }} />
                    <Bar dataKey="count">
                      {mc.histogramBins.map((b: any, i: number) => (
                        <Cell key={i} fill={b.value < mc.currentValue ? "#ef4444" : "#22c55e"} opacity={0.7} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-lg p-3">
                  <div className="text-[11px] text-slate-400">30일 내 수익 확률</div>
                  <div className="text-2xl font-bold text-emerald-400">{(mc.probProfit * 100).toFixed(0)}%</div>
                </div>
                <div className="bg-rose-500/5 border border-rose-500/30 rounded-lg p-3">
                  <div className="text-[11px] text-slate-400">30일 내 -10% 손실 확률</div>
                  <div className="text-2xl font-bold text-rose-400">{(mc.probLoss10 * 100).toFixed(0)}%</div>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-500 text-center">
                기대 평가액: <b className="text-white">{fmtUsd(mc.expectedValue)}</b>
                {" · "}
                현재 대비 {mc.expectedValue >= mc.currentValue ? "+" : ""}{((mc.expectedValue / mc.currentValue - 1) * 100).toFixed(1)}%
              </div>
            </div>
          )}

          {/* What-If 탭 */}
          {tab === "whatif" && (
            <div className="space-y-3">
              <div className="text-[11px] text-slate-400 mb-2">
                특정 종목 매도 후 포트폴리오 리스크·수익 변화 시뮬레이션. <b className="text-amber-400">"오늘 밤 실행" 시나리오 포함.</b>
              </div>

              {/* 현재 상태 */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
                <div className="text-xs font-bold text-slate-300 mb-2">현재 상태</div>
                <div className="grid grid-cols-3 gap-3 text-[11px]">
                  <div>
                    <div className="text-slate-500">평가액</div>
                    <div className="font-bold text-white text-base">{fmtUsd(port?.totalValue)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">연환산 변동성</div>
                    <div className="font-bold text-rose-400 text-base">{port?.annualVol?.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-slate-500">집중도</div>
                    <div className="font-bold text-amber-400 text-base">{(port?.hhi * 100).toFixed(1)}</div>
                  </div>
                </div>
              </div>

              {whatIfs.map((wi: any, idx: number) => {
                const r = wi.result;
                if (!r) return null;
                const volChange = r.annualVol - port?.annualVol;
                const hhiChange = r.concentrationHHI - port?.hhi;
                const isBigCut = volChange < -5;
                return (
                  <div
                    key={idx}
                    className={`border-2 rounded-xl p-3 ${
                      isBigCut ? "border-emerald-500/40 bg-emerald-500/5" : "border-slate-700 bg-slate-800/30"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-bold text-white">{wi.label}</div>
                      <div className="text-[10px] text-slate-500">매도: {wi.remove.join(", ")}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-[11px]">
                      <div>
                        <div className="text-slate-500">잔존 평가액</div>
                        <div className="font-bold text-white text-base">{fmtUsd(r.newTotalValue)}</div>
                        <div className="text-[10px] text-slate-500">현금화 {fmtUsd(port?.totalValue - r.newTotalValue)}</div>
                      </div>
                      <div>
                        <div className="text-slate-500">연환산 변동성</div>
                        <div className={`font-bold text-base ${r.annualVol > 40 ? "text-rose-400" : r.annualVol > 25 ? "text-amber-400" : "text-emerald-400"}`}>
                          {r.annualVol.toFixed(1)}%
                        </div>
                        <div className={`text-[10px] ${volChange < 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {volChange > 0 ? "+" : ""}{volChange.toFixed(1)}%p
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">집중도 (HHI)</div>
                        <div className="font-bold text-white text-base">{(r.concentrationHHI * 100).toFixed(1)}</div>
                        <div className={`text-[10px] ${hhiChange < 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {hhiChange > 0 ? "+" : ""}{(hhiChange * 100).toFixed(1)}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-2 pt-2 border-t border-slate-700">
                      <div className="text-[11px]">
                        <span className="text-slate-500">30일 수익 확률: </span>
                        <b className="text-emerald-400">{(r.monteCarlo.probProfit * 100).toFixed(0)}%</b>
                      </div>
                      <div className="text-[11px]">
                        <span className="text-slate-500">-10% 손실 확률: </span>
                        <b className="text-rose-400">{(r.monteCarlo.probLoss10 * 100).toFixed(0)}%</b>
                      </div>
                    </div>
                    {isBigCut && (
                      <div className="mt-2 bg-emerald-500/10 border border-emerald-500/30 rounded p-2 text-[11px] text-emerald-400">
                        💚 <b>변동성 {Math.abs(volChange).toFixed(1)}%p 감소</b> — 유의미한 리스크 축소
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="bg-blue-500/5 border-l-4 border-blue-500 rounded-r-lg p-3 text-[11px]">
                <div className="text-blue-400 font-bold mb-1">💡 카일님 판단 가이드</div>
                <div className="text-slate-300 leading-relaxed">
                  변동성 감소가 3%p 미만이면 매도 효과 미미, 5%p 이상 감소하면 의미 있는 리스크 관리.
                  현금화한 금액은 <b className="text-white">TIGER S&P500 등 저변동성 자산</b>으로 재배치하면 리스크 감소가 영구화됨.
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, subColor = "slate" }: {
  label: string; value: string; sub?: string; subColor?: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    amber: "text-amber-400",
    blue: "text-blue-400",
    slate: "text-slate-400",
  };
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-bold text-white mt-0.5">{value}</div>
      {sub && <div className={`text-[10px] mt-0.5 ${colorMap[subColor]}`}>{sub}</div>}
    </div>
  );
}

function PctCard({ label, value, current, color, highlight = false }: {
  label: string; value: number; current: number; color: string; highlight?: boolean;
}) {
  const pct = ((value / current) - 1) * 100;
  const colorMap: Record<string, string> = {
    rose: "text-rose-400 border-rose-500/30",
    amber: "text-amber-400 border-amber-500/30",
    slate: "text-slate-300 border-slate-500/30",
    blue: "text-blue-400 border-blue-500/30",
    emerald: "text-emerald-400 border-emerald-500/30",
  };
  return (
    <div className={`rounded-lg p-2 border text-center ${colorMap[color]} ${highlight ? "bg-slate-800/80" : "bg-slate-800/30"}`}>
      <div className="text-[9px] text-slate-500 uppercase">{label}</div>
      <div className="text-sm font-bold mt-0.5">{fmtUsd(value)}</div>
      <div className="text-[10px] mt-0.5">{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</div>
    </div>
  );
}

function getCorrColor(val: number): React.CSSProperties {
  const abs = Math.abs(val);
  if (val > 0.7) return { background: `rgba(239, 68, 68, ${abs * 0.5})`, color: "#fff" };
  if (val > 0.3) return { background: `rgba(251, 191, 36, ${abs * 0.5})`, color: "#fff" };
  if (val > -0.3) return { background: "rgba(71, 85, 105, 0.3)", color: "#cbd5e1" };
  return { background: `rgba(34, 197, 94, ${abs * 0.5})`, color: "#fff" };
}
