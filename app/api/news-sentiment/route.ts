import { NextResponse } from "next/server";

export const revalidate = 900; // 15분
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// News Sentiment API
// 
// Yahoo Finance RSS + 키워드 기반 감정 분석
// 외부 AI API 의존 없이 로컬에서 빠르게 분석
// ═══════════════════════════════════════════════════════════

interface NewsItem {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source: string;
  symbol: string;
  // 분석 결과
  sentiment: "positive" | "negative" | "neutral";
  score: number; // -100 ~ +100
  impactLevel: "high" | "medium" | "low";
  keywords: string[];
}

// ───────────────────────────────────────────────────────────
// 감정 키워드 사전 (한영)
// ───────────────────────────────────────────────────────────
const POSITIVE_KEYWORDS = [
  // 영어 - 재무/실적
  { word: "beat", score: 15, high: true },
  { word: "beats", score: 15, high: true },
  { word: "surge", score: 10, high: false },
  { word: "rally", score: 10, high: false },
  { word: "soar", score: 10, high: false },
  { word: "jump", score: 7, high: false },
  { word: "boom", score: 12, high: true },
  { word: "record high", score: 15, high: true },
  { word: "all-time high", score: 15, high: true },
  { word: "breakout", score: 10, high: false },
  { word: "upgrade", score: 12, high: true },
  { word: "buy rating", score: 10, high: false },
  { word: "outperform", score: 10, high: false },
  // 사업/기술
  { word: "breakthrough", score: 12, high: true },
  { word: "innovation", score: 6, high: false },
  { word: "partnership", score: 7, high: false },
  { word: "expansion", score: 6, high: false },
  { word: "launch", score: 5, high: false },
  { word: "approval", score: 8, high: false },
  { word: "milestone", score: 7, high: false },
  { word: "strong demand", score: 10, high: false },
  // AI/반도체 특화
  { word: "AI boom", score: 15, high: true },
  { word: "chip shortage", score: 8, high: false }, // 반도체주엔 긍정
  { word: "HBM", score: 8, high: false }, // 메모리 긍정
  { word: "data center", score: 6, high: false },
  // 한국어
  { word: "실적 호조", score: 12, high: true },
  { word: "신고가", score: 12, high: true },
  { word: "상승", score: 5, high: false },
  { word: "급등", score: 10, high: false },
  { word: "목표가 상향", score: 10, high: false },
  { word: "매수", score: 6, high: false },
];

const NEGATIVE_KEYWORDS = [
  // 영어
  { word: "miss", score: -15, high: true },
  { word: "misses", score: -15, high: true },
  { word: "plunge", score: -15, high: true },
  { word: "plummet", score: -15, high: true },
  { word: "crash", score: -20, high: true },
  { word: "collapse", score: -15, high: true },
  { word: "sinks", score: -10, high: false },
  { word: "tumble", score: -10, high: false },
  { word: "slump", score: -10, high: false },
  { word: "downgrade", score: -15, high: true },
  { word: "sell rating", score: -12, high: true },
  { word: "underperform", score: -10, high: false },
  { word: "warning", score: -8, high: false },
  { word: "lawsuit", score: -10, high: false },
  { word: "investigation", score: -10, high: false },
  { word: "layoff", score: -8, high: false },
  { word: "layoffs", score: -10, high: false },
  { word: "cuts", score: -6, high: false },
  { word: "slowdown", score: -8, high: false },
  { word: "weak demand", score: -12, high: true },
  { word: "recession", score: -15, high: true },
  // 반도체 특화
  { word: "oversupply", score: -10, high: false },
  { word: "inventory glut", score: -12, high: true },
  // 한국어
  { word: "실적 부진", score: -12, high: true },
  { word: "급락", score: -15, high: true },
  { word: "하락", score: -5, high: false },
  { word: "목표가 하향", score: -10, high: false },
  { word: "매도", score: -6, high: false },
  { word: "감원", score: -10, high: false },
  { word: "구조조정", score: -8, high: false },
  { word: "규제", score: -5, high: false },
];

// ───────────────────────────────────────────────────────────
// 뉴스 감정 분석
// ───────────────────────────────────────────────────────────
function analyzeSentiment(text: string): {
  sentiment: "positive" | "negative" | "neutral";
  score: number;
  impactLevel: "high" | "medium" | "low";
  keywords: string[];
} {
  const lower = text.toLowerCase();
  let score = 0;
  const matchedKeywords: string[] = [];
  let highImpact = false;

  // 긍정 키워드
  for (const kw of POSITIVE_KEYWORDS) {
    if (lower.includes(kw.word.toLowerCase())) {
      score += kw.score;
      matchedKeywords.push(`+${kw.word}`);
      if (kw.high) highImpact = true;
    }
  }

  // 부정 키워드
  for (const kw of NEGATIVE_KEYWORDS) {
    if (lower.includes(kw.word.toLowerCase())) {
      score += kw.score;
      matchedKeywords.push(`-${kw.word}`);
      if (kw.high) highImpact = true;
    }
  }

  // 중립적 단어도 영향 감소 (하지만 키워드 매칭은 유지)
  score = Math.max(-100, Math.min(100, score));

  const sentiment: "positive" | "negative" | "neutral" =
    score >= 10 ? "positive" :
    score <= -10 ? "negative" :
    "neutral";

  const impactLevel: "high" | "medium" | "low" =
    highImpact || Math.abs(score) >= 20 ? "high" :
    Math.abs(score) >= 10 ? "medium" :
    "low";

  return { sentiment, score, impactLevel, keywords: matchedKeywords };
}

// ───────────────────────────────────────────────────────────
// Yahoo Finance RSS 파싱
// ───────────────────────────────────────────────────────────
async function fetchNewsForSymbol(symbol: string): Promise<NewsItem[]> {
  try {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();

    // 간단 XML 파싱
    const items: NewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/;
    const linkRegex = /<link>([\s\S]*?)<\/link>/;
    const dateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/;

    let match;
    let idx = 0;
    while ((match = itemRegex.exec(xml)) !== null && idx < 10) {
      const itemXml = match[1];
      const title = titleRegex.exec(itemXml)?.[1]?.trim() ?? "";
      const link = linkRegex.exec(itemXml)?.[1]?.trim() ?? "";
      const pubDate = dateRegex.exec(itemXml)?.[1]?.trim() ?? "";
      if (!title) continue;

      const analysis = analyzeSentiment(title);
      items.push({
        id: `${symbol}_${idx++}`,
        title,
        link,
        pubDate,
        source: "Yahoo Finance",
        symbol,
        ...analysis,
      });
    }

    return items;
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════
export async function GET() {
  try {
    // 주요 반도체/빅테크 종목
    const symbols = [
      "NVDA", "AMD", "TSM", "INTC", "MU", "AVGO",
      "SMH", "SOXX",
      "AAPL", "MSFT", "GOOGL", "META",
      "SPY", "QQQ",
    ];

    // 병렬 조회
    const allNews: NewsItem[] = [];
    await Promise.all(
      symbols.map(async (sym) => {
        const news = await fetchNewsForSymbol(sym);
        allNews.push(...news);
      })
    );

    // 중복 제거 (제목 기준)
    const seen = new Set<string>();
    const unique = allNews.filter((n) => {
      if (seen.has(n.title)) return false;
      seen.add(n.title);
      return true;
    });

    // 정렬: 영향도 + 최신순
    unique.sort((a, b) => {
      const impactOrder = { high: 0, medium: 1, low: 2 };
      if (impactOrder[a.impactLevel] !== impactOrder[b.impactLevel]) {
        return impactOrder[a.impactLevel] - impactOrder[b.impactLevel];
      }
      return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
    });

    // 섹터 전체 센티먼트 계산
    const avgScore = unique.length > 0
      ? unique.reduce((s, n) => s + n.score, 0) / unique.length
      : 0;
    const positiveCount = unique.filter(n => n.sentiment === "positive").length;
    const negativeCount = unique.filter(n => n.sentiment === "negative").length;
    const neutralCount = unique.filter(n => n.sentiment === "neutral").length;

    const overallSentiment =
      avgScore >= 5 ? "bullish" :
      avgScore <= -5 ? "bearish" :
      "neutral";

    // 심볼별 센티먼트
    const bySymbol: Record<string, { count: number; avgScore: number; top?: NewsItem }> = {};
    for (const n of unique) {
      if (!bySymbol[n.symbol]) {
        bySymbol[n.symbol] = { count: 0, avgScore: 0 };
      }
      bySymbol[n.symbol].count++;
      bySymbol[n.symbol].avgScore += n.score;
    }
    for (const sym in bySymbol) {
      bySymbol[sym].avgScore = Math.round(bySymbol[sym].avgScore / bySymbol[sym].count);
      bySymbol[sym].top = unique.find(n => n.symbol === sym && n.impactLevel === "high")
        || unique.find(n => n.symbol === sym);
    }

    // Top 뉴스 분류
    const topBullish = unique.filter(n => n.sentiment === "positive").slice(0, 5);
    const topBearish = unique.filter(n => n.sentiment === "negative").slice(0, 5);
    const highImpact = unique.filter(n => n.impactLevel === "high").slice(0, 10);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      totalNews: unique.length,
      overallSentiment,
      avgScore: Math.round(avgScore * 100) / 100,
      counts: {
        positive: positiveCount,
        negative: negativeCount,
        neutral: neutralCount,
      },
      bySymbol,
      topBullish,
      topBearish,
      highImpact,
      recent: unique.slice(0, 20),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      totalNews: 0,
      overallSentiment: "neutral",
      avgScore: 0,
      counts: { positive: 0, negative: 0, neutral: 0 },
      bySymbol: {},
      topBullish: [],
      topBearish: [],
      highImpact: [],
      recent: [],
    });
  }
}
