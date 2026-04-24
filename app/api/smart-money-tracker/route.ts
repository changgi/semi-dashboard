import { NextRequest, NextResponse } from "next/server";
import { retryFetchJson } from "@/lib/retry-fetch";

export const revalidate = 3600; // 1시간 캐시 (공시는 후행 데이터)
export const dynamic = "force-dynamic";
export const maxDuration = 45;

/**
 * /api/smart-money-tracker
 *
 * 스마트 머니 추적 엔진 (Whale Insight 스타일)
 *
 * 데이터 소스: DART Open API (전자공시시스템)
 *   - 대량보유 상황보고 (5%↑) - 지분공시
 *   - 임원/주요주주 소유보고 (10%↑) - 핵심주주
 *
 * 주의사항:
 *   - DART 공시는 후행 데이터 (실제 매매보다 수일 지연)
 *   - 실시간 시장 상황과 시차 존재
 *   - 맹신 금물, 거시 맥락 파악용으로만 활용
 *
 * 모드:
 *   - pension: 국민연금 최근 변동
 *   - whales: 5% 이상 대량보유 변동 (전체 고래)
 *   - legends: 투자 전설들의 지분 변동
 *   - recent: 최근 7일간 주요 공시
 */

type WhaleDisclosure = {
  rceptNo: string;        // 접수번호
  rceptDt: string;        // 접수일자 YYYYMMDD
  corpCode: string;       // 고유번호
  corpName: string;       // 회사명
  stockCode?: string;     // 종목코드
  reporterName: string;   // 보고자명
  reporterType: string;   // 보고자 유형 (국민연금/개인/법인)
  ratio: number;          // 보유 비율 (%)
  ratioChange: number;    // 전보고 대비 변동 (%)
  changeReason: string;   // 변동 사유
  reportType: "new" | "increase" | "decrease" | "unchanged";
  isWatched: boolean;     // 주목할 만한 변동 여부
};

// 투자 전설 식별용 키워드
const LEGEND_KEYWORDS = [
  "국민연금공단", "국민연금", "한국투자", "미래에셋",
  "Blackrock", "Vanguard", "Fidelity",
  "삼성자산운용", "KB자산운용", "NH아문디",
  "세이",  // 세이에셋
  "KCGI", // 행동주의
  "이창환", "강성부", "박영옥", // 유명 투자자
];

function detectLegendName(name: string): string | null {
  for (const kw of LEGEND_KEYWORDS) {
    if (name?.includes(kw)) return kw;
  }
  return null;
}

async function fetchDartDisclosures(
  dartApiKey: string,
  bgnDe: string,
  endDe: string,
  reportType: "대량보유" | "주요주주"
): Promise<WhaleDisclosure[]> {
  const detailTy = reportType === "대량보유" ? "D002" : "D003";
  const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${dartApiKey}&bgn_de=${bgnDe}&end_de=${endDe}&pblntf_detail_ty=${detailTy}&page_count=100&sort=date&sort_mth=desc`;

  try {
    const data: any = await retryFetchJson(url, {
      headers: { "User-Agent": "Mozilla/5.0 Semi-Dashboard/1.0" },
    }, { maxRetries: 2, timeoutMs: 15000 });

    if (data?.status !== "000") {
      if (data?.status === "013") return [];
      throw new Error(`DART error: ${data?.message ?? "unknown"}`);
    }

    const list = data?.list ?? [];
    return list.map((item: any): WhaleDisclosure => {
      const name = item.report_nm ?? "";
      return {
        rceptNo: item.rcept_no,
        rceptDt: item.rcept_dt,
        corpCode: item.corp_code,
        corpName: item.corp_name,
        stockCode: item.stock_code,
        reporterName: "미상",
        reporterType: detectLegendName(name) ?? "미상",
        ratio: 0,
        ratioChange: 0,
        changeReason: "",
        reportType: "unchanged",
        isWatched: false,
      };
    });
  } catch (err) {
    console.error("DART fetch error:", err);
    return [];
  }
}

// 대량보유 상세 조회 (majorstock.json)
async function fetchMajorStockDetail(dartApiKey: string, corpCode: string): Promise<any[]> {
  const url = `https://opendart.fss.or.kr/api/majorstock.json?crtfc_key=${dartApiKey}&corp_code=${corpCode}`;
  try {
    const data: any = await retryFetchJson(url, {
      headers: { "User-Agent": "Mozilla/5.0 Semi-Dashboard/1.0" },
    }, { maxRetries: 2, timeoutMs: 10000 });
    if (data?.status !== "000") return [];
    return data?.list ?? [];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode") ?? "recent";
    const days = parseInt(searchParams.get("days") ?? "7", 10);

    const dartApiKey = process.env.DART_API_KEY;
    if (!dartApiKey) {
      return NextResponse.json({
        success: false,
        error: "DART_API_KEY가 설정되지 않았습니다. https://opendart.fss.or.kr 에서 인증키를 발급받아 Vercel 환경변수에 등록하세요.",
        setupGuide: {
          step1: "https://opendart.fss.or.kr 접속 → 인증키 신청",
          step2: "개인 신청 (이메일 인증)",
          step3: "Vercel 프로젝트 → Settings → Environment Variables → DART_API_KEY 추가",
          step4: "재배포 후 활성화",
          dailyLimit: "하루 20,000건 제한 (개인 기준)",
        },
        _soft_failure: true,
      }, { status: 200 });
    }

    // 날짜 범위
    const now = new Date();
    const endDe = now.toISOString().slice(0, 10).replace(/-/g, "");
    const bgnDate = new Date(now.getTime() - days * 86400000);
    const bgnDe = bgnDate.toISOString().slice(0, 10).replace(/-/g, "");

    // 병렬로 대량보유 + 주요주주 공시 조회
    const [majorHoldings, majorShareholders] = await Promise.all([
      fetchDartDisclosures(dartApiKey, bgnDe, endDe, "대량보유"),
      fetchDartDisclosures(dartApiKey, bgnDe, endDe, "주요주주"),
    ]);

    const all = [...majorHoldings, ...majorShareholders];

    // 모드별 필터링
    let filtered = all;
    if (mode === "pension") {
      // 국민연금 공시는 회사명이 아닌 보고자명이 "국민연금공단"
      // 상세 조회 필요하나, 근사치로 개수만 표시
      filtered = all; // 후속 단계에서 상세 조회
    } else if (mode === "legends") {
      // 투자 전설 (기관/펀드) 포함 공시
      filtered = all.filter(d => d.reporterType !== "미상");
    }

    // 종합 통계
    const stats = {
      totalDisclosures: all.length,
      majorHoldingCount: majorHoldings.length,
      majorShareholderCount: majorShareholders.length,
      period: `${bgnDe} ~ ${endDe}`,
      days,
      uniqueCompanies: new Set(all.map(d => d.corpCode)).size,
    };

    // 회사별 집계 (가장 자주 등장한 종목 = 공시 집중 종목)
    const byCompany = new Map<string, { corpName: string; stockCode?: string; count: number; latestDate: string }>();
    all.forEach(d => {
      const existing = byCompany.get(d.corpCode);
      if (existing) {
        existing.count++;
        if (d.rceptDt > existing.latestDate) existing.latestDate = d.rceptDt;
      } else {
        byCompany.set(d.corpCode, {
          corpName: d.corpName,
          stockCode: d.stockCode,
          count: 1,
          latestDate: d.rceptDt,
        });
      }
    });

    const hotCompanies = Array.from(byCompany.entries())
      .map(([code, v]) => ({ corpCode: code, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return NextResponse.json({
      success: true,
      asOf: new Date().toISOString(),
      mode,
      stats,
      hotCompanies,
      disclosures: filtered.slice(0, 100),
      disclaimer: {
        source: "금융감독원 DART (opendart.fss.or.kr)",
        notice: "공시 제도 특성상 실제 매매보다 수일 지연된 후행 데이터입니다. 투자 참고용으로만 사용하세요.",
        limitations: [
          "지분율·변동량 상세는 개별 공시 조회 필요 (rceptNo로 조회 가능)",
          "기관의 포트폴리오 변동은 리밸런싱·의결권 행사 등 다양한 목적 포함",
          "추종 매매가 반드시 수익을 보장하지 않음",
        ],
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
