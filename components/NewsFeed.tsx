"use client";

import useSWR from "swr";
import type { NewsItem } from "@/lib/types";
import { relativeTime } from "@/lib/format";
import { safeFetcher } from "@/lib/swr-config";
import { extractKeywords } from "@/lib/keyword-extractor";

const fetcher = safeFetcher;

// DB 키워드 우선, 없으면 런타임 추출 fallback
function getDisplayKeywords(n: NewsItem, limit: number = 3): string[] {
  // (NewsItem 타입에 keywords 필드가 없어도 동적으로 접근)
  const dbKeywords = (n as any).keywords;
  if (Array.isArray(dbKeywords) && dbKeywords.length > 0) {
    return dbKeywords.slice(0, limit);
  }
  return extractKeywords(n.title, n.summary, limit);
}

// ────────────────────────────────────────────────────────────
// KST 절대 시간 포맷 (2026-04-24 18:08:00 KST)
// ────────────────────────────────────────────────────────────
function formatKst(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const kst = new Date(d.getTime() + 9 * 3600 * 1000);
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(kst.getUTCDate()).padStart(2, "0");
    const hh = String(kst.getUTCHours()).padStart(2, "0");
    const mi = String(kst.getUTCMinutes()).padStart(2, "0");
    const ss = String(kst.getUTCSeconds()).padStart(2, "0");
    return `${y}-${m}-${dd} ${hh}:${mi}:${ss} KST`;
  } catch {
    return "";
  }
}

// ────────────────────────────────────────────────────────────
// 출처별 아이콘·컬러 매핑
// ────────────────────────────────────────────────────────────
function sourceBadge(source: string | null): { label: string; icon: string; color: string } {
  const s = (source ?? "").toLowerCase();
  if (s.includes("yahoo")) return { label: "Yahoo Finance", icon: "🟣", color: "border-purple-500/50 text-purple-300" };
  if (s.includes("bloomberg")) return { label: "Bloomberg", icon: "📰", color: "border-amber-500/50 text-amber-300" };
  if (s.includes("reuters")) return { label: "Reuters", icon: "🌐", color: "border-orange-500/50 text-orange-300" };
  if (s.includes("cnbc")) return { label: "CNBC", icon: "📺", color: "border-red-500/50 text-red-300" };
  if (s.includes("wsj")) return { label: "WSJ", icon: "📄", color: "border-blue-500/50 text-blue-300" };
  if (s.includes("ft")) return { label: "FT", icon: "📄", color: "border-pink-500/50 text-pink-300" };
  if (s.includes("finnhub")) return { label: "Finnhub", icon: "🔶", color: "border-cyan-500/50 text-cyan-300" };
  if (s.includes("alpha")) return { label: "Alpha Vantage", icon: "🔷", color: "border-indigo-500/50 text-indigo-300" };
  if (s.includes("seeking")) return { label: "Seeking Alpha", icon: "🟢", color: "border-emerald-500/50 text-emerald-300" };
  if (s.includes("marketwatch")) return { label: "MarketWatch", icon: "📊", color: "border-teal-500/50 text-teal-300" };
  if (s.includes("benzinga")) return { label: "Benzinga", icon: "⚡", color: "border-yellow-500/50 text-yellow-300" };
  return { label: source ?? "UNKNOWN", icon: "📄", color: "border-slate-500/50 text-slate-300" };
}

export function NewsFeed({ symbol }: { symbol?: string }) {
  const url = symbol
    ? `/api/news?symbol=${symbol}&limit=20`
    : `/api/news?limit=25`;

  const { data, isLoading } = useSWR(url, fetcher, {
    refreshInterval: 60000,
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

      <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-2">
        {isLoading ? (
          <div className="dim text-[11px]">LOADING NEWS...</div>
        ) : news.length === 0 ? (
          <div className="dim text-[11px]">
            NO NEWS YET · Wait for first fetch cycle (~15 min)
          </div>
        ) : (
          news.map((n) => {
            const keywords = getDisplayKeywords(n, 3);
            const primarySymbol = n.related_symbols?.[0];
            const otherSymbols = n.related_symbols?.slice(1, 4) ?? [];
            const src = sourceBadge(n.source);
            const kstAbs = formatKst(n.published_at);
            const rel = relativeTime(n.published_at);

            return (
              <a
                key={n.id}
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-slate-900/50 hover:bg-slate-800/60 border border-slate-800 hover:border-amber-500/40 rounded-lg p-3 transition-all cursor-pointer group"
              >
                {/* Title row: [SYMBOL] Title */}
                <div className="flex items-start gap-2 mb-1">
                  {primarySymbol && (
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide flex-shrink-0 mt-0.5"
                      style={{
                        background: "rgba(251, 191, 36, 0.15)",
                        color: "#fbbf24",
                        border: "1px solid rgba(251, 191, 36, 0.4)",
                      }}
                    >
                      [{primarySymbol}]
                    </span>
                  )}
                  <div className="text-[12px] font-bold text-white leading-snug group-hover:text-amber-400 flex-1">
                    {n.title}
                  </div>
                </div>

                {/* Summary */}
                {n.summary && (
                  <div className="text-[10.5px] text-slate-400 leading-relaxed line-clamp-2 mb-2">
                    {n.summary}
                  </div>
                )}

                {/* Meta row: Source badge · Relative time · Absolute KST time */}
                <div className="flex items-center gap-2 flex-wrap text-[9px]">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${src.color}`}>
                    <span>{src.icon}</span>
                    <span className="font-semibold">{src.label}</span>
                  </span>

                  <span className="text-slate-500 font-medium">{rel}</span>

                  {kstAbs && (
                    <span className="text-slate-600 font-mono text-[9px]">
                      {kstAbs}
                    </span>
                  )}

                  {otherSymbols.length > 0 && (
                    <span className="flex gap-1 ml-auto">
                      {otherSymbols.map((s) => (
                        <span
                          key={s}
                          className="px-1 rounded text-[9px] bg-slate-800 text-slate-400 border border-slate-700"
                        >
                          {s}
                        </span>
                      ))}
                    </span>
                  )}
                </div>

                {/* Keywords row: 🔑 키워드: +boom, +AI boom */}
                {keywords.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-800 text-[9px]">
                    <span className="text-slate-600">🔑 키워드</span>
                    <span className="flex gap-1 flex-wrap">
                      {keywords.map((kw) => (
                        <span
                          key={kw}
                          className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                          style={{
                            background: "rgba(59, 130, 246, 0.1)",
                            color: "#93c5fd",
                            border: "1px solid rgba(59, 130, 246, 0.3)",
                          }}
                        >
                          +{kw}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
              </a>
            );
          })
        )}
      </div>
    </div>
  );
}
