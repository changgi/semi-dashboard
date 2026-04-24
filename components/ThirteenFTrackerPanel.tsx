"use client";

import { useState } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

/**
 * ThirteenFTrackerPanel
 *
 * SEC EDGAR 13F-HR 기반 미국 투자 전설 포트폴리오 추적.
 * Whale Insight의 미국 버전.
 */

type TrackerData = any;

export default function ThirteenFTrackerPanel() {
  const [tab, setTab] = useState<"overview" | "ownership" | "consensus" | "filings">("overview");

  const { data, isLoading, error, mutate } = useSWR<TrackerData>(
    "/api/thirteen-f-tracker?tickers=ORCL,AMZN,TSLA,NVDA,MSFT,GOOGL,AAPL,AMD",
    safeFetcher,
    { refreshInterval: 0, revalidateOnFocus: false, revalidateOnReconnect: false }
  );

  const filings = data?.filings ?? [];
  const ownership = data?.kyleInterestOwnership ?? [];
  const consensus = data?.consensusHoldings ?? [];
  const insights = data?.insights ?? [];

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs text-amber-400 font-bold tracking-wider uppercase">
            🦅 13F Institutional Tracker
          </div>
          <h3 className="text-lg font-bold text-white mt-1">미국 투자 전설 포트폴리오</h3>
          <div className="text-[11px] text-slate-500 mt-1">
            SEC EDGAR 직접 연동 · 분기 공시 · 무료 (Whale Insight 미국 대응)
          </div>
        </div>
        <button
          onClick={() => mutate()}
          className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700"
        >
          ↻
        </button>
      </div>

      {/* 데이터 후행성 경고 */}
      <div className="mb-4 bg-amber-500/5 border border-amber-500/30 rounded-lg p-3 text-[11px]">
        <div className="text-amber-400 font-bold mb-1">⚠️ 13F 특성 이해</div>
        <div className="text-slate-400">
          13F는 분기 말 기준 <b>45일 이내 제출</b>이므로 최대 45일 후행.
          공매도 포지션 미공개. "버핏이 지금 뭘 사고 있나"가 아니라 
          <b> "분기 말 시점에 뭘 보유했나"</b>.
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-16 text-slate-500">
          <div className="inline-block animate-pulse">🦅</div>
          <div className="text-sm mt-2">12명 전설 투자자 13F 조회 중...</div>
          <div className="text-[10px] text-slate-600 mt-1">SEC rate limit 10/분 → 최대 20초 소요</div>
        </div>
      )}

      {error && <div className="text-center py-12 text-rose-400">로드 실패</div>}

      {data?.success && (
        <>
          {/* 요약 */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-500">분석된 13F</div>
              <div className="text-lg font-bold text-white">{data.filingsAnalyzed}개</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-500">교차 합의 종목</div>
              <div className="text-lg font-bold text-emerald-400">{consensus.length}개</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2 text-center">
              <div className="text-[10px] text-slate-500">카일 관심 보유</div>
              <div className="text-lg font-bold text-amber-400">
                {ownership.filter((o: any) => o.heldBy.length > 0).length}/{ownership.length}
              </div>
            </div>
          </div>

          {/* 인사이트 */}
          {insights.length > 0 && (
            <div className="mb-4 bg-purple-500/5 border border-purple-500/30 rounded-xl p-3">
              <div className="text-xs font-bold text-purple-400 mb-2 uppercase tracking-wider">
                🎯 교차 분석 인사이트
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

          {/* 탭 */}
          <div className="flex gap-1 mb-3 border-b border-slate-700 overflow-x-auto">
            {[
              { id: "overview", label: "📊 개요" },
              { id: "ownership", label: "💼 카일 종목" },
              { id: "consensus", label: "🎯 합의 종목" },
              { id: "filings", label: "📑 개별 13F" },
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
              {filings.map((f: any) => (
                <div key={f.investor} className="bg-slate-800/40 border border-slate-700 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-white text-sm">{f.investor}</span>
                    <span className="text-[10px] text-slate-500">{f.style}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-400">
                    <div>
                      <span className="text-slate-500">운용 규모: </span>
                      <b className="text-white">${f.totalValueB.toFixed(1)}B</b>
                    </div>
                    <div>
                      <span className="text-slate-500">보유 종목: </span>
                      <b className="text-white">{f.holdingsCount}개</b>
                    </div>
                    <div>
                      <span className="text-slate-500">기준일: </span>
                      <b className="text-white">{f.periodOfReport}</b>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 카일 종목 탭 */}
          {tab === "ownership" && (
            <div className="space-y-3">
              {ownership.map((o: any) => (
                <div
                  key={o.ticker}
                  className={`border rounded-xl p-3 ${
                    o.heldBy.length > 0
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-slate-700 bg-slate-800/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-white text-base">{o.ticker}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      o.heldBy.length >= 3
                        ? "bg-emerald-500 text-white"
                        : o.heldBy.length > 0
                        ? "bg-amber-500 text-black"
                        : "bg-slate-600 text-slate-300"
                    }`}>
                      {o.heldBy.length}명 보유
                    </span>
                  </div>
                  {o.heldBy.length === 0 ? (
                    <div className="text-[11px] text-slate-500 italic">
                      조회된 전설 투자자 상위 10 보유 목록에 없음
                    </div>
                  ) : (
                    <div className="space-y-1 text-[11px]">
                      {o.heldBy.map((h: any, i: number) => (
                        <div key={i} className="flex justify-between bg-slate-900/50 rounded px-2 py-1">
                          <span className="text-slate-300">
                            <span className="text-slate-500 text-[10px]">#{h.rank}</span> {h.investor}
                          </span>
                          <span className="text-emerald-400 font-bold">
                            ${(h.value / 1e6).toFixed(0)}M
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 합의 종목 탭 */}
          {tab === "consensus" && (
            <div className="space-y-1">
              <div className="text-[11px] text-slate-400 mb-2">
                여러 전설 투자자의 상위 10에 공통으로 나타나는 종목 = 강한 합의
              </div>
              {consensus.map((c: any, i: number) => (
                <div key={c.name} className="bg-slate-800/40 border border-slate-700 rounded-lg p-2 text-[11px]">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 font-mono w-6">#{i + 1}</span>
                      <span className="font-bold text-white text-xs">{c.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-amber-400 font-bold">{c.count}명 보유</span>
                      <span className="text-slate-400">${(c.totalValue / 1e9).toFixed(1)}B</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 pl-8">
                    {c.investors.slice(0, 3).join(" · ")}
                    {c.investors.length > 3 && ` 외 ${c.investors.length - 3}명`}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 개별 13F 탭 */}
          {tab === "filings" && (
            <div className="space-y-3">
              {filings.map((f: any) => (
                <div key={f.investor} className="bg-slate-800/40 border border-slate-700 rounded-xl p-3">
                  <div className="mb-2">
                    <div className="font-bold text-white">{f.investor}</div>
                    <div className="text-[10px] text-slate-500">
                      {f.style} · 분기 {f.periodOfReport} (공시 {f.filingDate})
                    </div>
                  </div>
                  <div className="text-[11px] space-y-1">
                    <div className="text-amber-400 font-semibold mb-1">TOP 5 보유:</div>
                    {f.topHoldings.map((h: any, i: number) => (
                      <div key={i} className="flex justify-between bg-slate-900/50 rounded px-2 py-0.5">
                        <span className="text-slate-300 text-[10px]">
                          #{i + 1} {h.name}
                        </span>
                        <span className="text-emerald-400 font-bold text-[10px]">
                          ${(h.valueB).toFixed(2)}B
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
