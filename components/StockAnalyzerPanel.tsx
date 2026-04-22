"use client";

import { useState } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";
import { fmtUsd, fmtPct, fmtDday } from "@/lib/format";

const fetcher = safeFetcher;

interface Analysis {
  symbol: string;
  name: string;
  country: string;
  currentPrice: number;
  technical: {
    rsi14: number;
    rsiSignal: string;
    sma20: number;
    sma50: number;
    sma200: number;
    priceVsSma20: number;
    priceVsSma50: number;
    priceVsSma200: number;
    atr14: number;
    volatility30d: number;
    volumeRatio: number;
    trendDirection: string;
  };
  position52w: {
    high: number;
    low: number;
    distanceFromHigh: number;
    distanceFromLow: number;
    percentileRank: number;
    zone: string;
  };
  performance: { day: number; week: number; month: number; quarter: number; year: number };
  earnings: {
    nextDate: string | null;
    daysUntil: number | null;
    timing: string | null;
    importance: number | null;
  };
  portfolio: {
    isHeld: boolean;
    heldShares: number;
    heldAvgCost: number;
    heldGainPct: number;
    relatedPositions: Array<{ symbol: string; relation: string }>;
    concentrationWarning: boolean;
  };
  sector: {
    name: string | null;
    peers: string[];
  };
  judgment: {
    score: number;
    action: string;
    confidence: number;
    reasoning: string[];
    risks: string[];
    opportunities: string[];
    suggestedEntry: number | null;
    suggestedStopLoss: number | null;
    suggestedTakeProfit: number | null;
  };
}

interface Data {
  success: boolean;
  analysis?: Analysis;
  error?: string;
}

const ACTION_CONFIG: Record<string, { label: string; color: string; emoji: string; bgColor: string }> = {
  strong_buy: { label: "STRONG BUY", color: "#00ff88", emoji: "🚀", bgColor: "rgba(0,255,136,0.15)" },
  buy: { label: "BUY", color: "#00ff88", emoji: "📈", bgColor: "rgba(0,255,136,0.08)" },
  hold: { label: "HOLD", color: "#ffd93d", emoji: "⏸️", bgColor: "rgba(255,217,61,0.08)" },
  sell: { label: "SELL", color: "#ff3860", emoji: "📉", bgColor: "rgba(255,56,96,0.08)" },
  strong_sell: { label: "STRONG SELL", color: "#ff3860", emoji: "🔴", bgColor: "rgba(255,56,96,0.15)" },
  avoid: { label: "AVOID", color: "#ff3860", emoji: "⛔", bgColor: "rgba(255,56,96,0.2)" },
};

const ZONE_LABELS: Record<string, { label: string; color: string }> = {
  bottom: { label: "🔻 바닥권", color: "#00ff88" },
  lower_mid: { label: "📉 하단", color: "#7ec8ff" },
  upper_mid: { label: "📈 상단", color: "#ffd93d" },
  top: { label: "🔺 고점권", color: "#ff3860" },
};

const TREND_LABELS: Record<string, { label: string; color: string }> = {
  uptrend: { label: "↗️ 상승 추세", color: "#00ff88" },
  downtrend: { label: "↘️ 하락 추세", color: "#ff3860" },
  sideways: { label: "➡️ 횡보", color: "#aaa" },
};

export function StockAnalyzerPanel() {
  const [input, setInput] = useState("");
  const [symbol, setSymbol] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  
  const { data, isLoading } = useSWR<Data>(
    symbol ? `/api/stock-analyzer?symbol=${symbol}` : null,
    fetcher,
    { refreshInterval: 5 * 60 * 1000 }
  );
  
  const handleAnalyze = () => {
    const sym = input.trim().toUpperCase();
    if (!sym) return;
    setSymbol(sym);
    setRecent(prev => [sym, ...prev.filter(s => s !== sym)].slice(0, 5));
  };
  
  return (
    <div className="space-y-3">
      {/* 입력 */}
      <div className="p-3 border border-[var(--border)] rounded bg-black/20">
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
            placeholder="종목 심볼 (NVDA, TSLA, 005930.KS...)"
            className="flex-1 text-[11px] px-3 py-2 bg-black/40 border border-[var(--border)] rounded kr"
          />
          <button
            onClick={handleAnalyze}
            disabled={!input.trim()}
            className="text-[11px] px-4 py-2 border border-[var(--amber)] rounded bg-[rgba(255,176,0,0.1)] tick font-bold kr disabled:opacity-50"
          >
            🔍 분석
          </button>
        </div>
        
        {/* 빠른 버튼 (포트 + 최근) */}
        <div className="flex gap-1 flex-wrap">
          <div className="text-[9px] dim kr">빠른 선택:</div>
          {["NVDA", "TSLA", "MSFT", "ORCL", "CDNS"].map(s => (
            <button
              key={s}
              onClick={() => { setInput(s); setSymbol(s); setRecent(prev => [s, ...prev.filter(x => x !== s)].slice(0, 5)); }}
              className="text-[9px] px-1.5 py-0.5 border border-[var(--border)] rounded tick font-bold hover:bg-[rgba(255,176,0,0.08)]"
            >
              {s}
            </button>
          ))}
          {recent.map(s => (
            <button
              key={s}
              onClick={() => { setInput(s); setSymbol(s); }}
              className="text-[9px] px-1.5 py-0.5 border border-[var(--border)]/50 rounded dim"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      
      {/* 로딩 */}
      {isLoading && symbol && (
        <div className="p-6 text-center border border-[var(--border)] rounded bg-black/20">
          <div className="text-[10px] dim kr animate-pulse">🔍 {symbol} 심층 분석 중...</div>
        </div>
      )}
      
      {/* 에러 */}
      {data?.error && (
        <div className="p-3 border border-[#ff3860] rounded bg-[rgba(255,56,96,0.05)]">
          <div className="text-[10px] down kr">❌ {data.error}</div>
        </div>
      )}
      
      {/* 결과 */}
      {data?.success && data.analysis && (
        <AnalysisResult analysis={data.analysis} />
      )}
      
      {/* 빈 상태 */}
      {!symbol && !isLoading && (
        <div className="p-6 text-center border border-[var(--border)]/50 rounded bg-black/10">
          <div className="text-[10px] dim kr">심볼 입력 후 분석 버튼 클릭</div>
          <div className="text-[9px] dim kr mt-1">
            기술적 지표 + 52주 위치 + 실적 + 포트 관계 + AI 종합 평가
          </div>
        </div>
      )}
    </div>
  );
}

function AnalysisResult({ analysis: a }: { analysis: Analysis }) {
  const action = ACTION_CONFIG[a.judgment.action] ?? ACTION_CONFIG.hold;
  const zone = ZONE_LABELS[a.position52w.zone] ?? ZONE_LABELS.upper_mid;
  const trend = TREND_LABELS[a.technical.trendDirection] ?? TREND_LABELS.sideways;
  const scoreColor = a.judgment.score >= 70 ? "#00ff88" : a.judgment.score >= 50 ? "#ffd93d" : "#ff3860";
  
  return (
    <div className="space-y-3">
      {/* 판정 헤더 */}
      <div
        className="p-4 border-2 rounded"
        style={{ borderColor: action.color, background: action.bgColor }}
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <SymbolDisplay
              meta={{ symbol: a.symbol, displayName: a.name, country: a.country }}
              size="md"
              variant="inline"
              showBadges={true}
            />
            <div className="flex items-baseline gap-2 mt-2">
              <div
                className="text-[28px] font-bold leading-none"
                style={{ fontFamily: "'Bebas Neue', sans-serif" }}
              >
                {fmtUsd(a.currentPrice, { decimals: 2 })}
              </div>
              <div
                className="text-[12px] font-bold"
                style={{ color: a.performance.day >= 0 ? "#00ff88" : "#ff3860" }}
              >
                {fmtPct(a.performance.day)}
              </div>
            </div>
            <div className="flex gap-2 mt-1">
              <span className="text-[9px] kr" style={{ color: zone.color }}>{zone.label}</span>
              <span className="text-[9px] kr" style={{ color: trend.color }}>{trend.label}</span>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-[9px] dim kr">AI 판정</div>
            <div
              className="text-[28px] leading-none font-bold my-1"
              style={{ color: action.color, fontFamily: "'Bebas Neue', sans-serif" }}
            >
              {action.emoji} {action.label}
            </div>
            <div className="flex items-baseline gap-2 justify-end">
              <div
                className="text-[20px] font-bold"
                style={{ color: scoreColor, fontFamily: "'Bebas Neue', sans-serif" }}
              >
                {a.judgment.score}
              </div>
              <div className="text-[9px] dim">/100</div>
              <div className="text-[9px] dim ml-2">신뢰도 {a.judgment.confidence}%</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 포트 컨텍스트 (보유 중이면) */}
      {a.portfolio.isHeld && (
        <div className="p-2 border-l-4 border-l-[#7ec8ff] bg-[rgba(126,200,255,0.05)] rounded">
          <div className="text-[10px] kr">
            💼 <b className="tick">보유 중</b>: {a.portfolio.heldShares}주 @ {fmtUsd(a.portfolio.heldAvgCost, { decimals: 2 })}
            <span className={`ml-2 font-bold ${a.portfolio.heldGainPct >= 0 ? "up" : "down"}`}>
              {fmtPct(a.portfolio.heldGainPct)}
            </span>
          </div>
        </div>
      )}
      {a.portfolio.concentrationWarning && (
        <div className="p-2 border-l-4 border-l-[#ff3860] bg-[rgba(255,56,96,0.05)] rounded">
          <div className="text-[10px] kr down">
            ⚠️ 관련 포지션 {a.portfolio.relatedPositions.length}개 보유 (중복 노출)
          </div>
          <div className="text-[9px] dim mt-0.5">
            {a.portfolio.relatedPositions.map(p => p.symbol).join(", ")}
          </div>
        </div>
      )}
      
      {/* 기회 + 리스크 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* 기회 */}
        {a.judgment.opportunities.length > 0 && (
          <div className="p-3 border border-[#00ff88]/30 rounded bg-[rgba(0,255,136,0.03)]">
            <div className="text-[10px] up font-bold kr mb-1">✅ 기회</div>
            {a.judgment.opportunities.map((op, i) => (
              <div key={i} className="text-[10px] kr pl-3 relative mb-1">
                <span className="absolute left-0 up">•</span>
                {op}
              </div>
            ))}
          </div>
        )}
        
        {/* 리스크 */}
        {a.judgment.risks.length > 0 && (
          <div className="p-3 border border-[#ff3860]/30 rounded bg-[rgba(255,56,96,0.03)]">
            <div className="text-[10px] down font-bold kr mb-1">⚠️ 리스크</div>
            {a.judgment.risks.map((r, i) => (
              <div key={i} className="text-[10px] kr pl-3 relative mb-1">
                <span className="absolute left-0 down">•</span>
                {r}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* 제안 가격 */}
      <div className="p-3 border border-[var(--amber)] rounded bg-[rgba(255,176,0,0.04)]">
        <div className="text-[10px] tick font-bold kr mb-2">📍 제안 진입/청산 가격</div>
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-[8px] dim kr">🟢 진입가</div>
            <div className="text-[14px] up font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              {a.judgment.suggestedEntry !== null ? fmtUsd(a.judgment.suggestedEntry, { decimals: 2 }) : "—"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[8px] dim kr">🛑 손절가</div>
            <div className="text-[14px] down font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              {a.judgment.suggestedStopLoss !== null ? fmtUsd(a.judgment.suggestedStopLoss, { decimals: 2 }) : "—"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[8px] dim kr">💰 익절가</div>
            <div className="text-[14px] tick font-bold" style={{ fontFamily: "'Bebas Neue', sans-serif" }}>
              {a.judgment.suggestedTakeProfit !== null ? fmtUsd(a.judgment.suggestedTakeProfit, { decimals: 2 }) : "—"}
            </div>
          </div>
        </div>
      </div>
      
      {/* 기술적 지표 */}
      <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]">
        <div className="text-[10px] tick font-bold kr mb-2">📊 기술적 지표</div>
        <div className="grid grid-cols-4 gap-2 text-[9px]">
          <div>
            <div className="dim kr">RSI 14</div>
            <div
              className="text-[13px] font-bold"
              style={{ 
                color: a.technical.rsi14 < 30 ? "#00ff88" : a.technical.rsi14 > 70 ? "#ff3860" : "#ffd93d",
                fontFamily: "'Bebas Neue', sans-serif",
              }}
            >
              {a.technical.rsi14}
            </div>
          </div>
          <div>
            <div className="dim kr">SMA20 대비</div>
            <div
              className="text-[13px] font-bold"
              style={{ color: a.technical.priceVsSma20 >= 0 ? "#00ff88" : "#ff3860", fontFamily: "'Bebas Neue', sans-serif" }}
            >
              {fmtPct(a.technical.priceVsSma20, true)}
            </div>
          </div>
          <div>
            <div className="dim kr">거래량</div>
            <div
              className="text-[13px] tick font-bold"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              {a.technical.volumeRatio.toFixed(1)}x
            </div>
          </div>
          <div>
            <div className="dim kr">변동성</div>
            <div
              className="text-[13px] tick font-bold"
              style={{ fontFamily: "'Bebas Neue', sans-serif" }}
            >
              {a.technical.volatility30d.toFixed(0)}%
            </div>
          </div>
        </div>
      </div>
      
      {/* 52주 위치 바 */}
      <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]">
        <div className="text-[10px] tick font-bold kr mb-2">📍 52주 가격 위치 ({a.position52w.percentileRank}%)</div>
        <div className="relative h-8 bg-black/40 rounded overflow-hidden mb-2">
          {/* 존 배경 */}
          <div className="absolute left-0 top-0 bottom-0 w-[25%] bg-[rgba(0,255,136,0.08)]" />
          <div className="absolute left-[25%] top-0 bottom-0 w-[25%] bg-[rgba(126,200,255,0.05)]" />
          <div className="absolute left-[50%] top-0 bottom-0 w-[25%] bg-[rgba(255,217,61,0.05)]" />
          <div className="absolute left-[75%] top-0 bottom-0 w-[25%] bg-[rgba(255,56,96,0.08)]" />
          {/* 현재가 마커 */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-white"
            style={{ left: `${a.position52w.percentileRank}%`, transform: "translateX(-2px)" }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 text-[8px] font-bold px-1.5 py-0.5 bg-white text-black rounded"
            style={{ left: `${a.position52w.percentileRank}%`, transform: "translate(-50%, -50%)" }}
          >
            {fmtUsd(a.currentPrice, { decimals: 0 })}
          </div>
        </div>
        <div className="flex justify-between text-[9px] dim">
          <span>🔻 저 {fmtUsd(a.position52w.low, { decimals: 0 })}</span>
          <span>🔺 고 {fmtUsd(a.position52w.high, { decimals: 0 })}</span>
        </div>
      </div>
      
      {/* 성과 */}
      <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]">
        <div className="text-[10px] tick font-bold kr mb-2">📈 기간별 수익률</div>
        <div className="grid grid-cols-5 gap-1 text-[9px]">
          {[
            { label: "일", val: a.performance.day },
            { label: "주", val: a.performance.week },
            { label: "월", val: a.performance.month },
            { label: "분기", val: a.performance.quarter },
            { label: "년", val: a.performance.year },
          ].map((p, i) => (
            <div key={i} className="text-center p-1.5 bg-black/30 rounded">
              <div className="dim kr">{p.label}</div>
              <div
                className="text-[12px] font-bold"
                style={{ color: p.val >= 0 ? "#00ff88" : "#ff3860", fontFamily: "'Bebas Neue', sans-serif" }}
              >
                {fmtPct(p.val, true)}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* 실적 */}
      {a.earnings.nextDate && (
        <div
          className="p-3 border-l-4 rounded"
          style={{
            borderLeftColor: a.earnings.daysUntil && a.earnings.daysUntil <= 3 ? "#ff3860" : "#ffd93d",
            background: a.earnings.daysUntil && a.earnings.daysUntil <= 3 ? "rgba(255,56,96,0.05)" : "rgba(255,217,61,0.05)",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[10px] kr">
              📅 다음 실적: <b className="tick">{a.earnings.nextDate}</b>
              {a.earnings.timing && <span className="dim ml-1">({a.earnings.timing})</span>}
              {a.earnings.importance && <span className="dim ml-1">★{a.earnings.importance}</span>}
            </div>
            {a.earnings.daysUntil !== null && (
              <div
                className="text-[18px] font-bold"
                style={{
                  fontFamily: "'Bebas Neue', sans-serif",
                  color: a.earnings.daysUntil <= 1 ? "#ff3860" : a.earnings.daysUntil <= 3 ? "#ffd93d" : "#ffb000",
                }}
              >
                {fmtDday(a.earnings.nextDate)}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 섹터 정보 */}
      {a.sector.name && a.sector.peers.length > 0 && (
        <div className="p-3 border border-[var(--border)] rounded bg-[var(--bg-card,#141414)]">
          <div className="text-[10px] tick font-bold kr mb-2">
            🏭 섹터: {a.sector.name}
          </div>
          <div className="text-[9px] dim kr mb-1">동일 섹터 주요 종목:</div>
          <div className="flex gap-1 flex-wrap">
            {a.sector.peers.map(p => (
              <span
                key={p}
                className="text-[9px] px-1.5 py-0.5 rounded tick font-bold bg-black/30"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
