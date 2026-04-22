"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { safeFetcher } from "@/lib/swr-config";
import { fmtUsd } from "@/lib/format";

/**
 * TradeExecutionCard
 *
 * 긴급 매매 실행 카드 — 대시보드 내 일급 위젯.
 * - Trade Ideas API로부터 오늘 실행할 주문 자동 로드
 * - 각 주문의 증권사 입력 정보 (종목/수량/유형/금액)
 * - 데드라인 기반 카운트다운
 * - 체결가 기록 → localStorage
 */

type Order = {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  currentPrice: number;
  estimatedValue: number;
  confidence: number;
  reason: string;
  urgency: "critical" | "high" | "medium" | "low";
  source: string;
  deadline?: string; // ISO datetime (옵션)
};

type Props = {
  // 시스템 주도 데이터를 넘기지 않으면 trade-ideas API에서 자동 로드
  orders?: Order[];
  // 데드라인 (기본: 오늘 22:30 KST — TSLA 실적 대응)
  deadlineIso?: string;
  title?: string;
};

const DEFAULT_DEADLINE = (() => {
  const now = new Date();
  // 오늘 22:30 KST = UTC 13:30
  const kst = new Date(now.getTime() + 9 * 3600 * 1000);
  const target = new Date(Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate(),
    13, 30, 0 // UTC 13:30 = KST 22:30
  ));
  if (target.getTime() < now.getTime()) {
    // 이미 지났으면 내일
    target.setUTCDate(target.getUTCDate() + 1);
  }
  return target.toISOString();
})();

export default function TradeExecutionCard({ orders, deadlineIso = DEFAULT_DEADLINE, title = "🚨 오늘의 실행 주문" }: Props) {
  const { data: tradeIdeasData } = useSWR(
    orders ? null : "/api/trade-ideas",
    safeFetcher,
    { refreshInterval: 300000, revalidateOnFocus: false }
  );

  const resolvedOrders: Order[] = orders
    ?? (tradeIdeasData?.ideas ?? [])
      .filter((i: any) => i.urgency === "critical" || i.urgency === "high")
      .slice(0, 5)
      .map((i: any) => ({
        symbol: i.symbol,
        side: i.action,
        quantity: i.quantity ?? 0,
        currentPrice: i.price ?? 0,
        estimatedValue: i.estimatedValue ?? (i.price ?? 0) * (i.quantity ?? 0),
        confidence: i.confidence,
        reason: i.reason,
        urgency: i.urgency,
        source: i.source,
      }));

  // 카운트다운
  const [remaining, setRemaining] = useState<string>("--:--:--");
  const [isUrgent, setIsUrgent] = useState(false);
  useEffect(() => {
    const tick = () => {
      const diff = new Date(deadlineIso).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("실행 시각!");
        return;
      }
      setIsUrgent(diff < 600000);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [deadlineIso]);

  // 체결 기록
  const [fills, setFills] = useState<Record<string, { price: string; memo: string; savedAt?: string }>>({});
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const saved = localStorage.getItem(`execution_fills_${today}`);
    if (saved) setFills(JSON.parse(saved));
  }, []);

  const saveFill = (symbol: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const updated = { ...fills };
    if (!updated[symbol]) updated[symbol] = { price: "", memo: "" };
    updated[symbol].savedAt = new Date().toISOString();
    setFills(updated);
    localStorage.setItem(`execution_fills_${today}`, JSON.stringify(updated));
  };

  const updateFill = (symbol: string, field: "price" | "memo", value: string) => {
    setFills(prev => ({
      ...prev,
      [symbol]: { ...(prev[symbol] ?? { price: "", memo: "" }), [field]: value }
    }));
  };

  return (
    <div className="bg-gradient-to-br from-rose-950 to-slate-950 border-2 border-rose-500/40 rounded-2xl p-5 relative overflow-hidden">
      {/* 펄스 배경 */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-rose-500 to-transparent animate-pulse" />

      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs text-rose-400 font-bold tracking-wider uppercase flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            CRITICAL · 실행 카드
          </div>
          <h3 className="text-lg font-bold text-white mt-1">{title}</h3>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">데드라인까지</div>
          <div className={`font-mono text-2xl font-bold ${isUrgent ? "text-rose-400 animate-pulse" : "text-amber-400"}`}>
            {remaining}
          </div>
        </div>
      </div>

      {resolvedOrders.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">
          현재 긴급 실행 주문이 없습니다
        </div>
      ) : (
        <div className="space-y-3">
          {resolvedOrders.map((order, idx) => {
            const isDone = fills[order.symbol]?.savedAt;
            return (
              <div
                key={`${order.symbol}-${idx}`}
                className={`bg-slate-800/60 border rounded-xl p-4 ${
                  isDone ? "border-emerald-500/40 opacity-60" : "border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-black px-2.5 py-1 rounded ${
                      order.side === "SELL" ? "bg-rose-500 text-white" : "bg-emerald-500 text-black"
                    }`}>
                      {order.side === "SELL" ? "매도" : "매수"}
                    </span>
                    <div>
                      <div className="text-lg font-bold text-white">{order.symbol}</div>
                      <div className="text-[10px] text-slate-500">{order.source}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-500">신뢰도</div>
                    <div className="font-bold text-amber-400">{order.confidence}%</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3 text-[11px]">
                  <div>
                    <div className="text-slate-500 uppercase text-[9px]">수량</div>
                    <div className="text-white font-bold text-sm">{order.quantity}주</div>
                  </div>
                  <div>
                    <div className="text-slate-500 uppercase text-[9px]">현재가</div>
                    <div className="text-white font-bold text-sm">{fmtUsd(order.currentPrice)}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 uppercase text-[9px]">예상 체결액</div>
                    <div className="text-emerald-400 font-bold text-sm">{fmtUsd(order.estimatedValue)}</div>
                  </div>
                </div>

                <div className="text-[12px] text-slate-400 bg-slate-900/50 rounded-lg p-2 mb-3">
                  💡 {order.reason}
                </div>

                {/* 체결 기록 */}
                {!isDone ? (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      value={fills[order.symbol]?.price ?? ""}
                      onChange={(e) => updateFill(order.symbol, "price", e.target.value)}
                      placeholder="체결가"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                    <input
                      value={fills[order.symbol]?.memo ?? ""}
                      onChange={(e) => updateFill(order.symbol, "memo", e.target.value)}
                      placeholder="메모"
                      className="flex-[2] bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => saveFill(order.symbol)}
                      disabled={!fills[order.symbol]?.price}
                      className="bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-500 text-black disabled:cursor-not-allowed px-3 py-1.5 rounded-lg text-xs font-bold"
                    >
                      ✓ 기록
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-2">
                    <div className="text-xs text-emerald-400 font-bold">✅ 체결 완료 · ${fills[order.symbol].price}</div>
                    <button
                      onClick={() => {
                        const updated = { ...fills };
                        delete updated[order.symbol].savedAt;
                        setFills(updated);
                        const today = new Date().toISOString().slice(0, 10);
                        localStorage.setItem(`execution_fills_${today}`, JSON.stringify(updated));
                      }}
                      className="text-[10px] text-slate-500 hover:text-rose-400"
                    >
                      되돌리기
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-slate-800 text-[10px] text-slate-500 text-center">
        데드라인: {new Date(deadlineIso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST
      </div>
    </div>
  );
}
