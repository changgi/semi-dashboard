"use client";

import { useState } from "react";
import useSWR from "swr";
import type { NewsItem } from "@/lib/types";
import { relativeTime } from "@/lib/format";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function NewsFeed({ symbol }: { symbol?: string }) {
  const url = symbol
    ? `/api/news?symbol=${symbol}&limit=20`
    : `/api/news?limit=25`;

  const { data, isLoading } = useSWR(url, fetcher, {
    refreshInterval: 60000, // 1분마다 새 뉴스 체크
    revalidateOnFocus: false,
  });

  const news: NewsItem[] = data?.success ? data.data : [];

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="section-title">
          NEWS FEED {symbol ? `· ${symbol}` : "· SECTOR"}
        </div>
        <div className="flex items-center gap-2 text-[9px] dim">
          <span className="pulse-dot" style={{ width: 5, height: 5 }} />
          <span>AUTO-REFRESH 60s</span>
        </div>
      </div>

      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
        {isLoading ? (
          <div className="dim text-[11px]">LOADING NEWS...</div>
        ) : news.length === 0 ? (
          <div className="dim text-[11px]">
            NO NEWS YET · Wait for first fetch cycle (~15 min)
          </div>
        ) : (
          news.map((n) => (
            <a
              key={n.id}
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block border-l-2 pl-3 py-2 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer group"
              style={{ borderLeftColor: "var(--border-bright)" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.borderLeftColor = "var(--amber)")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.borderLeftColor = "var(--border-bright)")
              }
            >
              <div className="flex-1 min-w-0">
                <div className="text-[11px] bright leading-snug group-hover:text-[var(--amber)]">
                  {n.title}
                </div>
                {n.summary && (
                  <div className="text-[10px] dim mt-1 leading-relaxed line-clamp-2">
                    {n.summary}
                  </div>
                )}
                <div className="flex items-center gap-3 mt-2 text-[9px] dim flex-wrap">
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
            </a>
          ))
        )}
      </div>
    </div>
  );
}
