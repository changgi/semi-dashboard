"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";

const fetcher = safeFetcher;

interface Position {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  gain: number;
  gainPct: number;
  currency: string;
  isLeverage: boolean;
  leverageMultiplier: number;
  underlyingAsset: string;
  marketValueUsd: number;
}

interface ScenarioState {
  priceChanges: Record<string, number>;  // 기초자산별 가격 변동 % (ORCL, AMZN, TSLA...)
  sellAmounts: Record<string, number>;   // 심볼별 매도 주수
}

export function PortfolioSimulatorPanel() {
  const { data: diagnosisData, isLoading } = useSWR<any>(
    "/api/portfolio-diagnosis",
    fetcher,
    { refreshInterval: 60000 }
  );
  
  const [state, setState] = useState<ScenarioState>({ priceChanges: {}, sellAmounts: {} });
  
  const positions: Position[] = diagnosisData?.positions ?? [];
  
  // 고유 기초자산 추출
  const underlyingAssets = useMemo(() => {
    const set = new Set<string>();
    positions.forEach(p => set.add(p.underlyingAsset));
    return [...set];
  }, [positions]);
  
  // 시뮬레이션 계산
  const simulation = useMemo(() => {
    if (positions.length === 0) return null;
    
    let simulatedValue = 0;
    let realizedCash = 0;
    let realizedLoss = 0;
    let originalCost = 0;
    let currentValue = 0;
    
    for (const p of positions) {
      originalCost += p.shares * p.avgCost;
      currentValue += p.marketValueUsd;
      
      const sellShares = state.sellAmounts[p.symbol] ?? 0;
      const remainShares = p.shares - sellShares;
      
      // 매도분: 현재가 × 주수
      realizedCash += sellShares * p.currentPrice;
      realizedLoss += sellShares * (p.currentPrice - p.avgCost);
      
      // 잔여분: 기초자산 가격 변동 × 레버리지 배수
      const underlyingChange = state.priceChanges[p.underlyingAsset] ?? 0;
      const positionChange = underlyingChange * p.leverageMultiplier;
      const simulatedPrice = p.currentPrice * (1 + positionChange / 100);
      simulatedValue += remainShares * simulatedPrice;
    }
    
    const totalNet = simulatedValue + realizedCash;
    const totalPnl = totalNet - originalCost;
    const totalPnlPct = originalCost > 0 ? (totalPnl / originalCost) * 100 : 0;
    
    return {
      originalCost,
      currentValue,
      simulatedValue,
      realizedCash,
      realizedLoss,
      totalNet,
      totalPnl,
      totalPnlPct,
    };
  }, [positions, state]);
  
  const setPriceChange = (asset: string, val: number) => {
    setState(s => ({ ...s, priceChanges: { ...s.priceChanges, [asset]: val } }));
  };
  const setSellAmount = (symbol: string, val: number) => {
    setState(s => ({ ...s, sellAmounts: { ...s.sellAmounts, [symbol]: val } }));
  };
  
  const reset = () => setState({ priceChanges: {}, sellAmounts: {} });
  
  if (isLoading || !diagnosisData) {
    return (
      <div className="p-4 border border-[var(--border)] rounded bg-black/20">
        <div className="text-[10px] dim kr">시뮬레이터 로딩 중...</div>
      </div>
    );
  }
  
  if (positions.length === 0) {
    return (
      <div className="p-6 border border-[var(--border)] rounded bg-black/20 text-center">
        <div className="text-[11px] dim kr">보유 종목이 없습니다</div>
      </div>
    );
  }
  
  const sim = simulation!;
  const verdict = 
    sim.totalPnlPct >= -5 ? { label: "RECOVERY", kr: "회복", color: "#00ff88" } :
    sim.totalPnlPct >= -20 ? { label: "STABILIZATION", kr: "안정화", color: "#ffd93d" } :
    { label: "CRITICAL", kr: "위험", color: "#ff3860" };
  
  return (
    <div className="space-y-3">
      <div className="p-3 border border-[var(--border)] rounded bg-[rgba(126,200,255,0.04)]">
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] tick font-bold kr">🎮 시나리오 시뮬레이터</div>
          <button
            onClick={reset}
            className="text-[9px] px-2 py-1 border border-[var(--border)] rounded dim hover:text-[var(--amber)]"
          >
            🔄 초기화
          </button>
        </div>
        <div className="text-[9px] dim kr">슬라이더로 가격 변동 + 매도 시뮬레이션 · 실시간 계산</div>
      </div>
      
      {/* 시뮬레이션 결과 */}
      <div
        className="p-4 rounded border-2"
        style={{ borderColor: verdict.color, background: `${verdict.color}0a` }}
      >
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <div className="text-[9px] dim kr">시뮬레이션 순자산</div>
            <div
              className="text-[28px] font-bold leading-none mt-1"
              style={{ color: verdict.color, fontFamily: "'Bebas Neue', sans-serif" }}
            >
              ${sim.totalNet.toFixed(0)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[9px] dim kr">원금 대비</div>
            <div
              className="text-[26px] font-bold leading-none mt-1"
              style={{ color: verdict.color, fontFamily: "'Bebas Neue', sans-serif" }}
            >
              {sim.totalPnlPct >= 0 ? "+" : ""}{sim.totalPnlPct.toFixed(1)}%
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[var(--border)] text-[10px]">
          <div>
            <div className="dim kr">잔여 평가</div>
            <div className="tick font-bold">${sim.simulatedValue.toFixed(0)}</div>
          </div>
          <div>
            <div className="dim kr">매도 현금</div>
            <div className="tick font-bold">${sim.realizedCash.toFixed(0)}</div>
          </div>
          <div>
            <div className="dim kr">실현 손익</div>
            <div className={`font-bold ${sim.realizedLoss >= 0 ? "up" : "down"}`}>
              {sim.realizedLoss >= 0 ? "+" : ""}${sim.realizedLoss.toFixed(0)}
            </div>
          </div>
        </div>
        
        <div
          className="mt-3 pt-3 border-t border-[var(--border)] text-[10px] kr text-center font-bold"
          style={{ color: verdict.color }}
        >
          [{verdict.label}] {verdict.kr} · 현재 {diagnosisData.summary.totalGainPct.toFixed(1)}% → 시뮬 {sim.totalPnlPct.toFixed(1)}%
        </div>
      </div>
      
      {/* 기초자산별 가격 슬라이더 */}
      <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]">
        <div className="text-[10px] tick font-bold kr mb-3">📊 기초자산 가격 시나리오</div>
        <div className="space-y-3">
          {underlyingAssets.map(asset => {
            const val = state.priceChanges[asset] ?? 0;
            const affectedSymbols = positions.filter(p => p.underlyingAsset === asset);
            const hasLeverage = affectedSymbols.some(p => p.isLeverage);
            return (
              <div key={asset}>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="tick font-bold">{asset}</span>
                    <span className="dim kr">
                      ({affectedSymbols.map(p => p.symbol).join(", ")})
                    </span>
                  </div>
                  <div className="text-right">
                    <span
                      className="text-[14px] font-bold"
                      style={{
                        color: val > 0 ? "#00ff88" : val < 0 ? "#ff3860" : "var(--dim)",
                        fontFamily: "'Bebas Neue', sans-serif",
                      }}
                    >
                      {val > 0 ? "+" : ""}{val}%
                    </span>
                    {hasLeverage && val !== 0 && (
                      <div className="text-[8px] warn kr">
                        → 레버리지 {val * 2}%
                      </div>
                    )}
                  </div>
                </div>
                <input
                  type="range"
                  min="-30"
                  max="30"
                  step="1"
                  value={val}
                  onChange={(e) => setPriceChange(asset, +e.target.value)}
                  className="w-full h-1 bg-gradient-to-r from-[#ff3860] via-[#666] to-[#00ff88] rounded appearance-none cursor-pointer"
                />
                <div className="flex gap-1 mt-1 flex-wrap">
                  {[-20, -10, 0, 10, 20].map(v => (
                    <button
                      key={v}
                      onClick={() => setPriceChange(asset, v)}
                      className={`text-[8px] px-1.5 py-0.5 border rounded kr ${
                        val === v
                          ? "border-[var(--amber)] tick font-bold bg-[rgba(255,176,0,0.1)]"
                          : "border-[var(--border)] dim"
                      }`}
                    >
                      {v > 0 ? "+" : ""}{v}%
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      {/* 종목별 매도 슬라이더 */}
      <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]">
        <div className="text-[10px] tick font-bold kr mb-3">💱 종목별 매도 시뮬레이션</div>
        <div className="space-y-3">
          {positions.map(p => {
            const sellAmount = state.sellAmounts[p.symbol] ?? 0;
            const sellPct = (sellAmount / p.shares) * 100;
            return (
              <div key={p.symbol}>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex-1 min-w-0">
                    <SymbolDisplay
                      meta={{ symbol: p.symbol, displayName: p.name }}
                      size="xs"
                      variant="inline"
                      showBadges={false}
                    />
                    <div className="text-[8px] dim kr mt-0.5">
                      {p.shares}주 · {p.isLeverage && `${p.leverageMultiplier}x · `}
                      손익 {p.gainPct >= 0 ? "+" : ""}{p.gainPct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] tick font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                      {sellAmount}주
                    </div>
                    <div className="text-[8px] dim kr">
                      ({sellPct.toFixed(0)}%)
                    </div>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max={p.shares}
                  step="1"
                  value={sellAmount}
                  onChange={(e) => setSellAmount(p.symbol, +e.target.value)}
                  className="w-full h-1 bg-[rgba(255,176,0,0.2)] rounded appearance-none cursor-pointer"
                />
                <div className="flex gap-1 mt-1 flex-wrap">
                  <button
                    onClick={() => setSellAmount(p.symbol, 0)}
                    className={`text-[8px] px-1.5 py-0.5 border rounded kr ${
                      sellAmount === 0 ? "border-[var(--amber)] tick font-bold" : "border-[var(--border)] dim"
                    }`}
                  >
                    유지
                  </button>
                  <button
                    onClick={() => setSellAmount(p.symbol, Math.floor(p.shares / 4))}
                    className="text-[8px] px-1.5 py-0.5 border border-[var(--border)] dim rounded kr"
                  >
                    1/4
                  </button>
                  <button
                    onClick={() => setSellAmount(p.symbol, Math.floor(p.shares / 2))}
                    className="text-[8px] px-1.5 py-0.5 border border-[var(--border)] dim rounded kr"
                  >
                    절반
                  </button>
                  <button
                    onClick={() => setSellAmount(p.symbol, p.shares)}
                    className={`text-[8px] px-1.5 py-0.5 border rounded kr ${
                      sellAmount === p.shares ? "border-[#ff3860] down font-bold" : "border-[var(--border)] dim"
                    }`}
                  >
                    전량
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
