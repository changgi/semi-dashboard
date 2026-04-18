// ================================================
// Alpha Vantage API - 과거 데이터 전용 (Finnhub 보완)
// Free tier: 25 req/day - 일일 캔들 데이터용
// ================================================

const AV_BASE = "https://www.alphavantage.co/query";

interface AVDailyData {
  "Time Series (Daily)"?: Record<string, {
    "1. open": string;
    "2. high": string;
    "3. low": string;
    "4. close": string;
    "5. volume": string;
  }>;
  "Error Message"?: string;
  "Note"?: string;
}

export class AlphaVantageClient {
  constructor(private apiKey: string) {}

  /**
   * 일봉 데이터 가져오기 (최근 100일)
   */
  async getDailyHistory(symbol: string): Promise<Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>> {
    if (!this.apiKey) return [];

    const url = `${AV_BASE}?function=TIME_SERIES_DAILY&symbol=${symbol}&apikey=${this.apiKey}&outputsize=compact`;
    const res = await fetch(url, { next: { revalidate: 3600 } });

    if (!res.ok) throw new Error(`AlphaVantage error: ${res.status}`);

    const data: AVDailyData = await res.json();

    if (data["Error Message"]) {
      throw new Error(data["Error Message"]);
    }

    if (data["Note"]) {
      // Rate limit 도달
      console.warn("AlphaVantage rate limit:", data["Note"]);
      return [];
    }

    const series = data["Time Series (Daily)"];
    if (!series) return [];

    return Object.entries(series)
      .map(([date, values]) => ({
        date,
        open: parseFloat(values["1. open"]),
        high: parseFloat(values["2. high"]),
        low: parseFloat(values["3. low"]),
        close: parseFloat(values["4. close"]),
        volume: parseInt(values["5. volume"], 10),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

export function getAlphaVantageClient(): AlphaVantageClient {
  return new AlphaVantageClient(process.env.ALPHA_VANTAGE_API_KEY || "");
}
