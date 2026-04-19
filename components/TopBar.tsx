"use client";

import { useEffect, useState } from "react";

export function TopBar({ isConnected }: { isConnected: boolean }) {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZone: "America/New_York",
        })
      );
      setDate(
        now.toLocaleDateString("en-US", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          weekday: "short",
        })
      );
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const now = new Date();
  const nyTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = nyTime.getDay();
  const h = nyTime.getHours();
  const m = nyTime.getMinutes();
  const isMarketOpen =
    day >= 1 && day <= 5 && ((h === 9 && m >= 30) || (h >= 10 && h < 16));

  return (
    <div className="border-b border-[var(--border-bright)] px-3 sm:px-6 py-2 flex items-center justify-between text-[9px] sm:text-[10px]">
      <div className="flex items-center gap-2 sm:gap-6 flex-wrap">
        <span className="tick text-[10px] sm:text-[11px]">◢ SEMI-TERMINAL</span>
        <span className="hidden sm:inline dim">│</span>
        <span className="flex items-center gap-1">
          <span
            className="pulse-dot"
            style={{
              background: isConnected ? "var(--green)" : "var(--red)",
              boxShadow: `0 0 8px ${isConnected ? "var(--green)" : "var(--red)"}`,
            }}
          />
          <span className="hidden sm:inline ml-1">{isConnected ? "LIVE FEED" : "CONNECTING..."}</span>
        </span>
        <span className="hidden lg:inline dim">│</span>
        <span className="hidden lg:inline">
          <span className="dim">MKT: </span>
          <span className={isMarketOpen ? "up" : "down"}>
            {isMarketOpen ? "OPEN" : "CLOSED"}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2 sm:gap-6">
        <span className="hidden sm:inline dim">{date}</span>
        <span className="tick">{time}</span>
        <span className="dim blink">▮</span>
      </div>
    </div>
  );
}
