"use client";

import useSWR, { mutate } from "swr";
import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";
import { SymbolDisplay } from "@/components/SymbolDisplay";

const fetcher = safeFetcher;

interface TradeRecord {
  id: string;
  trade_date: string;
  symbol: string;
  action: "BUY" | "SELL";
  shares: number;
  price: number;
  total_amount: number;
  currency: string;
  source: string | null;
  reasoning: string | null;
  realized_pnl: number | null;
  realized_pnl_pct: number | null;
  holding_days: number | null;
  emotion: string | null;
  tags: string[] | null;
  lesson: string | null;
}

interface Data {
  success: boolean;
  records: TradeRecord[];
  stats: {
    totalBuys: number;
    totalSells: number;
    uniqueSymbols: number;
    totalInvested: number;
    totalRealized: number;
    totalRealizedPnl: number;
    winRate: number;
    winningSells: number;
    losingSells: number;
    sourceStats: Record<string, { count: number; avgPnl: number }>;
  };
  lessons: Array<{ date: string; symbol: string; lesson: string }>;
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  trade_ideas: { label: "💡 Trade Ideas", color: "#ffb000" },
  opportunity: { label: "🎯 기회 탐지", color: "#00ff88" },
  recovery_path: { label: "🔄 복구 경로", color: "#7ec8ff" },
  exit_strategy: { label: "🎯 출구 전략", color: "#c084fc" },
  manual: { label: "✍️ 수동", color: "#aaa" },
  emotional: { label: "😰 감정적", color: "#ff3860" },
};

const EMOTIONS: Record<string, string> = {
  confident: "😎 자신감",
  fearful: "😨 두려움",
  greedy: "🤤 욕심",
  regretful: "😔 후회",
  neutral: "😐 담담",
};

export function TradeJournalPanel() {
  const { data, isLoading } = useSWR<Data>(
    "/api/trade-journal-v2?limit=30",
    fetcher,
    { refreshInterval: 2 * 60 * 1000 }
  );
  
  const [mode, setMode] = useState<"list" | "add">("list");
  const [filter, setFilter] = useState<"all" | "buy" | "sell">("all");
  const [form, setForm] = useState({
    trade_date: new Date().toISOString().split("T")[0],
    symbol: "",
    action: "BUY" as "BUY" | "SELL",
    shares: "",
    price: "",
    currency: "USD" as "USD" | "KRW",
    source: "manual" as string,
    reasoning: "",
    emotion: "",
    tags: [] as string[],
  });
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  if (isLoading || !data) {
    return (
      <div className="p-4 border border-[var(--border)] rounded bg-black/20">
        <div className="text-[10px] dim kr">매매 이력 로딩 중...</div>
      </div>
    );
  }
  
  const handleAdd = async () => {
    if (!form.symbol || !form.shares || !form.price) {
      setMessage("심볼, 주수, 가격 필수");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/trade-journal-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          shares: Number(form.shares),
          price: Number(form.price),
        }),
      });
      const result = await res.json();
      if (result.success) {
        setMessage(result.message ?? "기록 완료");
        setForm({ ...form, symbol: "", shares: "", price: "", reasoning: "", emotion: "", tags: [] });
        mutate("/api/trade-journal-v2?limit=30");
        setTimeout(() => {
          setMode("list");
          setMessage(null);
        }, 1500);
      } else {
        setMessage("오류: " + result.error);
      }
    } catch (e) {
      setMessage("기록 실패");
    }
    setIsSubmitting(false);
  };
  
  const filteredRecords = data.records.filter(r => {
    if (filter === "buy") return r.action === "BUY";
    if (filter === "sell") return r.action === "SELL";
    return true;
  });
  
  const stats = data.stats;
  
  return (
    <div className="space-y-3">
      {/* 통계 */}
      <div className="p-3 border border-[var(--border)] rounded bg-[rgba(255,176,0,0.04)]">
        <div className="flex justify-between items-center mb-2">
          <div className="text-[11px] tick font-bold kr">📔 매매 저널</div>
          <div className="flex gap-1">
            {(["all", "buy", "sell"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-[9px] px-2 py-1 border rounded kr ${
                  filter === f
                    ? "border-[var(--amber)] tick font-bold"
                    : "border-[var(--border)] dim"
                }`}
              >
                {f === "all" ? "전체" : f === "buy" ? "매수" : "매도"}
              </button>
            ))}
          </div>
        </div>
        
        <div className="grid grid-cols-4 gap-2 text-[9px]">
          <div>
            <div className="dim kr">총 거래</div>
            <div className="text-[14px] tick font-bold">
              {stats.totalBuys + stats.totalSells}
            </div>
            <div className="text-[9px] dim">매수 {stats.totalBuys}·매도 {stats.totalSells}</div>
          </div>
          <div>
            <div className="dim kr">실현 손익</div>
            <div className={`text-[14px] font-bold ${stats.totalRealizedPnl >= 0 ? "up" : "down"}`}>
              {stats.totalRealizedPnl >= 0 ? "+" : ""}${Math.abs(stats.totalRealizedPnl).toFixed(0)}
            </div>
          </div>
          <div>
            <div className="dim kr">승률</div>
            <div className={`text-[14px] font-bold ${stats.winRate >= 60 ? "up" : stats.winRate >= 40 ? "warn" : "down"}`}>
              {stats.winRate.toFixed(0)}%
            </div>
            <div className="text-[9px] dim">{stats.winningSells}/{stats.totalSells}</div>
          </div>
          <div>
            <div className="dim kr">종목</div>
            <div className="text-[14px] tick font-bold">{stats.uniqueSymbols}</div>
          </div>
        </div>
      </div>
      
      {/* 액션 버튼 */}
      <div className="flex gap-2">
        <button
          onClick={() => { setMode("add"); setForm({ ...form, action: "BUY" }); }}
          className="flex-1 text-[10px] px-3 py-2 border border-[#00ff88] rounded bg-[rgba(0,255,136,0.05)] up font-bold kr hover:bg-[rgba(0,255,136,0.15)]"
        >
          ＋ 매수 기록
        </button>
        <button
          onClick={() => { setMode("add"); setForm({ ...form, action: "SELL" }); }}
          className="flex-1 text-[10px] px-3 py-2 border border-[#ff3860] rounded bg-[rgba(255,56,96,0.05)] down font-bold kr hover:bg-[rgba(255,56,96,0.15)]"
        >
          − 매도 기록
        </button>
      </div>
      
      {message && (
        <div className="p-2 border border-[var(--amber)] rounded bg-[rgba(255,176,0,0.1)] text-[10px] kr tick">
          {message}
        </div>
      )}
      
      {/* 기록 추가 폼 */}
      {mode === "add" && (
        <div className="p-3 border border-[var(--border)] rounded bg-black/30 space-y-2">
          <div className="text-[10px] tick font-bold kr">
            {form.action === "BUY" ? "＋ 매수 기록" : "− 매도 기록"}
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] dim kr block mb-1">거래일</label>
              <input
                type="date"
                value={form.trade_date}
                onChange={(e) => setForm({ ...form, trade_date: e.target.value })}
                className="w-full text-[10px] px-2 py-1.5 bg-black/40 border border-[var(--border)] rounded"
              />
            </div>
            <div>
              <label className="text-[9px] dim kr block mb-1">심볼</label>
              <input
                type="text"
                value={form.symbol}
                onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
                placeholder="NVDA, 005930.KS"
                className="w-full text-[10px] px-2 py-1.5 bg-black/40 border border-[var(--border)] rounded kr"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] dim kr block mb-1">주수</label>
              <input
                type="number"
                value={form.shares}
                onChange={(e) => setForm({ ...form, shares: e.target.value })}
                className="w-full text-[10px] px-2 py-1.5 bg-black/40 border border-[var(--border)] rounded"
              />
            </div>
            <div>
              <label className="text-[9px] dim kr block mb-1">가격</label>
              <input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full text-[10px] px-2 py-1.5 bg-black/40 border border-[var(--border)] rounded"
              />
            </div>
            <div>
              <label className="text-[9px] dim kr block mb-1">통화</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value as "USD" | "KRW" })}
                className="w-full text-[10px] px-2 py-1.5 bg-black/40 border border-[var(--border)] rounded"
              >
                <option value="USD">USD</option>
                <option value="KRW">KRW</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="text-[9px] dim kr block mb-1">출처</label>
            <select
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              className="w-full text-[10px] px-2 py-1.5 bg-black/40 border border-[var(--border)] rounded kr"
            >
              {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-[9px] dim kr block mb-1">감정 상태</label>
            <div className="flex gap-1 flex-wrap">
              {Object.entries(EMOTIONS).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setForm({ ...form, emotion: k })}
                  className={`text-[9px] px-2 py-1 border rounded kr ${
                    form.emotion === k
                      ? "border-[var(--amber)] tick font-bold bg-[rgba(255,176,0,0.1)]"
                      : "border-[var(--border)] dim"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <label className="text-[9px] dim kr block mb-1">매매 이유 (자유 서술)</label>
            <textarea
              value={form.reasoning}
              onChange={(e) => setForm({ ...form, reasoning: e.target.value })}
              placeholder="예: TSLA 실적 D-1 회피 목적, Trade Ideas P2 따름"
              rows={2}
              className="w-full text-[10px] px-2 py-1.5 bg-black/40 border border-[var(--border)] rounded kr resize-none"
            />
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={isSubmitting}
              className="flex-1 text-[10px] px-3 py-2 border border-[var(--amber)] rounded bg-[rgba(255,176,0,0.1)] tick font-bold kr disabled:opacity-50"
            >
              {isSubmitting ? "저장 중..." : "✓ 기록 저장"}
            </button>
            <button
              onClick={() => setMode("list")}
              className="text-[10px] px-3 py-2 border border-[var(--border)] rounded dim kr"
            >
              취소
            </button>
          </div>
        </div>
      )}
      
      {/* 기록 리스트 */}
      {mode === "list" && (
        <div className="space-y-1">
          {filteredRecords.length === 0 ? (
            <div className="p-6 text-center border border-[var(--border)] rounded bg-black/20">
              <div className="text-[10px] dim kr">기록된 매매가 없습니다</div>
            </div>
          ) : (
            filteredRecords.slice(0, 10).map(r => {
              const src = SOURCE_LABELS[r.source ?? "manual"] ?? SOURCE_LABELS.manual;
              return (
                <div
                  key={r.id}
                  className="p-2 border rounded bg-[var(--bg-card,#141414)]"
                  style={{
                    borderLeftColor: r.action === "BUY" ? "#00ff88" : "#ff3860",
                    borderLeftWidth: "3px",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                        style={{
                          background: r.action === "BUY" ? "#00ff88" : "#ff3860",
                          color: "#000",
                        }}
                      >
                        {r.action}
                      </span>
                      <SymbolDisplay
                        meta={{ symbol: r.symbol }}
                        size="xs"
                        variant="inline"
                        showBadges={false}
                        showName={false}
                      />
                      <span className="text-[10px] dim">{r.shares}주 @ ${r.price}</span>
                      <span className="text-[9px] dim">{r.trade_date}</span>
                    </div>
                    {r.realized_pnl !== null && (
                      <div
                        className={`text-[10px] font-bold ${r.realized_pnl >= 0 ? "up" : "down"}`}
                      >
                        {r.realized_pnl >= 0 ? "+" : ""}${Math.abs(r.realized_pnl).toFixed(0)}
                        {r.realized_pnl_pct !== null && ` (${r.realized_pnl_pct.toFixed(1)}%)`}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-[9px]">
                    <span className="px-1.5 py-0.5 rounded kr" style={{ background: `${src.color}20`, color: src.color }}>
                      {src.label}
                    </span>
                    {r.emotion && (
                      <span className="dim kr">{EMOTIONS[r.emotion]}</span>
                    )}
                    {r.holding_days !== null && (
                      <span className="dim kr">보유 {r.holding_days}일</span>
                    )}
                  </div>
                  {r.reasoning && (
                    <div className="text-[9px] kr mt-1 dim leading-relaxed">
                      💭 {r.reasoning}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
      
      {/* 소스별 성과 */}
      {Object.keys(data.stats.sourceStats).length > 1 && (
        <div className="p-2 border border-[var(--border)] rounded bg-black/20">
          <div className="text-[9px] tick font-bold kr mb-1">📊 출처별 성과</div>
          {Object.entries(data.stats.sourceStats).map(([src, st]) => {
            const cfg = SOURCE_LABELS[src] ?? { label: src, color: "#aaa" };
            return (
              <div key={src} className="flex justify-between text-[9px] py-0.5">
                <span className="kr" style={{ color: cfg.color }}>{cfg.label}</span>
                <span>
                  <span className="dim">{st.count}건</span>
                  {st.avgPnl !== 0 && (
                    <span className={`ml-2 font-bold ${st.avgPnl >= 0 ? "up" : "down"}`}>
                      평균 {st.avgPnl >= 0 ? "+" : ""}${st.avgPnl.toFixed(0)}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
