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
        className="bg-[var(--bg)] border-l border-[var(--border-bright)] w-[85%] max-w-6xl h-full ml-auto overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slideIn 0.3s" }}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6 pb-6 border-b border-[var(--border)]">
            <div>
              <div className="section-title mb-2">{row.segment?.toUpperCase()}</div>
              <div className="flex items-baseline gap-4">
                <div className="headline text-[64px] bright">{row.symbol}</div>
                <div className="text-[14px] dim kr">{row.name_kr}</div>
              </div>
              <div className="text-[11px] dim mt-1">{row.name}</div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAlert(true)}
                className="px-4 py-2 border border-[var(--amber)] text-[var(--amber)] text-[11px] tracking-widest hover:bg-[var(--amber)] hover:text-black"
              >
                ◢ SET ALERT
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 border border-[var(--border-bright)] dim text-[11px] hover:border-[var(--border-bright)] hover:bright"
              >
                CLOSE ✕
              </button>
            </div>
          </div>

          {/* Big Price Display */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="panel p-4 col-span-2">
              <div className="text-[10px] dim tracking-widest">CURRENT PRICE</div>
              <div className={`headline text-[56px] ${up ? "up glow-green" : "down glow-red"} hex-num`}>
                ${fmtPrice(row.price)}
              </div>
              <div className={`text-[14px] ${up ? "up" : "down"}`}>
                {up ? "▲" : "▼"} {fmtChange(row.change)} ({fmtPct(row.change_percent)})
              </div>
            </div>
            <div className="panel p-4">
              <div className="text-[10px] dim tracking-widest">DAY RANGE</div>
              <div className="mt-2 text-[14px] bright">
                ${fmtPrice(row.day_low)} — ${fmtPrice(row.day_high)}
              </div>
              <div className="text-[10px] dim mt-2">PREV CLOSE</div>
              <div className="text-[12px] bright">${fmtPrice(row.prev_close)}</div>
            </div>
            <div className="panel p-4">
              <div className="text-[10px] dim tracking-widest">MARKET CAP</div>
              <div className="text-[18px] bright mt-2">{fmtMarketCap(row.market_cap_b)}</div>
              <div className="text-[10px] dim mt-2">VOLUME</div>
              <div className="text-[12px] bright">{fmtVolume(row.volume)}</div>
            </div>
          </div>

          {/* Chart */}
          <div className="mb-6">
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
