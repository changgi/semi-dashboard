import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 45;

// ═══════════════════════════════════════════════════════════
// Order Slip Generator API
// 
// AI 권장사항을 실제 실행 가능한 주문 텍스트로 변환
// 
// 출력: 증권사 앱에 입력할 수 있는 형식으로
//       - 종목 + 수량 + 가격 + 주문 유형
//       - 복사용 텍스트
//       - 한국 증권사 / 미국 증권사 포맷
// ═══════════════════════════════════════════════════════════

interface OrderSlip {
  id: string;
  priority: number;
  category: "sell" | "buy" | "hedge" | "rebalance";
  urgency: "immediate" | "today" | "this_week";
  
  // 주문 정보
  symbol: string;
  name: string;
  action: "매도" | "매수" | "분할매도" | "분할매수";
  shares: number | string;  // "30%" 같은 비율일 수도
  orderType: "market" | "limit";
  targetPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  
  // 증권사 입력 텍스트 (복사용)
  orderText: string;          // 한국 포맷
  orderTextEnglish: string;   // 영문 포맷
  
  // 근거
  rationale: string;
  expectedOutcome: string;
  riskNote: string;
  
  // 메타
  estimatedValue: number;     // 원화 또는 USD
  currency: "KRW" | "USD";
}

// ───────────────────────────────────────────────────────────
// 주문 텍스트 생성
// ───────────────────────────────────────────────────────────
function buildOrderText(order: Partial<OrderSlip>): { kor: string; eng: string } {
  const action = order.action === "매도" ? "매도" :
                 order.action === "매수" ? "매수" :
                 order.action === "분할매도" ? "분할매도" :
                 "분할매수";
                 
  const actionEng = action.includes("매도") ? "SELL" : "BUY";
  
  const shares = typeof order.shares === "number" ? `${order.shares}주` : order.shares;
  const sharesEng = typeof order.shares === "number" ? `${order.shares}` : order.shares;
  
  const priceKor = order.orderType === "market" 
    ? "시장가" 
    : `지정가 ${order.targetPrice?.toLocaleString()}원`;
  const priceEng = order.orderType === "market" 
    ? "MARKET" 
    : `LIMIT $${order.targetPrice?.toFixed(2)}`;
  
  const kor = `[${action}] ${order.symbol} (${order.name}) ${shares} - ${priceKor}${order.stopLoss ? ` | 스탑로스: ${order.stopLoss.toLocaleString()}원` : ""}`;
  const eng = `${actionEng} ${sharesEng} ${order.symbol} @ ${priceEng}${order.stopLoss ? ` | STOP: $${order.stopLoss.toFixed(2)}` : ""}`;
  
  return { kor, eng };
}

// ═══════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════
export async function GET() {
  try {
    const supabase = createAdmin();
    
    // 1. 카일님 현재 포트폴리오
    const { data: holdings } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);
    
    // 2. 현재가
    const symbols = [...new Set((holdings ?? []).map((h: any) => h.symbol))];
    const quotes = await fetchYahooQuotes([...symbols, "^VIX", "SPY", "KRW=X", "SMH", "SOXX", "TLT", "GLD"]);
    const usdKrw = quotes.get("KRW=X")?.price ?? 1470;
    const vix = quotes.get("^VIX")?.price;
    
    // 3. 주문서 생성
    const orders: OrderSlip[] = [];
    
    // ─────────────────────────────────────────────
    // 주문 1: 대박 종목 부분 차익실현
    // ─────────────────────────────────────────────
    for (const h of holdings ?? []) {
      const q = quotes.get(h.symbol);
      if (!q) continue;
      
      const currentPrice = q.price;
      const gainPct = ((currentPrice - h.avg_cost) / h.avg_cost) * 100;
      
      if (gainPct > 50) {
        // 부분 차익실현 (30%)
        const sharesToSell = Math.max(1, Math.floor(h.shares * 0.3));
        const estimatedValue = sharesToSell * currentPrice;
        const estimatedKrw = h.currency === "KRW" ? estimatedValue : estimatedValue * usdKrw;
        
        const order: OrderSlip = {
          id: `sell_profit_${h.symbol}_${h.shares}`,
          priority: 1,
          category: "sell",
          urgency: "this_week",
          symbol: h.symbol,
          name: h.name || h.symbol,
          action: "분할매도",
          shares: sharesToSell,
          orderType: "market",
          targetPrice: currentPrice,
          rationale: `${gainPct.toFixed(0)}% 수익 - 원금 회수 레벨. 이번 주 빅 이벤트(MSFT/FOMC) 대비`,
          expectedOutcome: `약 ₩${Math.round(estimatedKrw).toLocaleString()} 현금 확보`,
          riskNote: "매도 후 추가 상승 시 기회비용 발생 가능",
          estimatedValue: Math.round(estimatedKrw),
          currency: "KRW",
          orderText: "",
          orderTextEnglish: "",
        };
        
        const texts = buildOrderText(order);
        order.orderText = texts.kor;
        order.orderTextEnglish = texts.eng;
        orders.push(order);
      }
    }
    
    // ─────────────────────────────────────────────
    // 주문 2: 스탑로스 설정 (남은 포지션 보호)
    // ─────────────────────────────────────────────
    for (const h of holdings ?? []) {
      const q = quotes.get(h.symbol);
      if (!q) continue;
      
      const currentPrice = q.price;
      const gainPct = ((currentPrice - h.avg_cost) / h.avg_cost) * 100;
      
      // 수익 중인 포지션에 스탑로스 설정 (평단 + 5%)
      if (gainPct > 5 && gainPct < 50) {
        const stopPrice = Math.round(h.avg_cost * 1.05);
        
        const order: OrderSlip = {
          id: `stoploss_${h.symbol}_${h.shares}`,
          priority: 2,
          category: "rebalance",
          urgency: "today",
          symbol: h.symbol,
          name: h.name || h.symbol,
          action: "매도",
          shares: h.shares,
          orderType: "limit",
          targetPrice: stopPrice,
          stopLoss: stopPrice,
          rationale: `평단 ₩${h.avg_cost.toLocaleString()} + 5% 수익 보호`,
          expectedOutcome: "하락 시 자동 매도로 손실 방지",
          riskNote: "갭 하락 시 설정가보다 낮은 가격에 체결 가능",
          estimatedValue: stopPrice * h.shares,
          currency: h.currency === "KRW" ? "KRW" : "USD",
          orderText: "",
          orderTextEnglish: "",
        };
        
        const texts = buildOrderText(order);
        order.orderText = `[스탑로스 예약] ${h.symbol} (${h.name}) ${h.shares}주 - ${stopPrice.toLocaleString()}원 도달 시 자동 매도`;
        order.orderTextEnglish = `STOP-LOSS ${h.shares} ${h.symbol} @ $${(stopPrice / (h.currency === "KRW" ? usdKrw : 1)).toFixed(2)}`;
        orders.push(order);
      }
    }
    
    // ─────────────────────────────────────────────
    // 주문 3: SMH 관찰 매수 (Max Pain $382.5 근처)
    // ─────────────────────────────────────────────
    const smh = quotes.get("SMH");
    if (smh && smh.price) {
      const targetPrice = Math.min(smh.price * 0.95, 395); // 5% 하락 or $395 중 낮은 값
      
      const order: OrderSlip = {
        id: "buy_smh_watch",
        priority: 3,
        category: "buy",
        urgency: "this_week",
        symbol: "SMH",
        name: "VanEck Semiconductor ETF",
        action: "분할매수",
        shares: 1,
        orderType: "limit",
        targetPrice,
        rationale: "TSM Q1 Beat로 반도체 중장기 긍정. 조정 시 진입",
        expectedOutcome: "반도체 섹터 분산 + 성장성 확보",
        riskNote: "단기 변동성 높음. 점진 매수 권장",
        estimatedValue: Math.round(targetPrice * usdKrw),
        currency: "USD",
        orderText: `[관찰 주문] SMH 1주 - $${targetPrice.toFixed(2)} 이하 도달 시 매수 (약 ₩${Math.round(targetPrice * usdKrw).toLocaleString()})`,
        orderTextEnglish: `BUY 1 SMH @ LIMIT $${targetPrice.toFixed(2)} (GTC)`,
      };
      orders.push(order);
    }
    
    // ─────────────────────────────────────────────
    // 주문 4: TLT 헤지 (선택)
    // ─────────────────────────────────────────────
    const tlt = quotes.get("TLT");
    if (tlt && tlt.price && vix && vix < 20) {
      const order: OrderSlip = {
        id: "hedge_tlt",
        priority: 4,
        category: "hedge",
        urgency: "this_week",
        symbol: "TLT",
        name: "iShares 20+ Year Treasury Bond ETF",
        action: "매수",
        shares: 5,
        orderType: "market",
        targetPrice: tlt.price,
        rationale: `VIX ${vix.toFixed(1)} 낮음 = 헤지 저렴. FOMC 대비 채권 편입`,
        expectedOutcome: "주식 하락 시 채권 상승으로 포트 보호",
        riskNote: "금리 추가 인상 시 TLT 하락 가능",
        estimatedValue: Math.round(5 * tlt.price * usdKrw),
        currency: "USD",
        orderText: `[헤지 매수] TLT 5주 - 시장가 (약 \$${(5 * tlt.price).toFixed(0)} = ₩${Math.round(5 * tlt.price * usdKrw).toLocaleString()})`,
        orderTextEnglish: `BUY 5 TLT @ MARKET (~ $${(5 * tlt.price).toFixed(0)})`,
      };
      orders.push(order);
    }
    
    // ─────────────────────────────────────────────
    // 주문 5: GLD 관찰 (Iran 긴장 + 금 수혜)
    // ─────────────────────────────────────────────
    const gld = quotes.get("GLD");
    if (gld && gld.price) {
      const order: OrderSlip = {
        id: "buy_gld_watch",
        priority: 5,
        category: "hedge",
        urgency: "this_week",
        symbol: "GLD",
        name: "SPDR Gold Shares ETF",
        action: "매수",
        shares: 2,
        orderType: "market",
        targetPrice: gld.price,
        rationale: "Iran-US 긴장 + 안전자산 선호. 포트 분산 효과",
        expectedOutcome: "지정학 리스크 대비 + 달러 약세 수혜",
        riskNote: "금리 상승 시 금 약세 가능",
        estimatedValue: Math.round(2 * gld.price * usdKrw),
        currency: "USD",
        orderText: `[관찰 매수] GLD 2주 - 시장가 (약 \$${(2 * gld.price).toFixed(0)})`,
        orderTextEnglish: `BUY 2 GLD @ MARKET (~ $${(2 * gld.price).toFixed(0)})`,
      };
      orders.push(order);
    }
    
    // 요약
    const totalSellValue = orders
      .filter(o => o.category === "sell")
      .reduce((s, o) => s + o.estimatedValue, 0);
    
    const totalBuyValue = orders
      .filter(o => o.category === "buy" || o.category === "hedge")
      .reduce((s, o) => s + o.estimatedValue, 0);
    
    const netFlow = totalSellValue - totalBuyValue;
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalOrders: orders.length,
        sellOrders: orders.filter(o => o.category === "sell").length,
        buyOrders: orders.filter(o => o.category === "buy").length,
        hedgeOrders: orders.filter(o => o.category === "hedge").length,
        stopLosses: orders.filter(o => o.category === "rebalance").length,
        totalSellValue,
        totalBuyValue,
        netFlow,
      },
      orders: orders.sort((a, b) => a.priority - b.priority),
      disclaimer: "💡 실제 주문 전 반드시 본인이 각 종목의 현재가, 수수료, 세금을 확인하세요. 주문서는 참고용 가이드입니다.",
      context: {
        portfolioHoldings: holdings?.length ?? 0,
        usdKrw,
        vix: vix ?? null,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      summary: {
        totalOrders: 0,
        sellOrders: 0,
        buyOrders: 0,
        hedgeOrders: 0,
        stopLosses: 0,
        totalSellValue: 0,
        totalBuyValue: 0,
        netFlow: 0,
      },
      orders: [],
    });
  }
}
