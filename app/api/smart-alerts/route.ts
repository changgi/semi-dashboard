import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Smart Alert Engine
// 
// 단순 경보가 아닌 "경보 + 이유 + 즉시 대응법":
// - VIX 급등 → 의미 + 어떤 종목이 위험 + 즉시 행동
// - 관심 종목 신고가 → 의미 + 포트와 관계 + 추격 매수 판단
// - 섹터 로테이션 → 감지 + 카일님 포트 영향 + 재배치 추천
// - Congressional trading → 내부자 매매 감지
// 
// 각 알림은 "이게 뭐고, 나한테 무슨 의미이고, 지금 뭘 해야 하나"
// ═══════════════════════════════════════════════════════════

interface SmartAlert {
  id: string;
  category: "market" | "portfolio" | "sector" | "earnings" | "technical";
  severity: "critical" | "warning" | "info" | "opportunity";
  title: string;
  icon: string;
  // 3-layer 분석
  whatHappened: string;       // 🔵 사실
  whyItMatters: string;       // 🟡 이유 + 영향
  whatToDo: string;           // 🟢 즉시 행동
  affectedSymbols: string[];
  relatedToPortfolio: boolean;
  confidence: number;         // 0-100
  createdAt: string;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdmin();
    const alerts: SmartAlert[] = [];
    
    // 포트 정보 로드
    const { data: holdings } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("is_active", true);
    
    const portfolioSymbols = new Set((holdings ?? []).map((h: any) => h.symbol));
    
    // ─────────────────────────────────────────────
    // 1. 매크로 경보 (VIX, 시장 지수)
    // ─────────────────────────────────────────────
    const macro = await fetchYahooQuotes(["^VIX", "SPY", "QQQ", "^TNX", "KRW=X"]);
    const vix = macro.get("^VIX");
    const spy = macro.get("SPY");
    const qqq = macro.get("QQQ");
    const tnx = macro.get("^TNX");
    
    if (vix && vix.price > 25) {
      alerts.push({
        id: `macro-vix-${Date.now()}`,
        category: "market",
        severity: vix.price > 30 ? "critical" : "warning",
        title: `VIX 급등 ${vix.price.toFixed(1)} (공포 지수)`,
        icon: "⚡",
        whatHappened: `시장 공포 지수 VIX가 ${vix.price.toFixed(1)}로 상승. 평상시(15-20) 대비 ${((vix.price / 17 - 1) * 100).toFixed(0)}% 높은 수준.`,
        whyItMatters: `VIX ${vix.price > 30 ? "30 돌파 시 역사적으로 큰 조정 신호" : "상승은 변동성 확대를 의미"}. ${(holdings ?? []).filter((h: any) => h.symbol.includes("L") || h.symbol.includes("X") || h.symbol.includes("U")).length > 0 ? "레버리지 ETF 보유 시 감가 가속화." : ""}`,
        whatToDo: `1) 레버리지 포지션 비중 축소 검토\n2) 헷지 고려 (SQQQ 등)\n3) 현금 비중 확대`,
        affectedSymbols: ["SPY", "QQQ"],
        relatedToPortfolio: true,
        confidence: 85,
        createdAt: new Date().toISOString(),
      });
    }
    
    if (spy && spy.changePct !== null && spy.changePct < -1.5) {
      alerts.push({
        id: `macro-spy-${Date.now()}`,
        category: "market",
        severity: spy.changePct < -2.5 ? "critical" : "warning",
        title: `S&P500 하락 ${spy.changePct.toFixed(2)}%`,
        icon: "📉",
        whatHappened: `S&P500이 하루 ${spy.changePct.toFixed(2)}% 하락. ${spy.changePct < -2.5 ? "2% 이상 하락은 연 2-3회 정도 발생" : "평균 이상의 하락"}.`,
        whyItMatters: `지수가 1% 하락하면 레버리지 2x ETF는 ~2% 하락. 카일님의 TSLL, ORCX, AMZU, ORCU 같은 레버리지 포지션이 직접 영향.`,
        whatToDo: `1) 레버리지 포지션 오늘 중 매도 검토\n2) 개별 종목 -5% 이상 하락 확인\n3) MSFT/TSLA 실적 임박 점검`,
        affectedSymbols: [...portfolioSymbols].slice(0, 5),
        relatedToPortfolio: true,
        confidence: 90,
        createdAt: new Date().toISOString(),
      });
    }
    
    // ─────────────────────────────────────────────
    // 2. 포트폴리오 심층 경보
    // ─────────────────────────────────────────────
    if (holdings && holdings.length > 0) {
      const symbols = holdings.map((h: any) => h.symbol);
      const quotes = await fetchYahooQuotes(symbols);
      
      for (const h of holdings) {
        const q = quotes.get(h.symbol);
        if (!q) continue;
        
        // 당일 급등 +8%
        if (q.changePct && q.changePct > 8) {
          alerts.push({
            id: `pos-surge-${h.symbol}-${Date.now()}`,
            category: "portfolio",
            severity: "opportunity",
            title: `🚀 ${h.symbol} 급등 +${q.changePct.toFixed(1)}%`,
            icon: "🚀",
            whatHappened: `보유 종목 ${h.symbol}이 당일 ${q.changePct.toFixed(1)}% 급등. ${h.shares}주 보유 중 평가액 증가 $${(h.shares * q.price * q.changePct / 100).toFixed(0)}.`,
            whyItMatters: `평단 $${h.avg_cost}에서 현재가 $${q.price.toFixed(2)}. 수익률 ${((q.price / h.avg_cost - 1) * 100).toFixed(1)}%. 단기 급등은 되돌림 가능성.`,
            whatToDo: `1) 부분 차익 실현 검토 (30% 정리)\n2) Trailing Stop 설정\n3) 감정적 "더 오를 것" 판단 경계`,
            affectedSymbols: [h.symbol],
            relatedToPortfolio: true,
            confidence: 80,
            createdAt: new Date().toISOString(),
          });
        }
        
        // 당일 급락 -5%
        if (q.changePct && q.changePct < -5) {
          const lossAmount = h.shares * q.price * Math.abs(q.changePct) / 100;
          alerts.push({
            id: `pos-drop-${h.symbol}-${Date.now()}`,
            category: "portfolio",
            severity: q.changePct < -8 ? "critical" : "warning",
            title: `🔴 ${h.symbol} 급락 ${q.changePct.toFixed(1)}%`,
            icon: "🔴",
            whatHappened: `보유 종목 ${h.symbol}이 당일 ${q.changePct.toFixed(1)}% 급락. 평가 손실 $${lossAmount.toFixed(0)} 발생.`,
            whyItMatters: `평단 $${h.avg_cost}, 현재 $${q.price.toFixed(2)}. 수익률 ${((q.price / h.avg_cost - 1) * 100).toFixed(1)}%. ${q.changePct < -8 ? "8% 이상 급락은 즉시 점검 필요" : "추세 확인 필요"}.`,
            whatToDo: `1) 급락 이유 확인 (뉴스/공시)\n2) 추가 하락 방어 - 손절선 설정\n3) 평단 낮추기는 금물 (레버리지는 특히)`,
            affectedSymbols: [h.symbol],
            relatedToPortfolio: true,
            confidence: 90,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }
    
    // ─────────────────────────────────────────────
    // 3. 실적 임박 경보
    // ─────────────────────────────────────────────
    const today = new Date().toISOString().split("T")[0];
    const twoDaysLater = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];
    
    const { data: earnings } = await supabase
      .from("earnings_schedule")
      .select("*")
      .gte("earnings_date", today)
      .lte("earnings_date", twoDaysLater)
      .order("earnings_date");
    
    for (const e of (earnings ?? [])) {
      const daysUntil = Math.ceil((new Date(e.earnings_date).getTime() - Date.now()) / 86400000);
      const isPortfolio = portfolioSymbols.has(e.symbol);
      // 기초자산으로 연결되는 레버리지 포지션 (ORCL → ORCX)
      const leveragedPositions = (holdings ?? []).filter((h: any) => 
        h.symbol.startsWith(e.symbol.substring(0, 3)) && h.symbol !== e.symbol
      );
      
      if (isPortfolio || leveragedPositions.length > 0) {
        alerts.push({
          id: `earnings-${e.symbol}-${Date.now()}`,
          category: "earnings",
          severity: daysUntil <= 1 ? "critical" : "warning",
          title: `📅 ${e.symbol} 실적 D-${daysUntil}`,
          icon: "📅",
          whatHappened: `${e.company_name ?? e.symbol} 실적 발표 예정: ${e.earnings_date} ${e.timing ?? ""}. 중요도 ${e.importance ?? 3}/5.`,
          whyItMatters: isPortfolio
            ? `카일님이 ${e.symbol}을 직접 보유 중. 어닝 서프라이즈/미스 시 직접 타격.`
            : `레버리지 포지션 ${leveragedPositions.map((l: any) => l.symbol).join(", ")}이 ${e.symbol} 기초자산 기반. 실적 반응이 2x로 증폭.`,
          whatToDo: daysUntil <= 1
            ? `1) 실적 발표 전 포지션 정리 검토 (레버리지 우선)\n2) 현재 수익률 점검\n3) 최악 시나리오 대비 손절선 설정`
            : `1) 실적 결과 모니터링 준비\n2) 시간외 반응 관찰\n3) 익일 개장 전략 수립`,
          affectedSymbols: isPortfolio ? [e.symbol] : leveragedPositions.map((l: any) => l.symbol),
          relatedToPortfolio: true,
          confidence: 95,
          createdAt: new Date().toISOString(),
        });
      }
    }
    
    // ─────────────────────────────────────────────
    // 4. 섹터 로테이션 감지 (간접)
    // ─────────────────────────────────────────────
    const sectorQuotes = await fetchYahooQuotes(["XLK", "XLE", "XLF", "XLV", "XLY"]);
    const sectors = [
      { symbol: "XLK", name: "기술주", held: true },  // ORCL, CDNS 등
      { symbol: "XLE", name: "에너지", held: false },
      { symbol: "XLF", name: "금융", held: false },
      { symbol: "XLV", name: "헬스케어", held: false },
      { symbol: "XLY", name: "경기소비재", held: true },  // AMZN/AMZU
    ];
    
    let maxGain = -Infinity;
    let maxLoss = Infinity;
    let topSector: any = null;
    let bottomSector: any = null;
    
    for (const s of sectors) {
      const q = sectorQuotes.get(s.symbol);
      if (!q || q.changePct === null) continue;
      if (q.changePct > maxGain) { maxGain = q.changePct; topSector = { ...s, change: q.changePct }; }
      if (q.changePct < maxLoss) { maxLoss = q.changePct; bottomSector = { ...s, change: q.changePct }; }
    }
    
    if (topSector && bottomSector && Math.abs(topSector.change - bottomSector.change) > 2) {
      const portHeldInBottom = bottomSector.held;
      alerts.push({
        id: `rotation-${Date.now()}`,
        category: "sector",
        severity: portHeldInBottom ? "warning" : "info",
        title: `🔄 섹터 로테이션: ${bottomSector.name} → ${topSector.name}`,
        icon: "🔄",
        whatHappened: `${topSector.name}(${topSector.symbol}) +${topSector.change.toFixed(2)}% vs ${bottomSector.name}(${bottomSector.symbol}) ${bottomSector.change.toFixed(2)}%. 차이 ${(topSector.change - bottomSector.change).toFixed(2)}%.`,
        whyItMatters: portHeldInBottom
          ? `카일님 포트는 ${bottomSector.name} 섹터 비중 큼. 로테이션으로 아웃퍼폼 어려움. ${topSector.name}으로 자금 이동 필요 가능성.`
          : `시장 자금이 ${bottomSector.name} → ${topSector.name}으로 이동 중. 카일님 포트 직접 영향은 적으나 추세 관찰 필요.`,
        whatToDo: portHeldInBottom
          ? `1) ${bottomSector.name} 비중 축소 검토\n2) ${topSector.name} 관련 종목 탐색\n3) 기회 탐지기에서 ${topSector.name} 후보 확인`
          : `1) 추세 지속 여부 모니터링\n2) 기회 탐지기에서 ${topSector.name} 기회 탐색`,
        affectedSymbols: [topSector.symbol, bottomSector.symbol],
        relatedToPortfolio: portHeldInBottom,
        confidence: 65,
        createdAt: new Date().toISOString(),
      });
    }
    
    // ─────────────────────────────────────────────
    // 5. 환율 급변 경보
    // ─────────────────────────────────────────────
    const krw = macro.get("KRW=X");
    if (krw && krw.changePct !== null && Math.abs(krw.changePct) > 1) {
      alerts.push({
        id: `fx-${Date.now()}`,
        category: "market",
        severity: "info",
        title: `💱 환율 급변 USD/KRW ${krw.changePct > 0 ? "+" : ""}${krw.changePct.toFixed(2)}%`,
        icon: "💱",
        whatHappened: `달러/원 환율 ${krw.price.toFixed(2)}원 · 당일 ${krw.changePct.toFixed(2)}% ${krw.changePct > 0 ? "상승" : "하락"}.`,
        whyItMatters: krw.changePct > 0
          ? `달러 강세. 미국 주식 원화 환산 평가액 증가 효과. 반대로 신규 달러 매수 비용 상승.`
          : `달러 약세. 카일님 달러 표시 포트 원화 평가액 감소. 신규 매수 기회 (달러 저가 매수).`,
        whatToDo: Math.abs(krw.changePct) > 1.5
          ? `1) 신규 환전 타이밍 고려\n2) 원화/달러 비중 재점검`
          : `1) 추세 관찰`,
        affectedSymbols: [],
        relatedToPortfolio: true,
        confidence: 75,
        createdAt: new Date().toISOString(),
      });
    }
    
    // ─────────────────────────────────────────────
    // 정렬: 중요도 → 포트 관련 → 신뢰도
    // ─────────────────────────────────────────────
    const severityOrder = { critical: 0, warning: 1, opportunity: 2, info: 3 };
    alerts.sort((a, b) => {
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[a.severity] - severityOrder[b.severity];
      }
      if (a.relatedToPortfolio !== b.relatedToPortfolio) {
        return a.relatedToPortfolio ? -1 : 1;
      }
      return b.confidence - a.confidence;
    });
    
    // ═══════════════════════════════════════
    // 히스토리 저장 (fire-and-forget)
    // ═══════════════════════════════════════
    try {
      // alert_id에서 timestamp 제거해서 안정적 식별자 생성
      const alertsForHistory = alerts.map(a => ({
        alert_id: a.id.replace(/-\d+$/, ""),  // timestamp suffix 제거
        ...a,
      }));
      
      for (const alert of alertsForHistory) {
        // 기존 알림 확인 (24시간 이내 같은 id)
        const yesterday = new Date(Date.now() - 24 * 3600000).toISOString();
        const { data: existing } = await supabase
          .from("smart_alerts_history")
          .select("id, occurrence_count")
          .eq("alert_id", alert.alert_id)
          .gte("first_seen_at", yesterday)
          .eq("is_resolved", false)
          .maybeSingle();
        
        if (existing) {
          // 기존 알림 업데이트 (occurrence 증가, last_seen)
          await supabase
            .from("smart_alerts_history")
            .update({
              last_seen_at: new Date().toISOString(),
              occurrence_count: (existing.occurrence_count ?? 1) + 1,
            })
            .eq("id", existing.id);
        } else {
          // 새 알림 저장
          await supabase.from("smart_alerts_history").insert({
            alert_id: alert.alert_id,
            first_seen_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            occurrence_count: 1,
            category: alert.category,
            severity: alert.severity,
            title: alert.title,
            icon: alert.icon,
            what_happened: alert.whatHappened,
            why_it_matters: alert.whyItMatters,
            what_to_do: alert.whatToDo,
            affected_symbols: alert.affectedSymbols,
            related_to_portfolio: alert.relatedToPortfolio,
            confidence: alert.confidence,
          });
        }
      }
      
      // 이전에 활성이었다가 지금 사라진 알림 → 해결됨 처리
      const currentAlertIds = alertsForHistory.map(a => a.alert_id);
      if (currentAlertIds.length > 0) {
        const today = new Date().toISOString().split("T")[0];
        await supabase
          .from("smart_alerts_history")
          .update({ is_resolved: true, resolved_at: new Date().toISOString() })
          .not("alert_id", "in", `(${currentAlertIds.map(id => `"${id}"`).join(",")})`)
          .eq("is_resolved", false)
          .gte("last_seen_at", `${today}T00:00:00Z`)
          .lt("last_seen_at", new Date(Date.now() - 30 * 60000).toISOString());  // 30분 이상 안 보인 것
      }
    } catch (histError) {
      console.error("Alerts 히스토리 저장 실패:", histError);
    }
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        total: alerts.length,
        critical: alerts.filter(a => a.severity === "critical").length,
        warning: alerts.filter(a => a.severity === "warning").length,
        opportunity: alerts.filter(a => a.severity === "opportunity").length,
        info: alerts.filter(a => a.severity === "info").length,
        portfolioRelated: alerts.filter(a => a.relatedToPortfolio).length,
      },
      alerts,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      _soft_failure: true,
      error: msg,
      alerts: [],
    });
  }
}
