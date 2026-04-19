"use client";

import { useState, useEffect, useRef, useMemo } from "react";

// ───────────────────────────────────────────────────────────
// 검색 가능한 종목 목록 (주요 반도체 + ETF + 한국)
// ───────────────────────────────────────────────────────────
const SEARCHABLE_STOCKS = [
  // 미국 반도체 대형주
  { symbol: "NVDA",      name: "NVIDIA",           keywords: "엔비디아 nvidia ai gpu" },
  { symbol: "AMD",       name: "AMD",              keywords: "amd cpu 데이터센터" },
  { symbol: "TSM",       name: "TSMC",             keywords: "tsmc 대만 파운드리 taiwan" },
  { symbol: "AVGO",      name: "Broadcom",         keywords: "브로드컴 broadcom" },
  { symbol: "MU",        name: "Micron",           keywords: "마이크론 micron 메모리 memory" },
  { symbol: "INTC",      name: "Intel",            keywords: "인텔 intel cpu foundry" },
  { symbol: "QCOM",      name: "Qualcomm",         keywords: "퀄컴 qualcomm 모바일 mobile" },
  { symbol: "ARM",       name: "Arm",              keywords: "arm 라이선스" },
  { symbol: "MRVL",      name: "Marvell",          keywords: "마벨 marvell" },
  { symbol: "TXN",       name: "Texas Instruments", keywords: "텍사스 analog" },
  { symbol: "ADI",       name: "Analog Devices",   keywords: "아날로그 디바이시스 analog" },
  // 반도체 장비 미국/유럽
  { symbol: "ASML",      name: "ASML",             keywords: "asml 노광 euv 네덜란드 lithography" },
  { symbol: "AMAT",      name: "Applied Materials",keywords: "어플라이드 applied 장비" },
  { symbol: "LRCX",      name: "Lam Research",     keywords: "램 리서치 lam" },
  { symbol: "KLAC",      name: "KLA Corp",         keywords: "kla 검사 inspection" },
  // 반도체 ETF
  { symbol: "SMH",       name: "VanEck Semi ETF",  keywords: "smh 반도체 etf" },
  { symbol: "SOXX",      name: "iShares Semi ETF", keywords: "soxx 반도체 etf" },
  { symbol: "SOXL",      name: "Direxion Semi 3x", keywords: "soxl 3배 레버리지 bull" },
  { symbol: "SOXS",      name: "Direxion Semi -3x",keywords: "soxs 3배 인버스 bear 숏" },
  { symbol: "XLK",       name: "Tech Select SPDR", keywords: "xlk 기술 tech" },
  { symbol: "SMHX",      name: "SMHX Semi ETF",    keywords: "smhx 반도체" },
  // 한국 반도체
  { symbol: "005930.KS", name: "삼성전자",          keywords: "삼성 samsung 반도체" },
  { symbol: "000660.KS", name: "SK하이닉스",        keywords: "sk하이닉스 hynix hbm 메모리" },
  { symbol: "042700.KS", name: "한미반도체",        keywords: "한미 hanmi tc bonder hbm" },
  { symbol: "240810.KS", name: "원익IPS",          keywords: "원익 wonik ips ald cvd" },
  { symbol: "036930.KS", name: "주성엔지니어링",     keywords: "주성 jusung ald" },
  { symbol: "039030.KS", name: "이오테크닉스",       keywords: "이오 eotechnics 레이저" },
  { symbol: "058470.KS", name: "리노공업",          keywords: "리노 leeno 테스트핀" },
  { symbol: "095610.KS", name: "테스",             keywords: "테스 tes 식각" },
  // 한국 ETF
  { symbol: "091170.KS", name: "KODEX 반도체",      keywords: "kodex 반도체 etf 한국" },
  { symbol: "139290.KS", name: "TIGER 200 IT",    keywords: "tiger 200 it 한국" },
  { symbol: "122630.KS", name: "KODEX 레버리지",    keywords: "kodex 레버리지 2배" },
  { symbol: "252670.KS", name: "KODEX 인버스2X",   keywords: "kodex 인버스 하락" },
  // 지수
  { symbol: "^NDX",      name: "Nasdaq 100",       keywords: "나스닥 nasdaq 100 ndx" },
  { symbol: "^GSPC",     name: "S&P 500",          keywords: "s&p 500 sp500 gspc" },
  { symbol: "^KS11",     name: "KOSPI",            keywords: "코스피 kospi" },
  { symbol: "^KQ11",     name: "KOSDAQ",           keywords: "코스닥 kosdaq" },
  { symbol: "^VIX",      name: "VIX 공포지수",      keywords: "vix 공포 변동성" },
  { symbol: "^TNX",      name: "10Y 국채",          keywords: "10y 국채 금리" },
];

// ═══════════════════════════════════════════════════════════
// 검색 모달 컴포넌트
// ═══════════════════════════════════════════════════════════
export function GlobalStockSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K 또는 Cmd+K 단축키
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K (Win/Linux) 또는 Cmd+K (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
      // Esc로 닫기
      if (e.key === "Escape" && open) {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    // 외부에서 검색 열기 이벤트 수신 (QuickActionsBar의 검색 버튼 등)
    const handleOpenSearch = () => {
      setOpen(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    };
    window.addEventListener("open-search", handleOpenSearch);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-search", handleOpenSearch);
    };
  }, [open]);

  // 필터링된 결과
  const results = useMemo(() => {
    if (!query.trim()) {
      // 빈 쿼리일 때 인기 종목 표시
      return SEARCHABLE_STOCKS.filter((s) =>
        ["NVDA", "TSM", "MU", "AVGO", "005930.KS", "000660.KS", "042700.KS", "SMH"].includes(s.symbol)
      );
    }
    const q = query.toLowerCase().trim();
    return SEARCHABLE_STOCKS.filter((s) => {
      return (
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.keywords.toLowerCase().includes(q)
      );
    }).slice(0, 10); // 최대 10개
  }, [query]);

  // 결과 변경시 선택 인덱스 초기화
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // 화살표/엔터 키보드 네비게이션
  useEffect(() => {
    if (!open) return;
    const handleNav = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        handleSelect(results[selectedIndex].symbol);
      }
    };
    window.addEventListener("keydown", handleNav);
    return () => window.removeEventListener("keydown", handleNav);
  }, [open, results, selectedIndex]);

  const handleSelect = (symbol: string) => {
    window.open(`/stock/${encodeURIComponent(symbol)}`, "_blank");
    setOpen(false);
    setQuery("");
  };

  if (!open) return null;

  return (
    <>
      {/* 오버레이 */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-[10vh] p-4"
        onClick={() => setOpen(false)}
      >
        <div
          className="bg-[var(--bg)] border border-[var(--amber-dim)] rounded w-full max-w-xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 검색창 */}
          <div className="flex items-center gap-2 border-b border-[var(--border)] p-3">
            <span className="text-[var(--amber)] text-[14px]">🔍</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="종목명, 심볼 검색 (NVDA, 삼성, 한미반도체...)"
              className="flex-1 bg-transparent text-[var(--amber)] text-[13px] placeholder-[var(--border-bright)] outline-none kr"
            />
            <button
              onClick={() => setOpen(false)}
              className="text-[12px] dim hover:text-[var(--amber)]"
            >
              ✕
            </button>
          </div>

          {/* 결과 */}
          <div className="max-h-[50vh] overflow-y-auto">
            {results.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-[10px] dim kr">
                  &quot;{query}&quot;에 대한 결과가 없습니다
                </div>
                <div className="text-[8px] dim kr mt-2">
                  심볼, 종목명, 키워드로 검색해보세요
                </div>
              </div>
            ) : (
              <>
                {!query.trim() && (
                  <div className="text-[8px] dim kr px-3 py-2 border-b border-[var(--border)]">
                    ⭐ 인기 종목
                  </div>
                )}
                {results.map((stock, idx) => (
                  <button
                    key={stock.symbol}
                    onClick={() => handleSelect(stock.symbol)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full text-left px-3 py-2.5 border-b border-[var(--border)] flex items-center justify-between transition-colors ${
                      selectedIndex === idx
                        ? "bg-[rgba(255,176,0,0.1)]"
                        : "hover:bg-[rgba(255,176,0,0.05)]"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] tick font-bold">
                          {stock.symbol}
                        </span>
                        <span className="text-[10px] dim kr truncate">
                          {stock.name}
                        </span>
                      </div>
                      <div className="text-[8px] dim kr mt-0.5">
                        {stock.keywords.split(" ").slice(0, 4).join(" · ")}
                      </div>
                    </div>
                    <div className="text-[9px] text-[var(--amber)] ml-2 flex items-center gap-1">
                      {selectedIndex === idx && (
                        <>
                          <span>Enter</span>
                          <span>→</span>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>

          {/* 하단 힌트 */}
          <div className="border-t border-[var(--border)] px-3 py-2 flex items-center justify-between text-[8px] dim">
            <div className="flex items-center gap-3">
              <span>
                <kbd className="border border-[var(--border)] px-1 rounded mr-1">↑↓</kbd>
                이동
              </span>
              <span>
                <kbd className="border border-[var(--border)] px-1 rounded mr-1">Enter</kbd>
                선택
              </span>
              <span>
                <kbd className="border border-[var(--border)] px-1 rounded mr-1">Esc</kbd>
                닫기
              </span>
            </div>
            <span className="kr">새 탭에서 전체 분석 페이지 열기</span>
          </div>
        </div>
      </div>
    </>
  );
}
