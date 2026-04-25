/**
 * 뉴스 키워드 자동 추출 유틸
 *
 * 서버(cron/fetch-news)와 클라이언트(NewsFeed fallback)에서 공용.
 *
 * 전략:
 *   1. 카테고리별 키워드 사전 (catalyst/tech/macro/sector)
 *   2. 다중 단어 키워드 우선 매칭 ("AI boom"을 "AI"보다 먼저)
 *   3. 대소문자 무시, 단어 경계(boundary) 기반 매칭
 *   4. 한국어 키워드도 포함 (한글 뉴스 대응)
 */

// 카테고리별 우선순위 (앞에 올수록 먼저 매칭)
const KEYWORD_GROUPS = {
  // 우선 매칭: 다중 단어 (먼저 잡아야 단일 단어로 분해 안 됨)
  compound: [
    "AI boom", "AI rally", "AI bubble", "AI winter",
    "short squeeze", "rate cut", "rate hike",
    "supply chain", "chip shortage", "chip war",
    "earnings beat", "earnings miss", "guidance cut", "guidance raise",
    "buy rating", "sell rating", "price target",
    "market cap", "all-time high", "52-week high", "52-week low",
    "중앙은행", "금리 인하", "금리 인상", "반도체 공급", "경기 침체",
  ],
  // 카탈리스트
  catalyst: [
    "crash", "rally", "surge", "plunge", "soar", "slump", "tumble",
    "boom", "crisis", "panic", "breakout", "breakdown",
    "upgrade", "downgrade", "buyback", "dividend", "split", "spinoff",
    "IPO", "SPAC", "merger", "acquisition", "M&A", "bankruptcy",
    "layoff", "hiring", "expansion", "closure",
    "halt", "dump", "milestone", "breakthrough", "record",
    "급등", "급락", "상한가", "하한가", "합병", "인수", "부도",
  ],
  // 실적 관련
  earnings: [
    "earnings", "revenue", "EPS", "beat", "miss", "guidance",
    "outlook", "forecast", "Q1", "Q2", "Q3", "Q4", "FY",
    "실적", "매출", "영업이익", "가이던스",
  ],
  // 거시/정책
  macro: [
    "Fed", "FOMC", "rate", "inflation", "CPI", "PPI", "PCE",
    "recession", "stagflation", "GDP", "unemployment", "jobs",
    "tariff", "sanction", "trade war", "geopolitical",
    "Powell", "BOJ", "ECB", "PBOC", "BOK",
    "연준", "금리", "인플레이션", "경기 침체", "관세",
  ],
  // 기술/섹터
  tech: [
    "AI", "semiconductor", "chip", "GPU", "CPU", "HBM", "DRAM", "NAND",
    "foundry", "fab", "cloud", "quantum", "EV", "battery", "lidar",
    "autonomous", "robotics", "biotech", "fintech",
    "반도체", "파운드리", "배터리", "자율주행",
  ],
  // 규제/법
  regulatory: [
    "FDA", "SEC", "FTC", "DOJ", "EU", "antitrust", "regulation",
    "investigation", "lawsuit", "settlement", "fine",
    "공정위", "금감원", "소송", "조사",
  ],
} as const;

/** 모든 키워드를 우선순위 순으로 정렬한 리스트 */
const ORDERED_KEYWORDS: string[] = [
  ...KEYWORD_GROUPS.compound,
  ...KEYWORD_GROUPS.catalyst,
  ...KEYWORD_GROUPS.earnings,
  ...KEYWORD_GROUPS.macro,
  ...KEYWORD_GROUPS.tech,
  ...KEYWORD_GROUPS.regulatory,
];

/** 이미 포함된 키워드와 중복되는 단일어 제거 */
function filterRedundant(found: string[]): string[] {
  const result: string[] = [];
  for (const kw of found) {
    // 다른 키워드의 부분 문자열이면 제외
    //   e.g. "AI boom"이 있으면 "AI"는 빼기
    const isSubstr = found.some(
      (other) =>
        other !== kw &&
        other.toLowerCase().includes(kw.toLowerCase()) &&
        other.length > kw.length
    );
    if (!isSubstr) result.push(kw);
  }
  return result;
}

/**
 * 제목과 요약에서 최대 N개의 키워드 추출
 */
export function extractKeywords(
  title: string,
  summary?: string | null,
  limit: number = 3
): string[] {
  const text = `${title} ${summary ?? ""}`;
  const lower = text.toLowerCase();
  const found: string[] = [];

  for (const kw of ORDERED_KEYWORDS) {
    const kwLower = kw.toLowerCase();
    // 한글 포함이면 단어 경계 사용 안 함 (정규식 단어 경계는 ASCII만)
    const hasKorean = /[\uAC00-\uD7AF]/.test(kw);
    if (hasKorean) {
      if (lower.includes(kwLower)) {
        if (!found.includes(kw)) found.push(kw);
      }
    } else {
      // 영문: 단어 경계 매칭 (다른 단어의 부분이 아닌 경우만)
      const escaped = kwLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(^|[^a-zA-Z])${escaped}([^a-zA-Z]|$)`, "i");
      if (pattern.test(text)) {
        if (!found.includes(kw)) found.push(kw);
      }
    }
    // limit보다 많이 찾아두고 redundant 필터 후 잘라냄
    if (found.length >= limit * 2) break;
  }

  const filtered = filterRedundant(found);
  return filtered.slice(0, limit);
}

/**
 * 서버 사이드에서 DB 저장용 키워드 추출
 * (최대 5개까지 저장 → UI에서 3개만 표시)
 */
export function extractKeywordsForStorage(
  title: string,
  summary?: string | null
): string[] {
  return extractKeywords(title, summary, 5);
}
