"use client";

import { useState } from "react";
import type { DashboardRow } from "@/lib/types";
import { fmtPrice, fmtPct, fmtChange, fmtMarketCap, fmtVolume } from "@/lib/format";
import { PriceChart } from "./PriceChart";
import { NewsFeed } from "./NewsFeed";
import { AlertModal } from "./AlertModal";

export function StockDrawer({
  row,
  onClose,
}: {
  row: DashboardRow;
  onClose: () => void;
}) {
  const [showAlert, setShowAlert] = useState(false);
  const up = (row.change ?? 0) >= 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-[var(--bg)] border-l border-[var(--border-bright)] w-full sm:w-[90%] lg:w-[85%] max-w-6xl h-full ml-auto overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slideIn 0.3s" }}
      >
        <div className="p-4 sm:p-6">
          {/* Header */}
          <div className="mb-4 sm:mb-6 pb-4 sm:pb-6 border-b border-[var(--border)]">
            {/* Top row: segment + buttons */}
            <div className="flex items-center justify-between mb-2">
              <div className="section-title text-[10px]">{row.segment?.toUpperCase()}</div>
              <div className="flex gap-2">
                <a
                  href={`/stock/${encodeURIComponent(row.symbol)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2 sm:px-4 py-1.5 sm:py-2 border border-[var(--amber-dim)] text-[var(--amber)] text-[9px] sm:text-[11px] tracking-widest hover:bg-[var(--amber)] hover:text-black"
                  title="전체 분석 페이지 열기"
                >
                  ◢ FULL PAGE
                </a>
                <button
                  onClick={() => setShowAlert(true)}
                  className="px-2 sm:px-4 py-1.5 sm:py-2 border border-[var(--amber)] text-[var(--amber)] text-[9px] sm:text-[11px] tracking-widest hover:bg-[var(--amber)] hover:text-black"
                >
                  ◢ ALERT
                </button>
                <button
                  onClick={onClose}
                  className="px-2 sm:px-4 py-1.5 sm:py-2 border border-[var(--border-bright)] dim text-[9px] sm:text-[11px] hover:bright"
                >
                  ✕
                </button>
              </div>
            </div>
            {/* Symbol + name */}
            <div className="flex items-baseline gap-2 sm:gap-4 flex-wrap">
              <div className="headline text-[40px] sm:text-[56px] lg:text-[64px] bright">{row.symbol}</div>
              <div className="text-[12px] sm:text-[14px] dim kr">{row.name_kr}</div>
            </div>
            <div className="text-[10px] sm:text-[11px] dim mt-1">{row.name}</div>
          </div>

          {/* Price Display */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
            <div className="panel p-3 sm:p-4 col-span-2">
              <div className="text-[9px] sm:text-[10px] dim tracking-widest">CURRENT PRICE</div>
              <div className={`headline text-[36px] sm:text-[48px] lg:text-[56px] ${up ? "up glow-green" : "down glow-red"} hex-num`}>
                ${fmtPrice(row.price)}
              </div>
              <div className={`text-[12px] sm:text-[14px] ${up ? "up" : "down"}`}>
                {up ? "▲" : "▼"} {fmtChange(row.change)} ({fmtPct(row.change_percent)})
              </div>
            </div>
            <div className="panel p-3 sm:p-4">
              <div className="text-[9px] sm:text-[10px] dim tracking-widest">DAY RANGE</div>
              <div className="mt-2 text-[12px] sm:text-[14px] bright">
                ${fmtPrice(row.day_low)}
              </div>
              <div className="text-[10px] dim">—</div>
              <div className="text-[12px] sm:text-[14px] bright">
                ${fmtPrice(row.day_high)}
              </div>
              <div className="text-[9px] sm:text-[10px] dim mt-2">PREV CLOSE</div>
              <div className="text-[11px] sm:text-[12px] bright">${fmtPrice(row.prev_close)}</div>
            </div>
            <div className="panel p-3 sm:p-4">
              <div className="text-[9px] sm:text-[10px] dim tracking-widest">MARKET CAP</div>
              <div className="text-[16px] sm:text-[18px] bright mt-2">{fmtMarketCap(row.market_cap_b)}</div>
              <div className="text-[9px] sm:text-[10px] dim mt-2">VOLUME</div>
              <div className="text-[11px] sm:text-[12px] bright">{fmtVolume(row.volume)}</div>
            </div>
          </div>

          {/* Chart */}
          <div className="mb-4 sm:mb-6">
            <PriceChart symbol={row.symbol} />
          </div>

          {/* News */}
          <div>
            <NewsFeed symbol={row.symbol} />
          </div>
        </div>
      </div>

      {showAlert && (
        <AlertModal
          symbol={row.symbol}
          currentPrice={row.price}
          onClose={() => setShowAlert(false)}
        />
      )}

      <style jsx global>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
