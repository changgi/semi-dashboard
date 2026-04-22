"use client";

import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

type RegimeData = any;

export default function MarketRegimePanel() {
  const { data, isLoading, error, mutate } = useSWR<RegimeData>(
    "/api/market-regime",
    safeFetcher,
    { refreshInterval: 300000, revalidateOnFocus: false }
  );

  const regime = data?.regime;
  const regimeMap: Record<string, { label: string; color: string; emoji: string; desc: string }> = {
    risk_on: { label: "리스크온", color: "emerald", emoji: "🟢", desc: "위험자산 선호 국면 · 테크/성장주 유리" },
    risk_off: { label: "리스크오프", color: "rose", emoji: "🔴", desc: "안전자산 선호 국면 · 방어주/현금 유리" },
    transition: { label: "전환 국면", color: "amber", emoji: "🟡", desc: "방향성 탐색 중 · 섹터 로테이션 발생" },
    late_cycle: { label: "후기 사이클", color: "purple", emoji: "🟣", desc: "고변동성 · 2x 레버리지 위험" },
  };
  const info = regime ? regimeMap[regime] : null;

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700 rounded-2xl p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-amber-400 font-bold tracking-wider uppercase">🌐 Market Regime Engine</div>
          <h3 className="text-lg font-bold text-white mt-1">시황 국면 분석</h3>
        </div>
        <button
          onClick={() => mutate()}
          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700"
        >
          ↻
        </button>
      </div>

      {isLoading && <div className="text-center py-12 text-slate-500">시황 분석 중...</div>}
      {error && <div className="text-center py-12 text-rose-400">로드 실패</div>}
      {data?.success === false && <div className="text-center py-12 text-rose-400">실패: {data?.error}</div>}

      {data?.success && (
        <>
          {/* 국면 헤드라인 */}
          {info && (
            <div className={`rounded-2xl p-4 mb-4 border-2 bg-${info.color}-500/10 border-${info.color}-500/50`}>
              <div className="flex items-start gap-3">
                <div className="text-3xl">{info.emoji}</div>
                <div className="flex-1">
                  <div className="text-xs uppercase tracking-wider text-slate-400">현재 국면</div>
                  <div className="text-xl font-bold text-white mt-0.5">{info.label}</div>
                  <div className="text-[12px] text-slate-400 mt-1">{info.desc}</div>
                  <div className="text-[11px] text-slate-500 mt-2 italic">{data.headline}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-500">점수</div>
                  <div className={`font-bold text-lg ${data.regimeScore >= 3 ? "text-emerald-400" : data.regimeScore <= -3 ? "text-rose-400" : "text-amber-400"}`}>
                    {data.regimeScore > 0 ? "+" : ""}{data.regimeScore}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 주요 지수 */}
          <div className="mb-4">
            <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-wider">📊 주요 지수</div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {["SPY", "QQQ", "IWM", "VIX", "TLT"].map(key => {
                const idx = data.indices[key];
                if (!idx) return null;
                const change = idx.changePct;
                return (
                  <div key={key} className="bg-slate-800/50 border border-slate-700 rounded-lg p-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{key}</span>
                      {idx.sma50AboveSma200 != null && (
                        <span className={`text-[9px] px-1 rounded ${idx.sma50AboveSma200 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                          {idx.sma50AboveSma200 ? "정배열" : "역배열"}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-bold text-white mt-1">
                      {idx.price != null ? idx.price.toFixed(2) : "-"}
                    </div>
                    <div className={`text-[11px] font-semibold ${change > 0 ? "text-emerald-400" : change < 0 ? "text-rose-400" : "text-slate-500"}`}>
                      {change != null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "-"}
                    </div>
                    {idx.ret20d != null && (
                      <div className="text-[10px] text-slate-500 mt-0.5">20d {idx.ret20d >= 0 ? "+" : ""}{idx.ret20d.toFixed(1)}%</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 국면 판단 근거 */}
          <div className="mb-4 bg-slate-800/30 border border-slate-700 rounded-xl p-3">
            <div className="text-xs font-bold text-amber-400 mb-2 uppercase tracking-wider">🎯 국면 판단 근거</div>
            <ul className="space-y-1 text-[12px] text-slate-300">
              {data.regimeReasons?.map((r: string, i: number) => (
                <li key={i} className="flex gap-2">
                  <span className="text-slate-500">▸</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 섹터 로테이션 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-3">
              <div className="text-xs font-bold text-emerald-400 mb-2 uppercase tracking-wider">🏆 강세 섹터</div>
              {data.sectorRotation?.leaders?.map((s: any) => (
                <div key={s.symbol} className="flex justify-between items-center py-1 text-[12px] border-b border-slate-800 last:border-0">
                  <div>
                    <span className="font-bold text-white">{s.symbol}</span>
                    <span className="text-slate-400 ml-2">{s.name}</span>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${s.ret20d > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {s.ret20d != null ? `${s.ret20d >= 0 ? "+" : ""}${s.ret20d.toFixed(1)}%` : "-"}
                    </div>
                    <div className="text-[10px] text-slate-500">20d</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-rose-500/5 border border-rose-500/30 rounded-xl p-3">
              <div className="text-xs font-bold text-rose-400 mb-2 uppercase tracking-wider">⚠ 약세 섹터</div>
              {data.sectorRotation?.laggards?.map((s: any) => (
                <div key={s.symbol} className="flex justify-between items-center py-1 text-[12px] border-b border-slate-800 last:border-0">
                  <div>
                    <span className="font-bold text-white">{s.symbol}</span>
                    <span className="text-slate-400 ml-2">{s.name}</span>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${s.ret20d > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {s.ret20d != null ? `${s.ret20d >= 0 ? "+" : ""}${s.ret20d.toFixed(1)}%` : "-"}
                    </div>
                    <div className="text-[10px] text-slate-500">20d</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 오늘의 테마 */}
          {data.themes && data.themes.length > 0 && (
            <div className="mb-4 bg-purple-500/5 border border-purple-500/30 rounded-xl p-3">
              <div className="text-xs font-bold text-purple-400 mb-2 uppercase tracking-wider">💡 오늘의 테마</div>
              <div className="space-y-1 text-[12px] text-slate-300">
                {data.themes.map((t: string, i: number) => (
                  <div key={i} className="flex gap-2">
                    <span>🔹</span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 섹터 시그널 */}
          {data.sectorSignals && data.sectorSignals.length > 0 && (
            <div className="mb-4 bg-amber-500/5 border border-amber-500/30 rounded-xl p-3">
              <div className="text-xs font-bold text-amber-400 mb-2 uppercase tracking-wider">⚡ 섹터 시그널</div>
              <ul className="space-y-1 text-[12px] text-slate-300">
                {data.sectorSignals.map((s: string, i: number) => (
                  <li key={i} className="flex gap-2">
                    <span>📌</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 카일 포트폴리오 영향 */}
          {data.kylePortfolioImpact && data.kylePortfolioImpact.length > 0 && (
            <div className="mb-4 bg-blue-500/5 border border-blue-500/30 rounded-xl p-3">
              <div className="text-xs font-bold text-blue-400 mb-2 uppercase tracking-wider">💼 카일님 포트폴리오 영향</div>
              <div className="space-y-1.5">
                {data.kylePortfolioImpact.map((p: any) => (
                  <div key={p.symbol} className="flex justify-between items-center text-[12px] py-1 border-b border-slate-800 last:border-0">
                    <div>
                      <span className="font-bold text-white">{p.symbol}</span>
                      {p.leverage > 1 && <span className="ml-1.5 bg-rose-500/20 text-rose-400 px-1 py-0.5 rounded text-[9px]">{p.leverage}x</span>}
                      <span className="text-slate-500 ml-2">←{p.underlying}</span>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${p.leveragedImpact > 0 ? "text-emerald-400" : p.leveragedImpact < 0 ? "text-rose-400" : "text-slate-400"}`}>
                        {p.leveragedImpact != null ? `${p.leveragedImpact >= 0 ? "+" : ""}${p.leveragedImpact.toFixed(2)}%` : "-"}
                      </div>
                      <div className="text-[9px] text-slate-500">기초 {p.underlyingChange != null ? `${p.underlyingChange >= 0 ? "+" : ""}${p.underlyingChange.toFixed(2)}%` : "-"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 전망 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <div className="text-xs font-bold text-emerald-400 mb-2 uppercase tracking-wider">📅 단기 전망</div>
              <ul className="space-y-1 text-[12px] text-slate-300">
                {data.outlook?.short?.map((o: string, i: number) => (
                  <li key={i}>• {o}</li>
                ))}
              </ul>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <div className="text-xs font-bold text-blue-400 mb-2 uppercase tracking-wider">📆 중기 전망</div>
              <ul className="space-y-1 text-[12px] text-slate-300">
                {data.outlook?.mid?.map((o: string, i: number) => (
                  <li key={i}>• {o}</li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
