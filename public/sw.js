// ═══════════════════════════════════════════════════════════
// Service Worker
// 
// 목적:
//   1. 오프라인 시 대시보드 쉘 로드 (캐시된 버전)
//   2. 네트워크 요청 실패 시 우아한 폴백
//   3. 정적 자원 캐싱으로 속도 향상
// ═══════════════════════════════════════════════════════════

const CACHE_VERSION = "semi-v1";
const CACHE_NAME = `semi-terminal-${CACHE_VERSION}`;

// 설치 - 필수 리소스 캐싱
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// 활성화 - 오래된 캐시 삭제
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("semi-terminal-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// fetch - 네트워크 우선, 캐시 폴백
self.addEventListener("fetch", (event) => {
  const { request } = event;
  
  // API는 항상 네트워크 (캐싱 안 함)
  if (request.url.includes("/api/")) return;
  
  // HTML은 네트워크 우선
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/")))
    );
    return;
  }
  
  // 정적 자원은 캐시 우선
  if (
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "image" ||
    request.destination === "font"
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        });
      })
    );
  }
});
