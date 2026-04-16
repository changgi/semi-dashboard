"use client";

import { useEffect, useState, useCallback } from "react";
import useSWR from "swr";
import { createBrowser } from "@/lib/supabase";
import type { DashboardRow, Quote } from "@/lib/types";
import { TopBar } from "@/components/TopBar";
import { LiveTicker } from "@/components/LiveTicker";
import { Heatmap } from "@/components/Heatmap";
import { ChangeRanking } from "@/components/ChangeRanking";
import { SegmentStats } from "@/components/SegmentStats";
import { NewsFeed } from "@/components/NewsFeed";
import { StockDrawer } from "@/components/StockDrawer";
import { fmtPct } from "@/lib/format";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function Dashboard() {
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [flashMap, setFlashMap] = useState<Map<string, "up" | "down">>(new Map());

  // 초기 데이터 로드 + 15초 폴링
  const { data } = useSWR("/api/quotes", fetcher, {
    refreshInterval: 15000,
    revalidateOnFocus: true,
  });

  useEffect(() => {
    if (data?.success) {
      setRows(data.data);
    }
  }, [data]);

  // Supabase Realtime 구독
  useEffect(() => {
    const supabase = createBrowser();

    const channel = supabase
      .channel("quotes-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "quotes" },
        (payload) => {
          const newQuote = payload.new as Quote;
          if (!newQuote?.symbol) return;

          setRows((prev) => {
            const old = prev.find((r) => r.symbol === newQuote.symbol);
            if (old && old.price !== null) {
              const dir = newQuote.price > old.price ? "up" : "down";
              setFlashMap((m) => new Map(m).set(newQuote.symbol, dir));
              setTimeout(() => {
                setFlashMap((m) => {
                  const next = new Map(m);
                  next.delete(newQuote.symbol);
                  return next;
                });
              }, 1200);
            }

            return prev.map((r) =>
              r.symbol === newQuote.symbol
                ? {
                    ...r,
                    price: newQuote.price,
                    change: newQuote.change,
                    change_percent: newQuote.change_percent,
                    day_high: newQuote.day_high,
                    day_low: newQuote.day_low,
                    prev_close: newQuote.prev_close,
                    volume: newQuote.volume,
                    updated_at: newQuote.updated_at,
                  }
                : r
            );
          });
        }
      )
      .subscribe((status) => {
        setIsConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSelect = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
  }, []);

  const selectedRow = selectedSymbol
    ? rows.find((r) => r.symbol === selectedSymbol) ?? null
    : null;

  // 헤드라인 지표
  const gainers = rows.filter((r) => (r.change_percent ?? 0) > 0).length;
  const losers = rows.filter((r) => (r.change_percent ?? 0) < 0).length;
  const avgChange =
    rows.length > 0
      ? rows.reduce((s, r) => s + (r.change_percent ?? 0), 0) / rows.length
      : 0;
  const totalCap = rows
    .filter((r) => !r.is_etf)
    .reduce((s, r) => s + (r.market_cap_b ?? 0), 0);

  return (
    <div className="relative z-10">
      <TopBar isConnected={isConnected} />
      <LiveTicker rows={rows} />

      {/* Hero */}
      <div className="px-6 py-8 border-b border-[var(--border)]">
        <div className="grid grid-cols-12 gap-6 items-end">
          <div className="col-span-8">
            <div className="text-[10px] tick mb-2">
              ◢ SEMICONDUCTOR SECTOR // REAL-TIME
            </div>
            <h1 className="headline text-white text-[72px] leading-[0.82]">
              THE<br />
              <span style={{ color: "var(--amber)" }}>MEMFLATION</span>
              <br />
              <span className="serif italic" style={{ fontWeight: 400, color: "var(--text-dim)" }}>
                dashboard.
              </span>
            </h1>
            <div className="mt-4 text-[12px] dim kr max-w-2xl">
              실시간 반도체 섹터 모니터링. Finnhub 시세 + Supabase Realtime +
              1분 Cron. 종목 클릭 시 상세 차트와 관련 뉴스 확인.
            </div>
          </div>
          <div className="col-span-4 grid grid-cols-2 gap-3">
            <div className="panel p-3">
              <div className="text-[9px] dim tracking-widest">GAINERS</div>
              <div className="headline text-[32px] up mt-1">{gainers}</div>
            </div>
            <div className="panel p-3">
              <div className="text-[9px] dim tracking-widest">LOSERS</div>
              <div className="headline text-[32px] down mt-1">{losers}</div>
            </div>
            <div className="panel p-3">
              <div className="text-[9px] dim tracking-widest">AVG CHG</div>
              <div
                className={`headline text-[32px] mt-1 ${
                  avgChange >= 0 ? "up" : "down"
                }`}
              >
                {fmtPct(avgChange)}
              </div>
            </div>
            <div className="panel p-3">
              <div className="text-[9px] dim tracking-widest">TOTAL MCAP</div>
              <div className="headline text-[32px] mt-1" style={{ color: "var(--amber)" }}>
                ${(totalCap / 1000).toFixed(1)}T
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="px-6 py-6 grid grid-cols-12 gap-5">
        {/* Heatmap - full width */}
        <div className="col-span-12">
          <Heatmap rows={rows} onSelect={handleSelect} />
        </div>

        {/* Ranking + Segments */}
        <div className="col-span-6">
          <ChangeRanking rows={rows} />
        </div>
        <div className="col-span-6">
          <SegmentStats rows={rows} />
        </div>

        {/* ETF Row */}
        <div className="col-span-12 panel p-5">
          <div className="section-title mb-4">ETF TRACKER</div>
          <div className="grid grid-cols-5 gap-3">
            {rows
              .filter((r) => r.is_etf)
              .map((r) => {
                const up = (r.change_percent ?? 0) >= 0;
                const flash = flashMap.get(r.symbol);
                return (
                  <button
                    key={r.symbol}
                    onClick={() => handleSelect(r.symbol)}
                    className={`text-left p-4 border border-[var(--border)] hover:border-[var(--amber)] transition-colors ${
                      flash === "up" ? "flash-green" : flash === "down" ? "flash-red" : ""
                    }`}
                  >
                    <div className="tick text-[14px]">{r.symbol}</div>
                    <div className="text-[9px] dim kr">{r.name_kr}</div>
                    <div className="bright text-[16px] mt-2 hex-num">
                      ${r.price?.toFixed(2) ?? "—"}
                    </div>
                    <div className={`text-[11px] ${up ? "up" : "down"}`}>
                      {up ? "▲" : "▼"} {fmtPct(r.change_percent)}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* News */}
        <div className="col-span-12">
          <NewsFeed />
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--border-bright)] px-6 py-3 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-4">
          <span className="tick">◢ EOF</span>
          <span className="dim">│</span>
          <span className="dim">DATA: FINNHUB + ALPHA VANTAGE</span>
          <span className="dim">│</span>
          <span className="dim">STORE: SUPABASE (SEOUL)</span>
          <span className="dim">│</span>
          <span className="dim">HOST: VERCEL</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="dim">NOT FINANCIAL ADVICE</span>
          <span className="tick">◤ END</span>
        </div>
      </div>

      {selectedRow && (
        <StockDrawer row={selectedRow} onClose={() => setSelectedSymbol(null)} />
      )}
    </div>
  );
}
