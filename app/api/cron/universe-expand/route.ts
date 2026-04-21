import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { fetchYahooSymbolInfo } from "@/lib/yahoo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ═══════════════════════════════════════════════════════════
// Symbol Universe Auto-Expand
// 
// 목적:
//   - 포트폴리오/실적/뉴스에 나온 종목 중 Universe에 없는 것 자동 등록
//   - Yahoo에서 기본 정보 수집 (회사명, 통화 등)
//   - 수동 한글명 보강이 가능한 기반 제공
// 
// 실행 조건:
//   - Cron (매일 16:30 KST)
//   - Admin 수동 호출 가능
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  // Cron 인증
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    const supabase = createAdmin();
    
    // ─────────────────────────────────────────────
    // 1. 여러 소스에서 심볼 수집
    // ─────────────────────────────────────────────
    const candidateSymbols = new Set<string>();
    
    // 1-1. 포트폴리오
    const { data: holdings } = await supabase
      .from("portfolio_holdings")
      .select("symbol, name")
      .eq("is_active", true);
    
    for (const h of (holdings ?? [])) {
      if (h.symbol) candidateSymbols.add(h.symbol);
    }
    
    // 1-2. 실적 일정
    const { data: earnings } = await supabase
      .from("earnings_schedule")
      .select("symbol");
    
    for (const e of (earnings ?? [])) {
      if (e.symbol) candidateSymbols.add(e.symbol);
    }
    
    // 1-3. Data Warehouse 스냅샷에서 추적 중인 심볼
    const { data: snapshots } = await supabase
      .from("data_snapshots")
      .select("symbol")
      .order("snapshot_date", { ascending: false })
      .limit(100);
    
    for (const s of (snapshots ?? [])) {
      if (s.symbol) candidateSymbols.add(s.symbol);
    }
    
    // ─────────────────────────────────────────────
    // 2. Universe에 이미 있는 것 제외
    // ─────────────────────────────────────────────
    const { data: existing } = await supabase
      .from("symbol_universe")
      .select("symbol")
      .in("symbol", [...candidateSymbols]);
    
    const existingSet = new Set((existing ?? []).map((e: any) => e.symbol));
    const missingSymbols = [...candidateSymbols].filter(s => !existingSet.has(s));
    
    // ─────────────────────────────────────────────
    // 3. Yahoo에서 기본 정보 수집
    // ─────────────────────────────────────────────
    const added: any[] = [];
    const failed: string[] = [];
    
    // 10개씩 배치
    for (let i = 0; i < Math.min(missingSymbols.length, 30); i++) {
      const symbol = missingSymbols[i];
      try {
        const info = await fetchYahooSymbolInfo(symbol);
        if (!info) {
          failed.push(symbol);
          continue;
        }
        
        const displayName = info.longName ?? info.shortName ?? symbol;
        
        // 한국 종목 판별
        const isKorean = symbol.endsWith(".KS") || symbol.endsWith(".KQ");
        const isTaiwan = symbol.endsWith(".TW");
        const isJapan = symbol.endsWith(".T");
        const country = isKorean ? "KR" : isTaiwan ? "TW" : isJapan ? "JP" : "US";
        const currency = info.currency ?? (isKorean ? "KRW" : isTaiwan ? "TWD" : isJapan ? "JPY" : "USD");
        const exchange = info.exchangeName ?? (isKorean ? (symbol.endsWith(".KQ") ? "KOSDAQ" : "KOSPI")
                        : isTaiwan ? "TWSE"
                        : isJapan ? "TSE"
                        : "NASDAQ");
        
        // ETF 여부 추정
        const isEtf = info.instrumentType === "ETF"
                   || /TIGER|KODEX|ARIRANG|KBSTAR|SPY|QQQ|ETF/i.test(displayName) 
                   || displayName.toUpperCase().includes("ETF");
        
        // DB 등록
        const { error } = await supabase
          .from("symbol_universe")
          .insert({
            symbol,
            name_en: displayName,
            name_ko: null,  // 수동 보강 대상
            exchange,
            country,
            currency,
            is_etf: isEtf,
            market_cap_tier: null,
            is_active: true,
            notes: "Auto-added by cron",
          });
        
        if (error) {
          failed.push(symbol);
        } else {
          added.push({ symbol, name: displayName, country, isEtf });
        }
      } catch (e) {
        failed.push(symbol);
      }
    }
    
    // ─────────────────────────────────────────────
    // 4. 통계 반환
    // ─────────────────────────────────────────────
    const { count: totalCount } = await supabase
      .from("symbol_universe")
      .select("*", { count: "exact", head: true });
    
    return NextResponse.json({
      success: true,
      candidatesScanned: candidateSymbols.size,
      alreadyRegistered: existingSet.size,
      newlyAdded: added.length,
      failed: failed.length,
      totalInUniverse: totalCount ?? 0,
      added,
      failedSymbols: failed,
      note: "한글명은 수동 보강 필요 (name_ko = NULL인 항목)",
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
