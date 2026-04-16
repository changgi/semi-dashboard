"use client";

import { useEffect, useState } from "react";
import type { NewsItem } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { createBrowser } from "@/lib/supabase";

export function NewsFeed({ symbol }: { symbol?: string }) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = symbol
      ? `/api/news?symbol=${symbol}&limit=20`
      : `/api/news?limit=25`;

    fetch(url)
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setNews(res.data);
        setLoading(false);
      });

    // Realtime 구독 - 새 뉴스가 들어오면 추가
    const supabase = createBrowser();
    const channel = supabase
      .channel("news-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "news" },
        (payload) => {
          const newItem = payload.new as NewsItem;
          if (
            !symbol ||
            (newItem.related_symbols ?? []).includes(symbol.toUpperCase())
          ) {
            setNews((prev) => [newItem, ...prev].slice(0, 25));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [symbol]);

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="section-title">
          NEWS FEED {symbol ? `· ${symbol}` : "· SECTOR"}
        </div>
        <div className="flex items-center gap-2 text-[9px] dim">
          <span className="pulse-dot" style={{ width: 5, height: 5 }}></span>
          <span>LIVE</span>
        </div>
      </div>

      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
        {loading ? (
          <div className="dim text-[11px]">LOADING NEWS...</div>
        ) : news.length === 0 ? (
          <div className="dim text-[11px]">
            NO NEWS YET · Wait for first fetch cycle
          </div>
        ) : (
          news.map((n) => (
            <a
              key={n.id}
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block border-l-2 border-[var(--border-bright)] pl-3 py-2 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group"
              style={{ borderLeftColor: "var(--border-bright)" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.borderLeftColor =
                  "var(--amber)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.borderLeftColor =
                  "var(--border-bright)")
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] bright leading-snug group-hover:text-[var(--amber)]">
                    {n.title}
                  </div>
                  {n.summary && (
                    <div className="text-[10px] dim mt-1 leading-relaxed line-clamp-2">
                      {n.summary}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[9px] dim">
                    <span className="tick">{n.source || "UNKNOWN"}</span>
                    <span>·</span>
                    <span>{relativeTime(n.published_at)}</span>
                    {n.related_symbols && n.related_symbols.length > 0 && (
                      <>
                        <span>·</span>
                        <span className="flex gap-1">
                          {n.related_symbols.slice(0, 3).map((s) => (
                            <span
                              key={s}
                              className="px-1 border border-[var(--border-bright)] text-[var(--amber)]"
                              style={{ fontSize: 9 }}
                            >
                              {s}
                            </span>
                          ))}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
