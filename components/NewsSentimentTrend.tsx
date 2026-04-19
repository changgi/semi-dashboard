"use client";

import useSWR from "swr";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, ReferenceLine,
} from "recharts";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface NewsItem {
  title: string;
  sentiment: number;
  sentiment_label: string;
  source: string;
  published_at: string;
  related_symbols: string[];
}

export function NewsSentimentTrend() {
  const { data } = useSWR("/api/news?limit=100", fetcher, { refreshInterval: 120000 });
  const news: NewsItem[] = data?.success ? data.data : [];

  if (news.length === 0) {
    return (
      <div className="panel p-3 sm:p-5">
        <div className="section-title mb-4">NEWS SENTIMENT ANALYSIS</div>
        <div className="dim text-[11px]">COLLECTING NEWS DATA...</div>
      </div>
    );
  }

  // 감성 분포
  const pos = news.filter((n) => n.sentiment > 0.1).length;
  const neg = news.filter((n) => n.sentiment < -0.1).length;
  const neu = news.length - pos - neg;
  const avgSentiment = news.reduce((s, n) => s + (n.sentiment ?? 0), 0) / news.length;

  // 종목별 감성
  const symbolSentiment = new Map<string, { total: number; count: number }>();
  for (const n of news) {
    for (const sym of (n.related_symbols ?? [])) {
      const existing = symbolSentiment.get(sym) ?? { total: 0, count: 0 };
      existing.total += n.sentiment ?? 0;
      existing.count++;
      symbolSentiment.set(sym, existing);
    }
  }

  const symData = Array.from(symbolSentiment.entries())
    .map(([sym, d]) => ({ symbol: sym, sentiment: d.total / d.count, count: d.count }))
    .sort((a, b) => b.sentiment - a.sentiment)
    .slice(0, 12);

  return (
    <div className="panel p-3 sm:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2">
        <div className="section-title text-[10px] sm:text-[12px]">NEWS SENTIMENT ANALYSIS</div>
        <div className="text-[9px] dim">N={news.length} articles</div>
      </div>

      {/* 감성 요약 */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-4">
        <div className="border border-[var(--border)] p-2 sm:p-3">
          <div className="text-[8px] sm:text-[9px] dim">AVG SENTIMENT</div>
          <div className={`text-[18px] sm:text-[24px] font-bold ${avgSentiment >= 0 ? "up" : "down"}`}>
            {avgSentiment >= 0 ? "+" : ""}{(avgSentiment * 100).toFixed(0)}
          </div>
        </div>
        <div className="border border-[var(--border)] p-2 sm:p-3">
          <div className="text-[8px] sm:text-[9px] dim">POSITIVE</div>
          <div className="text-[18px] sm:text-[24px] font-bold up">{pos}</div>
        </div>
        <div className="border border-[var(--border)] p-2 sm:p-3">
          <div className="text-[8px] sm:text-[9px] dim">NEGATIVE</div>
          <div className="text-[18px] sm:text-[24px] font-bold down">{neg}</div>
        </div>
        <div className="border border-[var(--border)] p-2 sm:p-3">
          <div className="text-[8px] sm:text-[9px] dim">NEUTRAL</div>
          <div className="text-[18px] sm:text-[24px] font-bold dim">{neu}</div>
        </div>
      </div>

      {/* 종목별 감성 바 차트 */}
      <div className="text-[9px] dim mb-2">SENTIMENT BY TICKER</div>
      <div style={{ width: "100%", height: 250 }}>
        <ResponsiveContainer>
          <BarChart data={symData} layout="vertical">
            <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
            <XAxis type="number" domain={[-1, 1]} tick={{ fill: "#888", fontSize: 9 }} />
            <YAxis dataKey="symbol" type="category" tick={{ fill: "#ccc", fontSize: 10 }} width={45} />
            <Tooltip
              contentStyle={{ background: "rgba(20,20,20,0.95)", border: "1px solid var(--amber-dim)", borderRadius: "4px", fontSize: 11, padding: "8px 10px", boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }} labelStyle={{ color: "var(--amber)", fontWeight: "bold", marginBottom: "4px" }} itemStyle={{ color: "#e0e0e0", padding: "1px 0" }}
              formatter={(v: number) => [(v * 100).toFixed(0), "Sentiment"]}
            />
            <ReferenceLine x={0} stroke="rgba(255,255,255,0.25)" />
            <Bar dataKey="sentiment">
              {symData.map((d, i) => (
                <Cell key={i} fill={d.sentiment >= 0 ? "#00d468" : "#ff3b6b"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 최근 뉴스 + 감성 */}
      <div className="mt-4 text-[9px] dim mb-2">RECENT SENTIMENT FEED</div>
      <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
        {news.slice(0, 15).map((n, i) => (
          <div key={i} className="flex items-start gap-2 py-1 border-b border-[var(--border)]">
            <span className={`w-12 shrink-0 text-right font-bold text-[10px] ${
              n.sentiment > 0.1 ? "up" : n.sentiment < -0.1 ? "down" : "dim"
            }`}>
              {n.sentiment > 0 ? "+" : ""}{(n.sentiment * 100).toFixed(0)}
            </span>
            <span className="text-[9px] sm:text-[10px] bright leading-snug line-clamp-2 flex-1">
              {n.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
