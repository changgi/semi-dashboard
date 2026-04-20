import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// ═══════════════════════════════════════════════════════════
// Symbol Search API
// 
// 검색 쿼리에 따라 S&P500/NASDAQ100/KOSPI100 + 반도체 전종목에서
// 매칭되는 종목 반환
// 
// Query Params:
//   q       : 검색어 (심볼 or 회사명)
//   index   : "sp500" | "nasdaq100" | "kospi100" | "semi" | "all" (default: all)
//   limit   : 최대 결과 (default: 10)
//   country : "US" | "KR" | "TW" 등 (optional)
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("q")?.trim() ?? "";
    const index = url.searchParams.get("index") ?? "all";
    const country = url.searchParams.get("country");
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "10"), 50);
    
    const supabase = createAdmin();
    
    let sb = supabase
      .from("symbol_universe")
      .select("symbol, name_ko, name_en, exchange, country, currency, in_sp500, in_nasdaq100, in_kospi100, is_semi, semi_category, gics_sector, gics_industry, market_cap_tier, is_etf, related_etfs")
      .eq("is_active", true);
    
    // 인덱스 필터
    if (index === "sp500") sb = sb.eq("in_sp500", true);
    else if (index === "nasdaq100") sb = sb.eq("in_nasdaq100", true);
    else if (index === "kospi100") sb = sb.eq("in_kospi100", true);
    else if (index === "semi") sb = sb.eq("is_semi", true);
    else if (index === "etf") sb = sb.eq("is_etf", true);
    
    // 국가 필터
    if (country) sb = sb.eq("country", country);
    
    // 검색 쿼리 (심볼 or 한글명 or 영문명)
    if (query) {
      const escaped = query.replace(/[%_]/g, "\\$&");
      sb = sb.or(`symbol.ilike.%${escaped}%,name_ko.ilike.%${escaped}%,name_en.ilike.%${escaped}%`);
    }
    
    // 정렬: 반도체 우선 → 인덱스 멤버십 → 심볼순
    sb = sb.order("is_semi", { ascending: false })
           .order("in_sp500", { ascending: false })
           .order("symbol", { ascending: true })
           .limit(limit);
    
    const { data, error } = await sb;
    
    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
        results: [],
      }, { status: 500 });
    }
    
    // 결과 정규화 (모든 화면 공통 양식)
    const results = (data ?? []).map((s: any) => ({
      symbol: s.symbol,
      displayName: s.name_ko || s.name_en || s.symbol,  // 표시용 우선 이름
      name_ko: s.name_ko,
      name_en: s.name_en,
      exchange: s.exchange,
      country: s.country,
      currency: s.currency,
      flag: countryFlag(s.country),
      indexes: [
        s.in_sp500 && "S&P500",
        s.in_nasdaq100 && "NASDAQ100",
        s.in_kospi100 && "KOSPI100",
      ].filter(Boolean),
      isSemi: s.is_semi,
      semiCategory: s.semi_category,
      sector: s.gics_sector,
      industry: s.gics_industry,
      marketCapTier: s.market_cap_tier,
      isEtf: s.is_etf,
      relatedEtfs: s.related_etfs ?? [],
      // 표시 헬퍼
      displayLabel: formatDisplayLabel(s),
    }));
    
    return NextResponse.json({
      success: true,
      count: results.length,
      query,
      index,
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
      count: 0,
      results: [],
    });
  }
}

function countryFlag(country: string | null): string {
  if (!country) return "";
  const flags: Record<string, string> = {
    US: "🇺🇸", KR: "🇰🇷", TW: "🇹🇼", JP: "🇯🇵", NL: "🇳🇱",
    UK: "🇬🇧", CA: "🇨🇦", CN: "🇨🇳", DE: "🇩🇪", FR: "🇫🇷",
  };
  return flags[country] ?? "🌍";
}

/**
 * 종목 표시 통일 포맷:
 * "🇺🇸 NVDA · 엔비디아 · NASDAQ · S&P500/NASDAQ100"
 */
function formatDisplayLabel(s: any): string {
  const parts = [countryFlag(s.country)];
  parts.push(s.symbol);
  if (s.name_ko && s.name_ko !== s.symbol) parts.push(s.name_ko);
  
  const badges: string[] = [];
  if (s.in_sp500) badges.push("S&P500");
  if (s.in_nasdaq100) badges.push("NASDAQ100");
  if (s.in_kospi100) badges.push("KOSPI100");
  if (s.is_semi) badges.push("🎮반도체");
  if (s.is_etf) badges.push("📊ETF");
  
  if (badges.length > 0) parts.push(`[${badges.join("/")}]`);
  
  return parts.join(" · ");
}
