"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";

const fetcher = safeFetcher;

interface Path {
  name: string;
  nameShort: string;
  strategy: "hold" | "swap" | "dca" | "hedge";
  description: string;
  requiredReturn: number;
  estimatedMonths: number;
  difficulty: "easy" | "medium" | "hard";
  successProbability: number;
  pros: string[];
  cons: string[];
  actionSteps: string[];
  breakdown?: Array<{
    symbol: string;
    name: string;
    recoveryNeeded: number;
    estimatedMonthsToRecover: number;
    isLeverage: boolean;
  }>;
  keyTrades?: Array<{
    action: "BUY" | "SELL";
    symbol: string;
    name: string;
    shares?: number;
    estimatedAmount?: number;
    estimatedCash?: number;
    realizedLoss?: number;
    rationale: string;
  }>;
}

interface Data {
  success: boolean;
  empty?: boolean;
  summary: {
    currentValue: number;
    originalCost: number;
    lossUsd: number;
    lossPct: number;
  };
  recommendedPath: string;
  recommendation: string;
  paths: Path[];
}

const DIFFICULTY_CONFIG = {
  easy: { color: "#00ff88", label: "EASY" },
  medium: { color: "#ffd93d", label: "MED" },
  hard: { color: "#ff3860", label: "HARD" },
} as const;

export function RecoveryPathPanel() {
  const { data, isLoading } = useSWR<Data>(
    "/api/recovery-path",
    fetcher,
    { refreshInterval: 5 * 60 * 1000 }
  );
  
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  
  if (isLoading || !data) {
    return (
      <div className="p-4 border border-[var(--border)] rounded bg-black/20">
        <div className="text-[10px] dim kr">복구 전략 분석 중...</div>
      </div>
    );
  }
  
  if (data.empty) {
    return (
      <div className="p-6 border border-[var(--border)] rounded bg-black/20 text-center">
        <div className="text-[11px] dim kr">보유 포지션 없음</div>
      </div>
    );
  }
  
  const selectedPath = data.paths.find(p => p.strategy === selectedStrategy) ?? null;

  return (
    <div className="space-y-3">
      {/* 요약 */}
      <div className="p-3 border border-[var(--border)] rounded bg-[rgba(255,56,96,0.04)]">
        <div className="flex justify-between items-center mb-2">
          <div className="text-[11px] tick font-bold kr">🎯 손실 복구 전략</div>
          <div className="text-[9px] dim kr">목표: 본전 달성</div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[9px]">
          <div>
            <div className="dim kr">현재</div>
            <div className="text-[14px] tick font-bold">${data.summary.currentValue.toLocaleString()}</div>
          </div>
          <div>
            <div className="dim kr">손실</div>
            <div className="text-[14px] down font-bold">
              ${Math.abs(data.summary.lossUsd).toLocaleString()}
            </div>
          </div>
          <div>
            <div className="dim kr">회복 필요</div>
            <div className="text-[14px] warn font-bold">
              +{((data.summary.originalCost - data.summary.currentValue) / data.summary.currentValue * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>
      
      {/* AI 추천 */}
      <div className="p-3 border-2 border-[var(--amber)] rounded bg-[rgba(255,176,0,0.06)]">
        <div className="text-[9px] tick kr mb-1 font-bold">🤖 AI 추천 전략</div>
        <div className="text-[12px] kr leading-relaxed">
          {data.recommendation}
        </div>
      </div>
      
      {/* 경로 카드들 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {data.paths.map(p => {
          const diff = DIFFICULTY_CONFIG[p.difficulty];
          const isRecommended = p.strategy === data.recommendedPath;
          const isSelected = p.strategy === selectedStrategy;
          return (
            <div
              key={p.strategy}
              onClick={() => setSelectedStrategy(isSelected ? null : p.strategy)}
              className="p-3 border rounded cursor-pointer transition-all"
              style={{
                borderColor: isSelected ? "var(--amber)" :
                             isRecommended ? "var(--amber)" : "var(--border)",
                borderWidth: isSelected || isRecommended ? "2px" : "1px",
                background: isSelected ? "rgba(255,176,0,0.08)" :
                            isRecommended ? "rgba(255,176,0,0.04)" : "var(--bg-card, #141414)",
              }}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="text-[12px] kr font-bold bright">{p.name}</div>
                  {isRecommended && (
                    <div className="text-[8px] tick kr mt-0.5 font-bold">⭐ AI 추천</div>
                  )}
                </div>
                <span
                  className="text-[8px] px-1.5 py-0.5 rounded font-bold"
                  style={{ background: `${diff.color}30`, color: diff.color }}
                >
                  {diff.label}
                </span>
              </div>
              <div className="text-[10px] kr dim mb-2">{p.description}</div>
              
              <div className="grid grid-cols-3 gap-1 text-[9px] pt-2 border-t border-[var(--border)]">
                <div>
                  <div className="dim kr">회복률</div>
                  <div className="tick font-bold">+{p.requiredReturn.toFixed(1)}%</div>
                </div>
                <div>
                  <div className="dim kr">기간</div>
                  <div className="tick font-bold">{p.estimatedMonths}개월</div>
                </div>
                <div>
                  <div className="dim kr">성공률</div>
                  <div 
                    className="font-bold"
                    style={{ color: p.successProbability >= 70 ? "#00ff88" : p.successProbability >= 50 ? "#ffd93d" : "#ff3860" }}
                  >
                    {p.successProbability}%
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* 선택한 경로 상세 */}
      {selectedPath && (
        <div className="p-4 border-2 border-[var(--amber)] rounded bg-[var(--bg-card, #141414)]">
          <div className="text-[14px] tick font-bold kr mb-3">{selectedPath.name} · 상세</div>
          
          <div className="grid grid-cols-2 gap-3 mb-4">
            {/* PROS */}
            <div>
              <div className="text-[10px] up font-bold kr mb-2">✅ 장점</div>
              {selectedPath.pros.map((p, i) => (
                <div key={i} className="text-[10px] kr mb-1 pl-4 relative">
                  <span className="absolute left-0 text-[#00ff88]">•</span>
                  {p}
                </div>
              ))}
            </div>
            
            {/* CONS */}
            <div>
              <div className="text-[10px] down font-bold kr mb-2">⚠️ 단점</div>
              {selectedPath.cons.map((c, i) => (
                <div key={i} className="text-[10px] kr mb-1 pl-4 relative">
                  <span className="absolute left-0 text-[#ff3860]">•</span>
                  {c}
                </div>
              ))}
            </div>
          </div>
          
          {/* 실행 단계 */}
          <div className="mb-4">
            <div className="text-[10px] tick font-bold kr mb-2">📋 실행 단계</div>
            {selectedPath.actionSteps.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px] mb-1.5 kr">
                <span className="tick font-bold min-w-[16px]">{i + 1}.</span>
                <span>{s}</span>
              </div>
            ))}
          </div>
          
          {/* 핵심 매매 */}
          {selectedPath.keyTrades && selectedPath.keyTrades.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] tick font-bold kr mb-2">💱 권장 매매</div>
              {selectedPath.keyTrades.map((t, i) => (
                <div
                  key={i}
                  className="p-2 mb-1.5 rounded border-l-4"
                  style={{
                    borderLeftColor: t.action === "BUY" ? "#00ff88" : "#ff3860",
                    background: t.action === "BUY" ? "rgba(0,255,136,0.05)" : "rgba(255,56,96,0.05)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-[9px] px-1.5 py-0.5 font-bold rounded"
                      style={{
                        background: t.action === "BUY" ? "#00ff88" : "#ff3860",
                        color: "#000",
                      }}
                    >
                      {t.action}
                    </span>
                    <span className="text-[11px] tick font-bold">{t.symbol}</span>
                    <span className="text-[10px] kr">{t.name}</span>
                  </div>
                  <div className="text-[9px] dim kr grid grid-cols-2 gap-2">
                    {t.shares !== undefined && <span>주수: <b className="tick">{t.shares}주</b></span>}
                    {t.estimatedAmount !== undefined && <span>금액: <b className="tick">${t.estimatedAmount.toLocaleString()}</b></span>}
                    {t.estimatedCash !== undefined && <span>현금화: <b className="tick">${t.estimatedCash.toLocaleString()}</b></span>}
                    {t.realizedLoss !== undefined && <span>확정 손익: <b className={t.realizedLoss >= 0 ? "up" : "down"}>${t.realizedLoss.toLocaleString()}</b></span>}
                  </div>
                  <div className="text-[9px] kr mt-1 dim italic">{t.rationale}</div>
                </div>
              ))}
            </div>
          )}
          
          {/* Breakdown (HOLD path) */}
          {selectedPath.breakdown && selectedPath.breakdown.length > 0 && (
            <div>
              <div className="text-[10px] tick font-bold kr mb-2">📊 종목별 회복 시나리오</div>
              <div className="space-y-1">
                {selectedPath.breakdown.map((b, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px] p-1.5 bg-black/30 rounded">
                    <div className="flex items-center gap-2">
                      <span className="tick font-bold">{b.symbol}</span>
                      <span className="kr dim text-[9px]">{b.name}</span>
                      {b.isLeverage && (
                        <span className="text-[8px] px-1 rounded bg-[rgba(255,176,0,0.2)] tick">LEV</span>
                      )}
                    </div>
                    <div className="flex gap-3 text-[9px]">
                      <span>회복 <b className="warn">+{b.recoveryNeeded.toFixed(1)}%</b></span>
                      <span>예상 <b className="tick">{b.estimatedMonthsToRecover}개월</b></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {!selectedPath && (
        <div className="text-[9px] dim kr text-center p-2">
          💡 경로 카드를 클릭하여 상세 실행 플랜 확인
        </div>
      )}
    </div>
  );
}
