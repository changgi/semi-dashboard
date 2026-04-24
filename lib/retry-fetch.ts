/**
 * Common retry wrapper for fetch operations.
 *
 * Handles known transient issues:
 *   - "DNS cache overflow" (Vercel runtime)
 *   - ECONNRESET / ETIMEDOUT
 *   - 5xx errors
 *   - 429 rate limits
 *
 * Usage:
 *   const res = await retryFetch(url, options, { maxRetries: 3 });
 */

type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOnStatus?: number[];
  timeoutMs?: number;
};

const DEFAULT_RETRYABLE_STATUSES = [408, 425, 429, 500, 502, 503, 504];
const TRANSIENT_ERROR_PATTERNS = [
  "DNS cache overflow",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "socket hang up",
  "network timeout",
  "Failed to fetch",
];

function isTransientError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return TRANSIENT_ERROR_PATTERNS.some(p => msg.toLowerCase().includes(p.toLowerCase()));
}

function expBackoff(attempt: number, base = 500, max = 8000): number {
  const delay = Math.min(max, base * Math.pow(2, attempt));
  // Jitter ±25%
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(100, delay + jitter);
}

export async function retryFetch(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    baseDelayMs = 500,
    maxDelayMs = 8000,
    retryOnStatus = DEFAULT_RETRYABLE_STATUSES,
    timeoutMs = 15000,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        ...init,
        signal: init?.signal ?? controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok && retryOnStatus.includes(res.status)) {
        // 재시도 대상 상태 코드
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, expBackoff(attempt, baseDelayMs, maxDelayMs)));
          continue;
        }
      }

      // 응답 본문에 DNS cache overflow 텍스트가 담긴 경우 (200이지만 실패)
      if (res.ok && attempt < maxRetries) {
        const clone = res.clone();
        const text = await clone.text().catch(() => "");
        if (text.startsWith("DNS cache overflow")) {
          await new Promise(r => setTimeout(r, expBackoff(attempt, baseDelayMs, maxDelayMs)));
          continue;
        }
        // 본문 이상 없음 → 정상 응답 반환
        return res;
      }

      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isTransientError(err)) {
        await new Promise(r => setTimeout(r, expBackoff(attempt, baseDelayMs, maxDelayMs)));
        continue;
      }
      throw err;
    }
  }

  throw lastError ?? new Error("retryFetch exhausted retries");
}

/**
 * retryFetch + JSON 파싱 편의 wrapper
 */
export async function retryFetchJson<T = any>(
  url: string,
  init?: RequestInit,
  options?: RetryOptions
): Promise<T> {
  const res = await retryFetch(url, init, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

/**
 * retryFetch + 텍스트 파싱 편의 wrapper
 */
export async function retryFetchText(
  url: string,
  init?: RequestInit,
  options?: RetryOptions
): Promise<string> {
  const res = await retryFetch(url, init, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return await res.text();
}
