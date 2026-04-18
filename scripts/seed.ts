/**
 * TypeScript 시드 스크립트
 * 사용법: npm run seed
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";

// .env 파일 로드
const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  config({ path: envPath });
} else {
  config();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const TICKERS = [
  ["NVDA", "NVIDIA Corporation", "엔비디아", "fabless", 4800, false, "AI GPU 절대 강자"],
  ["TSM", "Taiwan Semiconductor", "TSMC", "foundry", 1900, false, "세계 최대 파운드리"],
  ["AVGO", "Broadcom Inc.", "브로드컴", "fabless", 1800, false, "커스텀 AI 칩"],
  ["AMD", "Advanced Micro Devices", "AMD", "fabless", 420, false, "데이터센터 GPU"],
  ["MU", "Micron Technology", "마이크론", "memory", 510, false, "HBM 수혜"],
  ["ASML", "ASML Holding", "ASML", "equipment", 380, false, "EUV 장비 독점"],
  ["INTC", "Intel Corporation", "인텔", "idm", 280, false, "파운드리 전환 중"],
  ["QCOM", "Qualcomm", "퀄컴", "fabless", 150, false, "스마트폰 모뎀"],
  ["ARM", "Arm Holdings", "ARM", "fabless", 170, false, "CPU IP"],
  ["MRVL", "Marvell Technology", "마벨", "fabless", 120, false, "데이터센터 ASIC"],
  ["AMAT", "Applied Materials", "어플라이드", "equipment", 150, false, "반도체 장비"],
  ["LRCX", "Lam Research", "램리서치", "equipment", 95, false, "에칭/증착"],
  ["KLAC", "KLA Corporation", "KLA", "equipment", 85, false, "검사/계측"],
  ["TXN", "Texas Instruments", "TI", "idm", 170, false, "아날로그"],
  ["ADI", "Analog Devices", "아날로그디바이시스", "idm", 110, false, "아날로그"],
  ["SMH", "VanEck Semiconductor ETF", "SMH ETF", "etf", 25, true, "미국 25개"],
  ["SOXX", "iShares Semiconductor ETF", "SOXX ETF", "etf", 15, true, "NYSE 30종목"],
  ["SMHX", "Sprott Semiconductor ETF", "SMHX ETF", "etf", 2, true, "팹리스 집중"],
  ["SOXL", "Direxion Semi Bull 3X", "SOXL", "etf", 8, true, "3배 레버리지"],
  ["SOXS", "Direxion Semi Bear 3X", "SOXS", "etf", 1, true, "3배 인버스"],
] as const;

async function main() {
  console.log(`📦 Seeding ${TICKERS.length} tickers to ${SUPABASE_URL}...`);

  const rows = TICKERS.map((t) => ({
    symbol: t[0],
    name: t[1],
    name_kr: t[2],
    segment: t[3],
    market_cap_b: t[4],
    is_etf: t[5],
    description_kr: t[6],
  }));

  const { data, error } = await supabase
    .from("tickers")
    .upsert(rows, { onConflict: "symbol" })
    .select();

  if (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }

  console.log(`✅ Upserted ${data?.length ?? 0} rows`);

  const { count } = await supabase
    .from("tickers")
    .select("symbol", { count: "exact", head: true });
  console.log(`📊 Total tickers in DB: ${count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
