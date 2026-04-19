// =================================================================
// AI Hedge Fund - 멀티 에이전트 트레이딩 시스템
// =================================================================
// 참조: virattt/ai-hedge-fund (55,000+ stars)
// 각 레전드 투자자의 투자 철학을 코드화
// 18명의 에이전트(12 legendary + 6 specialist)가 동일한 종목 분석 후
// Portfolio Manager가 최종 판단
// =================================================================

import { rsi, macd, sma, bollingerBands } from "./analysis";

export type Vote = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

export interface AgentOpinion {
  agent: string;           // 에이전트 이름
  agentKr: string;         // 한글 이름
  category: "legendary" | "specialist";
  vote: Vote;
  score: number;           // -100 ~ +100
  confidence: number;      // 0 ~ 100
  reasoning: string;       // 판단 근거
  icon: string;            // 이모지/기호
}

export interface FundamentalsData {
  peRatio?: number;        // 주가수익비율
  pbRatio?: number;        // 주가순자산비율
  dividendYield?: number;  // 배당수익률
  revenueGrowth?: number;  // 매출성장률
  profitMargin?: number;   // 순이익률
  debtToEquity?: number;   // 부채비율
  roe?: number;            // 자기자본이익률
}

export interface MacroContext {
  oilPrice?: number;            // WTI ($)
  yield10Y?: number;            // 10Y 국채금리 (%)
  vix?: number;                 // 변동성 지수
  dxy?: number;                 // 달러 인덱스
  ndxChangePct?: number;        // 나스닥100 일간 변동 (%)
  soxxChangePct?: number;       // SOXX 일간 변동 (%)
}

export interface AgentContext {
  symbol: string;
  prices: number[];
  highs: number[];
  lows: number[];
  currentPrice: number;
  beta: number;
  sentiment: number;
  volume?: number;
  marketCap?: number;
  segment?: string;
  fundamentals?: FundamentalsData;
  macro?: MacroContext;         // ★ 신규: 매크로 환경
}

// ─────────────────────────────────────────────────────────────────
// 공통 지표 헬퍼
// ─────────────────────────────────────────────────────────────────
function priceChange(prices: number[], days: number): number {
  if (prices.length <= days) return 0;
  const past = prices[prices.length - 1 - days];
  const current = prices[prices.length - 1];
  if (past <= 0) return 0;
  return ((current - past) / past) * 100;
}

function volatility(prices: number[], period = 20): number {
  if (prices.length < period + 1) return 0;
  const returns: number[] = [];
  for (let i = prices.length - period; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance * 252) * 100;
}

function scoreToVote(score: number): Vote {
  if (score >= 40) return "STRONG_BUY";
  if (score >= 15) return "BUY";
  if (score >= -15) return "HOLD";
  if (score >= -40) return "SELL";
  return "STRONG_SELL";
}

// =================================================================
// LEGENDARY INVESTOR AGENTS (12명)
// =================================================================

// ─────────────────────────────────────────────────────────────────
// 1. Warren Buffett - 오마하의 현인
//    "Wonderful company at a fair price"
//    해자(moat), 내재가치, 장기 보유
// ─────────────────────────────────────────────────────────────────
function warrenBuffettAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  // 1. 시가총액 - 우량 대형주 선호
  if (ctx.marketCap && ctx.marketCap > 200) {
    score += 15;
    reasons.push("대형 우량주 (해자 존재)");
  }

  // 2. 변동성 낮을수록 좋음 (예측 가능성)
  const vol = volatility(ctx.prices, 20);
  if (vol > 0 && vol < 25) {
    score += 15;
    reasons.push(`낮은 변동성 (${vol.toFixed(0)}%)`);
  } else if (vol > 50) {
    score -= 15;
    reasons.push("과도한 변동성 (리스크)");
  }

  // 3. 장기 추세 - 1년 수익률
  const yearReturn = priceChange(ctx.prices, 252);
  if (yearReturn > 0 && yearReturn < 30) {
    score += 20;
    reasons.push(`합리적 장기 수익 (+${yearReturn.toFixed(0)}%)`);
  } else if (yearReturn > 50) {
    score -= 10;
    reasons.push("과열 가능성 (버블 경계)");
  }

  // 4. P/E - 밸류에이션
  if (ctx.fundamentals?.peRatio) {
    if (ctx.fundamentals.peRatio < 20) {
      score += 15;
      reasons.push(`매력적 P/E (${ctx.fundamentals.peRatio}x)`);
    } else if (ctx.fundamentals.peRatio > 40) {
      score -= 20;
      reasons.push("P/E 과도하게 높음");
    }
  }

  // 5. 세그먼트 - 메모리/파운드리 등 실물 비즈니스 선호
  if (ctx.segment === "foundry" || ctx.segment === "memory") {
    score += 10;
    reasons.push("실물 기반 비즈니스");
  }

  return {
    agent: "Warren Buffett",
    agentKr: "워런 버핏",
    category: "legendary",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 85,
    reasoning: reasons.join(" · "),
    icon: "🏛️",
  };
}

// ─────────────────────────────────────────────────────────────────
// 2. Charlie Munger - 버핏의 파트너
//    "Wonderful business at a reasonable price"
//    경영진 품질, 예측 가능성
// ─────────────────────────────────────────────────────────────────
function charlieMungerAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  // 버핏과 비슷하나 더 품질 중심
  const yearReturn = priceChange(ctx.prices, 252);
  const threeYearReturn = priceChange(ctx.prices, 756);

  if (yearReturn > 15 && threeYearReturn > 50) {
    score += 25;
    reasons.push("지속적 복리 성장");
  }

  if (ctx.marketCap && ctx.marketCap > 500) {
    score += 20;
    reasons.push("업계 지배적 위치");
  }

  // 변동성 회피
  const vol = volatility(ctx.prices, 60);
  if (vol > 0 && vol < 30) {
    score += 15;
    reasons.push("예측 가능한 변동성");
  } else if (vol > 45) {
    score -= 20;
    reasons.push("투기적 변동성");
  }

  if (ctx.fundamentals?.roe && ctx.fundamentals.roe > 15) {
    score += 20;
    reasons.push(`높은 ROE (${ctx.fundamentals.roe}%)`);
  }

  return {
    agent: "Charlie Munger",
    agentKr: "찰리 멍거",
    category: "legendary",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 80,
    reasoning: reasons.join(" · ") || "품질 평가 중",
    icon: "🎩",
  };
}

// ─────────────────────────────────────────────────────────────────
// 3. Benjamin Graham - 가치투자의 아버지
//    "Margin of safety"
//    P/E, P/B 저평가 주식
// ─────────────────────────────────────────────────────────────────
function benjaminGrahamAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  if (ctx.fundamentals?.peRatio) {
    if (ctx.fundamentals.peRatio < 15) {
      score += 30;
      reasons.push(`Graham 기준 저P/E (${ctx.fundamentals.peRatio}x)`);
    } else if (ctx.fundamentals.peRatio > 25) {
      score -= 25;
      reasons.push("안전마진 없음 (P/E 과다)");
    }
  }

  if (ctx.fundamentals?.pbRatio) {
    if (ctx.fundamentals.pbRatio < 1.5) {
      score += 25;
      reasons.push(`매력적 P/B (${ctx.fundamentals.pbRatio}x)`);
    } else if (ctx.fundamentals.pbRatio > 5) {
      score -= 20;
      reasons.push("자산 대비 과대평가");
    }
  }

  // 최근 하락한 주식 (역발상)
  const monthReturn = priceChange(ctx.prices, 20);
  if (monthReturn < -10) {
    score += 15;
    reasons.push("최근 하락으로 안전마진 확대");
  }

  if (ctx.fundamentals?.dividendYield && ctx.fundamentals.dividendYield > 2) {
    score += 15;
    reasons.push(`배당 제공 (${ctx.fundamentals.dividendYield}%)`);
  }

  return {
    agent: "Benjamin Graham",
    agentKr: "벤저민 그레이엄",
    category: "legendary",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 75,
    reasoning: reasons.join(" · ") || "안전마진 검토",
    icon: "📚",
  };
}

// ─────────────────────────────────────────────────────────────────
// 4. Cathie Wood - 성장투자의 여왕
//    "Disruptive innovation"
//    고성장 + 기술 혁신
// ─────────────────────────────────────────────────────────────────
function cathieWoodAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  // 고성장 선호
  const yearReturn = priceChange(ctx.prices, 252);
  if (yearReturn > 50) {
    score += 30;
    reasons.push(`폭발적 성장세 (+${yearReturn.toFixed(0)}%)`);
  } else if (yearReturn > 20) {
    score += 15;
    reasons.push("양호한 성장");
  } else if (yearReturn < 0) {
    score -= 15;
    reasons.push("성장 모멘텀 부재");
  }

  // AI/GPU/혁신 세그먼트 선호
  if (ctx.segment === "fabless" || ctx.segment === "equipment") {
    score += 20;
    reasons.push("혁신 선도 세그먼트");
  }

  // 높은 변동성 허용 (성장주 특성)
  const vol = volatility(ctx.prices, 20);
  if (vol > 35 && vol < 80) {
    score += 10;
    reasons.push("건강한 성장주 변동성");
  }

  // 최근 모멘텀
  const monthReturn = priceChange(ctx.prices, 20);
  if (monthReturn > 10) {
    score += 15;
    reasons.push("단기 모멘텀 강세");
  }

  return {
    agent: "Cathie Wood",
    agentKr: "캐시 우드",
    category: "legendary",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 70,
    reasoning: reasons.join(" · ") || "혁신 잠재력 평가",
    icon: "🚀",
  };
}

// ─────────────────────────────────────────────────────────────────
// 5. Michael Burry - 빅쇼트 주인공
//    Contrarian, 과대평가 시장 숏
// ─────────────────────────────────────────────────────────────────
function michaelBurryAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  // 과열 시장 경계
  const yearReturn = priceChange(ctx.prices, 252);
  if (yearReturn > 100) {
    score -= 40;
    reasons.push(`비정상적 급등 (+${yearReturn.toFixed(0)}%) 거품 경계`);
  } else if (yearReturn > 50) {
    score -= 20;
    reasons.push("과열 신호");
  } else if (yearReturn < -20) {
    score += 30;
    reasons.push("시장 외면받는 저점 기회");
  }

  // RSI 과매수
  const rsiVal = rsi(ctx.prices, 14);
  if (rsiVal && rsiVal > 75) {
    score -= 25;
    reasons.push(`과매수 상태 (RSI ${rsiVal.toFixed(0)})`);
  } else if (rsiVal && rsiVal < 30) {
    score += 25;
    reasons.push("극도의 과매도 기회");
  }

  // P/E 고평가 숏
  if (ctx.fundamentals?.peRatio && ctx.fundamentals.peRatio > 40) {
    score -= 30;
    reasons.push("밸류에이션 버블");
  }

  return {
    agent: "Michael Burry",
    agentKr: "마이클 버리",
    category: "legendary",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 65,
    reasoning: reasons.join(" · ") || "거품 위험 평가",
    icon: "🐻",
  };
}

// ─────────────────────────────────────────────────────────────────
// 6. Peter Lynch - 10배주 사냥꾼
//    "Ten-baggers in everyday businesses"
//    PEG ratio, 이해 가능한 비즈니스
// ─────────────────────────────────────────────────────────────────
function peterLynchAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  const yearReturn = priceChange(ctx.prices, 252);

  // PEG 계산 (P/E를 성장률로 나눔) - 1 미만이 매력적
  if (ctx.fundamentals?.peRatio && ctx.fundamentals.revenueGrowth) {
    const peg = ctx.fundamentals.peRatio / ctx.fundamentals.revenueGrowth;
    if (peg < 1) {
      score += 35;
      reasons.push(`우수한 PEG (${peg.toFixed(2)})`);
    } else if (peg > 2) {
      score -= 15;
      reasons.push("PEG 비싸짐");
    }
  }

  // 연 15~40% 성장 선호
  if (yearReturn >= 15 && yearReturn <= 40) {
    score += 25;
    reasons.push("Lynch 스위트스팟 성장률");
  }

  // 중형주 선호
  if (ctx.marketCap && ctx.marketCap > 50 && ctx.marketCap < 300) {
    score += 15;
    reasons.push("적정 규모 (성장 여력)");
  }

  return {
    agent: "Peter Lynch",
    agentKr: "피터 린치",
    category: "legendary",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 75,
    reasoning: reasons.join(" · ") || "10배주 후보 탐색",
    icon: "🔍",
  };
}

// ─────────────────────────────────────────────────────────────────
// 7. Bill Ackman - 액티비스트 투자자
//    집중 투자, 소수 종목 대규모 포지션
// ─────────────────────────────────────────────────────────────────
function billAckmanAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  // 저평가 대형주 선호
  if (ctx.marketCap && ctx.marketCap > 100) {
    if (ctx.fundamentals?.peRatio && ctx.fundamentals.peRatio < 20) {
      score += 30;
      reasons.push("대형 저평가 타겟");
    } else if (!ctx.fundamentals?.peRatio) {
      score += 10;
    }
  }

  // 최근 하락했지만 펀더멘털 강한 종목
  const yearReturn = priceChange(ctx.prices, 252);
  if (yearReturn < 0 && ctx.marketCap && ctx.marketCap > 200) {
    score += 25;
    reasons.push("일시적 하락, 턴어라운드 기회");
  }

  if (yearReturn > 30) {
    score -= 10;
    reasons.push("이미 많이 오른 상태");
  }

  return {
    agent: "Bill Ackman",
    agentKr: "빌 애크먼",
    category: "legendary",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 70,
    reasoning: reasons.join(" · ") || "집중 투자 대상 선별",
    icon: "🎯",
  };
}

// ─────────────────────────────────────────────────────────────────
// 8. Phil Fisher - 성장주의 아버지
//    Scuttlebutt, 장기 보유, 뛰어난 경영진
// ─────────────────────────────────────────────────────────────────
function philFisherAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  // 장기 성장 추세
  const threeYearReturn = priceChange(ctx.prices, 756);
  if (threeYearReturn > 100) {
    score += 30;
    reasons.push("장기 복리 성장 (3년+)");
  } else if (threeYearReturn > 50) {
    score += 20;
    reasons.push("견조한 장기 성장");
  }

  // 매출성장 + 이익률
  if (ctx.fundamentals?.revenueGrowth && ctx.fundamentals.revenueGrowth > 15) {
    score += 20;
    reasons.push(`매출 성장 (+${ctx.fundamentals.revenueGrowth}%)`);
  }
  if (ctx.fundamentals?.profitMargin && ctx.fundamentals.profitMargin > 20) {
    score += 15;
    reasons.push("높은 순이익률");
  }

  // 혁신 세그먼트
  if (ctx.segment === "fabless" || ctx.segment === "equipment") {
    score += 15;
    reasons.push("기술 우위 세그먼트");
  }

  return {
    agent: "Phil Fisher",
    agentKr: "필립 피셔",
    category: "legendary",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 78,
    reasoning: reasons.join(" · ") || "성장 품질 검증",
    icon: "🌱",
  };
}

// ─────────────────────────────────────────────────────────────────
// 9. Stanley Druckenmiller - 매크로 투자의 전설
//    거시경제 + 집중 베팅
// ─────────────────────────────────────────────────────────────────
function druckenmillerAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  // 강한 추세 포착
  const yearReturn = priceChange(ctx.prices, 252);
  const monthReturn = priceChange(ctx.prices, 20);

  if (yearReturn > 30 && monthReturn > 5) {
    score += 35;
    reasons.push("거시적 상승 트렌드 확인");
  } else if (yearReturn < -20 && monthReturn < -5) {
    score -= 25;
    reasons.push("하락 추세 지속");
  }

  // MACD 트렌드
  const macdRes = macd(ctx.prices);
  if (macdRes && macdRes.macd > macdRes.signal && macdRes.macd > 0) {
    score += 20;
    reasons.push("MACD 강세 신호");
  }

  // 뉴스 감성 (매크로 심리)
  if (ctx.sentiment > 0.2) {
    score += 15;
    reasons.push("시장 심리 긍정적");
  } else if (ctx.sentiment < -0.2) {
    score -= 15;
    reasons.push("시장 심리 악화");
  }

  return {
    agent: "Stanley Druckenmiller",
    agentKr: "스탠리 드러켄밀러",
    category: "legendary",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 72,
    reasoning: reasons.join(" · ") || "매크로 트렌드 분석",
    icon: "🌊",
  };
}

// ─────────────────────────────────────────────────────────────────
// 10. Nassim Taleb - 블랙스완 이론가
//     Antifragility, 꼬리 리스크
// ─────────────────────────────────────────────────────────────────
function nassimTalebAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  // 변동성 극단 → 비대칭 수익 기회
  const vol = volatility(ctx.prices, 20);
  const yearReturn = priceChange(ctx.prices, 252);

  if (vol > 50 && yearReturn < 0) {
    score += 20;
    reasons.push("비대칭 반등 가능성");
  }

  // 과도한 낙관/비관 반대 포지션
  if (ctx.sentiment > 0.4) {
    score -= 20;
    reasons.push("시장 과낙관 - 꼬리 리스크");
  } else if (ctx.sentiment < -0.4) {
    score += 15;
    reasons.push("시장 과비관 - 역발상 기회");
  }

  // 변동성 저점 경계 (저변동성은 큰 움직임의 전조)
  if (vol > 0 && vol < 15) {
    score -= 10;
    reasons.push("저변동성 위험 (폭발 대기)");
  }

  return {
    agent: "Nassim Taleb",
    agentKr: "나심 탈레브",
    category: "legendary",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 60,
    reasoning: reasons.join(" · ") || "꼬리 리스크 평가",
    icon: "🦢",
  };
}

// ─────────────────────────────────────────────────────────────────
// 11. Jim Simons - 르네상스 테크놀로지 창립자
//     통계적 아비트라지, 패턴 인식
// ─────────────────────────────────────────────────────────────────
function jimSimonsAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  // 평균회귀 신호 (볼린저밴드)
  const bb = bollingerBands(ctx.prices, 20, 2);
  if (bb) {
    const position = (ctx.currentPrice - bb.lower) / (bb.upper - bb.lower);
    if (position < 0.15) {
      score += 30;
      reasons.push("BB 하단 접근 (평균회귀)");
    } else if (position > 0.85) {
      score -= 30;
      reasons.push("BB 상단 접근 (과열)");
    }
  }

  // 단기 통계적 신호
  const d5 = priceChange(ctx.prices, 5);
  const d20 = priceChange(ctx.prices, 20);
  
  // 단기 과매도 + 중기 안정 = 매수
  if (d5 < -5 && d20 > 0) {
    score += 25;
    reasons.push("단기 과매도 후 반등 신호");
  }
  if (d5 > 10 && d20 > 20) {
    score -= 20;
    reasons.push("단기 급등 후 조정 가능");
  }

  return {
    agent: "Jim Simons",
    agentKr: "짐 사이먼스",
    category: "legendary",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 80,
    reasoning: reasons.join(" · ") || "통계적 패턴 감지",
    icon: "📊",
  };
}

// ─────────────────────────────────────────────────────────────────
// 12. Mohnish Pabrai - Dhandho 투자자
//     저위험 고수익 더블 기회
// ─────────────────────────────────────────────────────────────────
function mohnishPabraiAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  // 하락 후 재평가 기회
  const yearReturn = priceChange(ctx.prices, 252);
  if (yearReturn < -15 && ctx.marketCap && ctx.marketCap > 50) {
    score += 30;
    reasons.push("저평가 우량주 (Dhandho)");
  }

  // 낮은 P/E + 배당
  if (ctx.fundamentals?.peRatio && ctx.fundamentals.peRatio < 15) {
    score += 20;
    reasons.push("저평가 P/E");
  }
  if (ctx.fundamentals?.dividendYield && ctx.fundamentals.dividendYield > 2) {
    score += 15;
    reasons.push("안정 배당 제공");
  }

  // 극도 고평가 회피
  if (ctx.fundamentals?.peRatio && ctx.fundamentals.peRatio > 35) {
    score -= 25;
    reasons.push("Dhandho 원칙 위반 (고평가)");
  }

  return {
    agent: "Mohnish Pabrai",
    agentKr: "모니시 파브라이",
    category: "legendary",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 70,
    reasoning: reasons.join(" · ") || "Dhandho 스크리닝",
    icon: "💎",
  };
}

// ─────────────────────────────────────────────────────────────────
// 13. Daniel Yoo - 거시경제 + 한국 반도체 전문가
//     AI 슈퍼사이클 프레임워크
//     핵심 관점:
//      · 현재 AI 슈퍼사이클 = 1994~2000 인터넷 사이클과 유사하나 더 강하고 빠름
//      · 6개월 내 전고점 탈환 → 향후 12개월 나스닥 +30% 이상
//      · 반도체 이익증가율 +125% 컨센서스
//      · 나스닥100 최선호 (PEG 0.63, 12개월 +40% 여지)
//      · 10Y 국채 4.25% → 3.5% 하락 가능성
//      · SK하이닉스 글로벌 저평가 1위 · 삼성전자 3위
//      · 반도체 업종 ETF (SOXX/SMH) 비중 확대 추천
//      · 자산배분: 주식 80% / 채권 20%
// ─────────────────────────────────────────────────────────────────
function danielYooAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  // 1. AI 슈퍼사이클 섹터 선호 (반도체 전반)
  if (
    ctx.segment === "fabless" ||
    ctx.segment === "memory" ||
    ctx.segment === "foundry" ||
    ctx.segment === "equipment"
  ) {
    score += 25;
    reasons.push("AI 슈퍼사이클 핵심 섹터");
  }

  // 2. 메모리 특별 선호 (HBM/Memflation)
  if (ctx.segment === "memory") {
    score += 15;
    reasons.push("메모리 3강 - HBM 2028년까지 CAGR 40%");
  }

  // 3. 최근 6개월 내 조정 후 회복 패턴 (Daniel Yoo 핵심 프레임)
  const halfYearReturn = priceChange(ctx.prices, 120);
  const monthReturn = priceChange(ctx.prices, 20);
  const d5 = priceChange(ctx.prices, 5);
  
  // 6개월 내 -10~-20% 조정 후 반등 중 = 최고 매수 시그널
  if (halfYearReturn > -25 && halfYearReturn < 0 && monthReturn > 0 && d5 > 0) {
    score += 30;
    reasons.push("조정 후 전고점 탈환 구간 (1994~2000 패턴)");
  }
  
  // 단기 급락 후 반등 시작
  if (monthReturn < -10 && d5 > 2) {
    score += 20;
    reasons.push("급락 후 바닥 확인 매수 전환");
  }

  // 4. 매크로 환경 (새로 추가된 macro context 활용)
  if (ctx.macro) {
    // 국채 금리 - 4.25%에서 하락 시 성장주 수혜
    if (ctx.macro.yield10Y !== undefined) {
      if (ctx.macro.yield10Y < 4.0) {
        score += 15;
        reasons.push(`금리 ${ctx.macro.yield10Y.toFixed(2)}% 하락 추세`);
      } else if (ctx.macro.yield10Y > 4.8) {
        score -= 10;
        reasons.push("금리 고점 - PER 압박");
      }
    }
    
    // VIX - 변동성 과열/안정
    if (ctx.macro.vix !== undefined) {
      if (ctx.macro.vix > 25) {
        score += 15;
        reasons.push("VIX 급등 - 공포 속 기회");
      } else if (ctx.macro.vix < 15) {
        score -= 5;
        reasons.push("VIX 극저 - 낙관 과열");
      }
    }
    
    // 유가 안정 ($70~90 적정)
    if (ctx.macro.oilPrice !== undefined) {
      if (ctx.macro.oilPrice > 95) {
        score -= 10;
        reasons.push(`WTI $${ctx.macro.oilPrice.toFixed(0)} - 공정비 부담`);
      } else if (ctx.macro.oilPrice < 80) {
        score += 5;
        reasons.push(`유가 안정 - 생산비 우호`);
      }
    }
    
    // 달러 약세 = 신흥국/수출기업 수혜
    if (ctx.macro.dxy !== undefined && ctx.macro.dxy < 102) {
      score += 8;
      reasons.push("달러 약세 - 수출 유리");
    }
    
    // SOXX 랠리 중이면 추가 상승
    if (ctx.macro.soxxChangePct !== undefined && ctx.macro.soxxChangePct > 1.5) {
      score += 10;
      reasons.push("반도체 섹터 랠리");
    }
  }

  // 5. 버블 경계 - 과열 시 경계 (1999~2000 패턴 예방)
  const yearReturn = priceChange(ctx.prices, 252);
  if (yearReturn > 150) {
    score -= 20;
    reasons.push("1999년형 과열 - 신중 필요");
  }

  // 6. PEG 기반 밸류에이션 (Daniel Yoo: 나스닥100 PEG 0.63)
  if (ctx.fundamentals?.peRatio && ctx.fundamentals.revenueGrowth) {
    const peg = ctx.fundamentals.peRatio / ctx.fundamentals.revenueGrowth;
    if (peg < 1) {
      score += 15;
      reasons.push(`PEG ${peg.toFixed(2)} (저평가)`);
    } else if (peg > 2.5) {
      score -= 15;
      reasons.push(`PEG ${peg.toFixed(2)} (과열)`);
    }
  }

  // 7. 장기 실적 추세 (이익 증가율 핵심)
  if (ctx.fundamentals?.revenueGrowth && ctx.fundamentals.revenueGrowth > 30) {
    score += 15;
    reasons.push("이익 증가율 슈퍼사이클 수혜");
  }

  return {
    agent: "Daniel Yoo",
    agentKr: "대니얼 유",
    category: "legendary",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 82,
    reasoning: reasons.join(" · ") || "AI 슈퍼사이클 프레임 분석 중",
    icon: "🇰🇷",
  };
}

// =================================================================
// SPECIALIST AGENTS (6명) - 기술/재무/위험 분석
// =================================================================

// ─────────────────────────────────────────────────────────────────
// 13. Technical Analysis Agent
// ─────────────────────────────────────────────────────────────────
function technicalAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  const rsiVal = rsi(ctx.prices, 14);
  if (rsiVal) {
    if (rsiVal < 30) { score += 25; reasons.push(`RSI ${rsiVal.toFixed(0)} 과매도`); }
    else if (rsiVal > 70) { score -= 25; reasons.push(`RSI ${rsiVal.toFixed(0)} 과매수`); }
  }

  const macdRes = macd(ctx.prices);
  if (macdRes) {
    if (macdRes.macd > macdRes.signal && macdRes.macd > 0) {
      score += 20; reasons.push("MACD 골든크로스");
    } else if (macdRes.macd < macdRes.signal && macdRes.macd < 0) {
      score -= 20; reasons.push("MACD 데드크로스");
    }
  }

  const sma20 = sma(ctx.prices, 20);
  const sma50 = sma(ctx.prices, 50);
  if (sma20 && sma50) {
    if (ctx.currentPrice > sma20 && sma20 > sma50) {
      score += 15; reasons.push("정배열 (이평선 상승)");
    } else if (ctx.currentPrice < sma20 && sma20 < sma50) {
      score -= 15; reasons.push("역배열 (이평선 하락)");
    }
  }

  return {
    agent: "Technical Agent",
    agentKr: "기술적 분석가",
    category: "specialist",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 78,
    reasoning: reasons.join(" · ") || "차트 패턴 분석",
    icon: "📈",
  };
}

// ─────────────────────────────────────────────────────────────────
// 14. Valuation Agent - DCF 기반 내재가치
// ─────────────────────────────────────────────────────────────────
function valuationAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  if (ctx.fundamentals?.peRatio) {
    if (ctx.fundamentals.peRatio < 15) { score += 25; reasons.push("저평가 P/E"); }
    else if (ctx.fundamentals.peRatio > 30) { score -= 20; reasons.push("고평가 P/E"); }
  }

  if (ctx.fundamentals?.pbRatio) {
    if (ctx.fundamentals.pbRatio < 2) { score += 15; reasons.push("자산가치 대비 저렴"); }
    else if (ctx.fundamentals.pbRatio > 6) { score -= 15; reasons.push("자산 대비 비쌈"); }
  }

  // DCF 간이 - 수익률 vs Required Rate (반도체 12%)
  const yearReturn = priceChange(ctx.prices, 252);
  if (yearReturn > 12) { score += 10; reasons.push("요구수익률 초과 달성"); }

  return {
    agent: "Valuation Agent",
    agentKr: "밸류에이션 전문가",
    category: "specialist",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 75,
    reasoning: reasons.join(" · ") || "내재가치 산출",
    icon: "💰",
  };
}

// ─────────────────────────────────────────────────────────────────
// 15. Sentiment Agent
// ─────────────────────────────────────────────────────────────────
function sentimentAgent(ctx: AgentContext): AgentOpinion {
  let score = Math.round(ctx.sentiment * 60); // -60 ~ +60
  const reasons: string[] = [];
  
  if (ctx.sentiment > 0.3) reasons.push("뉴스 매우 긍정적");
  else if (ctx.sentiment > 0.1) reasons.push("뉴스 긍정 우세");
  else if (ctx.sentiment < -0.3) reasons.push("뉴스 매우 부정적");
  else if (ctx.sentiment < -0.1) reasons.push("뉴스 부정 우세");
  else reasons.push("뉴스 중립");

  return {
    agent: "Sentiment Agent",
    agentKr: "감성 분석가",
    category: "specialist",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 65,
    reasoning: reasons.join(" · "),
    icon: "💬",
  };
}

// ─────────────────────────────────────────────────────────────────
// 16. Risk Management Agent
// ─────────────────────────────────────────────────────────────────
function riskAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  const vol = volatility(ctx.prices, 20);
  if (vol > 60) { score -= 30; reasons.push(`극도의 변동성 (${vol.toFixed(0)}%)`); }
  else if (vol > 40) { score -= 15; reasons.push("높은 변동성"); }
  else if (vol > 0 && vol < 25) { score += 15; reasons.push("안정적 변동성"); }

  // 베타 - 시장 리스크
  if (ctx.beta > 1.5) { score -= 15; reasons.push(`고베타 (${ctx.beta.toFixed(2)})`); }
  else if (ctx.beta < 0.8) { score += 10; reasons.push("저베타 안정주"); }

  // 최근 드로다운
  const peak = Math.max(...ctx.prices.slice(-60));
  const drawdown = ((peak - ctx.currentPrice) / peak) * 100;
  if (drawdown > 20) { score -= 20; reasons.push(`60일 -${drawdown.toFixed(0)}% 드로다운`); }

  return {
    agent: "Risk Manager",
    agentKr: "리스크 관리자",
    category: "specialist",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 85,
    reasoning: reasons.join(" · ") || "위험 수준 정상",
    icon: "⚠️",
  };
}

// ─────────────────────────────────────────────────────────────────
// 17. Fundamentals Agent
// ─────────────────────────────────────────────────────────────────
function fundamentalsAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];
  const f = ctx.fundamentals;

  if (f?.revenueGrowth && f.revenueGrowth > 20) { score += 20; reasons.push("강한 매출 성장"); }
  else if (f?.revenueGrowth && f.revenueGrowth < 0) { score -= 20; reasons.push("매출 감소"); }

  if (f?.profitMargin && f.profitMargin > 25) { score += 15; reasons.push("우수한 이익률"); }
  else if (f?.profitMargin && f.profitMargin < 5) { score -= 15; reasons.push("낮은 이익률"); }

  if (f?.debtToEquity && f.debtToEquity < 0.5) { score += 10; reasons.push("건전한 재무구조"); }
  else if (f?.debtToEquity && f.debtToEquity > 2) { score -= 20; reasons.push("과도한 부채"); }

  if (f?.roe && f.roe > 20) { score += 15; reasons.push("높은 자본수익률"); }

  return {
    agent: "Fundamentals Agent",
    agentKr: "펀더멘털 분석가",
    category: "specialist",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: f ? 80 : 40,
    reasoning: reasons.join(" · ") || "재무 데이터 부족",
    icon: "📊",
  };
}

// ─────────────────────────────────────────────────────────────────
// 18. Semiconductor Specialist - 반도체 섹터 전문가 (커스텀)
// ─────────────────────────────────────────────────────────────────
function semiconductorAgent(ctx: AgentContext): AgentOpinion {
  let score = 0;
  const reasons: string[] = [];

  // 반도체 섹터별 특성
  if (ctx.segment === "memory") {
    // 메모리 사이클 - Memflation 수혜
    score += 20;
    reasons.push("Memflation 슈퍼사이클 수혜");
  } else if (ctx.segment === "fabless") {
    score += 15;
    reasons.push("AI GPU/커스텀칩 성장");
  } else if (ctx.segment === "foundry") {
    score += 15;
    reasons.push("파운드리 독점력");
  } else if (ctx.segment === "equipment") {
    score += 10;
    reasons.push("장비주 - 캐펙스 수혜");
  }

  // 반도체 특화 - 변동성 허용
  const vol = volatility(ctx.prices, 20);
  if (vol > 30 && vol < 60) {
    score += 10;
    reasons.push("건강한 반도체 변동성");
  }

  // 모멘텀
  const monthReturn = priceChange(ctx.prices, 20);
  if (monthReturn > 5) {
    score += 15;
    reasons.push("섹터 모멘텀 강세");
  }

  return {
    agent: "Semiconductor Specialist",
    agentKr: "반도체 섹터 전문가",
    category: "specialist",
    vote: scoreToVote(score),
    score: Math.max(-100, Math.min(100, score)),
    confidence: 82,
    reasoning: reasons.join(" · ") || "섹터 위치 분석",
    icon: "💻",
  };
}

// =================================================================
// PORTFOLIO MANAGER - 최종 의사결정
// =================================================================

export interface PortfolioDecision {
  finalVote: Vote;
  finalScore: number;
  agentConsensus: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  };
  agreementLevel: number;  // 0-100: 에이전트 간 동의 정도
  bullishAgents: string[];  // 매수 의견 에이전트들
  bearishAgents: string[];  // 매도 의견 에이전트들
  keyReasoning: string;     // 핵심 판단 근거
  confidence: number;       // 종합 신뢰도
}

function portfolioManager(opinions: AgentOpinion[]): PortfolioDecision {
  // 카테고리별 가중치 (레전드 70% + 스페셜리스트 30%)
  let weightedScore = 0;
  let totalWeight = 0;

  for (const op of opinions) {
    const weight = op.category === "legendary" ? 1.0 : 1.3; // 스페셜리스트 약간 가중
    const confWeight = op.confidence / 100;
    weightedScore += op.score * weight * confWeight;
    totalWeight += weight * confWeight;
  }

  const finalScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
  const finalVote = scoreToVote(finalScore);

  // 합의 수준
  const consensus = {
    strongBuy: opinions.filter((o) => o.vote === "STRONG_BUY").length,
    buy: opinions.filter((o) => o.vote === "BUY").length,
    hold: opinions.filter((o) => o.vote === "HOLD").length,
    sell: opinions.filter((o) => o.vote === "SELL").length,
    strongSell: opinions.filter((o) => o.vote === "STRONG_SELL").length,
  };

  const majorityCount = Math.max(
    consensus.strongBuy + consensus.buy,
    consensus.hold,
    consensus.sell + consensus.strongSell
  );
  const agreementLevel = Math.round((majorityCount / opinions.length) * 100);

  const bullishAgents = opinions
    .filter((o) => o.vote === "BUY" || o.vote === "STRONG_BUY")
    .map((o) => o.agentKr);
  const bearishAgents = opinions
    .filter((o) => o.vote === "SELL" || o.vote === "STRONG_SELL")
    .map((o) => o.agentKr);

  // 핵심 근거 (가장 강한 의견 3개)
  const topOpinions = [...opinions]
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 3);
  const keyReasoning = topOpinions
    .map((o) => `${o.icon} ${o.agentKr}: ${o.reasoning.split(" · ")[0] || o.reasoning}`)
    .join(" / ");

  // 신뢰도 = 합의 수준 × 평균 신뢰도
  const avgConfidence =
    opinions.reduce((s, o) => s + o.confidence, 0) / opinions.length;
  const confidence = Math.round((agreementLevel / 100) * avgConfidence);

  return {
    finalVote,
    finalScore,
    agentConsensus: consensus,
    agreementLevel,
    bullishAgents,
    bearishAgents,
    keyReasoning,
    confidence,
  };
}

// =================================================================
// 메인 엔트리 - 모든 에이전트 실행
// =================================================================
export function runAllAgents(ctx: AgentContext): {
  opinions: AgentOpinion[];
  decision: PortfolioDecision;
} {
  const opinions: AgentOpinion[] = [
    // 13 Legendary Investors
    warrenBuffettAgent(ctx),
    charlieMungerAgent(ctx),
    benjaminGrahamAgent(ctx),
    cathieWoodAgent(ctx),
    michaelBurryAgent(ctx),
    peterLynchAgent(ctx),
    billAckmanAgent(ctx),
    philFisherAgent(ctx),
    druckenmillerAgent(ctx),
    nassimTalebAgent(ctx),
    jimSimonsAgent(ctx),
    mohnishPabraiAgent(ctx),
    danielYooAgent(ctx),          // ★ 신규: 한국 반도체 + AI 슈퍼사이클 전문가
    // 6 Specialists
    technicalAgent(ctx),
    valuationAgent(ctx),
    sentimentAgent(ctx),
    riskAgent(ctx),
    fundamentalsAgent(ctx),
    semiconductorAgent(ctx),
  ];

  const decision = portfolioManager(opinions);
  return { opinions, decision };
}

export { scoreToVote };
