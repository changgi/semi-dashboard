import type { FinnhubQuote } from "./types";

const FINNHUB_BASE = "https://finnhub.io/api/v1";

export interface FinnhubNewsItem {
  id: number;
  headline: string;
  summary: string;
  url: string;
  image: string;
  source: string;
  datetime: number;
  related: string;
  category: string;
}

export class FinnhubClient {
  constructor(private apiKey: string) {
    if (!apiKey) {
      throw new Error("FINNHUB_API_KEY is required");
    }
  }

  async getQuote(symbol: string): Promise<FinnhubQuote> {
    const url = `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${this.apiKey}`;
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) throw new Error(`Finnhub quote error ${symbol}: ${res.status}`);
    const data: FinnhubQuote = await res.json();
    if (data.c === 0 && data.pc === 0) throw new Error(`No data for ${symbol}`);
    return data;
  }

  async getQuotes(symbols: string[]): Promise<Map<string, FinnhubQuote>> {
    const result = new Map<string, FinnhubQuote>();
    const BATCH_SIZE = 10;
    const BATCH_DELAY_MS = 1100;

    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      const batch = symbols.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((s) => this.getQuote(s))
      );
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") result.set(batch[idx], r.value);
        else console.error(`Failed ${batch[idx]}:`, r.reason);
      });
      if (i + BATCH_SIZE < symbols.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }
    return result;
  }

  async getMarketNews(category = "technology"): Promise<FinnhubNewsItem[]> {
    const url = `${FINNHUB_BASE}/news?category=${category}&token=${this.apiKey}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`Finnhub news error: ${res.status}`);
    return res.json();
  }

  async getCompanyNews(
    symbol: string,
    from: string,
    to: string
  ): Promise<FinnhubNewsItem[]> {
    const url = `${FINNHUB_BASE}/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${this.apiKey}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) throw new Error(`Finnhub company news error: ${res.status}`);
    return res.json();
  }
}

export function getFinnhubClient(): FinnhubClient {
  return new FinnhubClient(process.env.FINNHUB_API_KEY!);
}
