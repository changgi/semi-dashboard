// ═══════════════════════════════════════════════════════════
// SWR 전역 Fetcher v2 - Cache + Fallback Strategy
// 
// Vercel 간헐 장애 완전 방어:
//   1. 성공 응답은 localStorage에 캐싱 (30분 TTL)
//   2. API 503/500 시 → 캐시된 데이터 자동 복구
//   3. 캐시 없으면 → 기본 빈 데이터
//   4. 절대 크래시 안 남
// ═══════════════════════════════════════════════════════════

const CACHE_PREFIX = "semi_cache_";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30분

interface CacheEntry {
  data: any;
  timestamp: number;
  url: string;
}

// 캐시 유틸
function getCache(url: string): any | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + url);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + url);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function setCache(url: string, data: any): void {
  if (typeof window === "undefined") return;
  try {
    const entry: CacheEntry = { data, timestamp: Date.now(), url };
    localStorage.setItem(CACHE_PREFIX + url, JSON.stringify(entry));
  } catch {
    try { cleanOldCache(); } catch { /* 무시 */ }
  }
}

function cleanOldCache(): void {
  if (typeof window === "undefined") return;
  const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
  const entries = keys
    .map((k) => {
      try {
        const raw = localStorage.getItem(k);
        if (!raw) return null;
        const entry: CacheEntry = JSON.parse(raw);
        return { key: k, timestamp: entry.timestamp };
      } catch {
        return null;
      }
    })
    .filter((e): e is { key: string; timestamp: number } => e !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
  
  for (const e of entries.slice(0, 10)) {
    localStorage.removeItem(e.key);
  }
}

// 기본 빈 데이터 (모든 가능한 배열/객체 필드)
const EMPTY_DEFAULTS: Record<string, any> = {
  alerts: [], triggered: [], notifications: [], recent: [],
  positions: [], holdings: [], sectorBreakdown: [],
  signals: [], tradingSignals: [], bucketResults: [],
  keyInsights: [], opportunities: [], riskFactors: [], actions: [],
  orders: [],
  supportResistance: [], unusualActivity: [], gammaSqueezeCandidates: [],
  allResults: [], levels: [], events: [],
  priceSeries: [], forecast: [], history: [],
  topRisks: [], topOpportunities: [], recommendedActions: [],
  thisWeek: [], nextWeek: [], upcoming: [],
  actionItems: [], symbolSignals: [], todayEvents: [],
  pendingSignals: [], snapshots: [], symbolStats: [], portfolioTrend: [],
  insights: [],
  news: [], comparisons: [],
  items: [], list: [], rows: [],
  results: { strongBuys: [], buys: [], neutrals: [], sells: [], strongSells: [] },
  summary: { keyRecommendations: [], executionOrder: [], totalBuyAmount: 0, totalSellAmount: 0, netFlow: 0 },
  overallStats: { total: 0, accuracy1d: 0, accuracy7d: 0, accuracy30d: 0, avgMaxGain: 0, avgMaxLoss: 0 },
  directionStats: { upSignals: { total: 0, accuracy: 0 }, downSignals: { total: 0, accuracy: 0 } },
  confidenceStats: { high: { total: 0, accuracy: 0 }, medium: { total: 0, accuracy: 0 }, low: { total: 0, accuracy: 0 } },
  expectedPortfolio: { beforeTotal: 0, afterTotal: 0, beforePositions: 0, afterPositions: 0, diversificationScore: 0 },
  executiveSummary: { headline: "", todayAction: "", actionColor: "#888", actionIcon: "⏸️", urgency: "normal", confidence: 0, keyPoints: [] },
  portfolioSummary: { totalValueUsd: 0, totalGainPct: 0, positionCount: 0, riskScore: 0 },
  macro: { vix: null, tnx: null, krw: 1470, dxy: null, oil: null, vixRegime: "unknown" },
  sectorSentiment: { bullish: 0, bearish: 0, neutral: 0, avgScore: 0, positiveGex: 0, negativeGex: 0 },
  prediction: { direction: "neutral", confidence: 0, targetPrice: 0, targetPct: 0, signals: [], rationale: [], timeHorizon: "" },
  gex: { total: 0, regime: "neutral" },
  ivStructure: { atmCallIV: 0, atmPutIV: 0 },
  profile: { currentRegime: "unknown", currentGamma: 0, flipLevel: null, largestConcentrations: [], pricePoints: [] },
  interpretation: { signals: [], scenarios: [], summary: "" },
  decision: { actionLabel: "", icon: "", confidence: 0, title: "", subtitle: "", reasons: [], risks: [], targetPrice: 0, stopLoss: 0, takeProfit: 0 },
  stats: { total: 0, critical: 0, warning: 0, info: 0, opportunity: 0, success: 0 },
  // 추가 nested 보호 (BacktestPanel, DailySummaryPanel 등 대응)
  strategy: { avgReturn: 0, winRate: 0, totalTrades: 0, buckets: [] },
  benchmark: { avgReturn: 0, symbol: "" },
  agents: { totalAnalyzed: 0, results: [] },
  accuracy: { avgMape: 0, avgCoverage: 0, avgDirectionAcc: 0 },
  dataStats: { totalForecasts: 0, dataHealthScore: 0 },
  krwAnalysis: { price: 0, change: 0, range: { low: 0, high: 0 } },
  fxAnalysis: { price: 0, change: 0 },
  futuresAnalysis: {},
  bucketAnalysis: {},
  totalCapital: { usd: 0, krw: 0 },
  riskMetrics: { overallScore: 0, portfolioValue: 0, beta: 0 },
  marketState: { regime: "unknown", condition: "" },
  trades: [],
  allEvents: [],
  chartData: [],
  heatmap: [],
};

// ───────────────────────────────────────────────────────────
// Deep merge: undefined/null인 값은 기본값을 유지
// ───────────────────────────────────────────────────────────
function deepMergeWithDefaults(defaults: any, data: any): any {
  if (data === null || data === undefined) return defaults;
  if (typeof data !== "object" || Array.isArray(data)) return data;
  
  const result: any = { ...defaults };
  for (const key in data) {
    const val = data[key];
    if (val === undefined || val === null) {
      // undefined/null이면 기본값 유지 (배열/객체 보존)
      if (key in defaults) continue;
      result[key] = val;
    } else if (typeof val === "object" && !Array.isArray(val) && key in defaults && typeof defaults[key] === "object" && !Array.isArray(defaults[key])) {
      // 객체면 재귀
      result[key] = deepMergeWithDefaults(defaults[key], val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * 안전한 fetcher (캐시 + 기본값)
 * - 503/500 시 → 최근 캐시 복구 (최대 30분 전 데이터)
 * - 네트워크 에러 시 → 캐시 복구
 * - 응답 누락 필드 → 기본 빈 값
 * - 절대 throw 안 함
 */
export async function safeFetcher(url: string): Promise<any> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });

    if (!res.ok) {
      console.warn(`[API soft failure] ${url} → HTTP ${res.status}`);
      
      // 📦 503/500 시 캐시 복구
      const cached = getCache(url);
      if (cached) {
        console.info(`[Cache recovery] ${url} → 최근 캐시 사용`);
        return deepMergeWithDefaults(EMPTY_DEFAULTS, { ...cached, _from_cache: true });
      }
      
      return {
        success: false,
        error: `HTTP ${res.status}`,
        _soft_failure: true,
        ...EMPTY_DEFAULTS,
      };
    }

    try {
      const data = await res.json();
      // 🔥 deep merge - undefined가 기본값을 덮어쓰지 않음
      const merged = deepMergeWithDefaults(EMPTY_DEFAULTS, data);
      
      // 📦 성공 응답 캐싱
      if (data && data.success !== false) {
        setCache(url, data);
      }
      
      return merged;
    } catch {
      const cached = getCache(url);
      if (cached) {
        return deepMergeWithDefaults(EMPTY_DEFAULTS, { ...cached, _from_cache: true });
      }
      return {
        success: false,
        error: "JSON parse error",
        _soft_failure: true,
        ...EMPTY_DEFAULTS,
      };
    }
  } catch (networkError) {
    const msg = networkError instanceof Error ? networkError.message : "Network error";
    console.warn(`[API network error] ${url} → ${msg}`);
    
    const cached = getCache(url);
    if (cached) {
      console.info(`[Cache recovery] ${url} → 네트워크 에러, 캐시 사용`);
      return deepMergeWithDefaults(EMPTY_DEFAULTS, { ...cached, _from_cache: true });
    }
    
    return {
      success: false,
      error: msg,
      _soft_failure: true,
      ...EMPTY_DEFAULTS,
    };
  }
}

export const swrDefaultConfig = {
  fetcher: safeFetcher,
  revalidateOnFocus: false,
  shouldRetryOnError: true,
  errorRetryCount: 3,
  errorRetryInterval: 5000,
  dedupingInterval: 5000,
};

// 디버그 헬퍼 (브라우저 콘솔에서 __semi_cache.stats() 호출 가능)
if (typeof window !== "undefined") {
  (window as any).__semi_cache = {
    stats: () => {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
      let size = 0;
      for (const k of keys) size += (localStorage.getItem(k) || "").length;
      return { entries: keys.length, sizeKB: Math.round(size / 1024) };
    },
    clear: () => {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
      for (const k of keys) localStorage.removeItem(k);
      return `${keys.length}개 캐시 삭제됨`;
    },
    list: () => {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
      return keys.map((k) => {
        try {
          const entry: CacheEntry = JSON.parse(localStorage.getItem(k) || "{}");
          const ageSec = Math.floor((Date.now() - entry.timestamp) / 1000);
          return { url: entry.url, age: `${ageSec}초 전`, fresh: ageSec < CACHE_TTL_MS / 1000 };
        } catch {
          return { url: k, age: "?", fresh: false };
        }
      });
    },
  };
}
