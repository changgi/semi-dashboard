// ═══════════════════════════════════════════════════════════
// SWR 전역 Fetcher & Config
// 
// 목적: 모든 API 에러(500, 503, 타임아웃 등)를 빈 데이터로 자동 변환
// 효과: 컴포넌트가 `data`를 절대 undefined로 받지 않음
// ═══════════════════════════════════════════════════════════

/**
 * 안전한 전역 fetcher
 * 
 * - 네트워크 에러 → 빈 객체 반환
 * - HTTP 500/503 → { success: false, error } 반환
 * - JSON 파싱 실패 → 빈 객체 반환
 * - 절대 throw하지 않음 → 컴포넌트 크래시 불가
 */
export async function safeFetcher(url: string): Promise<any> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30000), // 30초 타임아웃
    });

    // HTTP 에러 (4xx, 5xx)
    if (!res.ok) {
      // 500은 Vercel의 일시적 문제일 가능성 → 조용히 빈 데이터
      if (res.status === 500 || res.status === 503 || res.status === 504) {
        console.warn(`[API soft failure] ${url} → HTTP ${res.status}`);
        return {
          success: false,
          error: `HTTP ${res.status}`,
          _soft_failure: true,
          // 일반적인 배열 필드 기본값
          alerts: [],
          triggered: [],
          notifications: [],
          positions: [],
          results: { strongBuys: [], buys: [], neutrals: [], sells: [], strongSells: [] },
          topRisks: [],
          topOpportunities: [],
          recommendedActions: [],
          orders: [],
          priceSeries: [],
          levels: [],
          events: [],
          signals: [],
          holdings: [],
          actionItems: [],
          symbolSignals: [],
          todayEvents: [],
          unusualActivity: [],
          gammaSqueezeCandidates: [],
          allResults: [],
        };
      }

      // 404는 그냥 success: false
      return {
        success: false,
        error: `HTTP ${res.status}`,
      };
    }

    // 정상 응답
    try {
      const data = await res.json();
      return data;
    } catch (parseError) {
      console.warn(`[API JSON parse error] ${url}`, parseError);
      return { success: false, error: "JSON parse error", _soft_failure: true };
    }
  } catch (networkError) {
    // 네트워크 에러, 타임아웃 등
    const msg = networkError instanceof Error ? networkError.message : "Network error";
    console.warn(`[API network error] ${url} → ${msg}`);
    return {
      success: false,
      error: msg,
      _soft_failure: true,
      // 기본 빈 배열들
      alerts: [],
      triggered: [],
      notifications: [],
      positions: [],
      orders: [],
    };
  }
}

/**
 * SWR 기본 설정
 * - 에러 재시도: 최대 3번
 * - 포커스 시 revalidate: 비활성 (API 부담 줄임)
 * - 5초 이내 중복 요청 deduplication
 */
export const swrDefaultConfig = {
  fetcher: safeFetcher,
  revalidateOnFocus: false,
  shouldRetryOnError: true,
  errorRetryCount: 3,
  errorRetryInterval: 5000, // 5초 간격
  dedupingInterval: 5000,
};
