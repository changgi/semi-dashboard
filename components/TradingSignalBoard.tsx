"use client";

import { useState } from "react";
import useSWR from "swr";
import { fmtPrice, fmtPct } from "@/lib/format";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Signal {
  symbol: string;
  signal: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";
  score: number;
  confidence: number;
  current_price: number;
  buy_entry: number;
  buy_target_1: number;
  buy_target_2: number;
  buy_stop_loss: number;
  buy_risk_reward: number;
  sell_entry: number;
  sell_target: number;
  sell_stop_loss: number;
  reasons: string[];
  timeframe: string;
  rsi: number | null;
  trend: string;
}

const SIGNAL_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  STRONG_BUY: { label: "적극 매수", color: "var(--green)", bg: "rgba(0,255,136,0.15)", icon: "⬆⬆" },
  BUY: { label: "매수", color: "var(--green)", bg: "rgba(0,255,136,0.08)", icon: "⬆" },
  HOLD: { label: "보유/관망", color: "var(--amber)", bg: "rgba(255,176,0,0.08)", icon: "■" },
  SELL: { label: "매도", color: "var(--red)", bg: "rgba(255,56,96,0.08)", icon: "⬇" },
  STRONG_SELL: { label: "적극 매도", color: "var(--red)", bg: "rgba(255,56,96,0.15)", icon: "⬇⬇" },
};

const TIMEFRAME_KR: Record<string, string> = {
  SHORT: "단기 (1~5일)",
  MEDIUM: "중기 (1~4주)",
  LONG: "장기 (1~3개월)",
};

export function TradingSignalBoard() {
  const [filterSignal, setFilterSignal] = useState<string>("ALL");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const { data } = useSWR("/api/signals", fetcher, { refreshInterval: 120000 });
  const signals: Signal[] = data?.success ? data.data : [];

  const filtered = filterSignal === "ALL"
    ? signals
    : signals.filter((s) => s.signal === filterSignal);

  // 요약
  const summary = {
    STRONG_BUY: signals.filter((s) => s.signal === "STRONG_BUY").length,
    BUY: signals.filter((s) => s.signal === "BUY").length,
    HOLD: signals.filter((s) => s.signal === "HOLD").length,
    SELL: signals.filter((s) => s.signal === "SELL").length,
    STRONG_SELL: signals.filter((s) => s.signal === "STRONG_SELL").length,
  };

  const selected = selectedSymbol ? signals.find((s) => s.symbol === selectedSymbol) : null;

  if (signals.length === 0) {
    return (
      <div className="panel p-3 sm:p-5">
        <div className="section-title mb-4">TRADING SIGNALS · 매매 시그널</div>
        <div className="dim text-[11px] kr">
          매매 시그널 계산 중... 첫 데이터는 약 10분 후 표시됩니다.
        </div>
      </div>
    );
  }

  return (
    <div className="panel p-3 sm:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div className="section-title text-[10px] sm:text-[12px]">
          TRADING SIGNALS · 매매 시그널
        </div>
        <div className="text-[9px] dim">UPDATED EVERY 10 MIN</div>
      </div>

      {/* 요약 바 */}
      <div className="grid grid-cols-5 gap-1.5 sm:gap-3 mb-4">
        {(Object.keys(SIGNAL_CONFIG) as (keyof typeof SIGNAL_CONFIG)[]).map((s) => {
          const cfg = SIGNAL_CONFIG[s];
          const count = summary[s as keyof typeof summary];
          return (
            <button
              key={s}
              onClick={() => setFilterSignal(filterSignal === s ? "ALL" : s)}
              className="border p-2 sm:p-3 text-center hover:opacity-80 transition-opacity"
              style={{
                borderColor: filterSignal === s ? cfg.color : "var(--border)",
                background: filterSignal === s ? cfg.bg : "transparent",
              }}
            >
              <div className="text-[10px] sm:text-[14px]" style={{ color: cfg.color }}>{cfg.icon}</div>
              <div className="text-[8px] sm:text-[9px] dim kr mt-1">{cfg.label}</div>
              <div className="text-[16px] sm:text-[20px] font-bold mt-1" style={{ color: cfg.color }}>
                {count}
              </div>
            </button>
          );
        })}
      </div>

      {/* 시그널 리스트 */}
      <div className="space-y-2">
        {filtered
          .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
          .map((s) => {
            const cfg = SIGNAL_CONFIG[s.signal];
            const isSelected = selectedSymbol === s.symbol;
            const isBuySignal = s.signal.includes("BUY");
            const isSellSignal = s.signal.includes("SELL");

            return (
              <div key={s.symbol}>
                <button
                  onClick={() => setSelectedSymbol(isSelected ? null : s.symbol)}
                  className="w-full border p-2 sm:p-3 text-left hover:border-[var(--amber)] transition-colors"
                  style={{
                    borderColor: isSelected ? "var(--amber)" : "var(--border)",
                    background: isSelected ? "rgba(255,176,0,0.05)" : "transparent",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <span
                        className="inline-flex items-center justify-center w-10 sm:w-12 h-6 sm:h-7 text-[10px] sm:text-[11px] font-bold"
                        style={{ background: cfg.bg, color: cfg.color }}
                      >
                        {cfg.icon}
                      </span>
                      <span className="tick text-[13px] sm:text-[16px] font-bold">{s.symbol}</span>
                      <span className="text-[9px] sm:text-[10px] dim kr hidden sm:inline">
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-4">
                      <div className="text-right">
                        <div className="text-[9px] dim">현재가</div>
                        <div className="text-[11px] sm:text-[13px] bright font-bold">
                          ${fmtPrice(s.current_price)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[9px] dim">점수</div>
                        <div
                          className="text-[11px] sm:text-[13px] font-bold"
                          style={{ color: cfg.color }}
                        >
                          {s.score > 0 ? "+" : ""}{s.score}
                        </div>
                      </div>
                      <div className="text-right hidden sm:block">
                        <div className="text-[9px] dim">신뢰도</div>
                        <div className="text-[11px] sm:text-[13px] bright">{s.confidence}%</div>
                      </div>
                    </div>
                  </div>
                </button>

                {/* 펼친 상세 */}
                {isSelected && (
                  <div
                    className="border-l-2 ml-2 sm:ml-4 mt-1 p-3 sm:p-4"
                    style={{
                      borderColor: cfg.color,
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* 매수 시나리오 */}
                      {(isBuySignal || s.signal === "HOLD") && (
                        <div className="space-y-2">
                          <div className="text-[10px] sm:text-[11px] tick font-bold kr mb-2">
                            💰 매수 시나리오
                          </div>
                          <PriceRow label="진입가" value={s.buy_entry} big color="var(--amber)" />
                          <PriceRow label="1차 목표" value={s.buy_target_1}
                            pct={((s.buy_target_1 - s.buy_entry) / s.buy_entry) * 100}
                            color="var(--green)" />
                          <PriceRow label="2차 목표" value={s.buy_target_2}
                            pct={((s.buy_target_2 - s.buy_entry) / s.buy_entry) * 100}
                            color="var(--green)" />
                          <PriceRow label="손절가" value={s.buy_stop_loss}
                            pct={((s.buy_stop_loss - s.buy_entry) / s.buy_entry) * 100}
                            color="var(--red)" />
                          <div className="flex justify-between text-[10px] pt-2 border-t border-[var(--border)]">
                            <span className="dim kr">위험 대비 수익 (R:R)</span>
                            <span className="bright font-bold">
                              1:{s.buy_risk_reward.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* 매도 시나리오 */}
                      {(isSellSignal || s.signal === "HOLD") && (
                        <div className="space-y-2">
                          <div className="text-[10px] sm:text-[11px] tick font-bold kr mb-2">
                            💸 매도/청산 시나리오
                          </div>
                          <PriceRow label="청산 기준가" value={s.sell_entry} big color="var(--amber)" />
                          <PriceRow label="상단 목표" value={s.sell_target}
                            pct={((s.sell_target - s.sell_entry) / s.sell_entry) * 100}
                            color="var(--green)" />
                          <PriceRow label="손절가" value={s.sell_stop_loss}
                            pct={((s.sell_stop_loss - s.sell_entry) / s.sell_entry) * 100}
                            color="var(--red)" />
                          <div className="text-[10px] dim kr pt-2 border-t border-[var(--border)] leading-relaxed">
                            {isSellSignal
                              ? "→ 보유 중이라면 청산 검토 권고"
                              : "→ 매수 후 상단 도달 시 부분 익절 고려"}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 판단 근거 */}
                    <div className="mt-4 pt-3 border-t border-[var(--border)]">
                      <div className="text-[10px] tick font-bold kr mb-2">📊 판단 근거</div>
                      <div className="space-y-1">
                        {s.reasons.map((r, i) => (
                          <div key={i} className="text-[10px] sm:text-[11px] flex items-start gap-2">
                            <span className="dim">▸</span>
                            <span className="kr">{r}</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-[9px] sm:text-[10px]">
                        <span className="dim">
                          시간프레임: <span className="bright kr">{TIMEFRAME_KR[s.timeframe] ?? s.timeframe}</span>
                        </span>
                        <span className="dim">
                          추세: <span className={
                            s.trend === "UP" ? "up" : s.trend === "DOWN" ? "down" : "bright"
                          }>
                            {s.trend === "UP" ? "↗ 상승" : s.trend === "DOWN" ? "↘ 하락" : "→ 횡보"}
                          </span>
                        </span>
                        {s.rsi !== null && (
                          <span className="dim">
                            RSI: <span className="bright">{s.rsi.toFixed(0)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {/* 면책 */}
      <div className="mt-4 pt-3 border-t border-[var(--border)] text-[8px] sm:text-[9px] dim kr leading-relaxed">
        ⚠ 본 시그널은 기술적 지표 + 뉴스 감성 기반 통계 분석으로, 투자 자문이 아닙니다.
        실제 매매 전 본인의 투자 목표·리스크 허용도·재무상황을 종합 고려하세요.
        과거 데이터는 미래 수익을 보장하지 않습니다.
      </div>
    </div>
  );
}

function PriceRow({
  label,
  value,
  pct,
  color,
  big,
}: {
  label: string;
  value: number;
  pct?: number;
  color: string;
  big?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-[10px] dim kr">{label}</span>
      <div className="text-right">
        <span
          className={`font-bold ${big ? "text-[16px] sm:text-[18px]" : "text-[12px] sm:text-[13px]"}`}
          style={{ color }}
        >
          ${fmtPrice(value)}
        </span>
        {pct !== undefined && (
          <span className="ml-2 text-[10px]" style={{ color }}>
            ({pct > 0 ? "+" : ""}{pct.toFixed(1)}%)
          </span>
        )}
      </div>
    </div>
  );
}
