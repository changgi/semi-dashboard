// ================================================
// 공통 타입 정의
// ================================================

export interface Ticker {
  symbol: string;
  name: string;
  name_kr: string | null;
  sector: string;
  segment: string | null;
  market_cap_b: number | null;
  is_etf: boolean;
  logo_url: string | null;
  description_kr: string | null;
  created_at: string;
}

export interface Quote {
  symbol: string;
  price: number;
  change: number | null;
  change_percent: number | null;
  day_high: number | null;
  day_low: number | null;
  prev_close: number | null;
  volume: number | null;
  updated_at: string;
}

export interface DashboardRow {
  symbol: string;
  name: string;
  name_kr: string | null;
  segment: string | null;
  market_cap_b: number | null;
  is_etf: boolean;
  price: number | null;
  change: number | null;
  change_percent: number | null;
  day_high: number | null;
  day_low: number | null;
  prev_close: number | null;
  volume: number | null;
  updated_at: string | null;
}

export interface PriceHistoryPoint {
  symbol: string;
  price: number;
  timestamp: string;
  interval_type: string;
}

export interface Alert {
  id: string;
  symbol: string;
  condition: "above" | "below" | "change_up" | "change_down";
  threshold: number;
  email: string | null;
  is_active: boolean;
  triggered_at: string | null;
  created_at: string;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  source: string | null;
  image_url: string | null;
  related_symbols: string[] | null;
  published_at: string;
  created_at: string;
}

// ================================================
// Finnhub API Response
// ================================================

export interface FinnhubQuote {
  c: number; // current price
  d: number; // change
  dp: number; // percent change
  h: number; // day high
  l: number; // day low
  o: number; // open
  pc: number; // previous close
  t: number; // timestamp
}

// ================================================
// Segments
// ================================================

export const SEGMENTS = {
  fabless: { label: "팹리스", color: "#00d4ff" },
  foundry: { label: "파운드리", color: "#ffb000" },
  memory: { label: "메모리", color: "#ff00aa" },
  equipment: { label: "장비", color: "#00ff88" },
  idm: { label: "IDM", color: "#ff6600" },
  etf: { label: "ETF", color: "#a0a0a0" },
} as const;

export type Segment = keyof typeof SEGMENTS;
