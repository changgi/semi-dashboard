// ═══════════════════════════════════════════════════════════
// 포트폴리오 종목 → 옵션 분석 가능한 미국 티커 매핑
// 
// 사용 목적:
//   - 한국 ETF (TIGER S&P500, KODEX 반도체 등)는 옵션 없음
//   - 기초자산이 되는 미국 종목/ETF의 옵션으로 간접 분석
// ═══════════════════════════════════════════════════════════

export interface OptionsProxy {
  symbol: string;        // 포트폴리오 심볼 (예: 360750.KS)
  name: string;          // 종목명
  proxySymbol: string;   // 옵션 분석용 대체 티커 (예: SPY)
  proxyName: string;     // 대체 티커 이름
  relationship: string;  // 관계 설명
  correlation: number;   // 상관관계 (0-1)
}

// ───────────────────────────────────────────────────────────
// 한국 ETF → 미국 대응 매핑
// ───────────────────────────────────────────────────────────
const KOREAN_ETF_MAPPING: Record<string, { proxy: string; name: string; rel: string; corr: number }> = {
  // S&P 500 계열
  "360750.KS": { proxy: "SPY",  name: "S&P 500 ETF",           rel: "TIGER 미국S&P500은 S&P 500 지수 추종", corr: 0.98 },
  "379800.KS": { proxy: "SPY",  name: "S&P 500 ETF",           rel: "KODEX 미국S&P500은 S&P 500 지수 추종", corr: 0.98 },
  "461340.KS": { proxy: "SPY",  name: "S&P 500 ETF",           rel: "TIGER 미국S&P500선물은 S&P 500 선물 추종", corr: 0.95 },
  
  // 나스닥/기술주
  "133690.KS": { proxy: "QQQ",  name: "Invesco QQQ Trust",     rel: "TIGER 미국나스닥100은 나스닥 추종", corr: 0.97 },
  "381180.KS": { proxy: "SOXX", name: "iShares Semi ETF",      rel: "TIGER 미국필라델피아반도체나스닥", corr: 0.95 },
  "381170.KS": { proxy: "QQQ",  name: "Invesco QQQ Trust",     rel: "TIGER 미국테크TOP10은 미국 빅테크 추종", corr: 0.92 },
  "411420.KS": { proxy: "QQQ",  name: "Invesco QQQ Trust",     rel: "KODEX 미국빅테크10은 미국 빅테크 추종", corr: 0.90 },
  
  // 반도체
  "091160.KS": { proxy: "SMH",  name: "VanEck Semi ETF",       rel: "KODEX 반도체는 국내 반도체주 지수", corr: 0.80 },
  
  // 한국 대형주 (직접 옵션 불가, 유사 섹터로)
  "005930.KS": { proxy: "SMH",  name: "VanEck Semi ETF",       rel: "삼성전자는 반도체 섹터 대표주", corr: 0.75 },
  "000660.KS": { proxy: "SMH",  name: "VanEck Semi ETF",       rel: "SK하이닉스는 메모리 반도체 대표주", corr: 0.82 },
  "042700.KS": { proxy: "SMH",  name: "VanEck Semi ETF",       rel: "한미반도체는 반도체 장비주", corr: 0.70 },
  
  // 배당/리츠/산업
  "148070.KS": { proxy: "SPY",  name: "S&P 500 ETF",           rel: "KOSEF 국고채10년은 금리 민감", corr: 0.50 },
};

// ───────────────────────────────────────────────────────────
// 미국 주식 (직접 옵션 가능)
// ───────────────────────────────────────────────────────────
const US_STOCKS_WITH_OPTIONS = new Set([
  "NVDA", "AMD", "TSM", "AVGO", "MU", "INTC", "QCOM", "ARM", "MRVL", "TXN", "ADI",
  "ASML", "AMAT", "LRCX", "KLAC",
  "SMH", "SOXX", "SOXL", "SOXS", "XLK",
  "SPY", "QQQ", "IWM", "DIA",
  "AAPL", "MSFT", "GOOGL", "META", "AMZN", "TSLA", "NFLX", "DIS",
]);

/**
 * 심볼이 직접 옵션 분석 가능한지 확인
 */
export function hasDirectOptions(symbol: string): boolean {
  const upper = symbol.toUpperCase();
  return US_STOCKS_WITH_OPTIONS.has(upper);
}

/**
 * 포트폴리오 심볼을 옵션 분석 가능한 proxy로 변환
 */
export function resolveOptionsProxy(
  symbol: string,
  name: string | null
): OptionsProxy | null {
  const upper = symbol.toUpperCase();
  
  // 1. 이미 미국 옵션 가능 종목이면 그대로 사용
  if (hasDirectOptions(upper)) {
    return {
      symbol: upper,
      name: name || upper,
      proxySymbol: upper,
      proxyName: name || upper,
      relationship: "직접 옵션 분석 가능",
      correlation: 1.0,
    };
  }
  
  // 2. 한국 ETF 매핑
  const mapping = KOREAN_ETF_MAPPING[upper];
  if (mapping) {
    return {
      symbol: upper,
      name: name || upper,
      proxySymbol: mapping.proxy,
      proxyName: mapping.name,
      relationship: mapping.rel,
      correlation: mapping.corr,
    };
  }
  
  // 3. 한국 심볼이지만 매핑 없음 → SPY로 기본 연결
  if (upper.endsWith(".KS") || upper.endsWith(".KQ")) {
    return {
      symbol: upper,
      name: name || upper,
      proxySymbol: "SPY",
      proxyName: "S&P 500 ETF",
      relationship: "한국 주식 (기본 S&P 500 참조)",
      correlation: 0.50,
    };
  }
  
  return null;
}

/**
 * 포트폴리오 전체의 proxy 매핑
 */
export function resolvePortfolioProxies(
  holdings: Array<{ symbol: string; name: string | null }>
): Map<string, OptionsProxy> {
  const map = new Map<string, OptionsProxy>();
  for (const h of holdings) {
    const proxy = resolveOptionsProxy(h.symbol, h.name);
    if (proxy) {
      map.set(h.symbol, proxy);
    }
  }
  return map;
}
