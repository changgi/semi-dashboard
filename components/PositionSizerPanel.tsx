"use client";

import { useState } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";
import { fmtUsd } from "@/lib/format";

const fetcher = safeFetcher;

interface Data {
  success: boolean;
  symbol: string;
  currentPrice: number;
  atr: number;
  volatilityPct: number;
  totalPortfolioValue: number;
  inputs: { confidence: number; riskToleranceUsd: number; portfolioPct: number };
  methods: {
    fixedFractional: any;
    riskPerTrade: any;
    volatilityAdjusted: any;
    kelly: any;
  };
  aiRecommendation: {
    shares: number;
    usd: number;
    portfolioPct: number;
    method: string;
    stopLossPrice: number;
    estimatedRisk: number;
    note: string;
  };
  splitStrategy: {
    firstBuy: number;
    secondBuy: number;
    thirdBuy: number;
    note: string;
  };
}

export function PositionSizerPanel() {
  const [symbol, setSymbol] = useState("");
  const [confidence, setConfidence] = useState(60);
  const [riskUsd, setRiskUsd] = useState(300);
  const [portfolioPct, setPortfolioPct] = useState(5);
  const [targetSymbol, setTargetSymbol] = useState<string | null>(null);
  
  const { data, isLoading } = useSWR<Data>(
    targetSymbol ? `/api/position-sizing?symbol=${targetSymbol}&confidence=${confidence}&riskUsd=${riskUsd}&portfolioPct=${portfolioPct}` : null,
    fetcher,
    { refreshInterval: 5 * 60 * 1000 }
  );
  
  const handleCalculate = () => {
    const s = symbol.trim().toUpperCase();
    if (s) setTargetSymbol(s);
  };
  
  return (
    <div className="space-y-3">
      {/* 안내 */}
      <div className="p-2 border border-[var(--border)]/50 rounded bg-black/10 text-[10px] dim kr">
        💡 카일님의 포트 규모 + 종목 변동성 + 신뢰도 + 허용 손실 기반 <b className="tick">4가지 방식</b>으로 적정 주수 계산
      </div>
      
      {/* 입력 폼 */}
      <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)] space-y-3">
        {/* 종목 입력 */}
        <div>
          <label className="text-[9px] dim kr block mb-1">매수 검토 종목</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleCalculate()}
              placeholder="CDNS, NVDA, 005930.KS..."
              className="flex-1 text-[11px] px-3 py-2 bg-black/40 border border-[var(--border)] rounded kr"
            />
            <button
              onClick={handleCalculate}
              disabled={!symbol.trim()}
              className="text-[11px] px-4 py-2 border border-[var(--amber)] rounded bg-[rgba(255,176,0,0.1)] tick font-bold kr disabled:opacity-50"
            >
              📏 계산
            </button>
          </div>
          <div className="flex gap-1 mt-1">
            {["CDNS", "NVDA", "MSFT", "AMZN"].map(s => (
              <button
                key={s}
                onClick={() => { setSymbol(s); setTargetSymbol(s); }}
                className="text-[9px] px-1.5 py-0.5 border border-[var(--border)] rounded tick font-bold"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        
        {/* 신뢰도 슬라이더 */}
        <div>
          <div className="flex justify-between items-center text-[9px] mb-1">
            <span className="dim kr">매수 확신도</span>
            <span
              className="font-bold text-[12px]"
              style={{
                color: confidence >= 75 ? "#00ff88" : confidence >= 50 ? "#ffd93d" : "#ff3860",
                fontFamily: "'Bebas Neue', sans-serif",
              }}
            >
              {confidence}%
            </span>
          </div>
          <input
            type="range"
            min="30"
            max="90"
            step="5"
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            className="w-full h-1 bg-gradient-to-r from-red-500 to-green-500 rounded appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-[8px] dim mt-0.5">
            <span>불확실</span>
            <span>확신</span>
          </div>
        </div>
        
        {/* 허용 손실 */}
        <div>
          <div className="flex justify-between items-center text-[9px] mb-1">
            <span className="dim kr">이 종목 최대 허용 손실</span>
            <span className="font-bold text-[12px] down" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              ${riskUsd}
            </span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {[100, 200, 300, 500, 1000].map(r => (
              <button
                key={r}
                onClick={() => setRiskUsd(r)}
                className={`text-[9px] px-2 py-1 border rounded kr flex-1 ${
                  riskUsd === r
                    ? "border-[var(--amber)] tick font-bold bg-[rgba(255,176,0,0.1)]"
                    : "border-[var(--border)] dim"
                }`}
              >
                ${r}
              </button>
            ))}
          </div>
        </div>
        
        {/* 포트 비중 */}
        <div>
          <div className="flex justify-between items-center text-[9px] mb-1">
            <span className="dim kr">포트 투입 비중</span>
            <span className="font-bold text-[12px] tick" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              {portfolioPct}%
            </span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {[2, 5, 10, 15, 20].map(p => (
              <button
                key={p}
                onClick={() => setPortfolioPct(p)}
                className={`text-[9px] px-2 py-1 border rounded kr flex-1 ${
                  portfolioPct === p
                    ? "border-[var(--amber)] tick font-bold bg-[rgba(255,176,0,0.1)]"
                    : "border-[var(--border)] dim"
                }`}
              >
                {p}%
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* 로딩 */}
      {isLoading && targetSymbol && (
        <div className="p-6 text-center border border-[var(--border)] rounded bg-black/20">
          <div className="text-[10px] dim kr animate-pulse">📏 {targetSymbol} 적정 주수 계산 중...</div>
        </div>
      )}
      
      {/* 결과 */}
      {data?.success && (
        <>
          {/* AI 추천 */}
          <div
            className="p-4 border-2 rounded"
            style={{ borderColor: "var(--amber)", background: "rgba(255,176,0,0.08)" }}
          >
            <div className="flex justify-between items-start gap-3 flex-wrap mb-3">
              <div>
                <div className="text-[9px] dim kr tracking-widest">AI 추천 규모</div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span
                    className="text-[40px] leading-none font-bold tick"
                    style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                  >
                    {data.aiRecommendation.shares}
                  </span>
                  <span className="text-[14px] dim kr">주</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] dim kr">총 투자</div>
                <div
                  className="text-[20px] font-bold"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", color: "#00ff88" }}
                >
                  {fmtUsd(data.aiRecommendation.usd)}
                </div>
                <div className="text-[9px] dim kr mt-1">
                  포트의 <b className="tick">{data.aiRecommendation.portfolioPct}%</b>
                </div>
              </div>
            </div>
            
            <div className="p-2 rounded bg-black/30 text-[11px] kr">
              💬 {data.aiRecommendation.note}
            </div>
            
            <div className="grid grid-cols-3 gap-2 mt-2 text-[9px]">
              <div className="p-1.5 bg-black/20 rounded text-center">
                <div className="dim kr">현재가</div>
                <div className="text-[11px] tick font-bold">{fmtUsd(data.currentPrice, { decimals: 2 })}</div>
              </div>
              <div className="p-1.5 bg-black/20 rounded text-center">
                <div className="dim kr">손절가</div>
                <div className="text-[11px] down font-bold">{fmtUsd(data.aiRecommendation.stopLossPrice, { decimals: 2 })}</div>
              </div>
              <div className="p-1.5 bg-black/20 rounded text-center">
                <div className="dim kr">최대 손실</div>
                <div className="text-[11px] down font-bold">{fmtUsd(data.aiRecommendation.estimatedRisk)}</div>
              </div>
            </div>
          </div>
          
          {/* 분할 매수 전략 */}
          <div className="p-3 border border-[#7ec8ff]/30 rounded bg-[rgba(126,200,255,0.05)]">
            <div className="text-[10px] font-bold kr mb-2" style={{ color: "#7ec8ff" }}>
              📊 분할 매수 전략 (권장)
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2 bg-black/30 rounded">
                <div className="text-[8px] dim kr">1차 (현재가)</div>
                <div
                  className="text-[18px] font-bold"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", color: "#7ec8ff" }}
                >
                  {data.splitStrategy.firstBuy}주
                </div>
                <div className="text-[8px] tick">
                  {fmtUsd(data.splitStrategy.firstBuy * data.currentPrice)}
                </div>
              </div>
              <div className="text-center p-2 bg-black/30 rounded">
                <div className="text-[8px] dim kr">2차 (-3% 조정 시)</div>
                <div
                  className="text-[18px] font-bold"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", color: "#7ec8ff" }}
                >
                  {data.splitStrategy.secondBuy}주
                </div>
              </div>
              <div className="text-center p-2 bg-black/30 rounded">
                <div className="text-[8px] dim kr">3차 (추가 조정 시)</div>
                <div
                  className="text-[18px] font-bold"
                  style={{ fontFamily: "'Bebas Neue', sans-serif", color: "#7ec8ff" }}
                >
                  {data.splitStrategy.thirdBuy}주
                </div>
              </div>
            </div>
            <div className="text-[9px] dim kr mt-2">💡 {data.splitStrategy.note}</div>
          </div>
          
          {/* 4가지 방식 비교 */}
          <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]">
            <div className="text-[10px] tick font-bold kr mb-2">📊 4가지 방식 비교</div>
            <div className="space-y-2">
              {[
                { key: "fixedFractional", method: data.methods.fixedFractional, color: "#7ec8ff" },
                { key: "riskPerTrade", method: data.methods.riskPerTrade, color: "#ff3860" },
                { key: "volatilityAdjusted", method: data.methods.volatilityAdjusted, color: "#ffd93d" },
                { key: "kelly", method: data.methods.kelly, color: "#c084fc" },
              ].map(({ key, method, color }) => (
                <div
                  key={key}
                  className="p-2 rounded border-l-4 bg-black/20"
                  style={{ borderLeftColor: color }}
                >
                  <div className="flex justify-between items-start gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-bold kr" style={{ color }}>
                        {method.name}
                      </div>
                      <div className="text-[9px] dim kr">{method.description}</div>
                    </div>
                    <div className="text-right">
                      <div
                        className="text-[16px] font-bold"
                        style={{ fontFamily: "'Bebas Neue', sans-serif", color }}
                      >
                        {method.shares}주
                      </div>
                      <div className="text-[9px] dim tick">{fmtUsd(method.usd)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      
      {!targetSymbol && (
        <div className="p-6 text-center border border-[var(--border)]/50 rounded bg-black/10">
          <div className="text-[10px] dim kr">종목 입력 후 계산 버튼 클릭</div>
        </div>
      )}
    </div>
  );
}
