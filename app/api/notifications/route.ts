import { NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// 통합 알림 센터 API
// 매크로 / 포트폴리오 / 가격 / 뉴스 / 시그널을 하나로
// 중요도(priority 1-10)와 시간순으로 정렬
// ═══════════════════════════════════════════════════════════

interface Notification {
  id: string;
  type: "macro" | "portfolio" | "price" | "news" | "signal" | "option" | "system";
  priority: number; // 1 (최고) ~ 10 (최저)
  severity: "critical" | "warning" | "info" | "opportunity" | "success";
  icon: string;
  title: string;
  message: string;
  symbol?: string;
  value?: number;
  change?: number;
  timestamp: string;
  actionUrl?: string;
  dismissable: boolean;
}

export async function GET() {
  try {
    const supabase = createAdmin();
    const notifications: Notification[] = [];
    const now = new Date().toISOString();

    // ─────────────────────────────────────────────
    // 1. 매크로 데이터 (Today's View와 연동)
    // ─────────────────────────────────────────────
    const macroSymbols = ["CL=F", "^TNX", "^VIX", "DX-Y.NYB", "KRW=X", "^NDX", "SOXX"];
    const macroQuotes = await fetchYahooQuotes(macroSymbols);

    const macro = {
      oil: macroQuotes.get("CL=F"),
      yield10: macroQuotes.get("^TNX"),
      vix: macroQuotes.get("^VIX"),
      dxy: macroQuotes.get("DX-Y.NYB"),
      usdKrw: macroQuotes.get("KRW=X"),
      ndx: macroQuotes.get("^NDX"),
      soxx: macroQuotes.get("SOXX"),
    };

    // USD/KRW 1400원 이상 = Priority 2
    if (macro.usdKrw?.price && macro.usdKrw.price > 1450) {
      notifications.push({
        id: `macro-krw-${Date.now()}`,
        type: "macro",
        priority: 2,
        severity: "opportunity",
        icon: "💱",
        title: "USD/KRW 초강세 구간",
        message: `${macro.usdKrw.price.toFixed(0)}원 - 삼성·SK하이닉스 수출 수혜 극대화. 외화환산 이익 Q2 대폭 반영 예상`,
        value: macro.usdKrw.price,
        change: macro.usdKrw.changePct,
        timestamp: now,
        dismissable: false,
      });
    }

    // VIX 급등 (25+) = Priority 1
    if (macro.vix?.price && macro.vix.price > 25) {
      notifications.push({
        id: `macro-vix-high-${Date.now()}`,
        type: "macro",
        priority: 1,
        severity: "warning",
        icon: "🚨",
        title: "VIX 급등 - 시장 공포 확대",
        message: `${macro.vix.price.toFixed(2)} - 공포지수 25 돌파, 포지션 축소/헤지 검토 필요`,
        value: macro.vix.price,
        timestamp: now,
        dismissable: false,
      });
    }

    // VIX 극저 (< 13) 경계
    if (macro.vix?.price && macro.vix.price < 13) {
      notifications.push({
        id: `macro-vix-low-${Date.now()}`,
        type: "macro",
        priority: 3,
        severity: "warning",
        icon: "⚠️",
        title: "VIX 극저 - 낙관 과열 경계",
        message: `${macro.vix.price.toFixed(2)} - 꼬리 리스크 미반영, 풋 옵션 보험 고려`,
        value: macro.vix.price,
        timestamp: now,
        dismissable: false,
      });
    }

    // 반도체 ETF 급등
    if (macro.soxx?.changePct !== null && macro.soxx?.changePct !== undefined) {
      if (macro.soxx.changePct > 3) {
        notifications.push({
          id: `macro-soxx-up-${Date.now()}`,
          type: "macro",
          priority: 3,
          severity: "success",
          icon: "🚀",
          title: "반도체 섹터 강력 랠리",
          message: `SOXX +${macro.soxx.changePct.toFixed(2)}% - 섹터 전반 강세, 관련 포지션 점검 권장`,
          value: macro.soxx.price,
          change: macro.soxx.changePct,
          timestamp: now,
          dismissable: true,
        });
      } else if (macro.soxx.changePct < -3) {
        notifications.push({
          id: `macro-soxx-down-${Date.now()}`,
          type: "macro",
          priority: 2,
          severity: "opportunity",
          icon: "🎯",
          title: "반도체 섹터 조정 - 역발상 기회",
          message: `SOXX ${macro.soxx.changePct.toFixed(2)}% - Daniel Yoo 프레임워크: AI 슈퍼사이클 중 조정은 매수 기회`,
          value: macro.soxx.price,
          change: macro.soxx.changePct,
          timestamp: now,
          dismissable: true,
        });
      }
    }

    // 금리 급변
    if (macro.yield10?.changePct !== null && macro.yield10?.changePct !== undefined) {
      if (Math.abs(macro.yield10.changePct) > 3) {
        notifications.push({
          id: `macro-yield-${Date.now()}`,
          type: "macro",
          priority: 2,
          severity: macro.yield10.changePct < 0 ? "opportunity" : "warning",
          icon: macro.yield10.changePct < 0 ? "📉" : "📈",
          title: `10Y 국채 금리 ${macro.yield10.changePct < 0 ? "급락" : "급등"}`,
          message: `${macro.yield10.price.toFixed(2)}% (${macro.yield10.changePct >= 0 ? "+" : ""}${macro.yield10.changePct.toFixed(2)}%) - 성장주 ${macro.yield10.changePct < 0 ? "수혜" : "부담"} 예상`,
          value: macro.yield10.price,
          change: macro.yield10.changePct,
          timestamp: now,
          dismissable: true,
        });
      }
    }

    // 원유 급등 (95+)
    if (macro.oil?.price && macro.oil.price > 95) {
      notifications.push({
        id: `macro-oil-${Date.now()}`,
        type: "macro",
        priority: 3,
        severity: "warning",
        icon: "🛢️",
        title: "WTI 원유 급등",
        message: `$${macro.oil.price.toFixed(2)} - 인플레이션 압박 가능성, 공정비 증가 우려`,
        value: macro.oil.price,
        change: macro.oil.changePct ?? undefined,
        timestamp: now,
        dismissable: true,
      });
    }

    // ─────────────────────────────────────────────
    // 2. 포트폴리오 급변동
    // ─────────────────────────────────────────────
    try {
      const { data: holdings } = await supabase
        .from("portfolio_holdings")
        .select("*")
        .eq("is_active", true);

      if (holdings && holdings.length > 0) {
        const symbols = [...new Set(holdings.map((h) => h.symbol))];
        const stockQuotes = await fetchYahooQuotes(symbols);

        for (const h of holdings) {
          const q = stockQuotes.get(h.symbol);
          if (!q?.price || !q?.changePct) continue;

          const cost = h.shares * h.avg_cost;
          const value = h.shares * q.price;
          const gain = value - cost;
          const gainPct = (gain / cost) * 100;

          // 일일 5%+ 급등 = Priority 2
          if (q.changePct > 5) {
            notifications.push({
              id: `port-up-${h.id}-${Date.now()}`,
              type: "portfolio",
              priority: 2,
              severity: "success",
              icon: "🚀",
              title: `${h.symbol} 급등`,
              message: `${h.name || h.symbol} +${q.changePct.toFixed(2)}% · 현재 평가 수익 ${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}% (${gain >= 0 ? "+" : ""}${h.currency === "KRW" ? "₩" : "$"}${Math.abs(gain).toLocaleString(undefined, { maximumFractionDigits: 0 })})`,
              symbol: h.symbol,
              value: q.price,
              change: q.changePct,
              timestamp: now,
              dismissable: false,
            });
          }

          // 일일 -5% 이하 급락 = Priority 1
          if (q.changePct < -5) {
            notifications.push({
              id: `port-down-${h.id}-${Date.now()}`,
              type: "portfolio",
              priority: 1,
              severity: "critical",
              icon: "📉",
              title: `${h.symbol} 급락 경보`,
              message: `${h.name || h.symbol} ${q.changePct.toFixed(2)}% · 뉴스/실적 확인 필수 · 현재 평가 ${gainPct >= 0 ? "+" : ""}${gainPct.toFixed(1)}%`,
              symbol: h.symbol,
              value: q.price,
              change: q.changePct,
              timestamp: now,
              dismissable: false,
            });
          }

          // 목표 수익 달성 (+30%)
          if (gainPct > 30 && gainPct < 31) {
            notifications.push({
              id: `port-target-${h.id}-${Date.now()}`,
              type: "portfolio",
              priority: 3,
              severity: "success",
              icon: "🎯",
              title: `${h.symbol} 목표 수익률 달성`,
              message: `평가 수익 +${gainPct.toFixed(1)}% · 일부 이익실현 검토 구간`,
              symbol: h.symbol,
              value: q.price,
              timestamp: now,
              dismissable: true,
            });
          }

          // 손실 경고 (-20%)
          if (gainPct < -20) {
            notifications.push({
              id: `port-loss-${h.id}-${Date.now()}`,
              type: "portfolio",
              priority: 2,
              severity: "warning",
              icon: "⚠️",
              title: `${h.symbol} 손실 확대`,
              message: `평가 손실 ${gainPct.toFixed(1)}% · 투자 논리 재점검 필요 (매수 평균단가 대비)`,
              symbol: h.symbol,
              value: q.price,
              timestamp: now,
              dismissable: true,
            });
          }
        }
      }
    } catch (e) {
      // 포트폴리오 테이블 없으면 스킵
    }

    // ─────────────────────────────────────────────
    // 3. 기존 alerts 테이블의 활성 알림
    // ─────────────────────────────────────────────
    try {
      const { data: recentTriggers } = await supabase
        .from("alert_triggers")
        .select("*, alerts!inner(symbol, alert_type, threshold, message)")
        .order("triggered_at", { ascending: false })
        .limit(10);

      for (const t of recentTriggers ?? []) {
        const alert = (t as any).alerts;
        if (!alert) continue;
        notifications.push({
          id: `alert-${t.id}`,
          type: "price",
          priority: 3,
          severity: "info",
          icon: "🔔",
          title: `${alert.symbol} 가격 알림`,
          message: `${alert.message || `${alert.alert_type} ${alert.threshold} 도달`} · 트리거 시점: $${t.price_at_trigger?.toFixed(2)}`,
          symbol: alert.symbol,
          value: t.price_at_trigger,
          timestamp: t.triggered_at,
          dismissable: true,
        });
      }
    } catch (e) {
      // alert_triggers 접근 실패 시 스킵
    }

    // ─────────────────────────────────────────────
    // 4. 최근 고감성 뉴스
    // ─────────────────────────────────────────────
    try {
      const { data: recentNews } = await supabase
        .from("news_sentiment_daily")
        .select("*")
        .gte("date", new Date(Date.now() - 86400000).toISOString().split("T")[0]) // 24시간
        .order("avg_sentiment", { ascending: false })
        .limit(5);

      for (const n of recentNews ?? []) {
        // 극단적 감성만 (|sentiment| > 0.5)
        if (Math.abs(n.avg_sentiment) < 0.5) continue;

        const isPositive = n.avg_sentiment > 0;
        notifications.push({
          id: `news-${n.id}`,
          type: "news",
          priority: 4,
          severity: isPositive ? "success" : "warning",
          icon: isPositive ? "📰" : "📰",
          title: `${n.symbol} 뉴스 감성 ${isPositive ? "긍정" : "부정"}`,
          message: `24시간 평균 감성 ${n.avg_sentiment >= 0 ? "+" : ""}${n.avg_sentiment.toFixed(2)} · 긍정 ${n.positive_count} / 부정 ${n.negative_count} / 중립 ${n.neutral_count}${n.top_keywords?.length ? ` · 키워드: ${n.top_keywords.slice(0, 3).join(", ")}` : ""}`,
          symbol: n.symbol,
          value: n.avg_sentiment,
          timestamp: n.date + "T12:00:00Z",
          dismissable: true,
        });
      }
    } catch (e) {
      // 뉴스 감성 접근 실패 시 스킵
    }

    // ─────────────────────────────────────────────
    // 5. 에이전트 합의 강한 매수/매도 시그널
    // ─────────────────────────────────────────────
    try {
      const { data: decisions } = await supabase
        .from("portfolio_decisions")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(50);

      const seenSymbols = new Set<string>();
      for (const d of decisions ?? []) {
        if (seenSymbols.has(d.symbol)) continue;
        seenSymbols.add(d.symbol);

        // 매우 강한 합의만 (score |20|+ AND agreement 80%+)
        if (Math.abs(d.final_score) >= 20 && d.agreement_level >= 80) {
          notifications.push({
            id: `agent-${d.id}`,
            type: "signal",
            priority: 3,
            severity: d.final_score > 0 ? "success" : "warning",
            icon: d.final_score > 0 ? "🤖" : "🤖",
            title: `AI 에이전트 ${d.final_score > 0 ? "강력 매수" : "강력 매도"} 합의: ${d.symbol}`,
            message: `19명 중 ${d.agreement_level}% 합의 · 점수 ${d.final_score >= 0 ? "+" : ""}${d.final_score} · 판정: ${d.final_vote}`,
            symbol: d.symbol,
            value: d.final_score,
            timestamp: d.timestamp,
            dismissable: true,
          });
        }
      }
    } catch (e) {
      // 에이전트 합의 접근 실패 시 스킵
    }

    // ─────────────────────────────────────────────
    // 6. 예측 정확도 검증 완료된 최근 예측
    // ─────────────────────────────────────────────
    try {
      const { data: recentEval } = await supabase
        .from("forecast_accuracy")
        .select("*")
        .gte("evaluated_at", new Date(Date.now() - 3 * 86400000).toISOString())
        .order("evaluated_at", { ascending: false })
        .limit(5);

      // 특이하게 빗나간 예측 하이라이트
      for (const e of recentEval ?? []) {
        if (Math.abs(e.absolute_percent_error) > 10) {
          notifications.push({
            id: `forecast-${e.id}`,
            type: "system",
            priority: 5,
            severity: "info",
            icon: "🎯",
            title: `예측 오차 검증: ${e.symbol}`,
            message: `${e.horizon_days}일 전 예측 vs 실제 - 오차 ${e.absolute_percent_error.toFixed(1)}% (예측값 ${e.forecast_value.toFixed(2)} vs 실제 ${e.actual_value.toFixed(2)})`,
            symbol: e.symbol,
            timestamp: e.evaluated_at,
            dismissable: true,
          });
        }
      }
    } catch (e) {
      // 스킵
    }

    // ─────────────────────────────────────────────
    // 정렬: Priority → Timestamp
    // ─────────────────────────────────────────────
    notifications.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    // 통계
    const stats = {
      total: notifications.length,
      critical: notifications.filter((n) => n.severity === "critical").length,
      warnings: notifications.filter((n) => n.severity === "warning").length,
      opportunities: notifications.filter((n) => n.severity === "opportunity").length,
      successes: notifications.filter((n) => n.severity === "success").length,
      byType: {
        macro: notifications.filter((n) => n.type === "macro").length,
        portfolio: notifications.filter((n) => n.type === "portfolio").length,
        price: notifications.filter((n) => n.type === "price").length,
        news: notifications.filter((n) => n.type === "news").length,
        signal: notifications.filter((n) => n.type === "signal").length,
        option: notifications.filter((n) => n.type === "option").length,
        system: notifications.filter((n) => n.type === "system").length,
      },
    };

    return NextResponse.json({
      success: true,
      timestamp: now,
      notifications,
      stats,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
