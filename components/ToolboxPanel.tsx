"use client";

import { useState } from "react";
import { safeFetcher } from "@/lib/swr-config";
import useSWR from "swr";

const fetcher = safeFetcher;

// ═══════════════════════════════════════════════════════════
// Investment Toolbox
// 
// 3가지 통합 도구:
//   1. 💾 데이터 내보내기 (CSV)
//   2. 📧 이메일 브리핑 (미리보기 + 발송)
//   3. 🤖 뉴스 센티먼트
// ═══════════════════════════════════════════════════════════

interface SentimentData {
  success: boolean;
  totalNews: number;
  overallSentiment: string;
  avgScore: number;
  counts: { positive: number; negative: number; neutral: number };
  topBullish: any[];
  topBearish: any[];
  highImpact: any[];
  recent: any[];
}

export function ToolboxPanel() {
  const [tab, setTab] = useState<"export" | "email" | "news">("news");

  return (
    <div className="panel p-3 sm:p-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <div className="section-title text-[11px] sm:text-[13px]">
            🛠️ INVESTMENT TOOLBOX · 실용 도구 모음
          </div>
          <div className="text-[8px] sm:text-[9px] dim mt-0.5 kr">
            데이터 내보내기 · 이메일 브리핑 · 뉴스 센티먼트
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="mb-3 flex items-center gap-1 flex-wrap border-b border-[var(--border)] pb-1">
        <TabBtn label="🤖 뉴스 센티먼트" active={tab === "news"} onClick={() => setTab("news")} />
        <TabBtn label="📧 이메일 브리핑" active={tab === "email"} onClick={() => setTab("email")} />
        <TabBtn label="💾 데이터 내보내기" active={tab === "export"} onClick={() => setTab("export")} />
      </div>

      {tab === "news" && <NewsSentimentTab />}
      {tab === "email" && <EmailBriefingTab />}
      {tab === "export" && <ExportTab />}
    </div>
  );
}

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] px-3 py-1.5 border-b-2 transition-all kr ${
        active
          ? "border-[var(--amber)] text-[var(--amber)] font-bold"
          : "border-transparent dim hover:text-[var(--amber)]"
      }`}
    >
      {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// 🤖 News Sentiment Tab
// ═══════════════════════════════════════════════════════════
function NewsSentimentTab() {
  const { data, isLoading } = useSWR<SentimentData>(
    "/api/news-sentiment",
    fetcher,
    { refreshInterval: 900000 } // 15분
  );

  if (isLoading) {
    return (
      <div className="text-center py-10 text-[10px] dim kr">
        🤖 뉴스 분석 중...
      </div>
    );
  }

  if (!data?.success) {
    return (
      <div className="text-center py-10 text-[10px] dim kr border border-[var(--border)] rounded">
        📰 뉴스 데이터 수집 중...
      </div>
    );
  }

  const sentimentColor =
    data.overallSentiment === "bullish" ? "#00ff88" :
    data.overallSentiment === "bearish" ? "#ff3860" :
    "#ffaa44";
  const sentimentLabel =
    data.overallSentiment === "bullish" ? "🟢 강세" :
    data.overallSentiment === "bearish" ? "🔴 약세" :
    "➖ 중립";

  return (
    <div className="space-y-3">
      {/* 전체 센티먼트 */}
      <div
        className="border rounded p-3"
        style={{
          borderColor: `${sentimentColor}40`,
          background: `linear-gradient(135deg, ${sentimentColor}10, transparent)`,
        }}
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-[9px] dim kr">섹터 뉴스 센티먼트</div>
            <div className="text-[20px] font-bold" style={{ color: sentimentColor }}>
              {sentimentLabel}
            </div>
            <div className="text-[9px] dim kr">
              평균 점수 <span className="tick font-bold" style={{ color: sentimentColor }}>
                {data.avgScore >= 0 ? "+" : ""}{data.avgScore}
              </span> · 총 {data.totalNews}건 분석
            </div>
          </div>
          <div className="text-right text-[9px] kr">
            <div className="up">🟢 긍정 {data.counts.positive}</div>
            <div className="dim">➖ 중립 {data.counts.neutral}</div>
            <div className="down">🔴 부정 {data.counts.negative}</div>
          </div>
        </div>
      </div>

      {/* 상위 뉴스 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <NewsList
          title="🟢 강세 뉴스"
          news={data.topBullish ?? []}
          color="#00ff88"
          emptyMsg="현재 긍정 뉴스 없음"
        />
        <NewsList
          title="🔴 약세 뉴스"
          news={data.topBearish ?? []}
          color="#ff3860"
          emptyMsg="현재 부정 뉴스 없음"
        />
      </div>

      {/* 고영향 뉴스 */}
      {(data.highImpact?.length ?? 0) > 0 && (
        <div>
          <div className="text-[10px] tick kr font-bold mb-2">
            🔥 고영향 뉴스 (중요 키워드 포함)
          </div>
          <div className="space-y-1">
            {data.highImpact.slice(0, 5).map((n: any) => (
              <div
                key={n.id}
                className="border-l-3 rounded-r p-2 hover:bg-[rgba(255,255,255,0.02)]"
                style={{
                  borderLeftColor: n.sentiment === "positive" ? "#00ff88" : n.sentiment === "negative" ? "#ff3860" : "#aaa",
                  borderLeftWidth: 3,
                  background: n.sentiment === "positive" ? "#00ff8808" : n.sentiment === "negative" ? "#ff386008" : "transparent",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <a
                    href={n.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] kr leading-relaxed flex-1 hover:bright"
                  >
                    <span className="tick font-bold">[{n.symbol}]</span> {n.title}
                  </a>
                  <span
                    className="text-[9px] font-bold"
                    style={{
                      color: n.score > 0 ? "#00ff88" : n.score < 0 ? "#ff3860" : "#aaa",
                    }}
                  >
                    {n.score > 0 ? "+" : ""}{n.score}
                  </span>
                </div>
                {n.keywords && n.keywords.length > 0 && (
                  <div className="text-[8px] dim mt-1">
                    키워드: {n.keywords.slice(0, 3).join(", ")}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-[8px] dim kr pt-2 border-t border-[var(--border)]">
        💡 Yahoo Finance 뉴스 자동 수집 · 키워드 기반 감정 분석 · 15분마다 자동 갱신
      </div>
    </div>
  );
}

function NewsList({ title, news, color, emptyMsg }: { title: string; news: any[]; color: string; emptyMsg: string }) {
  return (
    <div
      className="border rounded p-3"
      style={{ borderColor: `${color}30`, background: `${color}05` }}
    >
      <div className="text-[10px] font-bold kr mb-2" style={{ color }}>{title}</div>
      {news.length === 0 ? (
        <div className="text-[9px] dim text-center py-4 kr">{emptyMsg}</div>
      ) : (
        <div className="space-y-1">
          {news.slice(0, 3).map((n: any) => (
            <a
              key={n.id}
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[9px] leading-relaxed hover:bright kr"
              style={{ color: `${color}cc` }}
            >
              <strong>[{n.symbol}]</strong> {n.title?.slice(0, 80)}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 📧 Email Briefing Tab
// ═══════════════════════════════════════════════════════════
function EmailBriefingTab() {
  const [email, setEmail] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handlePreview = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/email-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: email, mode: "preview" }),
      });
      const d = await res.json();
      if (d.success) {
        setPreview(d);
      } else {
        setResult(`❌ ${d.error}`);
      }
    } catch (e) {
      setResult(`❌ ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!email) { setResult("❌ 이메일 주소 입력"); return; }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/email-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: email, mode: "send" }),
      });
      const d = await res.json();
      if (d.success) {
        setResult(`✅ ${email}로 발송 완료!`);
      } else {
        setResult(`⚠️ ${d.error}`);
        if (d.mailtoUrl) {
          setResult(`⚠️ SendGrid 미설정. 기본 메일앱으로 열까요?`);
          window.location.href = d.mailtoUrl;
        }
      }
    } catch (e) {
      setResult(`❌ ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="border border-[var(--border)] rounded p-3 bg-[rgba(0,0,0,0.2)]">
        <div className="text-[10px] kr font-bold mb-2">📧 이메일로 Daily Briefing 받기</div>
        <div className="text-[9px] dim kr mb-3">
          오늘의 결정, 포트폴리오, 매크로, 섹터 시그널을 이메일 한 통으로
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="flex-1 min-w-[200px] text-[11px] px-3 py-2 bg-black/30 border border-[var(--border)] text-[var(--amber)] rounded"
          />
          <button
            onClick={handlePreview}
            disabled={loading}
            className="text-[10px] px-3 py-2 border border-[var(--amber)] text-[var(--amber)] hover:bg-[rgba(255,176,0,0.1)] rounded kr disabled:opacity-50"
          >
            {loading ? "⏳" : "👁️ 미리보기"}
          </button>
          <button
            onClick={handleSend}
            disabled={loading || !email}
            className="text-[10px] px-3 py-2 border border-[var(--amber)] bg-[var(--amber)] text-[#111] hover:bg-[#e09900] rounded kr font-bold disabled:opacity-50"
          >
            📤 발송
          </button>
        </div>
        {result && <div className="mt-2 text-[10px] kr">{result}</div>}
      </div>

      {preview && (
        <div className="border border-[var(--border)] rounded overflow-hidden">
          <div className="bg-[rgba(0,0,0,0.3)] px-3 py-2 border-b border-[var(--border)]">
            <div className="text-[10px] tick kr font-bold">📨 미리보기: {preview.subject}</div>
          </div>
          <iframe
            srcDoc={preview.html}
            className="w-full bg-white"
            style={{ height: "500px", border: "none" }}
            sandbox="allow-same-origin"
          />
        </div>
      )}

      <div className="text-[8px] dim kr pt-2 border-t border-[var(--border)]">
        💡 <strong>자동 발송 설정</strong>: Vercel에 SENDGRID_API_KEY 환경변수 설정 후 매일 아침 자동<br />
        📮 <strong>수동</strong>: 발송 버튼 → 메일 앱 자동 열림 (환경변수 없어도 작동)
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 💾 Export Tab
// ═══════════════════════════════════════════════════════════
function ExportTab() {
  const handleExport = (type: string, format: string = "csv") => {
    const url = `/api/export?type=${type}&format=${format}`;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <ExportCard
          icon="💼"
          title="포트폴리오"
          subtitle="현재 보유 종목 + 평가액"
          fields={["심볼", "종목명", "수량", "평단가", "현재가", "수익률"]}
          onClick={() => handleExport("portfolio")}
        />
        <ExportCard
          icon="🎯"
          title="시그널 이력"
          subtitle="투자 시그널 + 검증 결과"
          fields={["날짜", "심볼", "방향", "신뢰도", "진입가", "1d/7d/30d 결과"]}
          onClick={() => handleExport("signals")}
        />
        <ExportCard
          icon="📝"
          title="매매 이력"
          subtitle="실제 체결 거래 기록"
          fields={["날짜", "심볼", "매수/매도", "수량", "가격", "근거"]}
          onClick={() => handleExport("trades")}
        />
        <ExportCard
          icon="📊"
          title="일일 스냅샷"
          subtitle="포트폴리오 + 시장 상태 추이"
          fields={["날짜", "평가액", "수익률", "VIX", "섹터 방향"]}
          onClick={() => handleExport("snapshots")}
        />
      </div>

      <div className="border border-[var(--amber-dim)] bg-[rgba(255,176,0,0.03)] rounded p-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="text-[11px] tick kr font-bold">📦 전체 백업 (JSON)</div>
            <div className="text-[9px] dim kr mt-1">
              포트폴리오 + 시그널 + 거래 + 스냅샷 전체 데이터
            </div>
          </div>
          <button
            onClick={() => handleExport("full", "json")}
            className="text-[10px] px-3 py-2 border border-[var(--amber)] bg-[var(--amber)] text-[#111] rounded kr font-bold"
          >
            📥 JSON 다운로드
          </button>
        </div>
      </div>

      <div className="text-[8px] dim kr pt-2 border-t border-[var(--border)]">
        💡 CSV 파일은 <strong>Excel, Google Sheets</strong>에서 바로 열 수 있어요<br />
        🔒 데이터는 카일님 브라우저로 직접 다운로드 (외부 전송 없음)<br />
        🇰🇷 UTF-8 BOM 포함으로 한글 깨짐 방지
      </div>
    </div>
  );
}

function ExportCard({
  icon, title, subtitle, fields, onClick,
}: {
  icon: string;
  title: string;
  subtitle: string;
  fields: string[];
  onClick: () => void;
}) {
  return (
    <div className="border border-[var(--border)] rounded p-3 hover:border-[var(--amber)] hover:bg-[rgba(255,176,0,0.03)] transition-all">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[18px]">{icon}</span>
          <div>
            <div className="text-[11px] tick font-bold kr">{title}</div>
            <div className="text-[9px] dim kr">{subtitle}</div>
          </div>
        </div>
        <button
          onClick={onClick}
          className="text-[9px] px-2 py-1 border border-[var(--amber)] text-[var(--amber)] hover:bg-[rgba(255,176,0,0.1)] rounded kr font-bold"
        >
          📥 CSV
        </button>
      </div>
      <div className="text-[8px] dim kr">
        컬럼: {fields.join(" · ")}
      </div>
    </div>
  );
}
