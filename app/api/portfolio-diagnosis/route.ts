import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Portfolio Diagnosis API
// 
// 카일님 포트를 자동 분석하여:
// - 건강 점수 (0-100)
// - 집중도 분석 (기초자산별, 레버리지 비중)
// - 리스크 경고 자동 생성
// - 실적 이벤트 노출 매핑
// - 우선순위별 액션 플랜
// ═══════════════════════════════════════════════════════════

interface Position {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  gain: number;
  gainPct: number;
  currency: string;
  isLeverage: boolean;
  leverageMultiplier: number;
  underlyingAsset: string;  // 실제 추적 종목 (ORCX→ORCL)
  isInverse: boolean;
  country: string;
  dayChangePct: number;
  purchaseDate: string | null;
}

interface RiskFlag {
  severity: "critical" | "warning" | "info";
  type: string;
  title: string;
  description: string;
  affectedValue: number;
}

interface ActionPlan {
  priority: 1 | 2 | 3 | 4;
  title: string;
  symbol: string;
  actionType: "sell_full" | "sell_partial" | "hold_watch" | "rebalance";
  shares?: number;
  reasoning: string;
  expectedCashUsd?: number;
  lossRealized?: number;
  urgency: "today" | "this_week" | "next_week";
}

export async function GET() {
  try {
    const supabase = createAdmin();
    
    // 1. 포트폴리오 로드
    const { data: holdings } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);
    
    if (!holdings || holdings.length === 0) {
      return NextResponse.json({
        success: true,
        empty: true,
        summary: { healthScore: 100, healthGrade: "healthy", positionCount: 0 },
      });
    }
    
    // 2. 실시간 시세
    const symbols = [...new Set(holdings.map((h: any) => h.symbol))];
    const quotes = await fetchYahooQuotes(symbols);
    
    // 3. Symbol Universe 메타 로드
    const { data: universeData } = await supabase
      .from("symbol_universe")
      .select("symbol, name_ko, country, is_semi, is_etf, semi_tags, related_etfs, in_sp500, in_nasdaq100")
      .in("symbol", symbols);
    const universeMap = new Map<string, any>();
    for (const u of (universeData ?? [])) {
      universeMap.set(u.symbol, u);
    }
    
    // 4. 실적 일정 로드 (향후 14일)
    const today = new Date().toISOString().split("T")[0];
    const twoWeeksLater = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];
    const { data: earnings } = await supabase
      .from("earnings_schedule")
      .select("*")
      .gte("earnings_date", today)
      .lte("earnings_date", twoWeeksLater)
      .order("earnings_date", { ascending: true });
    
    // 5. 포지션 정규화 (레버리지/인버스 감지, 기초자산 매핑)
    const positions: Position[] = [];
    for (const h of holdings) {
      const q = quotes.get(h.symbol);
      const meta = universeMap.get(h.symbol);
      const tags: string[] = meta?.semi_tags ?? [];
      const isLeverage = tags.includes("레버리지") || tags.includes("2x") || tags.includes("3x");
      const isInverse = tags.includes("인버스") || tags.includes("bear");
      const leverageMultiplier = tags.includes("3x") ? 3 : (isLeverage || isInverse ? 2 : 1);
      const underlyingAsset = meta?.related_etfs?.[0] ?? h.symbol;
      
      const currentPrice = q?.price ?? h.avg_cost;
      const marketValue = h.shares * currentPrice;
      const totalCost = h.shares * h.avg_cost;
      const gain = marketValue - totalCost;
      
      positions.push({
        symbol: h.symbol,
        name: meta?.name_ko ?? h.name ?? h.symbol,
        shares: h.shares,
        avgCost: h.avg_cost,
        currentPrice,
        marketValue,
        gain,
        gainPct: totalCost > 0 ? (gain / totalCost) * 100 : 0,
        currency: h.currency,
        isLeverage,
        leverageMultiplier,
        underlyingAsset,
        isInverse,
        country: meta?.country ?? "US",
        dayChangePct: q?.changePct ?? 0,
        purchaseDate: h.purchase_date,
      });
    }
    
    // ─────────────────────────────────────────────
    // 통화별 집계 (USD 기준)
    // ─────────────────────────────────────────────
    const fxQuotes = await fetchYahooQuotes(["KRW=X"]);
    const usdKrw = fxQuotes.get("KRW=X")?.price ?? 1472;
    
    const toUsd = (val: number, ccy: string) => ccy === "KRW" ? val / usdKrw : val;
    
    const totalValueUsd = positions.reduce((s, p) => s + toUsd(p.marketValue, p.currency), 0);
    const totalCostUsd = positions.reduce((s, p) => s + toUsd(p.shares * p.avgCost, p.currency), 0);
    const totalGainUsd = totalValueUsd - totalCostUsd;
    const totalGainPct = totalCostUsd > 0 ? (totalGainUsd / totalCostUsd) * 100 : 0;
    
    // ─────────────────────────────────────────────
    // 집중도 분석
    // ─────────────────────────────────────────────
    // 기초자산별 (ORCX+ORCL+ORCU = Oracle 한 덩어리)
    const byAsset = new Map<string, { value: number; symbols: string[]; effectiveExposure: number }>();
    for (const p of positions) {
      const asset = p.underlyingAsset;
      const valueUsd = toUsd(p.marketValue, p.currency);
      const effExposure = valueUsd * p.leverageMultiplier * (p.isInverse ? -1 : 1);  // 레버리지 반영 실제 노출
      if (!byAsset.has(asset)) byAsset.set(asset, { value: 0, symbols: [], effectiveExposure: 0 });
      const e = byAsset.get(asset)!;
      e.value += valueUsd;
      e.effectiveExposure += effExposure;
      if (!e.symbols.includes(p.symbol)) e.symbols.push(p.symbol);
    }
    
    const concentrationByAsset = [...byAsset.entries()]
      .map(([asset, info]) => ({
        asset,
        valueUsd: Math.round(info.value * 100) / 100,
        pct: Math.round((info.value / totalValueUsd) * 10000) / 100,
        effectiveExposureUsd: Math.round(info.effectiveExposure * 100) / 100,
        symbols: info.symbols,
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd);
    
    // 레버리지 vs 본주
    let leverageValue = 0, spotValue = 0;
    for (const p of positions) {
      const v = toUsd(p.marketValue, p.currency);
      if (p.isLeverage || p.isInverse) leverageValue += v;
      else spotValue += v;
    }
    const leveragePct = (leverageValue / totalValueUsd) * 100;
    
    // 국가별
    const byCountry = new Map<string, number>();
    for (const p of positions) {
      const v = toUsd(p.marketValue, p.currency);
      byCountry.set(p.country, (byCountry.get(p.country) ?? 0) + v);
    }
    
    // ─────────────────────────────────────────────
    // 리스크 플래그 자동 생성
    // ─────────────────────────────────────────────
    const risks: RiskFlag[] = [];
    
    // 1) 단일 기초자산 40%+ 집중
    const topAsset = concentrationByAsset[0];
    if (topAsset && topAsset.pct >= 40) {
      risks.push({
        severity: "critical",
        type: "asset_concentration",
        title: `🎯 ${topAsset.asset} 집중 ${topAsset.pct.toFixed(1)}%`,
        description: `단일 자산(${topAsset.symbols.join("+")})에 전체의 ${topAsset.pct.toFixed(1)}%가 집중되어 있습니다. 해당 종목 하락 시 포트 전체 손실로 직결됩니다.`,
        affectedValue: topAsset.valueUsd,
      });
    }
    
    // 2) 레버리지 비중 50%+
    if (leveragePct >= 50) {
      risks.push({
        severity: "critical",
        type: "leverage_concentration",
        title: `⚡ 레버리지 비중 ${leveragePct.toFixed(1)}%`,
        description: `포트의 ${leveragePct.toFixed(1)}%가 레버리지/인버스 상품입니다. 시간 감가(volatility decay)로 횡보 시에도 가치가 지속 하락합니다.`,
        affectedValue: leverageValue,
      });
    } else if (leveragePct >= 30) {
      risks.push({
        severity: "warning",
        type: "leverage_concentration",
        title: `⚡ 레버리지 비중 ${leveragePct.toFixed(1)}%`,
        description: `레버리지 비중이 높습니다. 장기 보유 시 감가 비용 발생.`,
        affectedValue: leverageValue,
      });
    }
    
    // 3) 큰 손실 포지션 (−30%+)
    for (const p of positions) {
      if (p.gainPct <= -30) {
        risks.push({
          severity: "critical",
          type: "large_loss",
          title: `🔴 ${p.symbol} 큰 손실 ${p.gainPct.toFixed(1)}%`,
          description: `${p.name}에서 ${p.gainPct.toFixed(1)}%의 큰 손실 발생. 본전 회복에 +${((1 / (1 + p.gainPct / 100) - 1) * 100).toFixed(1)}% 필요.`,
          affectedValue: toUsd(p.marketValue, p.currency),
        });
      }
    }
    
    // 4) 포지션 수 부족 (< 3)
    if (positions.length < 3) {
      risks.push({
        severity: "warning",
        type: "low_diversification",
        title: `📊 포지션 ${positions.length}개 (분산 부족)`,
        description: `최소 5-7개 종목으로 분산을 권장합니다.`,
        affectedValue: totalValueUsd,
      });
    }
    
    // 5) 중복 노출 (같은 기초자산 3개 이상)
    for (const c of concentrationByAsset) {
      if (c.symbols.length >= 3) {
        risks.push({
          severity: "warning",
          type: "duplicate_exposure",
          title: `🔁 ${c.asset} ${c.symbols.length}개 포지션 중복`,
          description: `${c.symbols.join(", ")} 모두 ${c.asset} 기반입니다. 분산이 아닌 중복 노출입니다.`,
          affectedValue: c.valueUsd,
        });
      }
    }
    
    // ─────────────────────────────────────────────
    // 실적 노출 매핑
    // ─────────────────────────────────────────────
    const earningsImpact: any[] = [];
    for (const e of (earnings ?? [])) {
      const affectedPositions: Array<{symbol: string; name: string; exposureType: "direct" | "leverage" | "indirect"; multiplier: number}> = [];
      
      for (const p of positions) {
        // 직접 영향: 같은 종목
        if (p.symbol === e.symbol) {
          affectedPositions.push({ symbol: p.symbol, name: p.name, exposureType: "direct", multiplier: 1 });
        }
        // 레버리지 영향: 기초자산이 실적 발표 종목
        else if (p.underlyingAsset === e.symbol) {
          affectedPositions.push({ symbol: p.symbol, name: p.name, exposureType: "leverage", multiplier: p.leverageMultiplier });
        }
      }
      
      if (affectedPositions.length > 0) {
        const daysUntil = Math.ceil((new Date(e.earnings_date).getTime() - Date.now()) / 86400000);
        earningsImpact.push({
          date: e.earnings_date,
          daysUntil,
          symbol: e.symbol,
          name: e.company_name,
          timing: e.timing,
          importance: e.importance,
          affectedPositions,
          totalExposureUsd: affectedPositions.reduce((sum, ap) => {
            const pos = positions.find(p => p.symbol === ap.symbol);
            return sum + (pos ? toUsd(pos.marketValue, pos.currency) : 0);
          }, 0),
        });
      }
    }
    
    // ─────────────────────────────────────────────
    // 우선순위별 액션 플랜 자동 생성
    // ─────────────────────────────────────────────
    const actions: ActionPlan[] = [];
    
    // 원칙: 
    // P1 - 즉시 제거 가능한 중복 노출 (작은 포지션)
    // P2 - 실적 임박 레버리지 (리스크 큼)
    // P3 - 큰 포지션 부분 축소
    // P4 - 관망 (데이터 대기)
    
    // 중복 노출 중 가장 작은 것 → P1
    for (const c of concentrationByAsset) {
      if (c.symbols.length >= 3) {
        // 3개 중 가장 작은 포지션 찾기
        const smallest = c.symbols
          .map(s => positions.find(p => p.symbol === s)!)
          .filter(Boolean)
          .sort((a, b) => toUsd(a.marketValue, a.currency) - toUsd(b.marketValue, b.currency))[0];
        
        if (smallest && smallest.isLeverage) {
          actions.push({
            priority: 1,
            title: `${smallest.symbol} 전량 매도 (중복 노출 제거)`,
            symbol: smallest.symbol,
            actionType: "sell_full",
            shares: smallest.shares,
            reasoning: `${c.asset}에 ${c.symbols.length}개 포지션이 중복됩니다. 가장 작은 ${smallest.symbol}부터 정리하여 리스크를 단순화하세요. 매도 심리 장벽이 낮습니다.`,
            expectedCashUsd: toUsd(smallest.marketValue, smallest.currency),
            lossRealized: toUsd(smallest.gain, smallest.currency),
            urgency: "today",
          });
          break;
        }
      }
    }
    
    // 실적 임박 레버리지 포지션 → P2
    for (const imp of earningsImpact) {
      if (imp.daysUntil <= 3) {
        for (const ap of imp.affectedPositions) {
          if (ap.exposureType === "leverage" && ap.multiplier >= 2) {
            const pos = positions.find(p => p.symbol === ap.symbol)!;
            if (pos && !actions.some(a => a.symbol === pos.symbol)) {
              actions.push({
                priority: 2,
                title: `${pos.symbol} 매도 검토 (${imp.symbol} 실적 D-${imp.daysUntil})`,
                symbol: pos.symbol,
                actionType: "sell_full",
                shares: pos.shares,
                reasoning: `${imp.date} ${imp.name} 실적이 임박. ${pos.symbol}은 ${ap.multiplier}x 레버리지로 어닝 서프라이즈 시 극단적 변동 가능. 실적 전 포지션 정리로 리스크 회피.`,
                expectedCashUsd: toUsd(pos.marketValue, pos.currency),
                lossRealized: toUsd(pos.gain, pos.currency),
                urgency: imp.daysUntil <= 1 ? "today" : "this_week",
              });
            }
          }
        }
      }
    }
    
    // 큰 레버리지 포지션 부분 축소 → P3
    const biggestLeverage = positions
      .filter(p => p.isLeverage && !actions.some(a => a.symbol === p.symbol))
      .sort((a, b) => toUsd(b.marketValue, b.currency) - toUsd(a.marketValue, a.currency))[0];
    
    if (biggestLeverage && toUsd(biggestLeverage.marketValue, biggestLeverage.currency) > 2000) {
      const sharesHalf = Math.floor(biggestLeverage.shares * 0.44);
      actions.push({
        priority: 3,
        title: `${biggestLeverage.symbol} ${sharesHalf}주 매도 (비중 축소)`,
        symbol: biggestLeverage.symbol,
        actionType: "sell_partial",
        shares: sharesHalf,
        reasoning: `${biggestLeverage.symbol}은 포트 최대 레버리지 포지션. 절반 매도로 변동성 축소 + 현금 확보. 남은 포지션으로 반등 여지 유지.`,
        expectedCashUsd: sharesHalf * biggestLeverage.currentPrice,
        lossRealized: sharesHalf * (biggestLeverage.currentPrice - biggestLeverage.avgCost),
        urgency: "this_week",
      });
    }
    
    // 본주 포지션 관망 → P4
    const spotPosition = positions.find(p => !p.isLeverage && p.gainPct < -20);
    if (spotPosition) {
      actions.push({
        priority: 4,
        title: `${spotPosition.symbol} 유지 (본주, 시간 감가 없음)`,
        symbol: spotPosition.symbol,
        actionType: "hold_watch",
        reasoning: `${spotPosition.name}은 본주라 시간 감가가 없습니다. 손실 확정보다는 주요 실적(MSFT 등) 데이터 확인 후 이성적 판단을 권장. 감정적 손절은 금물.`,
        urgency: "next_week",
      });
    }
    
    // ─────────────────────────────────────────────
    // 건강 점수 계산
    // ─────────────────────────────────────────────
    let healthScore = 100;
    
    // 손실 패널티
    if (totalGainPct < -30) healthScore -= 30;
    else if (totalGainPct < -15) healthScore -= 15;
    else if (totalGainPct < -5) healthScore -= 5;
    
    // 집중도 패널티
    if (topAsset && topAsset.pct >= 60) healthScore -= 20;
    else if (topAsset && topAsset.pct >= 40) healthScore -= 10;
    
    // 레버리지 패널티
    if (leveragePct >= 70) healthScore -= 20;
    else if (leveragePct >= 50) healthScore -= 10;
    else if (leveragePct >= 30) healthScore -= 5;
    
    // 분산 패널티
    if (positions.length < 3) healthScore -= 10;
    else if (positions.length < 5) healthScore -= 5;
    
    // 중복 노출 패널티
    const maxDupe = Math.max(...concentrationByAsset.map(c => c.symbols.length));
    if (maxDupe >= 3) healthScore -= 10;
    
    healthScore = Math.max(0, Math.min(100, healthScore));
    
    const healthGrade = 
      healthScore >= 80 ? "healthy" :
      healthScore >= 60 ? "caution" :
      healthScore >= 40 ? "warning" :
      "critical";
    
    // ─────────────────────────────────────────────
    // 응답
    // ─────────────────────────────────────────────
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalValueUsd: Math.round(totalValueUsd * 100) / 100,
        totalCostUsd: Math.round(totalCostUsd * 100) / 100,
        totalGainUsd: Math.round(totalGainUsd * 100) / 100,
        totalGainPct: Math.round(totalGainPct * 100) / 100,
        positionCount: positions.length,
        healthScore,
        healthGrade,
        usdKrwRate: usdKrw,
      },
      concentration: {
        byAsset: concentrationByAsset,
        leveragePct: Math.round(leveragePct * 100) / 100,
        spotPct: Math.round((spotValue / totalValueUsd) * 10000) / 100,
        byCountry: [...byCountry.entries()].map(([c, v]) => ({ country: c, valueUsd: Math.round(v * 100) / 100, pct: Math.round((v / totalValueUsd) * 10000) / 100 })),
      },
      positions: positions.map(p => ({
        ...p,
        marketValueUsd: toUsd(p.marketValue, p.currency),
      })),
      risks,
      earningsImpact,
      actions: actions.sort((a, b) => a.priority - b.priority),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      _soft_failure: true,
      error: msg,
    });
  }
}
