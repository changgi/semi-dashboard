import { NextResponse } from "next/server";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// AI Position Guide API
// 
// 5가지 데이터를 종합해서 "지금 당장 뭐 해야 하나?" 즉답:
//   1. 현재 포트폴리오 상태
//   2. 매크로 환경 (VIX/금리)
//   3. 섹터 센티먼트
//   4. 뉴스 감정
//   5. 다가오는 이벤트 (실적/FOMC)
// 
// 출력: 최대 5개의 우선순위별 구체적 액션
// ═══════════════════════════════════════════════════════════

interface PositionGuide {
  urgency: "immediate" | "today" | "this_week" | "monitor";
  priority: 1 | 2 | 3 | 4 | 5;
  icon: string;
  title: string;
  action: string;
  reason: string;
  targetSymbol?: string;
  targetPrice?: number;
  confidence: number; // 0-100
  category: "portfolio" | "macro" | "earnings" | "news" | "sector";
}

async function fetchInternal(path: string, req?: Request): Promise<any> {
  try {
    // 1순위: 요청 헤더에서 host 추출 (가장 정확)
    let baseUrl: string;
    if (req) {
      const host = req.headers.get("host");
      const proto = req.headers.get("x-forwarded-proto") ?? "https";
      baseUrl = host ? `${proto}://${host}` : "";
    } else {
      baseUrl = "";
    }
    
    // 2순위: VERCEL_URL 환경변수
    if (!baseUrl && process.env.VERCEL_URL) {
      baseUrl = `https://${process.env.VERCEL_URL}`;
    }
    
    // 3순위: NEXT_PUBLIC_SITE_URL (fallback)
    if (!baseUrl && process.env.NEXT_PUBLIC_SITE_URL) {
      baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
    }
    
    // 4순위: localhost
    if (!baseUrl) {
      baseUrl = "http://localhost:3000";
    }
    
    const res = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(25000),
      headers: { "User-Agent": "Internal-Fetch" },
    });
    if (!res.ok) {
      console.warn(`[position-guide] ${path} → HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`[position-guide] ${path} 실패`, e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// GET
// ═══════════════════════════════════════════════════════════
export async function GET(req: Request) {
  try {
    // 1. 모든 데이터 병렬 수집 (req 전달로 올바른 URL 사용)
    const [portfolio, risk, briefing, sector, news, calendar, earnings] = await Promise.all([
      fetchInternal("/api/portfolio", req),
      fetchInternal("/api/portfolio-risk", req),
      fetchInternal("/api/daily-briefing", req),
      fetchInternal("/api/sector-scanner", req),
      fetchInternal("/api/news-sentiment", req),
      fetchInternal("/api/economic-calendar", req),
      fetchInternal("/api/earnings-monitor", req),
    ]);

    const guides: PositionGuide[] = [];

    // ─────────────────────────────────────────────
    // 1. 포트폴리오 기반 가이드
    // ─────────────────────────────────────────────
    const holdings = portfolio?.holdings ?? [];
    const totalValue = portfolio?.summary?.totalValue ?? 0;
    const totalGainPct = portfolio?.summary?.totalGainPct ?? 0;
    const riskScore = risk?.overallRiskScore ?? 0;

    // 고수익 차익실현 기회
    for (const h of holdings) {
      const gainPct = h.gainPct ?? 0;
      if (gainPct > 50) {
        guides.push({
          urgency: "this_week",
          priority: 3,
          icon: "💎",
          title: `${h.name || h.symbol} 대박 수익 (${gainPct.toFixed(0)}%)`,
          action: "일부 차익실현 고려 (30-50%)",
          reason: `50% 이상 수익 중 - 이익 확정으로 원금 리스크 제거. 나머지는 long-term 보유`,
          targetSymbol: h.symbol,
          confidence: 75,
          category: "portfolio",
        });
      } else if (gainPct < -15) {
        guides.push({
          urgency: "today",
          priority: 2,
          icon: "🚨",
          title: `${h.name || h.symbol} 손실 ${gainPct.toFixed(0)}%`,
          action: "손절 or 물타기 결정 필요",
          reason: "15% 이상 손실 중 - 펀더멘털 변화 없으면 추가 매수, 변화 있으면 손절",
          targetSymbol: h.symbol,
          confidence: 65,
          category: "portfolio",
        });
      }
    }

    // 포트폴리오 집중도 경고
    if (holdings.length <= 2 && totalValue > 1000) {
      guides.push({
        urgency: "this_week",
        priority: 3,
        icon: "🎯",
        title: "포트폴리오 분산 필요",
        action: "다른 섹터/지역 3-5종목 추가 매수",
        reason: `현재 ${holdings.length}개 종목 집중 - 개별 종목 리스크 높음. 반도체/AI ETF, 채권, 금 등 분산 추천`,
        confidence: 85,
        category: "portfolio",
      });
    }

    // 리스크 스코어 높음
    if (riskScore > 60) {
      guides.push({
        urgency: "today",
        priority: 2,
        icon: "⚠️",
        title: `리스크 점수 ${riskScore}/100 경고`,
        action: "포지션 축소 또는 헤지 설정",
        reason: "현재 포트폴리오 리스크 높음 - 일부 현금화 or TLT/금 헤지 고려",
        confidence: 80,
        category: "portfolio",
      });
    }

    // ─────────────────────────────────────────────
    // 2. 매크로 기반 가이드
    // ─────────────────────────────────────────────
    const vix = briefing?.macro?.vix;
    const tnx = briefing?.macro?.tnx;
    const krw = briefing?.macro?.krw;

    if (vix !== null && vix !== undefined) {
      if (vix > 25) {
        guides.push({
          urgency: "immediate",
          priority: 1,
          icon: "😱",
          title: `VIX ${vix.toFixed(1)} - 공포 구간`,
          action: "역발상 매수 기회 탐색 (SPY/QQQ 저가매수)",
          reason: "VIX 25 초과 시 과거 90% 확률로 3-6개월 후 반등. 분할 매수 시작",
          confidence: 70,
          category: "macro",
        });
      } else if (vix < 13) {
        guides.push({
          urgency: "this_week",
          priority: 3,
          icon: "😌",
          title: `VIX ${vix.toFixed(1)} - 극저 구간 (과열)`,
          action: "보험용 풋옵션 or VXX 저가매수",
          reason: "VIX 13 미만 시 변동성 확대 임박 신호 - 저렴한 보험 기회",
          confidence: 65,
          category: "macro",
        });
      }
    }

    // 환율 극단
    if (krw && krw > 1480) {
      guides.push({
        urgency: "this_week",
        priority: 3,
        icon: "💱",
        title: `USD/KRW ₩${Math.round(krw)} - 원화 초약세`,
        action: "한국 수출주(삼성전자, 현대차) 매수 or ETF 환차익 실현",
        reason: "원화 약세는 한국 수출 기업 수혜. 달러 표시 자산(TIGER S&P500) 환차익 실현 고려",
        confidence: 70,
        category: "macro",
      });
    } else if (krw && krw < 1350) {
      guides.push({
        urgency: "monitor",
        priority: 4,
        icon: "💱",
        title: `USD/KRW ₩${Math.round(krw)} - 원화 강세`,
        action: "달러 자산 추가 매수 기회",
        reason: "원화 강세는 달러 자산 저가 매수 타이밍",
        confidence: 65,
        category: "macro",
      });
    }

    // 금리 극단
    if (tnx !== null && tnx !== undefined) {
      if (tnx > 4.7) {
        guides.push({
          urgency: "today",
          priority: 2,
          icon: "📈",
          title: `10년물 ${tnx.toFixed(2)}% - 고금리 부담`,
          action: "성장주 비중 축소, 배당주/가치주 비중 확대",
          reason: "금리 4.7% 초과 시 PER 높은 기술주 타격. XLU/VYM 등 방어적",
          confidence: 70,
          category: "macro",
        });
      }
    }

    // ─────────────────────────────────────────────
    // 3. 섹터 기반 가이드
    // ─────────────────────────────────────────────
    if (sector?.success) {
      const strongSells = sector.results?.strongSells ?? [];
      const strongBuys = sector.results?.strongBuys ?? [];
      const unusualActivity = sector.unusualActivity ?? [];

      for (const r of strongSells.slice(0, 1)) {
        guides.push({
          urgency: "today",
          priority: 2,
          icon: "📉",
          title: `${r.symbol} 약세 시그널 강력 (${r.score})`,
          action: "보유 중이면 매도, 미보유 매수 금지",
          reason: r.rationale || "Max Pain 하락 압력 + 옵션 불균형",
          targetSymbol: r.symbol,
          targetPrice: r.currentPrice,
          confidence: Math.min(85, 60 + Math.abs(r.score)),
          category: "sector",
        });
      }

      for (const r of strongBuys.slice(0, 1)) {
        guides.push({
          urgency: "this_week",
          priority: 3,
          icon: "📈",
          title: `${r.symbol} 강세 시그널 (+${r.score})`,
          action: "분할 매수 고려 (2-3회 나눠서)",
          reason: r.rationale || "Max Pain 상승 + 긍정적 옵션 포지션",
          targetSymbol: r.symbol,
          targetPrice: r.currentPrice,
          confidence: Math.min(80, 55 + r.score),
          category: "sector",
        });
      }

      // 비정상 활동
      for (const u of unusualActivity.slice(0, 1)) {
        const isPutHeavy = u.putCallVolRatio > 2;
        guides.push({
          urgency: isPutHeavy ? "today" : "this_week",
          priority: isPutHeavy ? 2 : 3,
          icon: isPutHeavy ? "🚨" : "🔥",
          title: `${u.symbol} P/C ${u.putCallVolRatio.toFixed(1)} 비정상 활동`,
          action: isPutHeavy
            ? "대량 풋 매수 감지 - 보유 중이면 경계"
            : "옵션 활동 급증 - 큰 이벤트 임박 가능성",
          reason: isPutHeavy
            ? "기관의 대량 풋 매수는 하락 베팅 or 헤지 신호"
            : "비정상적 옵션 거래는 내부자 정보 or 이벤트 예고",
          targetSymbol: u.symbol,
          confidence: 65,
          category: "sector",
        });
      }
    }

    // ─────────────────────────────────────────────
    // 4. 뉴스 기반 가이드
    // ─────────────────────────────────────────────
    if (news?.success) {
      const overallSentiment = news.overallSentiment;
      const topBearish = news.topBearish ?? [];
      const highImpact = news.highImpact ?? [];

      if (overallSentiment === "bearish" && news.avgScore < -5) {
        guides.push({
          urgency: "today",
          priority: 2,
          icon: "📰",
          title: `섹터 뉴스 약세 (평균 ${news.avgScore})`,
          action: "신규 매수 보류, 기존 포지션 점검",
          reason: `부정 ${news.counts.negative}건 vs 긍정 ${news.counts.positive}건 - 시장 심리 악화`,
          confidence: 65,
          category: "news",
        });
      }

      // 특정 종목 강한 부정 뉴스
      for (const n of topBearish.slice(0, 2)) {
        if (n.score <= -15 && holdings.some((h: any) => h.symbol === n.symbol)) {
          guides.push({
            urgency: "today",
            priority: 1,
            icon: "🚨",
            title: `보유 종목 ${n.symbol} 강력 부정 뉴스`,
            action: "즉시 검토 - 손절 or 관망 결정",
            reason: n.title?.slice(0, 100) || "부정적 뉴스",
            targetSymbol: n.symbol,
            confidence: 75,
            category: "news",
          });
        }
      }
    }

    // ─────────────────────────────────────────────
    // 5. 실적 기반 가이드
    // ─────────────────────────────────────────────
    if (earnings?.success) {
      const directImpact = earnings.directImpact ?? [];
      const indirectImpact = earnings.indirectImpact ?? [];
      const highRisk = earnings.highRisk ?? [];

      for (const w of directImpact.slice(0, 2)) {
        if (w.daysUntil <= 3 && w.daysUntil >= 0) {
          guides.push({
            urgency: w.daysUntil <= 1 ? "immediate" : "today",
            priority: w.daysUntil <= 1 ? 1 : 2,
            icon: "📊",
            title: `${w.symbol} 실적 D-${w.daysUntil}`,
            action: w.preEarningsAction,
            reason: `보유 종목 실적 발표 임박 - ±${w.expectedMove?.toFixed(0) || "?"}$ 변동 예상`,
            targetSymbol: w.symbol,
            confidence: 85,
            category: "earnings",
          });
        }
      }

      // 간접 영향 종목 (이번 주)
      const thisWeekIndirect = indirectImpact.filter((w: any) => w.daysUntil <= 7 && w.importance >= 5);
      if (thisWeekIndirect.length >= 2) {
        guides.push({
          urgency: "this_week",
          priority: 3,
          icon: "📊",
          title: `이번 주 대형주 실적 ${thisWeekIndirect.length}건`,
          action: "ETF 변동성 확대 예상 - 신규 매수 조심",
          reason: thisWeekIndirect.map((w: any) => `${w.symbol} D-${w.daysUntil}`).join(", "),
          confidence: 75,
          category: "earnings",
        });
      }
    }

    // ─────────────────────────────────────────────
    // 6. 임박 이벤트 (FOMC 등)
    // ─────────────────────────────────────────────
    if (calendar?.success) {
      const nextMajor = calendar.nextMajor;
      if (nextMajor && nextMajor.importance >= 5 && nextMajor.daysUntil <= 7) {
        guides.push({
          urgency: nextMajor.daysUntil <= 2 ? "immediate" : "this_week",
          priority: nextMajor.daysUntil <= 2 ? 1 : 2,
          icon: "🏛️",
          title: `${nextMajor.title} D-${nextMajor.daysUntil}`,
          action: "포지션 축소 or 헤지 검토",
          reason: nextMajor.expectedImpact || "시장 전반 변동성 확대 예상",
          confidence: 85,
          category: "macro",
        });
      }
    }

    // ─────────────────────────────────────────────
    // 정렬 (긴급도 + 우선순위)
    // ─────────────────────────────────────────────
    const urgencyOrder = { immediate: 0, today: 1, this_week: 2, monitor: 3 };
    guides.sort((a, b) => {
      const ua = urgencyOrder[a.urgency];
      const ub = urgencyOrder[b.urgency];
      if (ua !== ub) return ua - ub;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return b.confidence - a.confidence;
    });

    // 종합 상황 평가
    const immediateCount = guides.filter(g => g.urgency === "immediate").length;
    const todayCount = guides.filter(g => g.urgency === "today").length;
    
    const overallState: "urgent" | "active" | "monitor" | "calm" = 
      immediateCount >= 2 ? "urgent" :
      immediateCount >= 1 || todayCount >= 3 ? "active" :
      todayCount >= 1 || guides.length >= 3 ? "monitor" :
      "calm";

    const stateMessage = 
      overallState === "urgent" ? "🚨 긴급 조치 필요" :
      overallState === "active" ? "⚡ 적극적 대응 권장" :
      overallState === "monitor" ? "👁️ 면밀 관찰 필요" :
      "✅ 평상 유지 가능";

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      overallState,
      stateMessage,
      totalGuides: guides.length,
      counts: {
        immediate: immediateCount,
        today: todayCount,
        thisWeek: guides.filter(g => g.urgency === "this_week").length,
        monitor: guides.filter(g => g.urgency === "monitor").length,
      },
      byCategory: {
        portfolio: guides.filter(g => g.category === "portfolio").length,
        macro: guides.filter(g => g.category === "macro").length,
        earnings: guides.filter(g => g.category === "earnings").length,
        news: guides.filter(g => g.category === "news").length,
        sector: guides.filter(g => g.category === "sector").length,
      },
      guides: guides.slice(0, 10), // Top 10
      contextSummary: {
        portfolioValue: totalValue,
        portfolioGainPct: totalGainPct,
        riskScore,
        vix,
        tnx,
        krw,
        newsAvgScore: news?.avgScore ?? 0,
        sectorDirection: sector?.sectorDirection ?? "unknown",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      overallState: "calm",
      stateMessage: "데이터 수집 중...",
      totalGuides: 0,
      guides: [],
      counts: { immediate: 0, today: 0, thisWeek: 0, monitor: 0 },
      byCategory: { portfolio: 0, macro: 0, earnings: 0, news: 0, sector: 0 },
    });
  }
}
