"use client";

import useSWR from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";

const fetcher = safeFetcher;

interface Signal {
  type: "momentum" | "oversold_bounce" | "breakout" | "pre_earnings" | "value";
  strength: number;
  description: string;
}

interface Opportunity {
  symbol: string;
  name: string;
  country: string;
  currency: string;
  currentPrice: number;
  dayChangePct: number;
  week52High: number;
  week52Low: number;
  distanceFromHigh: number;
  distanceFromLow: number;
  volatility30d: number;
  priceChange5d: number;
  priceChange20d: number;
  priceChange52w: number;
  volumeRatio: number;
  rsi14: number;
  signals: Signal[];
  totalScore: number;
  riskLevel: "low" | "medium" | "high";
  recommendation: string;
  inPortfolio: boolean;
  sector?: string;
  isSemi?: boolean;
  indexes?: string[];
}

interface Data {
  success: boolean;
  mode: string;
  scanned: number;
  found: number;
  opportunities: Opportunity[];
}

const SIGNAL_CONFIG = {
  momentum: { icon: "🚀", color: "#00ff88", label: "모멘텀" },
  oversold_bounce: { icon: "💎", color: "#7ec8ff", label: "과매도반등" },
  breakout: { icon: "⚡", color: "#ffd93d", label: "돌파" },
  pre_earnings: { icon: "📊", color: "#ffb000", label: "실적전" },
  value: { icon: "🏛️", color: "#c084fc", label: "가치" },
} as const;

const RISK_CONFIG = {
  low: { color: "#00ff88", label: "LOW" },
  medium: { color: "#ffd93d", label: "MID" },
  high: { color: "#ff3860", label: "HIGH" },
} as const;

export function OpportunityFinderPanel() {
  const [mode, setMode] = useState<"recovery" | "growth" | "balanced">("balanced");
  const [filter, setFilter] = useState<"all" | "not_owned" | "low_risk">("all");
  
  const { data, isLoading, mutate } = useSWR<Data>(
    `/api/opportunities?mode=${mode}&limit=15&minScore=45`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000 }
  );
  
  const opportunities = data?.opportunities ?? [];
  
  const filtered = opportunities.filter(o => {
    if (filter === "not_owned" && o.inPortfolio) return false;
    if (filter === "low_risk" && o.riskLevel === "high") return false;
    return true;
  });

  return (
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="p-3 border border-[var(--border)] rounded bg-[rgba(255,176,0,0.04)]">
        <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
          <div>
            <div className="text-[12px] tick font-bold kr">🎯 기회 탐지</div>
            <div className="text-[9px] dim kr mt-0.5">
              {isLoading ? "스캔 중..." : data ? `${data.scanned}종목 스캔 · ${filtered.length}개 기회 포착` : ""}
            </div>
          </div>
          <button
            onClick={() => mutate()}
            className="text-[9px] px-2 py-1 border border-[var(--border)] rounded dim hover:text-[var(--amber)] kr"
          >
            🔄 재스캔
          </button>
        </div>
        
        {/* 모드 선택 */}
        <div className="flex gap-1 mb-2 flex-wrap">
          {[
            { id: "recovery", label: "💎 손실 복구", desc: "저변동·반등" },
            { id: "balanced", label: "⚖️ 균형", desc: "모든 기회" },
            { id: "growth", label: "🚀 성장", desc: "모멘텀·돌파" },
          ].map(m => (
            <button
              key={m.id}
              onClick={() => setMode(m.id as any)}
              className={`flex-1 min-w-[100px] text-[10px] px-2 py-1.5 border rounded kr ${
                mode === m.id
                  ? "border-[var(--amber)] bg-[rgba(255,176,0,0.15)] text-[var(--amber-bright)] font-bold"
                  : "border-[var(--border)] dim hover:bg-[rgba(255,255,255,0.03)]"
              }`}
            >
              {m.label}
              <div className="text-[8px] opacity-70 mt-0.5">{m.desc}</div>
            </button>
          ))}
        </div>
        
        {/* 필터 */}
        <div className="flex gap-1 flex-wrap">
          {[
            { id: "all", label: "전체" },
            { id: "not_owned", label: "미보유만" },
            { id: "low_risk", label: "저위험만" },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as any)}
              className={`text-[9px] px-2 py-1 border rounded kr ${
                filter === f.id
                  ? "border-[var(--amber)] tick font-bold"
                  : "border-[var(--border)] dim"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* 로딩 */}
      {isLoading && (
        <div className="p-6 text-center border border-[var(--border)] rounded bg-black/20">
          <div className="text-[10px] dim kr animate-pulse">🔍 종목 분석 중... (최대 60초)</div>
        </div>
      )}
      
      {/* 결과 없음 */}
      {!isLoading && filtered.length === 0 && (
        <div className="p-6 text-center border border-[var(--border)] rounded bg-black/20">
          <div className="text-[10px] dim kr">현재 기준에 맞는 기회가 없습니다. 필터를 조정해보세요.</div>
        </div>
      )}
      
      {/* 기회 리스트 */}
      {!isLoading && filtered.map((opp, i) => (
        <OpportunityCard key={opp.symbol} opp={opp} rank={i + 1} />
      ))}
      
      {/* 안내 */}
      <div className="text-[9px] dim kr p-2 border border-[var(--border)]/50 rounded bg-black/10">
        💡 5분마다 자동 재스캔 · 스코어는 시그널 강도와 다양성 기반 · 투자 판단은 본인 책임
      </div>
    </div>
  );
}

function OpportunityCard({ opp, rank }: { opp: Opportunity; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const risk = RISK_CONFIG[opp.riskLevel];
  const topSignal = opp.signals[0];
  const sig = SIGNAL_CONFIG[topSignal.type];
  
  const scoreColor = opp.totalScore >= 80 ? "#00ff88" : opp.totalScore >= 65 ? "#ffb000" : "#aaa";
  
  return (
    <div
      className="border rounded bg-[var(--bg-card,#141414)] overflow-hidden transition-all hover:border-[var(--border-bright)]"
      style={{ borderColor: opp.inPortfolio ? "rgba(126,200,255,0.4)" : "var(--border)" }}
    >
      {/* 헤더 라인 */}
      <div
        className="p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3 flex-wrap">
          {/* 랭크 */}
          <div
            className="font-bold leading-none"
            style={{
              color: scoreColor,
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: "28px",
              minWidth: "40px"
            }}
          >
            {rank}
          </div>
          
          {/* 정보 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <SymbolDisplay
                meta={{
                  symbol: opp.symbol,
                  displayName: opp.name,
                  country: opp.country,
                  isSemi: opp.isSemi,
                  indexes: opp.indexes,
                }}
                size="sm"
                variant="inline"
                showBadges={false}
              />
              {opp.inPortfolio && (
                <span className="text-[8px] px-1.5 py-0.5 rounded kr font-bold bg-[rgba(126,200,255,0.2)] text-[#7ec8ff]">
                  보유중
                </span>
              )}
              <span
                className="text-[8px] px-1.5 py-0.5 rounded kr font-bold"
                style={{ background: `${risk.color}20`, color: risk.color }}
              >
                {risk.label} RISK
              </span>
            </div>
            
            {/* 추천 + 가격 */}
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              <span className="text-[11px] kr" style={{ color: sig.color }}>
                {sig.icon} {opp.recommendation}
              </span>
            </div>
            
            {/* 스탯 한 줄 */}
            <div className="flex items-center gap-3 mt-2 text-[9px] dim flex-wrap">
              <span>
                <span className="kr">현재가</span> <b className="tick">${opp.currentPrice.toFixed(2)}</b>
                <span className={opp.dayChangePct >= 0 ? "up ml-1" : "down ml-1"}>
                  ({opp.dayChangePct >= 0 ? "+" : ""}{opp.dayChangePct.toFixed(1)}%)
                </span>
              </span>
              <span>
                <span className="kr">5일</span>{" "}
                <b className={opp.priceChange5d >= 0 ? "up" : "down"}>
                  {opp.priceChange5d >= 0 ? "+" : ""}{opp.priceChange5d.toFixed(1)}%
                </b>
              </span>
              <span>
                <span className="kr">RSI</span>{" "}
                <b className={opp.rsi14 < 30 ? "up" : opp.rsi14 > 70 ? "down" : "tick"}>
                  {opp.rsi14}
                </b>
              </span>
              <span>
                <span className="kr">거래량</span>{" "}
                <b className={opp.volumeRatio > 1.5 ? "up" : "tick"}>
                  {opp.volumeRatio.toFixed(1)}x
                </b>
              </span>
            </div>
          </div>
          
          {/* 스코어 */}
          <div className="text-right">
            <div
              className="font-bold leading-none"
              style={{
                color: scoreColor,
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: "28px"
              }}
            >
              {opp.totalScore}
            </div>
            <div className="text-[8px] dim kr mt-0.5">SCORE</div>
          </div>
        </div>
        
        {/* 시그널 뱃지들 */}
        <div className="flex gap-1 mt-2 flex-wrap">
          {opp.signals.map((s, j) => {
            const c = SIGNAL_CONFIG[s.type];
            return (
              <span
                key={j}
                className="text-[9px] px-2 py-0.5 rounded kr font-bold"
                style={{ background: `${c.color}20`, color: c.color, border: `1px solid ${c.color}40` }}
              >
                {c.icon} {c.label} {Math.round(s.strength)}
              </span>
            );
          })}
        </div>
      </div>
      
      {/* 확장 영역 */}
      {expanded && (
        <div className="border-t border-[var(--border)] p-3 bg-black/20 space-y-2">
          {/* 상세 시그널 */}
          <div>
            <div className="text-[9px] tick font-bold kr mb-1">📡 감지된 시그널</div>
            {opp.signals.map((s, j) => {
              const c = SIGNAL_CONFIG[s.type];
              return (
                <div key={j} className="flex items-start gap-2 text-[10px] mb-1 p-1.5 rounded" style={{ background: `${c.color}08` }}>
                  <span style={{ color: c.color }}>{c.icon}</span>
                  <span className="kr flex-1">{s.description}</span>
                  <span style={{ color: c.color, fontWeight: 700 }}>{Math.round(s.strength)}</span>
                </div>
              );
            })}
          </div>
          
          {/* 가격 위치 */}
          <div>
            <div className="text-[9px] tick font-bold kr mb-1">📊 52주 가격 위치</div>
            <div className="relative h-6 bg-black/40 rounded overflow-hidden border border-[var(--border)]">
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-[var(--amber)]"
                style={{ left: `${(opp.distanceFromLow / (opp.distanceFromLow + opp.distanceFromHigh)) * 100}%` }}
              />
              <div className="absolute left-0 top-0 bottom-0 flex items-center px-2 text-[9px] dim kr">
                저 ${opp.week52Low.toFixed(0)}
              </div>
              <div className="absolute right-0 top-0 bottom-0 flex items-center px-2 text-[9px] dim kr">
                고 ${opp.week52High.toFixed(0)}
              </div>
            </div>
            <div className="flex justify-between text-[9px] dim mt-1">
              <span className="kr">저점 대비 <b className="up">+{opp.distanceFromLow.toFixed(1)}%</b></span>
              <span className="kr">고점 대비 <b className="down">−{opp.distanceFromHigh.toFixed(1)}%</b></span>
            </div>
          </div>
          
          {/* 추가 메트릭 */}
          <div className="grid grid-cols-3 gap-2 text-[9px]">
            <div className="p-1.5 bg-black/40 rounded">
              <div className="dim kr">변동성 30d</div>
              <div className="text-[11px] tick font-bold">{opp.volatility30d.toFixed(1)}%</div>
            </div>
            <div className="p-1.5 bg-black/40 rounded">
              <div className="dim kr">20일</div>
              <div className={`text-[11px] font-bold ${opp.priceChange20d >= 0 ? "up" : "down"}`}>
                {opp.priceChange20d >= 0 ? "+" : ""}{opp.priceChange20d.toFixed(1)}%
              </div>
            </div>
            <div className="p-1.5 bg-black/40 rounded">
              <div className="dim kr">52주</div>
              <div className={`text-[11px] font-bold ${opp.priceChange52w >= 0 ? "up" : "down"}`}>
                {opp.priceChange52w >= 0 ? "+" : ""}{opp.priceChange52w.toFixed(1)}%
              </div>
            </div>
          </div>
          
          {/* 링크 */}
          <div className="flex gap-2 pt-2">
            <a
              href={`/stock/${opp.symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center text-[9px] px-2 py-1.5 border border-[var(--border)] rounded kr tick hover:bg-[rgba(255,176,0,0.08)]"
            >
              📈 상세 분석
            </a>
            <a
              href={`https://finance.yahoo.com/quote/${opp.symbol}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center text-[9px] px-2 py-1.5 border border-[var(--border)] rounded kr dim hover:bg-[rgba(255,255,255,0.05)]"
            >
              🔗 Yahoo
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
