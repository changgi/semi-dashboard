"use client";

import { useState } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";

/**
 * SignalFusionPanel
 *
 * 스마트머니 + 수급 + 카일 전략을 융합한 시그널 대시보드
 * 원글 철학: "소스를 직접 큐레이션해서 내 시그널을 만드는 게 AI 매매다운 방향"
 */

type FusionData = any;

const TAB_CONFIG = [
  { id: "all", label: "전체" },
  { id: "STRONG_BUY", label: "🚀 강력매수" },
  { id: "BUY", label: "✅ 매수" },
  { id: "WATCH", label: "👀 관찰" },
  { id: "HOLD_CURRENT", label: "💼 보유중" },
  { id: "AVOID", label: "🚫 회피" },
];

export default function SignalFusionPanel() {
  const [filter, setFilter] = useState("all");
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

  const { data, isLoading, error, mutate } = useSWR<FusionData>(
    "/api/signal-fusion",
    safeFetcher,
    { refreshInterval: 0, revalidateOnFocus: false }
  );

  const signals = data?.signals ?? [];
  const filtered = filter === "all" ? signals : signals.filter((s: any) => s.signal === filter);
  const summary = data?.summary;
  const philosophy = data?.philosophy;

  const signalColors: Record<string, string> = {
    STRONG_BUY: "bg-emerald-600 text-white",
    BUY: "bg-emerald-500 text-black",
    WATCH: "bg-amber-500 text-black",
    HOLD_CURRENT: "bg-blue-500 text-white",
    AVOID: "bg-rose-500 text-white",
  };

  const signalLabels: Record<string, string> = {
    STRONG_BUY: "강력매수",
    BUY: "매수",
    WATCH: "관찰",
    HOLD_CURRENT: "보유중",
    AVOID: "회피",
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-700 rounded-2xl p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs text-amber-400 font-bold tracking-wider uppercase">
            🐋 Signal Fusion Engine
          </div>
          <h3 className="text-lg font-bold text-white mt-1">
            스마트머니 + 수급 + 카일 전략 융합
          </h3>
          <div className="text-[11px] text-slate-500 mt-1">
            Whale Insight (DART) · 세시반 (수급) · 카일 7원칙
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
      {philosophy && (
        <div className="mb-4 bg-blue-500/5 border-l-4 border-blue-500 rounded-r-lg p-3 text-[12px]">
          <div className="text-blue-400 font-bold mb-1">💡 {philosophy.title}</div>
          <div className="text-slate-400 leading-relaxed italic">{philosophy.note}</div>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-12 text-slate-500">
          3가지 소스 교차 분석 중... (DART + 수급 + 전략)
        </div>
      )}
      {error && <div className="text-center py-12 text-rose-400">로드 실패</div>}
      {data?.success === false && (
        <div className="text-center py-12 text-rose-400">
          실패: {data?.error}
          {!summary?.dartConfigured && (
            <div className="text-[11px] text-slate-500 mt-3">
              💡 DART_API_KEY 환경변수 설정 시 한국 종목 스마트머니 점수가 활성화됩니다.
            </div>
          )}
        </div>
      )}

      {data?.success && (
        <>
          {/* DART 설정 상태 */}
          {summary && !summary.dartConfigured && (
            <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-[11px]">
              <div className="text-amber-400 font-bold mb-1">⚠️ DART API 키 미설정</div>
              <div className="text-slate-400">
                현재는 수급 + 전략 시그널만 활성. DART_API_KEY를 Vercel 환경변수에 추가하면
                국민연금·대량보유 공시 데이터가 스마트머니 점수에 반영됩니다.
                <br />
                발급: <a href="https://opendart.fss.or.kr" target="_blank" className="text-blue-400 underline">opendart.fss.or.kr</a> (무료, 일 20,000건)
              </div>
            </div>
          )}

          {/* 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            <SummaryCard label="분석 종목" value={summary?.totalAnalyzed ?? 0} color="slate" />
            <SummaryCard label="🚀 강력매수" value={summary?.strongBuy ?? 0} color="emerald" />
            <SummaryCard label="✅ 매수" value={summary?.buy ?? 0} color="emerald" />
            <SummaryCard label="👀 관찰" value={summary?.watch ?? 0} color="amber" />
            <SummaryCard label="🚫 회피" value={summary?.avoid ?? 0} color="rose" />
          </div>

          {/* 필터 탭 */}
          <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
            {TAB_CONFIG.map(t => (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className={`text-[11px] px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
                  filter === t.id
                    ? "bg-blue-500 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {t.label}
                {filter !== t.id && (
                  <span className="ml-1 opacity-60">
                    {t.id === "all"
                      ? signals.length
                      : signals.filter((s: any) => s.signal === t.id).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* 종목 리스트 */}
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                해당 필터에 맞는 종목이 없습니다
              </div>
            ) : (
              filtered.map((s: any) => {
                const isExpanded = expandedSymbol === s.symbol;
                const pc = s.portfolioContext;
                return (
                  <div
                    key={s.symbol}
                    className={`bg-slate-800/40 border rounded-xl overflow-hidden transition-all ${
                      pc?.alreadyHeld ? "border-blue-500/30" : "border-slate-700"
                    }`}
                  >
                    <div
                      onClick={() => setExpandedSymbol(isExpanded ? null : s.symbol)}
                      className="p-3 cursor-pointer hover:bg-slate-800/60"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{s.symbol}</span>
                          <span className="text-[11px] text-slate-400">{s.name}</span>
                          <span className="text-[9px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-300">
                            {s.market}
                          </span>
                          {pc?.alreadyHeld && (
                            <span className="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-bold">
                              보유 {(pc.currentWeight * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${signalColors[s.signal]}`}>
                            {signalLabels[s.signal]}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {s.confidence}%
                          </span>
                        </div>
                      </div>

                      {/* 점수 바 */}
                      <div className="grid grid-cols-4 gap-2 text-[10px]">
                        <ScoreBar label="🐋 스마트머니" value={s.smartMoneyScore} color="purple" />
                        <ScoreBar label="💧 수급" value={s.supplyDemandScore} color="cyan" />
                        <ScoreBar label="🎯 전략적합" value={s.strategyFitScore} color="emerald" />
                        <div className="text-right">
                          <div className="text-slate-500">종합</div>
                          <div className={`text-base font-bold ${
                            s.fusedScore >= 70 ? "text-emerald-400" :
                            s.fusedScore >= 50 ? "text-amber-400" : "text-rose-400"
                          }`}>
                            {s.fusedScore.toFixed(0)}
                          </div>
                        </div>
                      </div>

                      {/* 가격 & 변동 */}
                      <div className="mt-2 pt-2 border-t border-slate-700 flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">
                          ${s.currentPrice.toFixed(2)}
                          <span className={`ml-2 ${s.changePct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {s.changePct >= 0 ? "+" : ""}{s.changePct.toFixed(2)}%
                          </span>
                        </span>
                        {pc?.alreadyHeld && (
                          <span className={`${pc.pnlPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            손익 {pc.pnlPct >= 0 ? "+" : ""}{pc.pnlPct?.toFixed(1)}%
                            {pc.leverage > 1 && <span className="ml-1 text-rose-400">({pc.leverage}x)</span>}
                          </span>
                        )}
                        <span className="text-slate-500">
                          {isExpanded ? "▲ 접기" : "▼ 근거 보기"}
                        </span>
                      </div>
                    </div>

                    {/* 펼침: 근거 체인 */}
                    {isExpanded && (
                      <div className="border-t border-slate-700 p-3 bg-slate-900/50 space-y-2 text-[11px]">
                        <ReasoningSection
                          title="🐋 스마트머니 근거"
                          items={s.reasoning.smartMoney}
                          color="purple"
                        />
                        <ReasoningSection
                          title="💧 수급 근거"
                          items={s.reasoning.supplyDemand}
                          color="cyan"
                        />
                        <ReasoningSection
                          title="🎯 전략 적합도"
                          items={s.reasoning.strategyFit}
                          color="emerald"
                        />
                        {s.reasoning.risks.length > 0 && (
                          <ReasoningSection
                            title="⚠ 리스크"
                            items={s.reasoning.risks}
                            color="rose"
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    slate: "text-slate-300",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    rose: "text-rose-400",
  };
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-2 text-center">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`text-lg font-bold ${colorMap[color]}`}>{value}</div>
    </div>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    purple: "bg-purple-500",
    cyan: "bg-cyan-500",
    emerald: "bg-emerald-500",
  };
  return (
    <div>
      <div className="text-slate-500 text-[9px]">{label}</div>
      <div className="text-white font-bold text-xs">{value.toFixed(0)}</div>
      <div className="h-1 bg-slate-700 rounded-full overflow-hidden mt-0.5">
        <div className={`h-full ${colorMap[color]}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ReasoningSection({ title, items, color }: { title: string; items: string[]; color: string }) {
  const colorMap: Record<string, string> = {
    purple: "text-purple-400",
    cyan: "text-cyan-400",
    emerald: "text-emerald-400",
    rose: "text-rose-400",
  };
  return (
    <div>
      <div className={`font-bold mb-1 ${colorMap[color]}`}>{title}</div>
      <ul className="space-y-0.5 text-slate-300 pl-2">
        {items.length === 0 ? (
          <li className="text-slate-500 italic">- 해당 시그널 없음</li>
        ) : items.map((item, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-slate-600">▸</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
