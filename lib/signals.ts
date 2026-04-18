// ================================================
// Trading Signal Engine
// 다중 지표 기반 매수/매도/보유 시그널 + 진입/목표/손절 가격
// ================================================

import { rsi, macd, sma, bollingerBands, atr } from "./analysis";

export type Signal = "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL";

export interface TradingSignal {
  symbol: string;
  signal: Signal;
  score: number; // -100 ~ +100
  confidence: number; // 0-100
  currentPrice: number;
  // 매수 시나리오
  buyEntry: number;      // 진입가
  buyTarget1: number;    // 1차 목표가 (빠른 수익실현)
  buyTarget2: number;    // 2차 목표가 (추세 연장)
  buyStopLoss: number;   // 손절가
  buyRiskReward: number; // 위험대비수익 비율
  // 매도 시나리오 (보유 중일 때)
  sellEntry: number;
  sellTarget: number;
  sellStopLoss: number;
  // 판단 근거
  reasons: string[];
  timeframe: string; // "SHORT" | "MEDIUM" | "LONG"
  indicators: {
    rsi: number | null;
    macd: number | null;
    macdSignal: number | null;
    sma20: number | null;
    sma50: number | null;
    bbPosition: number | null; // 0=하단, 50=중간, 100=상단
    trend: "UP" | "DOWN" | "SIDEWAYS";
  };
}

/**
 * 종합 매매 시그널 생성
 * @param prices 가격 히스토리 (오래된→최신 순)
 * @param highs 고가 배열 (ATR 계산용, 없으면 prices와 동일하게)
 * @param lows 저가 배열
 * @param sentiment 뉴스 감성 (-1 ~ +1)
 * @param symbol 종목명
 */
export function generateTradingSignal(
  prices: number[],
  highs: number[],
  lows: number[],
  sentiment: number,
  symbol: string
): TradingSignal | null {
  if (prices.length < 20) return null;

  const current = prices[prices.length - 1];

  // === 기술 지표 계산 ===
  const rsiVal = rsi(prices, 14);
  const macdRes = macd(prices);
  const sma20 = sma(prices, 20);
  const sma50 = sma(prices, 50);
  const bb = bollingerBands(prices, 20, 2);
  const atrVal = atr(highs, lows, prices, 14) ?? current * 0.02;

  // === 개별 시그널 점수 (-100 ~ +100) ===
  const scores: { indicator: string; score: number; reason: string }[] = [];

  // 1. RSI (과매도=매수, 과매수=매도)
  if (rsiVal !== null) {
    if (rsiVal < 30) scores.push({ indicator: "RSI", score: 30, reason: `RSI ${rsiVal.toFixed(0)} 과매도` });
    else if (rsiVal < 40) scores.push({ indicator: "RSI", score: 15, reason: `RSI ${rsiVal.toFixed(0)} 매수 우위` });
    else if (rsiVal > 70) scores.push({ indicator: "RSI", score: -30, reason: `RSI ${rsiVal.toFixed(0)} 과매수` });
    else if (rsiVal > 60) scores.push({ indicator: "RSI", score: -15, reason: `RSI ${rsiVal.toFixed(0)} 매도 우위` });
    else scores.push({ indicator: "RSI", score: 0, reason: `RSI ${rsiVal.toFixed(0)} 중립` });
  }

  // 2. MACD (골든크로스/데드크로스)
  if (macdRes) {
    const diff = macdRes.macd - macdRes.signal;
    if (diff > 0 && macdRes.macd > 0) scores.push({ indicator: "MACD", score: 25, reason: "MACD 골든크로스 상승세" });
    else if (diff > 0) scores.push({ indicator: "MACD", score: 15, reason: "MACD 상승 전환" });
    else if (diff < 0 && macdRes.macd < 0) scores.push({ indicator: "MACD", score: -25, reason: "MACD 데드크로스 하락세" });
    else scores.push({ indicator: "MACD", score: -10, reason: "MACD 하락 전환" });
  }

  // 3. 이동평균선 (골든크로스, 현재가 vs MA)
  let trend: "UP" | "DOWN" | "SIDEWAYS" = "SIDEWAYS";
  if (sma20 && sma50) {
    if (current > sma20 && sma20 > sma50) {
      scores.push({ indicator: "MA", score: 25, reason: "정배열 (현재가>20일>50일선)" });
      trend = "UP";
    } else if (current < sma20 && sma20 < sma50) {
      scores.push({ indicator: "MA", score: -25, reason: "역배열 (현재가<20일<50일선)" });
      trend = "DOWN";
    } else if (current > sma50) {
      scores.push({ indicator: "MA", score: 10, reason: "50일선 상단" });
      trend = "SIDEWAYS";
    } else {
      scores.push({ indicator: "MA", score: -10, reason: "50일선 하단" });
      trend = "SIDEWAYS";
    }
  }

  // 4. 볼린저밴드 위치
  let bbPosition: number | null = null;
  if (bb) {
    bbPosition = ((current - bb.lower) / (bb.upper - bb.lower)) * 100;
    if (bbPosition < 10) scores.push({ indicator: "BB", score: 20, reason: "볼린저 하단 접근 (과매도)" });
    else if (bbPosition < 30) scores.push({ indicator: "BB", score: 10, reason: "볼린저 하위권" });
    else if (bbPosition > 90) scores.push({ indicator: "BB", score: -20, reason: "볼린저 상단 접근 (과매수)" });
    else if (bbPosition > 70) scores.push({ indicator: "BB", score: -10, reason: "볼린저 상위권" });
  }

  // 5. 뉴스 감성
  if (Math.abs(sentiment) > 0.1) {
    const sentScore = sentiment * 20; // -20 ~ +20
    scores.push({
      indicator: "SENT",
      score: sentScore,
      reason: `뉴스 감성 ${sentiment > 0 ? "긍정" : "부정"} (${(sentiment * 100).toFixed(0)})`,
    });
  }

  // 6. 최근 모멘텀 (5일 수익률)
  if (prices.length >= 6) {
    const mom5 = ((current - prices[prices.length - 6]) / prices[prices.length - 6]) * 100;
    if (mom5 > 5) scores.push({ indicator: "MOM", score: 10, reason: `5일 +${mom5.toFixed(1)}% 강세` });
    else if (mom5 < -5) scores.push({ indicator: "MOM", score: -10, reason: `5일 ${mom5.toFixed(1)}% 약세` });
  }

  // === 종합 점수 (-100 ~ +100) ===
  const totalScore = Math.max(-100, Math.min(100, scores.reduce((s, v) => s + v.score, 0)));

  // === 시그널 판정 (민감도 강화) ===
  let signal: Signal;
  if (totalScore >= 35) signal = "STRONG_BUY";
  else if (totalScore >= 10) signal = "BUY";
  else if (totalScore >= -10) signal = "HOLD";
  else if (totalScore >= -35) signal = "SELL";
  else signal = "STRONG_SELL";

  // === 가격 레벨 계산 ===
  // ATR 기반 변동성 고려
  const volatilityUnit = atrVal;

  // 매수 시나리오
  let buyEntry = current;
  if (bb && current > bb.middle) {
    // 상단권: 조정 대기 (현재가 - 0.5 ATR)
    buyEntry = current - volatilityUnit * 0.5;
  } else if (sma20 && current < sma20) {
    // 단기 이평 아래: 반등 매수 (현재가 약간 위)
    buyEntry = current + volatilityUnit * 0.2;
  }
  buyEntry = Math.round(buyEntry * 100) / 100;

  const buyTarget1 = Math.round((buyEntry + volatilityUnit * 2) * 100) / 100; // +2 ATR
  const buyTarget2 = Math.round((buyEntry + volatilityUnit * 4) * 100) / 100; // +4 ATR
  const buyStopLoss = Math.round((buyEntry - volatilityUnit * 1.5) * 100) / 100; // -1.5 ATR

  const riskReward = (buyTarget1 - buyEntry) / (buyEntry - buyStopLoss);

  // 매도 시나리오 (보유 중일 때 수익 극대화)
  const sellEntry = current; // 현재가에서 매도 가능
  let sellTarget = current;
  if (bb) sellTarget = Math.max(bb.upper, current + volatilityUnit * 2);
  sellTarget = Math.round(sellTarget * 100) / 100;
  const sellStopLoss = Math.round((current - volatilityUnit * 1) * 100) / 100;

  // === 시간프레임 ===
  let timeframe = "MEDIUM";
  if (Math.abs(totalScore) > 60) timeframe = "SHORT"; // 강한 신호는 단기
  else if (trend === "SIDEWAYS") timeframe = "LONG"; // 횡보는 장기 대기

  // === 판단 근거 (상위 4개) ===
  const reasons = scores
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 4)
    .map((s) => s.reason);

  // === 신뢰도 계산 ===
  // 시그널 강도 + 지표 일치도
  const scoreAgreement = scores.filter((s) => Math.sign(s.score) === Math.sign(totalScore)).length;
  const confidence = Math.min(95, 30 + Math.abs(totalScore) * 0.5 + scoreAgreement * 5);

  return {
    symbol,
    signal,
    score: Math.round(totalScore),
    confidence: Math.round(confidence),
    currentPrice: Math.round(current * 100) / 100,
    buyEntry,
    buyTarget1,
    buyTarget2,
    buyStopLoss,
    buyRiskReward: Math.round(riskReward * 100) / 100,
    sellEntry: Math.round(sellEntry * 100) / 100,
    sellTarget,
    sellStopLoss,
    reasons,
    timeframe,
    indicators: {
      rsi: rsiVal,
      macd: macdRes?.macd ?? null,
      macdSignal: macdRes?.signal ?? null,
      sma20,
      sma50,
      bbPosition,
      trend,
    },
  };
}
