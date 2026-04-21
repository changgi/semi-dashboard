"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";

const fetcher = safeFetcher;

interface Strategy {
  symbol: string;
  name: string;
  currentPrice: number;
  avgCost: number;
  shares: number;
  marketValue: number;
  gain: number;
  gainPct: number;
  isLeverage: boolean;
  volatility30d: number;
  atr14: number;
  stopLoss: {
    price: number;
    pctFromCurrent: number;
    type: string;
    reasoning: string;
  };
  breakeven: {
    price: number;
    pctFromCurrent: number;
    pctGainNeeded: number;
  };
  takeProfit: {
    r1: { price: number; pctFromCurrent: number; reasoning: string };
    r2: { price: number; pctFromCurrent: number; reasoning: string };
    r3: { price: number; pctFromCurrent: number; reasoning: string };
  };
  trailingStop: {
    price: number;
    pctFromCurrent: number;
    pctFromPeak: number;
  };
  recommendation: {
    action: string;
    urgency: "low" | "medium" | "high";
    message: string;
  };
}

interface Data {
  success: boolean;
  empty?: boolean;
  strategies: Strategy[];
}

const URGENCY_CONFIG = {
  high: { color: "#ff3860", label: "HIGH" },
  medium: { color: "#ffd93d", label: "MED" },
  low: { color: "#00ff88", label: "LOW" },
};

export function ExitStrategyPanel() {
  const { data, isLoading } = useSWR<Data>(
    "/api/exit-strategy",
    fetcher,
    { refreshInterval: 5 * 60 * 1000 }
  );
  
  const [expanded, setExpanded] = useState<string | null>(null);
  
  if (isLoading || !data) {
    return (
      <div className="p-4 border border-[var(--border)] rounded bg-black/20">
        <div className="text-[10px] dim kr">출구 전략 계산 중...</div>
      </div>
    );
  }
  
  if (data.empty || !data.strategies || data.strategies.length === 0) {
    return (
      <div className="p-6 border border-[var(--border)] rounded bg-black/20 text-center">
        <div className="text-[11px] dim kr">보유 포지션 없음</div>
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      <div className="text-[10px] dim kr mb-1 p-2 border border-[var(--border)]/50 rounded bg-black/10">
        💡 각 포지션별 익절/손절 레벨. 감정적 매매 방지용 사전 계획.
      </div>
      
      {data.strategies.map(s => {
        const isExpanded = expanded === s.symbol;
        const urgency = URGENCY_CONFIG[s.recommendation.urgency];
        
        return (
          <div
            key={s.symbol}
            className="border rounded bg-[var(--bg-card,#141414)] overflow-hidden"
            style={{ borderLeftColor: urgency.color, borderLeftWidth: "4px" }}
          >
            {/* 헤더 */}
            <div
              className="p-3 cursor-pointer"
              onClick={() => setExpanded(isExpanded ? null : s.symbol)}
            >
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <SymbolDisplay
                      meta={{ symbol: s.symbol, displayName: s.name, isSemi: false }}
                      size="sm"
                      variant="inline"
                      showBadges={false}
                    />
                    {s.isLeverage && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded kr font-bold bg-[rgba(255,176,0,0.2)] tick">
                        ⚡ LEV
                      </span>
                    )}
                    <span
                      className="text-[8px] px-1.5 py-0.5 rounded kr font-bold"
                      style={{ background: `${urgency.color}30`, color: urgency.color }}
                    >
                      {urgency.label}
                    </span>
                  </div>
                  <div className="text-[10px] kr mt-1" style={{ color: "var(--text)" }}>
                    {s.recommendation.message}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[14px] tick font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                    ${s.currentPrice.toFixed(2)}
                  </div>
                  <div
                    className="text-[11px] font-bold"
                    style={{ color: s.gainPct >= 0 ? "#00ff88" : "#ff3860" }}
                  >
                    {s.gainPct >= 0 ? "+" : ""}{s.gainPct.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
            
            {/* 가격 레벨 시각화 */}
            <PriceLevels strategy={s} />
            
            {/* 확장 영역 */}
            {isExpanded && (
              <div className="border-t border-[var(--border)] p-3 bg-black/20 space-y-3">
                {/* Stop Loss */}
                <div className="p-2 rounded border-l-4" style={{ borderLeftColor: "#ff3860", background: "rgba(255,56,96,0.05)" }}>
                  <div className="text-[9px] down font-bold kr mb-1">🛑 STOP LOSS (손절가)</div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[13px] font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif", color: "#ff3860" }}>
                      ${s.stopLoss.price.toFixed(2)}
                    </div>
                    <div className="text-[11px] down font-bold">
                      {s.stopLoss.pctFromCurrent.toFixed(1)}%
                    </div>
                  </div>
                  <div className="text-[9px] kr dim">
                    {s.stopLoss.reasoning}
                  </div>
                </div>
                
                {/* Take Profit 3단계 */}
                <div>
                  <div className="text-[9px] up font-bold kr mb-1">💰 TAKE PROFIT (익절가)</div>
                  <div className="space-y-1">
                    <ProfitLevel 
                      label="R1"
                      color="#00ff88"
                      tp={s.takeProfit.r1}
                      portion="30%"
                    />
                    <ProfitLevel 
                      label="R2"
                      color="#00dd77"
                      tp={s.takeProfit.r2}
                      portion="40%"
                    />
                    <ProfitLevel 
                      label="R3"
                      color="#00bb66"
                      tp={s.takeProfit.r3}
                      portion="30%"
                    />
                  </div>
                </div>
                
                {/* Trailing Stop */}
                <div className="p-2 rounded bg-black/30">
                  <div className="text-[9px] warn font-bold kr mb-1">📉 TRAILING STOP (추적 손절)</div>
                  <div className="flex items-center justify-between">
                    <div className="text-[12px] font-bold warn" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
                      ${s.trailingStop.price.toFixed(2)}
                    </div>
                    <div className="text-[10px] dim kr">
                      최근 고점 −{s.trailingStop.pctFromPeak}%
                    </div>
                  </div>
                </div>
                
                {/* 기술 지표 */}
                <div className="grid grid-cols-3 gap-2 text-[9px] pt-2 border-t border-[var(--border)]">
                  <div>
                    <div className="dim kr">변동성 30d</div>
                    <div className="text-[11px] tick font-bold">{s.volatility30d.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="dim kr">ATR 14</div>
                    <div className="text-[11px] tick font-bold">${s.atr14.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="dim kr">평단 회복률</div>
                    <div className="text-[11px] warn font-bold">+{s.breakeven.pctGainNeeded.toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PriceLevels({ strategy: s }: { strategy: Strategy }) {
  // 가격 스펙트럼: stopLoss → current → r1 → r2 → r3
  const minPrice = Math.min(s.stopLoss.price, s.currentPrice, s.breakeven.price) * 0.95;
  const maxPrice = Math.max(s.takeProfit.r3.price, s.currentPrice, s.breakeven.price) * 1.05;
  const range = maxPrice - minPrice;
  
  const pctOf = (price: number) => Math.max(0, Math.min(100, ((price - minPrice) / range) * 100));
  
  return (
    <div className="px-3 pb-3">
      <div className="relative h-8 bg-black/40 rounded overflow-hidden">
        {/* Stop Loss 영역 (빨강) */}
        <div
          className="absolute top-0 bottom-0 bg-[rgba(255,56,96,0.15)]"
          style={{ left: 0, width: `${pctOf(s.stopLoss.price)}%` }}
        />
        {/* Profit 영역 (초록) */}
        <div
          className="absolute top-0 bottom-0 bg-[rgba(0,255,136,0.1)]"
          style={{ left: `${pctOf(s.currentPrice)}%`, right: 0 }}
        />
        
        {/* 가격 마커들 */}
        <div
          className="absolute top-0 bottom-0 w-0.5"
          style={{ left: `${pctOf(s.stopLoss.price)}%`, background: "#ff3860" }}
          title={`손절: $${s.stopLoss.price.toFixed(2)}`}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5"
          style={{ left: `${pctOf(s.breakeven.price)}%`, background: "#ffd93d" }}
          title={`평단: $${s.breakeven.price.toFixed(2)}`}
        />
        <div
          className="absolute top-0 bottom-0 w-1"
          style={{ left: `${pctOf(s.currentPrice)}%`, background: "#ffffff", transform: "translateX(-1px)" }}
          title={`현재: $${s.currentPrice.toFixed(2)}`}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5"
          style={{ left: `${pctOf(s.takeProfit.r1.price)}%`, background: "#00ff88" }}
          title={`R1: $${s.takeProfit.r1.price.toFixed(2)}`}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5"
          style={{ left: `${pctOf(s.takeProfit.r2.price)}%`, background: "#00dd77" }}
          title={`R2: $${s.takeProfit.r2.price.toFixed(2)}`}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5"
          style={{ left: `${pctOf(s.takeProfit.r3.price)}%`, background: "#00bb66" }}
          title={`R3: $${s.takeProfit.r3.price.toFixed(2)}`}
        />
        
        {/* 현재가 라벨 */}
        <div
          className="absolute top-1/2 -translate-y-1/2 text-[8px] font-bold px-1 bg-white text-black rounded"
          style={{ left: `${pctOf(s.currentPrice)}%`, transform: `translate(-50%, -50%)` }}
        >
          현재
        </div>
      </div>
      <div className="flex justify-between text-[8px] dim mt-1">
        <span>🛑 ${s.stopLoss.price.toFixed(0)}</span>
        <span>💰 R1 ${s.takeProfit.r1.price.toFixed(0)} → R3 ${s.takeProfit.r3.price.toFixed(0)}</span>
      </div>
    </div>
  );
}

function ProfitLevel({
  label,
  color,
  tp,
  portion,
}: {
  label: string;
  color: string;
  tp: { price: number; pctFromCurrent: number; reasoning: string };
  portion: string;
}) {
  return (
    <div
      className="p-2 rounded"
      style={{ background: `${color}08`, borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold" style={{ color, fontFamily: "'Bebas Neue', sans-serif" }}>
            {label} · {portion} 매도
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif", color }}>
            ${tp.price.toFixed(2)}
          </span>
          <span
            className="text-[10px] font-bold"
            style={{ color: tp.pctFromCurrent >= 0 ? "#00ff88" : "#ff3860" }}
          >
            {tp.pctFromCurrent >= 0 ? "+" : ""}{tp.pctFromCurrent.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="text-[9px] dim kr">
        {tp.reasoning}
      </div>
    </div>
  );
}
