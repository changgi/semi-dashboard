// ═══════════════════════════════════════════════════════════
// Semiconductor Universe (반도체 전종목 마스터)
// 
// 모든 분석/캘린더/스캐너/뉴스 등에서 공통 사용
// 한국/미국/대만/네덜란드/일본 반도체 주요 종목 망라
// ═══════════════════════════════════════════════════════════

export interface SemiSymbol {
  symbol: string;           // Yahoo Finance 심볼
  name: string;             // 한글명 우선
  englishName?: string;
  exchange: "NASDAQ" | "NYSE" | "KOSPI" | "KOSDAQ" | "TPE" | "TYO" | "AMS";
  country: "US" | "KR" | "TW" | "JP" | "NL";
  category: SemiCategory;
  marketCap?: "mega" | "large" | "mid" | "small";
  tags: string[];           // ["HBM", "foundry", "GPU", "메모리" 등]
  relatedEtfs: string[];    // 이 종목이 포함된 ETF들
}

export type SemiCategory =
  | "gpu_ai"           // GPU/AI 가속기
  | "cpu"              // CPU
  | "memory"           // 메모리 (DRAM/NAND/HBM)
  | "foundry"          // 파운드리
  | "fabless"          // 팹리스
  | "equipment"        // 장비 (전공정/후공정)
  | "materials"        // 소재
  | "design_tool"      // 설계 툴 (EDA)
  | "packaging"        // 패키징/테스트
  | "etf"              // ETF
  | "korea_small"      // 한국 중소형
  | "automotive";      // 자동차 반도체

export const SEMI_UNIVERSE: SemiSymbol[] = [
  // ═══ 🇺🇸 GPU/AI 가속기 (핵심) ═══
  { symbol: "NVDA",   name: "엔비디아",      englishName: "NVIDIA",     exchange: "NASDAQ", country: "US", category: "gpu_ai", marketCap: "mega",  tags: ["GPU", "AI", "데이터센터", "CUDA"], relatedEtfs: ["SMH", "SOXX", "QQQ", "SPY"] },
  { symbol: "AMD",    name: "AMD",           englishName: "AMD",        exchange: "NASDAQ", country: "US", category: "gpu_ai", marketCap: "large", tags: ["GPU", "CPU", "MI300X"], relatedEtfs: ["SMH", "SOXX", "QQQ"] },
  
  // ═══ 🇺🇸 CPU ═══
  { symbol: "INTC",   name: "인텔",          englishName: "Intel",      exchange: "NASDAQ", country: "US", category: "cpu",    marketCap: "large", tags: ["CPU", "파운드리", "Foundry"], relatedEtfs: ["SMH", "SOXX", "QQQ"] },
  
  // ═══ 🇺🇸 메모리 ═══
  { symbol: "MU",     name: "마이크론",      englishName: "Micron",     exchange: "NASDAQ", country: "US", category: "memory", marketCap: "large", tags: ["DRAM", "NAND", "HBM", "메모리"], relatedEtfs: ["SMH", "SOXX"] },
  
  // ═══ 🇹🇼 파운드리 ═══
  { symbol: "TSM",    name: "TSMC",          englishName: "TSMC",       exchange: "NYSE",   country: "TW", category: "foundry", marketCap: "mega", tags: ["파운드리", "3nm", "5nm", "Foundry"], relatedEtfs: ["SMH", "SOXX"] },
  
  // ═══ 🇺🇸 팹리스 (설계 전문) ═══
  { symbol: "AVGO",   name: "브로드컴",      englishName: "Broadcom",   exchange: "NASDAQ", country: "US", category: "fabless", marketCap: "mega", tags: ["AI", "네트워크", "커스텀 칩"], relatedEtfs: ["SMH", "SOXX", "QQQ"] },
  { symbol: "QCOM",   name: "퀄컴",          englishName: "Qualcomm",   exchange: "NASDAQ", country: "US", category: "fabless", marketCap: "large", tags: ["모바일", "5G", "Snapdragon"], relatedEtfs: ["SMH", "SOXX", "QQQ"] },
  { symbol: "ARM",    name: "ARM",           englishName: "ARM Holdings", exchange: "NASDAQ", country: "US", category: "fabless", marketCap: "large", tags: ["설계", "모바일"], relatedEtfs: ["SMH"] },
  { symbol: "MRVL",   name: "마벨",          englishName: "Marvell",    exchange: "NASDAQ", country: "US", category: "fabless", marketCap: "mid", tags: ["네트워크", "데이터센터"], relatedEtfs: ["SMH", "SOXX"] },
  
  // ═══ 🇺🇸 반도체 장비 ═══
  { symbol: "AMAT",   name: "AMAT",          englishName: "Applied Materials", exchange: "NASDAQ", country: "US", category: "equipment", marketCap: "large", tags: ["전공정", "증착"], relatedEtfs: ["SMH", "SOXX"] },
  { symbol: "LRCX",   name: "램 리서치",     englishName: "Lam Research", exchange: "NASDAQ", country: "US", category: "equipment", marketCap: "large", tags: ["식각", "증착"], relatedEtfs: ["SMH", "SOXX"] },
  { symbol: "KLAC",   name: "KLA",           englishName: "KLA Corp",   exchange: "NASDAQ", country: "US", category: "equipment", marketCap: "large", tags: ["검사", "측정"], relatedEtfs: ["SMH", "SOXX"] },
  
  // ═══ 🇳🇱 EUV 장비 ═══
  { symbol: "ASML",   name: "ASML",          englishName: "ASML",       exchange: "NASDAQ", country: "NL", category: "equipment", marketCap: "mega", tags: ["EUV", "노광기", "독점"], relatedEtfs: ["SMH", "SOXX"] },
  
  // ═══ 🇺🇸 EDA (설계 툴) ═══
  { symbol: "SNPS",   name: "시놉시스",      englishName: "Synopsys",   exchange: "NASDAQ", country: "US", category: "design_tool", marketCap: "large", tags: ["EDA", "설계툴"], relatedEtfs: ["SMH"] },
  { symbol: "CDNS",   name: "케이던스",      englishName: "Cadence",    exchange: "NASDAQ", country: "US", category: "design_tool", marketCap: "large", tags: ["EDA", "설계툴"], relatedEtfs: ["SMH"] },
  
  // ═══ 🇺🇸 아날로그/자동차 반도체 ═══
  { symbol: "TXN",    name: "TI",            englishName: "Texas Instruments", exchange: "NASDAQ", country: "US", category: "automotive", marketCap: "large", tags: ["아날로그", "자동차"], relatedEtfs: ["SMH", "SOXX"] },
  { symbol: "ADI",    name: "ADI",           englishName: "Analog Devices", exchange: "NASDAQ", country: "US", category: "automotive", marketCap: "large", tags: ["아날로그", "산업용"], relatedEtfs: ["SMH"] },
  { symbol: "NXPI",   name: "NXP",           englishName: "NXP Semi",   exchange: "NASDAQ", country: "US", category: "automotive", marketCap: "mid", tags: ["자동차", "IoT"], relatedEtfs: ["SMH"] },
  { symbol: "ON",     name: "온세미",        englishName: "onsemi",     exchange: "NASDAQ", country: "US", category: "automotive", marketCap: "mid", tags: ["전력반도체", "전기차"], relatedEtfs: ["SMH"] },
  
  // ═══ 🇰🇷 한국 대표 ═══
  { symbol: "005930.KS", name: "삼성전자",    englishName: "Samsung Electronics", exchange: "KOSPI", country: "KR", category: "memory", marketCap: "mega", tags: ["DRAM", "NAND", "HBM", "파운드리"], relatedEtfs: ["EWY"] },
  { symbol: "000660.KS", name: "SK하이닉스",  englishName: "SK Hynix",   exchange: "KOSPI", country: "KR", category: "memory", marketCap: "mega", tags: ["DRAM", "HBM", "메모리"], relatedEtfs: ["EWY"] },
  
  // ═══ 🇰🇷 한국 장비 ═══
  { symbol: "042700.KS", name: "한미반도체",  englishName: "Hanmi Semi", exchange: "KOSPI", country: "KR", category: "equipment", marketCap: "mid", tags: ["HBM 장비", "TC본더"], relatedEtfs: [] },
  { symbol: "240810.KS", name: "원익IPS",     englishName: "Wonik IPS",  exchange: "KOSDAQ", country: "KR", category: "equipment", marketCap: "mid", tags: ["증착", "한국장비"], relatedEtfs: [] },
  { symbol: "108320.KS", name: "실리콘웍스", englishName: "LX Semicon", exchange: "KOSDAQ", country: "KR", category: "fabless", marketCap: "mid", tags: ["팹리스", "디스플레이"], relatedEtfs: [] },
  { symbol: "403870.KS", name: "HPSP",       englishName: "HPSP",       exchange: "KOSDAQ", country: "KR", category: "equipment", marketCap: "mid", tags: ["고압수소어닐링"], relatedEtfs: [] },
  { symbol: "095340.KS", name: "ISC",        englishName: "ISC",        exchange: "KOSDAQ", country: "KR", category: "packaging", marketCap: "mid", tags: ["테스트소켓"], relatedEtfs: [] },
  
  // ═══ 🇰🇷 한국 소재 ═══
  { symbol: "036930.KS", name: "주성엔지니어링", englishName: "Jusung Engineering", exchange: "KOSDAQ", country: "KR", category: "equipment", marketCap: "small", tags: ["증착장비"], relatedEtfs: [] },
  { symbol: "131970.KS", name: "두산테스나", englishName: "Doosan Tesna", exchange: "KOSDAQ", country: "KR", category: "packaging", marketCap: "small", tags: ["테스트"], relatedEtfs: [] },
  { symbol: "095660.KS", name: "네오위즈",   englishName: "Neowiz",     exchange: "KOSDAQ", country: "KR", category: "korea_small", marketCap: "small", tags: ["게임"], relatedEtfs: [] },
  
  // ═══ 🇯🇵 일본 ═══
  { symbol: "8035.T",   name: "도쿄일렉트론", englishName: "Tokyo Electron", exchange: "TYO", country: "JP", category: "equipment", marketCap: "mega", tags: ["장비", "세정"], relatedEtfs: [] },
  
  // ═══ 📊 반도체 ETF ═══
  { symbol: "SMH",      name: "반도체 ETF",    englishName: "VanEck Semiconductor", exchange: "NASDAQ", country: "US", category: "etf", marketCap: "large", tags: ["ETF", "시가총액 가중"], relatedEtfs: [] },
  { symbol: "SOXX",     name: "반도체 ETF 2", englishName: "iShares Semiconductor", exchange: "NASDAQ", country: "US", category: "etf", marketCap: "large", tags: ["ETF", "동일가중"], relatedEtfs: [] },
  { symbol: "SOXL",     name: "반도체 3x",    englishName: "Direxion Semi Bull 3x", exchange: "NYSE", country: "US", category: "etf", marketCap: "mid", tags: ["레버리지", "3x"], relatedEtfs: [] },
  { symbol: "SOXS",     name: "반도체 인버스 3x", englishName: "Direxion Semi Bear 3x", exchange: "NYSE", country: "US", category: "etf", marketCap: "small", tags: ["인버스", "-3x"], relatedEtfs: [] },
  
  // ═══ 🇰🇷 한국 반도체 ETF ═══
  { symbol: "091160.KS", name: "KODEX 반도체", englishName: "KODEX Semiconductor", exchange: "KOSPI", country: "KR", category: "etf", marketCap: "mid", tags: ["한국 반도체 ETF"], relatedEtfs: [] },
  { symbol: "139260.KS", name: "TIGER 200IT",  englishName: "TIGER 200 IT",       exchange: "KOSPI", country: "KR", category: "etf", marketCap: "mid", tags: ["한국 IT"], relatedEtfs: [] },
];

// ───────────────────────────────────────────────────────────
// 헬퍼 함수
// ───────────────────────────────────────────────────────────

/** 모든 심볼 리스트 */
export function getAllSymbols(): string[] {
  return SEMI_UNIVERSE.map(s => s.symbol);
}

/** 카테고리별 필터 */
export function getByCategory(category: SemiCategory): SemiSymbol[] {
  return SEMI_UNIVERSE.filter(s => s.category === category);
}

/** 국가별 필터 */
export function getByCountry(country: SemiSymbol["country"]): SemiSymbol[] {
  return SEMI_UNIVERSE.filter(s => s.country === country);
}

/** 핵심 대장주만 (시가총액 mega/large) */
export function getMajorSymbols(): string[] {
  return SEMI_UNIVERSE
    .filter(s => s.marketCap === "mega" || s.marketCap === "large")
    .filter(s => s.category !== "etf")
    .map(s => s.symbol);
}

/** 모든 반도체 관련 심볼 (ETF 포함) */
export function getAllSemiSymbols(): string[] {
  return SEMI_UNIVERSE.map(s => s.symbol);
}

/** 한국 반도체만 */
export function getKoreanSemiSymbols(): string[] {
  return SEMI_UNIVERSE.filter(s => s.country === "KR" && s.category !== "etf").map(s => s.symbol);
}

/** 심볼로 메타데이터 조회 */
export function getSymbolInfo(symbol: string): SemiSymbol | undefined {
  return SEMI_UNIVERSE.find(s => s.symbol === symbol);
}

/** 태그로 검색 (예: "HBM" → HBM 관련 종목 모두) */
export function searchByTag(tag: string): SemiSymbol[] {
  const lowerTag = tag.toLowerCase();
  return SEMI_UNIVERSE.filter(s =>
    s.tags.some(t => t.toLowerCase().includes(lowerTag))
  );
}

/** 섹터 스캐너에서 쓸 확장 리스트 (24개 → 30+개) */
export function getScannerSymbols(): string[] {
  return [
    // 미국 대장주
    "NVDA", "TSM", "AVGO", "AMD", "INTC", "MU", "QCOM", "MRVL",
    // 장비
    "ASML", "AMAT", "LRCX", "KLAC",
    // 팹리스/EDA
    "ARM", "SNPS", "CDNS",
    // 자동차/아날로그
    "TXN", "ADI", "NXPI", "ON",
    // 한국
    "005930.KS", "000660.KS", "042700.KS", "240810.KS", "403870.KS",
    // ETF
    "SMH", "SOXX", "SOXL", "091160.KS", "139260.KS",
  ];
}

/** Earnings Monitor에서 쓸 확장 스케줄 (추후 더 추가) */
export const EXTENDED_EARNINGS_SCHEDULE = [
  // US Big Tech
  { symbol: "TSLA", name: "Tesla",         date: "2026-04-22", quarter: "Q1 2026", importance: 4, affectedETFs: ["QQQ"] },
  { symbol: "MSFT", name: "Microsoft",     date: "2026-04-23", quarter: "Q3 2026", importance: 5, affectedETFs: ["QQQ", "SPY"] },
  
  // 반도체 (이번 분기)
  { symbol: "INTC", name: "Intel",         date: "2026-04-24", quarter: "Q1 2026", importance: 4, affectedETFs: ["SMH", "SOXX"] },
  { symbol: "TXN",  name: "TI",            date: "2026-04-23", quarter: "Q1 2026", importance: 3, affectedETFs: ["SMH", "SOXX"] },
  { symbol: "LRCX", name: "Lam Research",  date: "2026-04-30", quarter: "Q3 2026", importance: 4, affectedETFs: ["SMH", "SOXX"] },
  { symbol: "KLAC", name: "KLA",           date: "2026-04-30", quarter: "Q3 2026", importance: 3, affectedETFs: ["SMH", "SOXX"] },
  
  { symbol: "AMD",  name: "AMD",           date: "2026-05-06", quarter: "Q1 2026", importance: 5, affectedETFs: ["SMH", "SOXX", "QQQ"] },
  { symbol: "QCOM", name: "Qualcomm",      date: "2026-05-01", quarter: "Q2 2026", importance: 4, affectedETFs: ["SMH"] },
  { symbol: "ARM",  name: "ARM Holdings",  date: "2026-05-07", quarter: "Q4 2026", importance: 4, affectedETFs: ["SMH"] },
  { symbol: "ASML", name: "ASML",          date: "2026-04-16", quarter: "Q1 2026", importance: 5, affectedETFs: ["SMH", "SOXX"] },
  { symbol: "AMAT", name: "Applied Mat",   date: "2026-05-15", quarter: "Q2 2026", importance: 4, affectedETFs: ["SMH", "SOXX"] },
  
  { symbol: "NVDA", name: "NVIDIA",        date: "2026-05-21", quarter: "Q1 2026", importance: 5, affectedETFs: ["SMH", "SOXX", "QQQ"] },
  { symbol: "AVGO", name: "Broadcom",      date: "2026-06-05", quarter: "Q2 2026", importance: 5, affectedETFs: ["SMH", "SOXX"] },
  { symbol: "MRVL", name: "Marvell",       date: "2026-06-05", quarter: "Q1 2026", importance: 3, affectedETFs: ["SMH", "SOXX"] },
  { symbol: "MU",   name: "Micron",        date: "2026-06-25", quarter: "Q3 2026", importance: 5, affectedETFs: ["SMH", "SOXX"] },
  
  // Big Tech
  { symbol: "AAPL",  name: "Apple",        date: "2026-04-30", quarter: "Q2 2026", importance: 5, affectedETFs: ["QQQ", "SPY"] },
  { symbol: "AMZN",  name: "Amazon",       date: "2026-04-30", quarter: "Q1 2026", importance: 4, affectedETFs: ["QQQ", "SPY"] },
  { symbol: "GOOGL", name: "Alphabet",     date: "2026-04-29", quarter: "Q1 2026", importance: 4, affectedETFs: ["QQQ"] },
  { symbol: "META",  name: "Meta",         date: "2026-04-29", quarter: "Q1 2026", importance: 4, affectedETFs: ["QQQ"] },
  
  // 한국 반도체
  { symbol: "005930.KS", name: "삼성전자",    date: "2026-04-30", quarter: "Q1 2026", importance: 5, affectedETFs: ["EWY", "SMH"] },
  { symbol: "000660.KS", name: "SK하이닉스",  date: "2026-04-24", quarter: "Q1 2026", importance: 5, affectedETFs: ["EWY", "SMH"] },
];
