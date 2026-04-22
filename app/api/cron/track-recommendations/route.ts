import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ═══════════════════════════════════════════════════════════
// Recommendation Tracking Accuracy Evaluator
// 
// 매일 03:00 KST 실행 (cron: "0 18 * * *" UTC)
// 
// 처리:
// 1. 1일 경과 → price_1d 업데이트
// 2. 7일 경과 → price_7d 업데이트  
// 3. 30일 경과 → price_30d + was_correct + if_followed_pnl 계산
// 4. Trade Journal과 매칭하여 was_executed 자동 설정
// 
// BUY 추천 정확도: price_30d > recommended_price → correct
// SELL 추천 정확도: price_30d < recommended_price → correct
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  return runTracking();
}

export async function POST(req: NextRequest) {
  return runTracking();
}

async function runTracking() {
  const startTime = Date.now();
  const supabase = createAdmin();
  
  try {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    
    const results = {
      price_1d_updated: 0,
      price_7d_updated: 0,
      price_30d_updated: 0,
      execution_matched: 0,
      correctness_evaluated: 0,
      errors: 0,
    };
    
    // ═══════════════════════════════════════
    // Step 1: 모든 미평가 추천 조회
    // ═══════════════════════════════════════
    const { data: allRecs } = await supabase
      .from("recommendation_tracking")
      .select("*")
      .or("price_1d.is.null,price_7d.is.null,price_30d.is.null")
      .gte("recommendation_date", new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0])
      .order("recommendation_date", { ascending: false });
    
    if (!allRecs || allRecs.length === 0) {
      return NextResponse.json({
        success: true,
        message: "처리할 추천 없음",
        elapsedMs: Date.now() - startTime,
      });
    }
    
    // ═══════════════════════════════════════
    // Step 2: 심볼별 시세 일괄 조회
    // ═══════════════════════════════════════
    const uniqueSymbols = [...new Set(allRecs.map((r: any) => r.symbol))];
    const quotes = await fetchYahooQuotes(uniqueSymbols);
    
    // ═══════════════════════════════════════
    // Step 3: 각 추천 업데이트
    // ═══════════════════════════════════════
    for (const rec of allRecs) {
      try {
        const recDate = new Date(rec.recommendation_date);
        const daysPassed = Math.floor((today.getTime() - recDate.getTime()) / 86400000);
        const currentQuote = quotes.get(rec.symbol);
        
        if (!currentQuote) continue;
        
        const updates: any = {};
        
        // 1일 경과
        if (daysPassed >= 1 && rec.price_1d === null) {
          updates.price_1d = currentQuote.price;
          results.price_1d_updated++;
        }
        
        // 7일 경과
        if (daysPassed >= 7 && rec.price_7d === null) {
          updates.price_7d = currentQuote.price;
          results.price_7d_updated++;
        }
        
        // 30일 경과: 최종 평가
        if (daysPassed >= 30 && rec.price_30d === null) {
          updates.price_30d = currentQuote.price;
          results.price_30d_updated++;
          
          // was_correct 판정
          const recPrice = rec.recommended_price;
          if (recPrice && recPrice > 0) {
            const priceChange = ((currentQuote.price - recPrice) / recPrice) * 100;
            
            if (rec.action === "BUY") {
              // BUY 추천: 가격 상승했으면 correct
              updates.was_correct = currentQuote.price > recPrice;
              // 추천 따랐다면 수익률
              updates.if_followed_pnl_pct = priceChange;
              updates.if_followed_pnl_usd = (rec.recommended_shares ?? 1) * (currentQuote.price - recPrice);
            } else if (rec.action === "SELL") {
              // SELL 추천: 가격 하락했으면 correct (회피한 손실)
              updates.was_correct = currentQuote.price < recPrice;
              // SELL의 경우 if_followed_pnl은 "회피한 손실" 관점
              updates.if_followed_pnl_pct = -priceChange;  // 하락했으면 양수 (이득)
              updates.if_followed_pnl_usd = (rec.recommended_shares ?? 1) * (recPrice - currentQuote.price);
            }
            
            updates.correctness_evaluated_at = new Date().toISOString();
            results.correctness_evaluated++;
          }
        }
        
        // ═══════════════════════════════════════
        // Trade Journal과 매칭 (was_executed 설정)
        // ═══════════════════════════════════════
        if (!rec.was_executed) {
          const windowStart = rec.recommendation_date;
          const windowEnd = new Date(recDate.getTime() + 3 * 86400000).toISOString().split("T")[0];
          
          const { data: matchingTrades } = await supabase
            .from("trade_journal")
            .select("id, trade_date, shares, price")
            .eq("symbol", rec.symbol)
            .eq("action", rec.action)
            .gte("trade_date", windowStart)
            .lte("trade_date", windowEnd)
            .limit(1);
          
          if (matchingTrades && matchingTrades.length > 0) {
            const trade = matchingTrades[0];
            updates.was_executed = true;
            updates.executed_at = trade.trade_date;
            updates.executed_price = trade.price;
            updates.executed_shares = trade.shares;
            updates.execution_source = `trade_journal:${trade.id}`;
            results.execution_matched++;
          }
        }
        
        // DB 업데이트
        if (Object.keys(updates).length > 0) {
          const { error } = await supabase
            .from("recommendation_tracking")
            .update(updates)
            .eq("id", rec.id);
          
          if (error) {
            console.error(`Update 실패 ${rec.id}:`, error.message);
            results.errors++;
          }
        }
      } catch (e) {
        console.error("Rec 처리 오류:", e);
        results.errors++;
      }
    }
    
    // ═══════════════════════════════════════
    // Step 4: Trade Journal의 price_after_7d/30d도 업데이트
    // ═══════════════════════════════════════
    const { data: journalRecords } = await supabase
      .from("trade_journal")
      .select("id, trade_date, symbol, price_after_7d, price_after_30d")
      .or("price_after_7d.is.null,price_after_30d.is.null")
      .gte("trade_date", new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0]);
    
    let journalUpdated = 0;
    for (const j of journalRecords ?? []) {
      try {
        const tradeDate = new Date(j.trade_date);
        const daysPassed = Math.floor((today.getTime() - tradeDate.getTime()) / 86400000);
        const quote = quotes.get(j.symbol);
        if (!quote) continue;
        
        const updates: any = {};
        if (daysPassed >= 7 && j.price_after_7d === null) {
          updates.price_after_7d = quote.price;
        }
        if (daysPassed >= 30 && j.price_after_30d === null) {
          updates.price_after_30d = quote.price;
        }
        
        if (Object.keys(updates).length > 0) {
          await supabase.from("trade_journal").update(updates).eq("id", j.id);
          journalUpdated++;
        }
      } catch {}
    }
    
    return NextResponse.json({
      success: true,
      totalRecs: allRecs.length,
      totalJournal: journalRecords?.length ?? 0,
      updates: results,
      journalUpdated,
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
