"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";

const fetcher = safeFetcher;

interface TargetAlloc {
  symbol: string;
  name: string;
  targetPct: number;
  role: string;
  currentPct: number;
  actionNeeded: {
    type: "buy" | "sell" | "hold";
    amountUsd: number;
    amountKrw: number;
  };
}

interface Plan {
  planName: string;
  description: string;
  targetAllocations: TargetAlloc[];
  expectedBenefits: string[];
  risks: string[];
  difficulty: "easy" | "medium" | "hard";
  totalCostKrw: number;
  riskReductionPct: number;
}

interface Data {
  success: boolean;
  currentPortfolio: {
    totalValueKrw: number;
    totalValueUsd: number;
    positionCount: number;
    currentAllocations: Array<{ symbol: string; allocationPct: number }>;
  } | null;
  plans: Plan[];
}

// ═══════════════════════════════════════════════════════════
export function RebalanceHelperPanel() {
  const [selectedPlan, setSelectedPlan] = useState<number>(2); // 기본: 균형형 (추천)

  const { data, isLoading } = useSWR<Data>(
    "/api/rebalance-helper",
    fetcher,
    { refreshInterval: 900000 } // 15분
  );

  if (isLoading) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[11px] dim kr">⚖️ 분산 플랜 생성 중...</div>
      </div>
    );
  }

  if (!data?.success || !data.plans || data.plans.length === 0) {
    return (
      <div className="panel p-3 sm:p-5 text-center py-10">
        <div className="text-[10px] dim kr">데이터 로드 실패</div>
      </div>
    );
  }

  const plan = data.plans[selectedPlan];

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            ⚖️ REBALANCE HELPER · 분산 투자 플랜
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            현재 {data.currentPortfolio?.positionCount}개 집중 → 분산 추천
          </div>
        </div>
      </div>

      {/* 현재 포트폴리오 */}
      {data.currentPortfolio && (
        <div className="mb-3 p-3 border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded">
          <div className="text-[10px] tick kr font-bold mb-2">📊 현재 구성</div>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="text-[13px] font-bold">
                ₩{data.currentPortfolio.totalValueKrw.toLocaleString()}
              </div>
              <div className="text-[9px] dim kr">
                = ${data.currentPortfolio.totalValueUsd.toLocaleString()} · {data.currentPortfolio.positionCount}개 포지션
              </div>
            </div>
            <div className="text-right">
              {(data.currentPortfolio.currentAllocations ?? []).map(a => (
                <div key={a.symbol} className="text-[10px] kr">
                  {a.symbol} <span className="tick font-bold">{a.allocationPct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 플랜 선택 탭 */}
      <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-1">
        {(data.plans ?? []).map((p, i) => {
          const emoji = p.difficulty === "easy" ? "⚡" : p.difficulty === "medium" ? "⚖️" : "🎯";
          const isRecommended = p.planName.includes("추천");
          return (
            <button
              key={i}
              onClick={() => setSelectedPlan(i)}
              className={`text-[10px] px-2 py-2 border rounded kr text-left ${
                selectedPlan === i
                  ? "border-[var(--amber)] bg-[rgba(255,176,0,0.1)] text-[var(--amber)]"
                  : "border-[var(--border)] hover:border-[var(--amber-dim)]"
              }`}
            >
              <div className="flex items-center gap-1">
                <span>{emoji}</span>
                {isRecommended && <span className="text-[8px] px-1 bg-[var(--amber)] text-[#111] rounded font-bold">★</span>}
              </div>
              <div className="font-bold mt-0.5 text-[10px]">
                {p.planName.replace(/^[🛡️🚀⚖️💰]+ /, "").replace(" ★ 추천", "")}
              </div>
              <div className="text-[8px] dim mt-0.5">
                리스크 -{p.riskReductionPct}%
              </div>
            </button>
          );
        })}
      </div>

      {/* 선택된 플랜 상세 */}
      {plan && (
        <div className="space-y-3">
          <div className="p-3 border border-[var(--amber)] bg-[rgba(255,176,0,0.03)] rounded">
            <div className="text-[14px] font-bold tick kr mb-1">{plan.planName}</div>
            <div className="text-[11px] dim kr leading-relaxed">{plan.description}</div>
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <div className="text-[9px] kr">
                <span className="dim">난이도:</span>{" "}
                <span className={plan.difficulty === "easy" ? "up" : plan.difficulty === "medium" ? "tick" : "down"}>
                  {plan.difficulty === "easy" ? "쉬움 ⚡" : plan.difficulty === "medium" ? "보통 ⚖️" : "어려움 🎯"}
                </span>
              </div>
              <div className="text-[9px] kr">
                <span className="dim">예상 리스크 감소:</span>{" "}
                <span className="up font-bold">-{plan.riskReductionPct}%</span>
              </div>
              {plan.totalCostKrw > 0 && (
                <div className="text-[9px] kr">
                  <span className="dim">추가 매수 비용:</span>{" "}
                  <span className="tick font-bold">₩{plan.totalCostKrw.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* 목표 구성 */}
          <div>
            <div className="text-[10px] tick font-bold kr mb-2">🎯 목표 구성 + 실행 방법</div>
            <div className="space-y-1">
              {(plan.targetAllocations ?? []).map((a, i) => {
                const actColor = 
                  a.actionNeeded.type === "buy" ? "#00ff88" :
                  a.actionNeeded.type === "sell" ? "#ff3860" :
                  "#aaaaaa";
                const actEmoji = 
                  a.actionNeeded.type === "buy" ? "📈" :
                  a.actionNeeded.type === "sell" ? "📉" :
                  "➖";
                const actLabel =
                  a.actionNeeded.type === "buy" ? "매수" :
                  a.actionNeeded.type === "sell" ? "매도" :
                  "유지";
                
                return (
                  <div key={i} className="border border-[var(--border)] rounded p-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <SymbolDisplay
                            meta={{ symbol: a.symbol, displayName: a.name }}
                            size="sm"
                            variant="inline"
                            showFlag={true}
                            showBadges={false}
                          />
                          <span className="text-[8px] px-1.5 py-0.5 bg-[var(--amber-dim)] text-white rounded">
                            목표 {a.targetPct}%
                          </span>
                        </div>
                        <div className="text-[9px] dim kr mt-0.5">{a.role}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div
                          className="text-[10px] px-2 py-1 rounded font-bold kr"
                          style={{ background: actColor, color: "white" }}
                        >
                          {actEmoji} {actLabel}
                        </div>
                        {a.actionNeeded.type !== "hold" && (
                          <div className="text-[9px] dim mt-1">
                            ₩{a.actionNeeded.amountKrw.toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* 비중 변화 바 */}
                    <div className="mt-2 flex items-center gap-2">
                      <div className="text-[8px] dim kr w-16">현재 {a.currentPct}%</div>
                      <div className="flex-1 h-2 bg-[var(--border)] rounded overflow-hidden relative">
                        <div
                          className="absolute top-0 left-0 h-full bg-[#555]"
                          style={{ width: `${a.currentPct}%` }}
                        />
                        <div
                          className="absolute top-0 left-0 h-full bg-[var(--amber)]"
                          style={{ width: `${a.targetPct}%`, opacity: 0.6 }}
                        />
                      </div>
                      <div className="text-[8px] tick kr w-16 text-right font-bold">→ {a.targetPct}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 기대효과 vs 리스크 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="border border-[#00ff88]/30 bg-[rgba(0,255,136,0.03)] rounded p-3">
              <div className="text-[10px] up font-bold kr mb-2">✅ 기대 효과</div>
              {(plan.expectedBenefits ?? []).map((b, i) => (
                <div key={i} className="text-[10px] kr leading-relaxed mb-1">• {b}</div>
              ))}
            </div>
            <div className="border border-[#ff3860]/30 bg-[rgba(255,56,96,0.03)] rounded p-3">
              <div className="text-[10px] down font-bold kr mb-2">⚠️ 주의사항</div>
              {(plan.risks ?? []).map((r, i) => (
                <div key={i} className="text-[10px] kr leading-relaxed mb-1">• {r}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 pt-2 border-t border-[var(--border)] text-[8px] dim kr leading-relaxed">
        💡 추천은 참고용. 세금/수수료/개인 상황 고려 필수<br />
        📊 15분마다 자동 갱신 · 현재 시세 기반 계산
      </div>
    </div>
  );
}
