"use client";

import { useState } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

type OptionsData = any;

export default function OptionsSignalsPanel() {
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const { data, isLoading, error, mutate } = useSWR<OptionsData>(
    "/api/options-signals",
    safeFetcher,
    { refreshInterval: 0, revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  const analyses = data?.analyses ?? [];
  const summary = data?.summary;
  const insights = data?.insights ?? [];

  const signalColor: Record<string, string> = {
    bullish: "emerald",
    bearish: "rose",
    neutral: "slate",
  };

  const signalEmoji: Record<string, string> = {
    bullish: "🚀",
    bearish: "🚨",
    neutral: "⚖️",
  };

  const sentimentColor: Record<string, string> = {
    very_bullish: "text-emerald-400",
    bullish: "text-emerald-500",
    neutral: "text-slate-400",
    bearish: "text-amber-400",
    very_bearish: "text-rose-400",
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs text-amber-400 font-bold tracking-wider uppercase">
            📈 Options Signals Engine
          </div>
          <h3 className="text-lg font-bold text-white mt-1">옵션 시장 시그널</h3>
          <div className="text-[11px] text-slate-500 mt-1">
            P/C Ratio · IV Skew · Max Pain · Unusual Activity
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
      <div className="mb-4 bg-blue-500/5 border-l-4 border-blue-500 rounded-r-lg p-3 text-[12px]">
        <div className="text-blue-400 font-bold mb-1">🎯 옵션 = 기관의 진짜 포지션</div>
        <div className="text-slate-400 italic leading-relaxed">
          "주식은 이야기를 하고, 옵션은 행동을 한다" — 기관은 현물 외에 옵션으로 실제 방향 베팅을 드러냅니다.
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-12 text-slate-500">
          <div className="inline-block animate-pulse">📊</div>
          <div className="text-sm mt-2">옵션 체인 교차 분석 중...</div>
        </div>
      )}

      {error && <div className="text-center py-12 text-rose-400">로드 실패</div>}

      {data?.success && (
        <>
          {/* 요약 */}
          {summary && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-500">🚀 강세</div>
                <div className="text-xl font-bold text-emerald-400">{summary.bullish}</div>
              </div>
              <div className="bg-slate-500/10 border border-slate-500/30 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-500">⚖️ 중립</div>
                <div className="text-xl font-bold text-slate-300">{summary.neutral}</div>
              </div>
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-500">🚨 약세</div>
                <div className="text-xl font-bold text-rose-400">{summary.bearish}</div>
              </div>
            </div>
          )}

          {/* 인사이트 */}
          {insights.length > 0 && (
            <div className="mb-4 bg-purple-500/5 border border-purple-500/30 rounded-xl p-3">
              <div className="text-xs font-bold text-purple-400 mb-2 uppercase tracking-wider">
                🎯 종합 인사이트
              </div>
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

          {/* 종목별 카드 */}
          <div className="space-y-2">
            {analyses.map((a: any) => {
              if (a.error) {
                return (
                  <div key={a.symbol} className="bg-slate-800/30 border border-slate-700 rounded-xl p-3 text-[11px]">
                    <span className="font-bold text-slate-400">{a.symbol}</span>
                    <span className="text-rose-400 ml-2">{a.error}</span>
                  </div>
                );
              }
              const isExpanded = expandedSymbol === a.symbol;
              const sig = a.signal;
              const color = signalColor[sig.netSignal];
              return (
                <div
                  key={a.symbol}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    sig.netSignal === "bearish" ? "border-rose-500/40 bg-rose-500/5" :
                    sig.netSignal === "bullish" ? "border-emerald-500/40 bg-emerald-500/5" :
                    "border-slate-700 bg-slate-800/30"
                  }`}
                >
                  <div
                    onClick={() => setExpandedSymbol(isExpanded ? null : a.symbol)}
                    className="p-3 cursor-pointer hover:bg-slate-800/30"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{signalEmoji[sig.netSignal]}</span>
                        <span className="font-bold text-white text-base">{a.symbol}</span>
                        <span className="text-[10px] text-slate-500">
                          ${a.underlyingPrice?.toFixed(2)}
                        </span>
                        {a.nearestExpiration && (
                          <span className="text-[9px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-400">
                            만기 {a.nearestExpiration}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded bg-${color}-500 text-white`}>
                          {sig.netSignal === "bullish" ? "강세" : sig.netSignal === "bearish" ? "약세" : "중립"}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>

                    {/* 미니 지표 */}
                    <div className="grid grid-cols-4 gap-2 text-[10px]">
                      <div>
                        <div className="text-slate-500">P/C Ratio</div>
                        <div className={`font-bold ${sentimentColor[a.putCallRatio.sentiment]}`}>
                          {a.putCallRatio.volumeRatio.toFixed(2)}
                        </div>
                      </div>
                      {a.ivSkew && (
                        <div>
                          <div className="text-slate-500">IV Skew</div>
                          <div className={`font-bold ${
                            a.ivSkew.totalSkew > 0.08 ? "text-rose-400" :
                            a.ivSkew.totalSkew < 0 ? "text-emerald-400" :
                            "text-slate-400"
                          }`}>
                            {(a.ivSkew.totalSkew * 100).toFixed(1)}%
                          </div>
                        </div>
                      )}
                      {a.maxPain && (
                        <div>
                          <div className="text-slate-500">Max Pain</div>
                          <div className={`font-bold ${
                            a.maxPain.distanceFromSpot > 3 ? "text-emerald-400" :
                            a.maxPain.distanceFromSpot < -3 ? "text-rose-400" :
                            "text-slate-400"
                          }`}>
                            ${a.maxPain.maxPainStrike} ({a.maxPain.distanceFromSpot >= 0 ? "+" : ""}{a.maxPain.distanceFromSpot.toFixed(1)}%)
                          </div>
                        </div>
                      )}
                      <div>
                        <div className="text-slate-500">이상 활동</div>
                        <div className="font-bold text-amber-400">{a.unusualActivity.length}건</div>
                      </div>
                    </div>

                    {/* 근거 체인 */}
                    <div className="mt-2 pt-2 border-t border-slate-700 flex flex-wrap gap-2 text-[10px]">
                      {sig.reasons.map((r: string, i: number) => (
                        <span key={i} className="text-slate-400">{r}</span>
                      ))}
                    </div>
                  </div>

                  {/* 펼친 상세 */}
                  {isExpanded && (
                    <div className="border-t border-slate-700 bg-slate-900/50 p-3 space-y-3 text-[11px]">
                      {/* P/C Detail */}
                      <div>
                        <div className="font-bold text-blue-400 mb-1">P/C Ratio 상세</div>
                        <div className="grid grid-cols-2 gap-2 pl-2 text-slate-300">
                          <div>거래량 풋: <b>{a.putCallRatio.totalPutVol.toLocaleString()}</b></div>
                          <div>거래량 콜: <b>{a.putCallRatio.totalCallVol.toLocaleString()}</b></div>
                          <div>미결제 풋: <b>{a.putCallRatio.totalPutOI.toLocaleString()}</b></div>
                          <div>미결제 콜: <b>{a.putCallRatio.totalCallOI.toLocaleString()}</b></div>
                        </div>
                      </div>

                      {/* IV Skew */}
                      {a.ivSkew && (
                        <div>
                          <div className="font-bold text-purple-400 mb-1">IV Skew 해석</div>
                          <div className="pl-2 text-slate-300 space-y-1">
                            <div>등가격 IV: {(a.ivSkew.atmIV * 100).toFixed(1)}% · 외가격 풋 IV: {(a.ivSkew.otmPutIV * 100).toFixed(1)}% · 외가격 콜 IV: {(a.ivSkew.otmCallIV * 100).toFixed(1)}%</div>
                            <div className="italic text-slate-400">💬 {a.ivSkew.interpretation}</div>
                          </div>
                        </div>
                      )}

                      {/* Max Pain */}
                      {a.maxPain && (
                        <div>
                          <div className="font-bold text-amber-400 mb-1">Max Pain 해석</div>
                          <div className="pl-2 text-slate-300 italic">💬 {a.maxPain.interpretation}</div>
                        </div>
                      )}

                      {/* Unusual Activity */}
                      {a.unusualActivity.length > 0 && (
                        <div>
                          <div className="font-bold text-rose-400 mb-1">이상 거래 활동</div>
                          <div className="space-y-1">
                            {a.unusualActivity.map((u: any, i: number) => (
                              <div key={i} className="bg-slate-800/50 rounded px-2 py-1">
                                <div className="flex justify-between">
                                  <span className={u.type === "call" ? "text-emerald-400" : "text-rose-400"}>
                                    {u.type === "call" ? "📞 CALL" : "📉 PUT"} ${u.strike}
                                  </span>
                                  <span className="text-slate-400">Vol/OI {u.volOIRatio.toFixed(1)}x</span>
                                </div>
                                <div className="text-slate-500 text-[10px] mt-0.5">{u.interpretation}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 교육 섹션 */}
          {data?.education && (
            <details className="mt-4 bg-slate-800/30 rounded-xl p-3 text-[11px]">
              <summary className="cursor-pointer text-amber-400 font-bold">
                📖 옵션 지표 해석 가이드
              </summary>
              <div className="mt-2 space-y-2 text-slate-400">
                <div><b className="text-white">P/C Ratio:</b> {data.education.putCallRatio}</div>
                <div><b className="text-white">IV Skew:</b> {data.education.ivSkew}</div>
                <div><b className="text-white">Max Pain:</b> {data.education.maxPain}</div>
                <div><b className="text-white">Unusual Activity:</b> {data.education.unusual}</div>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
