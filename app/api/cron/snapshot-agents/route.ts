import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { runAllAgents, AgentContext, MacroContext } from "@/lib/agents";
import { fetchYahooQuotes } from "@/lib/yahoo";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  const { searchParams } = new URL(req.url);
  const debugKey = searchParams.get("key");

  const authorized =
    isVercelCron ||
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    debugKey === process.env.CRON_SECRET;

  if (process.env.NODE_ENV === "production" && !authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const supabase = createAdmin();

  const { data: runRow } = await supabase
    .from("cron_runs")
    .insert({ job_name: "snapshot-agents", started_at: new Date().toISOString() })
    .select("id")
    .single();

  try {
    // 1. 분석할 종목 목록
    const { data: tickers } = await supabase.from("tickers").select("symbol");
    const symbols = (tickers ?? []).map((t) => t.symbol);
    if (symbols.length === 0) throw new Error("No tickers");

    // 2. 매크로 데이터 (Daniel Yoo 에이전트용)
    const macroSymbols = ["CL=F", "^TNX", "^VIX", "DX-Y.NYB", "^NDX", "SOXX"];
    const macroQuotes = await fetchYahooQuotes(macroSymbols).catch(() => new Map());
    const macro: MacroContext = {
      oilPrice: macroQuotes.get("CL=F")?.price,
      yield10Y: macroQuotes.get("^TNX")?.price,
      vix: macroQuotes.get("^VIX")?.price,
      dxy: macroQuotes.get("DX-Y.NYB")?.price,
      ndxChangePct: macroQuotes.get("^NDX")?.changePct,
      soxxChangePct: macroQuotes.get("SOXX")?.changePct,
    };

    // 3. 분석 스냅샷 로드
    const { data: analyses } = await supabase
      .from("analysis_snapshots")
      .select("symbol, sector_beta, news_sentiment_7d")
      .in("symbol", symbols)
      .order("date", { ascending: false });

    const analysisMap = new Map<string, { sector_beta: number | null; news_sentiment_7d: number | null }>();
    for (const a of analyses ?? []) {
      if (!analysisMap.has(a.symbol)) analysisMap.set(a.symbol, a);
    }

    // 4. 펀더멘털 로드 (DB에서)
    const { data: fundamentalsData } = await supabase
      .from("fundamentals")
      .select("*")
      .in("symbol", symbols);

    interface FundamentalRow {
      symbol: string;
      pe_ratio: number | null;
      pb_ratio: number | null;
      dividend_yield: number | null;
      revenue_growth: number | null;
      profit_margin: number | null;
      debt_to_equity: number | null;
      roe: number | null;
      market_cap: number | null;
      segment: string | null;
    }

    const fundamentalsMap = new Map<string, FundamentalRow>();
    for (const f of (fundamentalsData as FundamentalRow[] | null) ?? []) {
      fundamentalsMap.set(f.symbol, f);
    }

    const opinionRows = [];
    const decisionRows = [];
    const now = new Date().toISOString();

    for (const sym of symbols) {
      // 일봉 데이터
      const { data: hist } = await supabase
        .from("price_history")
        .select("price, day_high, day_low, timestamp")
        .eq("symbol", sym)
        .eq("interval_type", "1day")
        .order("timestamp", { ascending: true })
        .limit(500);

      if (!hist || hist.length < 10) continue;

      const prices = hist.map((h) => h.price).filter((p) => p && p > 0);
      const highs = hist.map((h, i) => h.day_high ?? prices[i] ?? 0);
      const lows = hist.map((h, i) => h.day_low ?? prices[i] ?? 0);

      const snap = analysisMap.get(sym);
      const fund = fundamentalsMap.get(sym);

      const ctx: AgentContext = {
        symbol: sym,
        prices,
        highs,
        lows,
        currentPrice: prices[prices.length - 1],
        beta: snap?.sector_beta ?? 1.0,
        sentiment: snap?.news_sentiment_7d ?? 0,
        marketCap: fund?.market_cap ?? undefined,
        segment: fund?.segment ?? undefined,
        fundamentals: fund
          ? {
              peRatio: fund.pe_ratio ?? undefined,
              pbRatio: fund.pb_ratio ?? undefined,
              dividendYield: fund.dividend_yield ?? undefined,
              revenueGrowth: fund.revenue_growth ?? undefined,
              profitMargin: fund.profit_margin ?? undefined,
              debtToEquity: fund.debt_to_equity ?? undefined,
              roe: fund.roe ?? undefined,
            }
          : undefined,
        macro,
      };

      const { opinions, decision } = runAllAgents(ctx);

      // 에이전트 의견들 저장
      for (const op of opinions) {
        opinionRows.push({
          symbol: sym,
          agent: op.agent,
          agent_kr: op.agentKr,
          category: op.category,
          vote: op.vote,
          score: op.score,
          confidence: op.confidence,
          reasoning: op.reasoning,
          icon: op.icon,
          timestamp: now,
        });
      }

      // Portfolio Manager 판단 저장
      decisionRows.push({
        symbol: sym,
        final_vote: decision.finalVote,
        final_score: decision.finalScore,
        agreement_level: decision.agreementLevel,
        confidence: decision.confidence,
        strong_buy_count: decision.agentConsensus.strongBuy,
        buy_count: decision.agentConsensus.buy,
        hold_count: decision.agentConsensus.hold,
        sell_count: decision.agentConsensus.sell,
        strong_sell_count: decision.agentConsensus.strongSell,
        bullish_agents: decision.bullishAgents,
        bearish_agents: decision.bearishAgents,
        key_reasoning: decision.keyReasoning,
        timestamp: now,
      });
    }

    // 배치 insert
    if (opinionRows.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < opinionRows.length; i += batchSize) {
        await supabase.from("agent_opinions").insert(opinionRows.slice(i, i + batchSize));
      }
    }
    if (decisionRows.length > 0) {
      await supabase.from("portfolio_decisions").insert(decisionRows);
    }

    const duration = Date.now() - started;

    if (runRow?.id) {
      await supabase
        .from("cron_runs")
        .update({
          completed_at: new Date().toISOString(),
          duration_ms: duration,
          success: true,
          records_processed: opinionRows.length + decisionRows.length,
          metadata: {
            symbols: symbols.length,
            opinions: opinionRows.length,
            decisions: decisionRows.length,
          },
        })
        .eq("id", runRow.id);
    }

    return NextResponse.json({
      success: true,
      duration_ms: duration,
      symbols: symbols.length,
      opinions_saved: opinionRows.length,
      decisions_saved: decisionRows.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    const duration = Date.now() - started;

    if (runRow?.id) {
      await supabase
        .from("cron_runs")
        .update({
          completed_at: new Date().toISOString(),
          duration_ms: duration,
          success: false,
          error_message: msg,
        })
        .eq("id", runRow.id);
    }

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
