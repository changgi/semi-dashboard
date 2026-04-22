import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// Price Alerts Monitor Cron
// 
// 5분마다 실행 (vercel.json schedule: "*/5 * * * *")
// 
// 처리:
// 1. is_active=true & triggered_at=null 알림 조회
// 2. 심볼 시세 일괄 조회
// 3. 조건 충족 → triggered_at, triggered_price 기록
// 4. Smart Alerts History에도 저장 (통합 이력)
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  return runCheck();
}

export async function POST(req: NextRequest) {
  return runCheck();
}

async function runCheck() {
  const startTime = Date.now();
  const supabase = createAdmin();
  
  try {
    // 미트리거 + 활성 알림 조회
    const { data: alerts } = await supabase
      .from("price_alerts")
      .select("*")
      .eq("is_active", true)
      .is("triggered_at", null);
    
    if (!alerts || alerts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "체크할 알림 없음",
        elapsedMs: Date.now() - startTime,
      });
    }
    
    // 심볼 일괄 조회
    const symbols = [...new Set(alerts.map((a: any) => a.symbol))];
    const quotes = await fetchYahooQuotes(symbols);
    
    let triggered = 0;
    const triggeredList: any[] = [];
    
    for (const alert of alerts) {
      const quote = quotes.get(alert.symbol);
      if (!quote) continue;
      
      const currentPrice = quote.price;
      let isTriggered = false;
      
      if (alert.alert_type === "above") {
        isTriggered = currentPrice >= alert.target_value;
      } else if (alert.alert_type === "below") {
        isTriggered = currentPrice <= alert.target_value;
      } else if (alert.alert_type === "percent_up" && alert.base_price) {
        const pctChange = ((currentPrice - alert.base_price) / alert.base_price) * 100;
        isTriggered = pctChange >= alert.target_value;
      } else if (alert.alert_type === "percent_down" && alert.base_price) {
        const pctChange = ((alert.base_price - currentPrice) / alert.base_price) * 100;
        isTriggered = pctChange >= alert.target_value;
      }
      
      if (isTriggered) {
        // 트리거 기록
        await supabase
          .from("price_alerts")
          .update({
            triggered_at: new Date().toISOString(),
            triggered_price: currentPrice,
          })
          .eq("id", alert.id);
        
        // Smart Alerts History에도 저장
        const alertIdStable = `price-alert-${alert.id}`;
        const severity = alert.alert_type.includes("down") || alert.alert_type === "below" ? "warning" : "opportunity";
        
        await supabase.from("smart_alerts_history").upsert({
          alert_id: alertIdStable,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          occurrence_count: 1,
          category: "portfolio",
          severity,
          title: alert.title ?? `${alert.symbol} ${alert.alert_type === "above" ? "↑" : "↓"} $${alert.target_value}`,
          icon: severity === "warning" ? "🛑" : "💰",
          what_happened: `${alert.symbol} 현재가 $${currentPrice.toFixed(2)} · 목표 $${alert.target_value} 도달`,
          why_it_matters: alert.note ?? "사전 설정한 가격 알림이 트리거됨",
          what_to_do: alert.action_suggestion ?? "해당 종목 포지션 점검 필요",
          affected_symbols: [alert.symbol],
          related_to_portfolio: true,
          confidence: 100,
        }, {
          onConflict: "alert_id",
          ignoreDuplicates: false,
        });
        
        triggered++;
        triggeredList.push({
          symbol: alert.symbol,
          type: alert.alert_type,
          target: alert.target_value,
          current: currentPrice,
          title: alert.title,
        });
      }
    }
    
    return NextResponse.json({
      success: true,
      checked: alerts.length,
      triggered,
      triggeredList,
      elapsedMs: Date.now() - startTime,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      elapsedMs: Date.now() - startTime,
    });
  }
}
