import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";
import { getFinnhubClient } from "@/lib/finnhub";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SEMI_KEYWORDS = [
  "semiconductor", "chip", "nvidia", "tsmc", "amd", "intel",
  "micron", "samsung", "sk hynix", "broadcom", "asml", "qualcomm",
  "dram", "hbm", "nand", "foundry", "fab", "gpu", "cpu",
];

const SEMI_SYMBOLS = [
  "NVDA", "TSM", "AVGO", "AMD", "MU", "ASML", "INTC", "QCOM",
  "ARM", "MRVL", "AMAT", "LRCX", "KLAC", "TXN", "ADI",
];

function extractRelatedSymbols(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();

  const mapping: Record<string, string[]> = {
    NVDA: ["nvidia", "jensen huang"],
    TSM: ["tsmc", "taiwan semi"],
    AVGO: ["broadcom"],
    AMD: ["amd ", "advanced micro"],
    MU: ["micron"],
    ASML: ["asml"],
    INTC: ["intel"],
    QCOM: ["qualcomm"],
    ARM: [" arm "],
    MRVL: ["marvell"],
    AMAT: ["applied materials"],
    LRCX: ["lam research"],
    KLAC: ["kla corp"],
  };

  for (const [symbol, keywords] of Object.entries(mapping)) {
    if (keywords.some((k) => lower.includes(k))) {
      found.add(symbol);
    }
  }

  for (const sym of SEMI_SYMBOLS) {
    if (text.includes(sym)) found.add(sym);
  }

  return Array.from(found);
}

function isSemiRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return SEMI_KEYWORDS.some((kw) => lower.includes(kw));
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.NODE_ENV === "production" &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdmin();
  const client = getFinnhubClient();

  try {
    const news = await client.getMarketNews("technology");
    const relevant = news.filter((n) =>
      isSemiRelated(n.headline + " " + n.summary)
    );

    const rows = relevant.map((n) => ({
      title: n.headline,
      summary: n.summary,
      url: n.url,
      source: n.source,
      image_url: n.image,
      related_symbols: extractRelatedSymbols(n.headline + " " + n.summary),
      published_at: new Date(n.datetime * 1000).toISOString(),
    }));

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        inserted: 0,
        total: news.length,
      });
    }

    // URL unique constraint로 중복 방지
    const { error } = await supabase
      .from("news")
      .upsert(rows, { onConflict: "url", ignoreDuplicates: true });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      fetched: news.length,
      relevant: rows.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
