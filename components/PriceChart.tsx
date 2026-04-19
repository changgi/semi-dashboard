"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  Area,
  ComposedChart,
} from "recharts";
import { fmtPrice } from "@/lib/format";

interface ChartPoint {
  timestamp: string;
  price: number;
}

const RANGES = [
  { key: "1h", label: "1H" },
  { key: "1d", label: "24H" },
  { key: "7d", label: "7D" },
  { key: "1m", label: "1M" },
] as const;

export function PriceChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<string>("1d");
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/history?symbol=${symbol}&range=${range}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          setData(res.data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [symbol, range]);

  const prices = data.map((d) => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const pad = (max - min) * 0.1 || 1;
  const first = data[0]?.price ?? 0;
  const last = data[data.length - 1]?.price ?? 0;
  const up = last >= first;

  const color = up ? "#00ff88" : "#ff3860";

  const formatted = data.map((d) => ({
    time: new Date(d.timestamp).getTime(),
    price: d.price,
    label: new Date(d.timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  }));

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="section-title">PRICE CHART · {symbol}</div>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-3 py-1 text-[10px] border ${
                range === r.key
                  ? "border-[var(--amber)] text-[var(--amber)]"
                  : "border-[var(--border)] dim hover:border-[var(--border-bright)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: 280 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full dim text-[11px]">
            LOADING DATA...
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-full dim text-[11px] flex-col gap-2">
            <div>NO DATA YET</div>
            <div className="text-[9px]">Wait ~1min for first cron fetch</div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={formatted}>
              <defs>
                <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1f2a20" strokeDasharray="2 4" />
              <XAxis
                dataKey="label"
                stroke="#6b7a6c"
                tick={{ fontSize: 9 }}
                axisLine={false}
              />
              <YAxis
                domain={[min - pad, max + pad]}
                stroke="#6b7a6c"
                tick={{ fontSize: 9 }}
                axisLine={false}
                tickFormatter={(v) => `$${fmtPrice(v)}`}
                width={55}
              />
              <Tooltip
                contentStyle={{
                  background: "#0f1411",
                  border: "1px solid #2d3d2f",
                  fontSize: 11,
                  fontFamily: "JetBrains Mono",
                }}
                labelStyle={{ color: "#ffb000" }}
                formatter={(value: number) => [`$${fmtPrice(value)}`, "PRICE"]}
              />
              <ReferenceLine
                y={first}
                stroke="#6b7a6c"
                strokeDasharray="3 3"
                label={{
                  value: `OPEN $${fmtPrice(first)}`,
                  fill: "#6b7a6c",
                  fontSize: 9,
                  position: "right",
                }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="none"
                fill={`url(#grad-${symbol})`}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke={color}
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-3 text-[10px]">
        <div>
          <div className="dim">OPEN</div>
          <div className="bright text-[13px]">${fmtPrice(first)}</div>
        </div>
        <div>
          <div className="dim">LAST</div>
          <div className="bright text-[13px]">${fmtPrice(last)}</div>
        </div>
        <div>
          <div className="dim">HIGH</div>
          <div className="up text-[13px]">${fmtPrice(max)}</div>
        </div>
        <div>
          <div className="dim">LOW</div>
          <div className="down text-[13px]">${fmtPrice(min)}</div>
        </div>
      </div>
    </div>
  );
}
