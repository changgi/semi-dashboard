"use client";

import { useState } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";
import { fmtUsd } from "@/lib/format";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ReferenceDot, Area, ComposedChart, Bar,
  Legend,
} from "recharts";

type Props = {
  initialSymbol?: string;
};

type DeepData = any;

const KYLE_WATCHLIST = ["ORCL", "ORCX", "ORCU", "AMZU", "TSLL", "NVDA", "AAPL", "MSFT", "GOOGL", "TSLA", "CDNS", "AMD"];

export default function DeepAnalysisPanel({ initialSymbol = "ORCL" }: Props) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [tab, setTab] = useState<"chart" | "diagnose" | "forecast" | "reasoning" | "action">("chart");
  const [customSymbol, setCustomSymbol] = useState("");

  const { data, isLoading, error, mutate } = useSWR<DeepData>(
    `/api/deep-analysis/${symbol}`,
    safeFetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );

  const tech = data?.technical;
  const diag = data?.diagnosis;
  const rec = data?.recommendation;
  const fc30 = data?.forecast?.days30;
  const fc5 = data?.forecast?.days5;
  const fc90 = data?.forecast?.days90;
  const reasoning = data?.reasoning;
  const port = data?.portfolio;
  const chart = data?.chart ?? [];

  const handleCustom = () => {
    if (!customSymbol.trim()) return;
    setSymbol(customSymbol.trim().toUpperCase());
    setCustomSymbol("");
  };

  const actionColor = (a?: string) => {
    if (a === "STRONG_BUY") return "bg-emerald-600 text-white";
    if (a === "BUY") return "bg-emerald-500 text-black";
    if (a === "SELL") return "bg-rose-500 text-black";
    if (a === "STRONG_SELL") return "bg-rose-600 text-white";
    return "bg-slate-500 text-white";
  };

  const actionLabel = (a?: string) => {
    const map: Record<string, string> = {
      STRONG_BUY: "강력 매수", BUY: "매수", HOLD: "관망", SELL: "매도", STRONG_SELL: "강력 매도",
    };
    return map[a ?? "HOLD"] ?? "-";
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700 rounded-2xl p-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-amber-400 font-bold tracking-wider uppercase">🔬 Deep Analysis Engine</div>
          <h3 className="text-lg font-bold text-white mt-1">다각도 통합 분석 · {symbol}</h3>
        </div>
        <button
          onClick={() => mutate()}
          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700"
        >
          ↻ 새로고침
        </button>
      </div>

      {/* 종목 선택 */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {KYLE_WATCHLIST.map(s => (
          <button
            key={s}
            onClick={() => setSymbol(s)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
              symbol === s
                ? "bg-blue-500 text-white border-blue-400"
                : "bg-slate-800 text-slate-300 border-slate-700 hover:border-blue-500"
            }`}
          >
            {s}
          </button>
        ))}
        <div className="flex gap-1">
          <input
            value={customSymbol}
            onChange={e => setCustomSymbol(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCustom()}
            placeholder="심볼"
            className="text-xs bg-slate-800 text-white border border-slate-700 rounded-lg px-2 py-1.5 w-20"
          />
          <button onClick={handleCustom} className="text-xs bg-slate-800 text-slate-300 px-2 py-1.5 rounded-lg border border-slate-700 hover:border-blue-500">
            ▶
          </button>
        </div>
      </div>

      {/* 로딩/에러 */}
      {isLoading && <div className="text-center py-12 text-slate-500">분석 중...</div>}
      {error && <div className="text-center py-12 text-rose-400">로드 실패</div>}
      {data?.success === false && <div className="text-center py-12 text-rose-400">분석 실패: {data?.error}</div>}

      {/* 헤드라인 카드 */}
      {data?.success && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">현재가</div>
              <div className="text-xl font-bold text-white">{fmtUsd(data.price)}</div>
              <div className="text-[11px] text-slate-500 mt-1">{data.asOf}</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">추세</div>
              <div className={`text-sm font-bold mt-1 ${
                tech?.trend === "uptrend" ? "text-emerald-400" :
                tech?.trend === "downtrend" ? "text-rose-400" : "text-amber-400"
              }`}>
                {tech?.trend === "uptrend" ? "📈 상승" : tech?.trend === "downtrend" ? "📉 하락" : "➖ 횡보"}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                20일 {tech?.momentum20d >= 0 ? "+" : ""}{tech?.momentum20d?.toFixed(1)}%
              </div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">52주 위치</div>
              <div className="text-sm font-bold text-white mt-1">
                {(tech?.week52Position * 100).toFixed(0)}%
              </div>
              <div className="h-1 bg-slate-700 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-rose-500 via-amber-500 to-emerald-500"
                  style={{ width: `${Math.max(0, Math.min(100, tech?.week52Position * 100))}%` }}
                />
              </div>
            </div>
            <div className={`rounded-xl p-3 border ${actionColor(rec?.action)} bg-opacity-20`}>
              <div className="text-[10px] uppercase tracking-wider opacity-80">AI 판단</div>
              <div className="text-lg font-bold mt-1">{actionLabel(rec?.action)}</div>
              <div className="text-[11px] opacity-80 mt-1">신뢰도 {rec?.confidence}%</div>
            </div>
          </div>

          {port?.held && (
            <div className="mb-4 bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 flex items-center gap-3 text-sm">
              <div className="text-blue-400 font-bold">💼 보유</div>
              <div className="text-slate-300 flex-1">
                {port.shares}주 @ ${port.avgCost?.toFixed(2)} · 손익 {(((data.price / port.avgCost) - 1) * 100).toFixed(1)}%
                {port.leverage > 1 && <span className="ml-2 bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded text-[10px]">{port.leverage}x 레버리지</span>}
              </div>
            </div>
          )}

          {/* 탭 */}
          <div className="flex gap-1 mb-3 border-b border-slate-700 overflow-x-auto">
            {[
              { id: "chart", label: "📊 차트" },
              { id: "diagnose", label: "🩺 진단" },
              { id: "forecast", label: "🔮 예측" },
              { id: "reasoning", label: "💡 이유" },
              { id: "action", label: "🎯 액션" },
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

          {/* 차트 탭 */}
          {tab === "chart" && (
            <div>
              <div className="h-64 bg-slate-800/30 rounded-xl p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart}>
                    <CartesianGrid stroke="#2a3550" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748b" }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} domain={["auto", "auto"]} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="close" stroke="#38bdf8" strokeWidth={2} dot={false} name="종가" />
                    <Line type="monotone" dataKey="sma20" stroke="#fbbf24" strokeWidth={1} dot={false} name="SMA20" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="sma50" stroke="#a855f7" strokeWidth={1} dot={false} name="SMA50" strokeDasharray="3 3" />
                    {port?.held && (
                      <ReferenceLine
                        y={port.avgCost}
                        stroke="#ef4444"
                        strokeDasharray="5 5"
                        label={{ value: `매입가 $${port.avgCost?.toFixed(2)}`, fill: "#ef4444", fontSize: 10, position: "insideTopRight" }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* RSI 차트 */}
              <div className="h-32 bg-slate-800/30 rounded-xl p-3 mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart}>
                    <CartesianGrid stroke="#2a3550" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#64748b" }} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11 }}
                    />
                    <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" />
                    <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="rsi" stroke="#a855f7" strokeWidth={1.5} dot={false} name="RSI(14)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* 기술 지표 테이블 */}
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                <Metric label="RSI(14)" value={tech?.rsi14?.toFixed(1)} color={tech?.rsi14 > 70 ? "rose" : tech?.rsi14 < 30 ? "emerald" : "slate"} />
                <Metric label="SMA20" value={tech?.sma20 ? `$${tech.sma20.toFixed(2)}` : "-"} />
                <Metric label="SMA50" value={tech?.sma50 ? `$${tech.sma50.toFixed(2)}` : "-"} />
                <Metric label="SMA200" value={tech?.sma200 ? `$${tech.sma200.toFixed(2)}` : "-"} />
                <Metric label="MACD" value={tech?.macd?.toFixed(2)} color={tech?.macdHist > 0 ? "emerald" : "rose"} />
                <Metric label="ATR(14)" value={tech?.atr14?.toFixed(2)} />
                <Metric label="변동성(20)" value={tech?.vol20 ? `${tech.vol20.toFixed(1)}%` : "-"} color={tech?.vol20 > 4 ? "rose" : "slate"} />
                <Metric label="볼린저 %B" value={tech?.bollPosition != null ? `${(tech.bollPosition * 100).toFixed(0)}%` : "-"} />
              </div>
            </div>
          )}

          {/* 진단 탭 */}
          {tab === "diagnose" && (
            <div className="space-y-3 text-[13px]">
              <DiagnosisGroup title="💪 강점" items={diag?.strengths ?? []} color="emerald" />
              <DiagnosisGroup title="⚠ 약점" items={diag?.weaknesses ?? []} color="amber" />
              <DiagnosisGroup title="🚨 리스크" items={diag?.risks ?? []} color="rose" />
            </div>
          )}

          {/* 예측 탭 */}
          {tab === "forecast" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <ForecastCard label="5일 예측" data={fc5} price={data.price} />
                <ForecastCard label="30일 예측" data={fc30} price={data.price} highlight />
                <ForecastCard label="90일 예측" data={fc90} price={data.price} />
              </div>
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-[12px]">
                <div className="font-bold text-amber-400 mb-2 text-xs uppercase tracking-wider">예측 방법론</div>
                <div className="text-slate-400 leading-relaxed">
                  ATR(14) 기반 일간 변동성을 측정 → 30일 변동성으로 환산 후 기하 브라운 운동(GBM)으로 Bull(+1σ)/Base/Bear(-1σ) 시나리오 산출.
                  추세 바이어스(SMA 정배열 여부) + RSI 극단값이 drift 조정에 반영됨. 거시 이벤트/실적 서프라이즈 시나리오는 반영되지 않음.
                </div>
              </div>
            </div>
          )}

          {/* 이유 탭 */}
          {tab === "reasoning" && (
            <div className="space-y-3 text-[13px]">
              <ReasoningGroup title="💡 왜 주목하는가 (Why)" items={reasoning?.why ?? []} color="blue" />
              <ReasoningGroup title="⏰ 왜 지금인가 (When)" items={reasoning?.when ?? []} color="purple" />
              <ReasoningGroup title="⚠ 어떻게 틀릴 수 있나 (Risk)" items={reasoning?.howWrong ?? []} color="rose" />
              <ReasoningGroup title="💰 얼마나 기대되는가 (Reward)" items={reasoning?.howMuch ?? []} color="emerald" />
            </div>
          )}

          {/* 액션 탭 */}
          {tab === "action" && (
            <div className="space-y-4">
              <div className={`p-5 rounded-2xl border-2 ${
                rec?.action?.includes("BUY") ? "bg-emerald-500/10 border-emerald-500/50" :
                rec?.action?.includes("SELL") ? "bg-rose-500/10 border-rose-500/50" :
                "bg-slate-500/10 border-slate-500/50"
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider opacity-70">추천 액션</div>
                    <div className="text-2xl font-black mt-1">{actionLabel(rec?.action)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs opacity-70">신뢰도</div>
                    <div className="text-2xl font-black">{rec?.confidence}%</div>
                  </div>
                </div>

                <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${
                      rec?.action?.includes("BUY") ? "bg-emerald-500" :
                      rec?.action?.includes("SELL") ? "bg-rose-500" : "bg-slate-500"
                    }`}
                    style={{ width: `${rec?.confidence}%` }}
                  />
                </div>
              </div>

              {/* 왜 이 액션인가 */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                <div className="text-xs font-bold text-amber-400 mb-2 uppercase tracking-wider">🎯 이 액션의 근거</div>
                <ol className="space-y-1.5 text-[12px] text-slate-300">
                  <li>1️⃣ 강점 {diag?.strengths?.length ?? 0}개 vs 약점 {diag?.weaknesses?.length ?? 0}개 (순 {(diag?.strengths?.length ?? 0) - (diag?.weaknesses?.length ?? 0)})</li>
                  <li>2️⃣ 30일 기대수익률: {fc30?.expectedPct}%</li>
                  <li>3️⃣ 리스크 신호 {diag?.risks?.length ?? 0}개</li>
                  <li>4️⃣ Bull/Bear 비율: {fc30 ? `${fc30.bull.pct}% / ${fc30.bear.pct}%` : "-"}</li>
                  {port?.held && <li>5️⃣ 현재 포지션: {port.shares}주 ({port.leverage}x 레버리지)</li>}
                </ol>
              </div>

              {/* 다음 체크 포인트 */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 text-[12px]">
                <div className="font-bold text-blue-400 mb-2 uppercase tracking-wider text-xs">⏭ 다음 체크 포인트</div>
                <ul className="space-y-1 text-slate-300">
                  <li>• RSI {(tech?.rsi14?.toFixed(0))}이 {tech?.rsi14 < 50 ? "50 돌파 시 모멘텀 전환" : "30 이하 진입 시 재진입 기회"}</li>
                  <li>• SMA20 ${tech?.sma20?.toFixed(2)} {data.price > tech?.sma20 ? "이탈 시 단기 약세 전환" : "회복 시 반등 신호"}</li>
                  {tech?.week52Position < 0.3 && <li>• 52주 저점 지지 여부 확인</li>}
                  {tech?.week52Position > 0.85 && <li>• 52주 고점 돌파 vs 저항 확인</li>}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ label, value, color = "slate" }: { label: string; value?: string; color?: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    amber: "text-amber-400",
    slate: "text-slate-300",
  };
  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-2">
      <div className="text-[9px] text-slate-500 uppercase">{label}</div>
      <div className={`font-bold ${colorMap[color]}`}>{value ?? "-"}</div>
    </div>
  );
}

function DiagnosisGroup({ title, items, color }: { title: string; items: string[]; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400 bg-emerald-500/5 border-emerald-500/30",
    amber: "text-amber-400 bg-amber-500/5 border-amber-500/30",
    rose: "text-rose-400 bg-rose-500/5 border-rose-500/30",
  };
  return (
    <div className={`rounded-xl border p-3 ${colorMap[color]}`}>
      <div className="font-bold text-xs uppercase tracking-wider mb-2">{title} · {items.length}</div>
      {items.length === 0 ? (
        <div className="text-slate-500 text-xs italic">해당 없음</div>
      ) : (
        <ul className="space-y-1.5 text-slate-300">
          {items.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="opacity-60">▸</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReasoningGroup({ title, items, color }: { title: string; items: string[]; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "text-blue-400 bg-blue-500/5 border-blue-500/30",
    purple: "text-purple-400 bg-purple-500/5 border-purple-500/30",
    rose: "text-rose-400 bg-rose-500/5 border-rose-500/30",
    emerald: "text-emerald-400 bg-emerald-500/5 border-emerald-500/30",
  };
  return (
    <div className={`rounded-xl border p-3 ${colorMap[color]}`}>
      <div className="font-bold text-xs uppercase tracking-wider mb-2">{title}</div>
      <ul className="space-y-1.5 text-slate-300">
        {items.length === 0 ? (
          <li className="text-slate-500 italic">해당 없음</li>
        ) : items.map((s, i) => (
          <li key={i} className="flex gap-2">
            <span className="opacity-60">→</span>
            <span className="flex-1">{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ForecastCard({ label, data, price, highlight = false }: { label: string; data: any; price: number; highlight?: boolean }) {
  if (!data) return null;
  return (
    <div className={`rounded-xl p-4 border ${
      highlight ? "bg-blue-500/10 border-blue-500/50" : "bg-slate-800/50 border-slate-700"
    }`}>
      <div className="text-xs uppercase tracking-wider text-slate-400 mb-2">{label}</div>
      <div className="space-y-2 text-[12px]">
        <div className="flex justify-between items-center">
          <span className="text-emerald-400">🚀 Bull ({(data.bull.probability * 100).toFixed(0)}%)</span>
          <span className="font-bold text-white">${data.bull.price} <span className="text-emerald-400 text-[10px]">+{data.bull.pct}%</span></span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-blue-400">➖ Base ({(data.base.probability * 100).toFixed(0)}%)</span>
          <span className="font-bold text-white">${data.base.price} <span className="text-blue-400 text-[10px]">{data.base.pct >= 0 ? "+" : ""}{data.base.pct}%</span></span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-rose-400">🐻 Bear ({(data.bear.probability * 100).toFixed(0)}%)</span>
          <span className="font-bold text-white">${data.bear.price} <span className="text-rose-400 text-[10px]">{data.bear.pct}%</span></span>
        </div>
        <div className="pt-2 border-t border-slate-700 mt-2">
          <div className="text-[10px] text-slate-500">기대수익률</div>
          <div className={`font-bold text-sm ${data.expectedPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {data.expectedPct >= 0 ? "+" : ""}{data.expectedPct}%
          </div>
        </div>
      </div>
    </div>
  );
}
