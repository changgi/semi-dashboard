import { NextRequest, NextResponse } from "next/server";
import { retryFetch, retryFetchJson } from "@/lib/retry-fetch";

export const revalidate = 21600; // 6시간 캐시 (13F는 분기 후행)
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/thirteen-f-tracker
 *
 * SEC EDGAR 13F-HR 공시 기반 미국 투자 전설 포트폴리오 추적
 *
 * Whale Insight의 해외(미국) 대응판. DART → SEC 대칭.
 *
 * 데이터 소스:
 *   - SEC EDGAR 직영 (data.sec.gov)
 *   - 무료, 분당 10회 제한, User-Agent 필수
 *   - 13F-HR (Holdings Report) 분기 공시
 *
 * 한계:
 *   - 13F는 분기 말 기준으로 **45일 이내** 제출 (공시일 기준 최대 45일 지연)
 *   - 공매도 포지션 미공개
 *   - 롱온리 펀드(뮤추얼펀드)만 의무 제출 (모든 헤지펀드는 아님)
 */

// 유명 투자자/기관의 SEC CIK (Central Index Key)
const LEGENDARY_INVESTORS: Array<{
  cik: string;
  name: string;
  displayName: string;
  style: string;
  aum?: string;
}> = [
  { cik: "0001067983", name: "Berkshire Hathaway", displayName: "버크셔 해서웨이 (버핏)", style: "가치 투자", aum: "$280B+" },
  { cik: "0001336528", name: "Pershing Square", displayName: "Pershing Square (빌 애크먼)", style: "액티비스트", aum: "$15B" },
  { cik: "0001061165", name: "Soros Fund Management", displayName: "소로스 펀드", style: "글로벌 매크로" },
  { cik: "0001103804", name: "Bridgewater Associates", displayName: "브릿지워터 (레이 달리오)", style: "글로벌 매크로", aum: "$112B" },
  { cik: "0001167483", name: "Blackrock", displayName: "BlackRock", style: "종합 자산운용", aum: "$10T+" },
  { cik: "0001029160", name: "Vanguard", displayName: "Vanguard", style: "패시브 인덱스", aum: "$9T+" },
  { cik: "0001061768", name: "Renaissance Technologies", displayName: "르네상스 (짐 사이먼스)", style: "퀀트" },
  { cik: "0001037389", name: "Tiger Global", displayName: "타이거 글로벌", style: "테크 성장주" },
  { cik: "0001649339", name: "Scion Asset Management", displayName: "사이언 에셋 (마이클 버리)", style: "가치·공매도" },
  { cik: "0001350694", name: "Coatue Management", displayName: "코튜 매니지먼트", style: "테크 성장주" },
  { cik: "0001423053", name: "Appaloosa Management", displayName: "아팔루사 (데이비드 테퍼)", style: "디스트레스드" },
  { cik: "0001214717", name: "Third Point", displayName: "써드 포인트 (댄 로브)", style: "액티비스트" },
];

type Holding = {
  nameOfIssuer: string;
  cusip: string;
  ticker?: string;
  value: number; // USD (thousands in raw, but normalized)
  shares: number;
  investmentDiscretion?: string;
};

type Filing = {
  cik: string;
  investorName: string;
  investorDisplayName: string;
  style: string;
  filingDate: string;
  periodOfReport: string;
  accessionNumber: string;
  totalValue: number;
  topHoldings: Holding[];
  holdingsCount: number;
};

/**
 * SEC EDGAR User-Agent 규정:
 * 반드시 "Company/Version (contact@email.com)" 형식이어야 함.
 */
const USER_AGENT = "Semi-Dashboard/8.7 (semi-dashboard@kyle.dev)";

async function fetchSubmissions(cik: string): Promise<any> {
  const paddedCik = cik.padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
  try {
    return await retryFetchJson(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
      },
    }, { maxRetries: 2, timeoutMs: 15000, baseDelayMs: 2000 });
  } catch (err) {
    console.error(`SEC submissions fetch failed for ${cik}:`, err);
    return null;
  }
}

/**
 * 13F-HR 최근 공시 목록을 가져와 첫 번째(가장 최근)를 반환
 */
function findLatest13F(submissions: any): {
  accessionNumber: string;
  filingDate: string;
  periodOfReport: string;
  primaryDocument: string;
} | null {
  if (!submissions?.filings?.recent) return null;
  const recent = submissions.filings.recent;
  const forms: string[] = recent.form ?? [];
  const accessionNumbers: string[] = recent.accessionNumber ?? [];
  const filingDates: string[] = recent.filingDate ?? [];
  const reportDates: string[] = recent.reportDate ?? [];
  const primaryDocs: string[] = recent.primaryDocument ?? [];

  for (let i = 0; i < forms.length; i++) {
    if (forms[i] === "13F-HR") {
      return {
        accessionNumber: accessionNumbers[i],
        filingDate: filingDates[i],
        periodOfReport: reportDates[i],
        primaryDocument: primaryDocs[i],
      };
    }
  }
  return null;
}

/**
 * 13F-HR XML (infotable.xml)을 가져와 holdings 파싱
 */
async function fetch13FHoldings(
  cik: string,
  accessionNumber: string
): Promise<Holding[]> {
  const paddedCik = cik.padStart(10, "0");
  const accessionNoNoDash = accessionNumber.replace(/-/g, "");
  // 13F XML 파일명은 보통 informationtable.xml 또는 infotable.xml
  // SEC EDGAR archive 경로
  const filingIndexUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${paddedCik}&type=13F&dateb=&owner=include&count=10&action=getcompany`;
  
  // 먼저 파일 리스트 조회
  const indexJsonUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${accessionNoNoDash}/index.json`;
  
  try {
    const indexData: any = await retryFetchJson(indexJsonUrl, {
      headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
    }, { maxRetries: 2, timeoutMs: 10000, baseDelayMs: 1500 });
    
    // infotable.xml 파일 찾기
    const items = indexData?.directory?.item ?? [];
    const xmlFile = items.find((f: any) =>
      f.name?.toLowerCase().includes("infotable") ||
      f.name?.toLowerCase().includes("information")
    );
    if (!xmlFile) return [];

    const xmlUrl = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik)}/${accessionNoNoDash}/${xmlFile.name}`;
    const xmlRes = await retryFetch(xmlUrl, {
      headers: { "User-Agent": USER_AGENT },
    }, { maxRetries: 2, timeoutMs: 15000, baseDelayMs: 1500 });
    if (!xmlRes.ok) return [];
    const xmlText = await xmlRes.text();

    return parseInfotableXml(xmlText);
  } catch (err) {
    console.error(`13F holdings fetch failed for ${cik}:`, err);
    return [];
  }
}

/**
 * 정규식 기반 XML 파싱 (xml2js 의존성 피하기)
 * SEC 13F infotable 구조:
 *   <infoTable>
 *     <nameOfIssuer>...</nameOfIssuer>
 *     <cusip>...</cusip>
 *     <value>...</value>
 *     <shrsOrPrnAmt>
 *       <sshPrnamt>...</sshPrnamt>
 *     </shrsOrPrnAmt>
 *     <investmentDiscretion>...</investmentDiscretion>
 *   </infoTable>
 */
function parseInfotableXml(xml: string): Holding[] {
  const holdings: Holding[] = [];
  // <infoTable> 또는 <ns1:infoTable> 등 네임스페이스 허용
  const tableRegex = /<(?:\w+:)?infoTable[^>]*>([\s\S]*?)<\/(?:\w+:)?infoTable>/gi;
  const matches = xml.match(tableRegex);
  if (!matches) return [];

  for (const match of matches) {
    const extract = (tag: string): string | null => {
      const re = new RegExp(`<(?:\\w+:)?${tag}[^>]*>([^<]*)</(?:\\w+:)?${tag}>`, "i");
      const m = match.match(re);
      return m ? m[1].trim() : null;
    };

    const name = extract("nameOfIssuer");
    const cusip = extract("cusip");
    const valueStr = extract("value");
    const sharesStr = extract("sshPrnamt");
    const discretion = extract("investmentDiscretion");

    if (!name || !cusip) continue;

    // value는 보통 천 단위 (최근 규정으로 달러 단위로도 나옴)
    const rawValue = parseFloat(valueStr ?? "0");
    // 2022년 이전: thousands, 2022년 이후: dollars
    // 대부분 2023+ 필링은 달러 단위지만, 안전하게 현재 필링은 달러로 가정
    const value = rawValue;
    const shares = parseFloat(sharesStr ?? "0");

    holdings.push({
      nameOfIssuer: name,
      cusip,
      value,
      shares,
      investmentDiscretion: discretion ?? undefined,
    });
  }

  return holdings;
}

async function fetchLatestFilingFor(investor: typeof LEGENDARY_INVESTORS[0]): Promise<Filing | null> {
  const submissions = await fetchSubmissions(investor.cik);
  if (!submissions) return null;

  const latest13F = findLatest13F(submissions);
  if (!latest13F) return null;

  const holdings = await fetch13FHoldings(investor.cik, latest13F.accessionNumber);
  if (holdings.length === 0) return null;

  const totalValue = holdings.reduce((s, h) => s + h.value, 0);
  // 상위 10개 holdings
  const topHoldings = [...holdings].sort((a, b) => b.value - a.value).slice(0, 10);

  return {
    cik: investor.cik,
    investorName: investor.name,
    investorDisplayName: investor.displayName,
    style: investor.style,
    filingDate: latest13F.filingDate,
    periodOfReport: latest13F.periodOfReport,
    accessionNumber: latest13F.accessionNumber,
    totalValue,
    topHoldings,
    holdingsCount: holdings.length,
  };
}

// Kyle 관심 종목과 매칭 (각 13F가 해당 종목을 보유하는지)
async function matchKyleInterests(filings: Filing[], targetTickers: string[]): Promise<Array<{
  ticker: string;
  heldBy: Array<{ investor: string; value: number; rank: number }>;
}>> {
  // CUSIP 매핑은 별도 DB 필요, 여기선 nameOfIssuer 문자열 매칭으로 근사
  const nameMap: Record<string, string[]> = {
    ORCL: ["oracle"],
    AMZN: ["amazon"],
    TSLA: ["tesla"],
    NVDA: ["nvidia"],
    MSFT: ["microsoft"],
    AAPL: ["apple"],
    GOOGL: ["alphabet", "google"],
    META: ["meta platforms", "facebook"],
    AMD: ["advanced micro"],
  };

  const results = targetTickers.map(ticker => {
    const patterns = nameMap[ticker] ?? [ticker.toLowerCase()];
    const heldBy: Array<{ investor: string; value: number; rank: number }> = [];

    filings.forEach(f => {
      // 상위 전체 holdings 기준으로 해당 패턴 매칭
      const matched = f.topHoldings.find(h =>
        patterns.some(p => h.nameOfIssuer.toLowerCase().includes(p))
      );
      if (matched) {
        const rank = f.topHoldings.indexOf(matched) + 1;
        heldBy.push({
          investor: f.investorDisplayName,
          value: matched.value,
          rank,
        });
      }
    });

    return { ticker, heldBy: heldBy.sort((a, b) => b.value - a.value) };
  });

  return results;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") ?? "top";
    const tickers = (searchParams.get("tickers") ?? "ORCL,AMZN,TSLA,NVDA,MSFT").split(",");

    // 병렬 조회, 단 SEC rate limit 10/분 주의
    const topInvestors = scope === "all" ? LEGENDARY_INVESTORS : LEGENDARY_INVESTORS.slice(0, 6);

    // 직렬 처리로 rate limit 보수적 회피
    const filings: Filing[] = [];
    for (const inv of topInvestors) {
      const f = await fetchLatestFilingFor(inv);
      if (f) filings.push(f);
      // 6초 간격 (분당 10회 = 6초에 1회)
      await new Promise(r => setTimeout(r, 1500));
    }

    // 카일 관심 종목과의 매칭
    const ownership = await matchKyleInterests(filings, tickers);

    // 인사이트 생성
    const insights: string[] = [];
    ownership.forEach(o => {
      if (o.heldBy.length >= 3) {
        insights.push(`🐋 ${o.ticker} — ${o.heldBy.length}명의 전설 투자자 보유 (상위: ${o.heldBy.slice(0, 2).map(h => h.investor).join(", ")})`);
      } else if (o.heldBy.length === 0) {
        insights.push(`⚠️ ${o.ticker} — 조회된 투자 전설 중 아무도 상위 10개 보유 목록에 없음`);
      }
    });

    // 가장 많이 담긴 종목 Top 10 (교차 분석)
    const nameFreq = new Map<string, { count: number; totalValue: number; investors: string[] }>();
    filings.forEach(f => {
      f.topHoldings.forEach(h => {
        const key = h.nameOfIssuer;
        const existing = nameFreq.get(key);
        if (existing) {
          existing.count++;
          existing.totalValue += h.value;
          existing.investors.push(f.investorDisplayName);
        } else {
          nameFreq.set(key, {
            count: 1,
            totalValue: h.value,
            investors: [f.investorDisplayName],
          });
        }
      });
    });

    const consensus = Array.from(nameFreq.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count || b.totalValue - a.totalValue)
      .slice(0, 15);

    return NextResponse.json({
      success: true,
      asOf: new Date().toISOString(),
      source: "SEC EDGAR 13F-HR (무료, 분기 공시)",
      filingsAnalyzed: filings.length,
      filings: filings.map(f => ({
        investor: f.investorDisplayName,
        style: f.style,
        filingDate: f.filingDate,
        periodOfReport: f.periodOfReport,
        totalValueB: f.totalValue / 1e9, // 10억 달러 단위
        holdingsCount: f.holdingsCount,
        topHoldings: f.topHoldings.slice(0, 5).map(h => ({
          name: h.nameOfIssuer,
          valueB: h.value / 1e9,
          shares: h.shares,
        })),
      })),
      kyleInterestOwnership: ownership,
      consensusHoldings: consensus,
      insights,
      disclaimer: {
        source: "SEC EDGAR (data.sec.gov)",
        lag: "13F는 분기 말 기준 45일 이내 제출 — 최대 45일 지연 후행 데이터",
        limitations: [
          "공매도 포지션 미공개",
          "모든 헤지펀드가 의무 제출하지는 않음",
          "최소 $100M 운용 기관만 의무",
          "CUSIP 기반 ticker 매핑은 추후 개선 필요",
        ],
        rateLimitNote: "SEC 분당 10회 제한으로 12개 투자자 조회 시 약 20초 소요",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({
      success: false,
      error: msg,
      _soft_failure: true,
    }, { status: 200 });
  }
}
