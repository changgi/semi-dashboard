import { NextRequest, NextResponse } from "next/server";

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Email Daily Briefing API
// 
// POST /api/email-briefing
// body: { to: "kyle@example.com" }
// 
// 환경변수 (옵션):
//   SENDGRID_API_KEY  → SendGrid 사용
//   SMTP_HOST         → 일반 SMTP 사용
//   NAVER_SENS_*      → 네이버 SENS
// 환경변수 없으면 Mailto 링크 생성
// ═══════════════════════════════════════════════════════════

async function fetchInternal(path: string): Promise<any> {
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const res = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────
// HTML 이메일 빌드
// ───────────────────────────────────────────────────────────
function buildEmailHtml(briefing: any, scanner: any, risk: any): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  const es = briefing?.executiveSummary ?? {};
  const p = briefing?.portfolioSummary ?? {};
  const m = briefing?.macro ?? {};
  const actionItems = briefing?.actionItems ?? [];

  const actionColor =
    es.actionColor === "#00ff88" ? "#00aa44" :
    es.actionColor === "#ff3860" ? "#cc2244" :
    "#d19200";

  const gainColor = (p.totalGainPct ?? 0) >= 0 ? "#00aa44" : "#cc2244";

  return `
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>반도체 투자 브리핑 ${now.toISOString().slice(0, 10)}</title>
</head>
<body style="margin:0;padding:20px;font-family:'Segoe UI',-apple-system,sans-serif;background:#f8f8f8;color:#222;">
  <div style="max-width:600px;margin:0 auto;background:white;padding:30px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.06);">
    
    <!-- 헤더 -->
    <div style="text-align:center;margin-bottom:25px;padding-bottom:20px;border-bottom:2px solid #f0d088;">
      <h1 style="margin:0;color:#d97e00;font-size:24px;">☕ Morning Briefing</h1>
      <div style="color:#666;font-size:13px;margin-top:5px;">${dateStr}</div>
    </div>
    
    <!-- 오늘의 결정 -->
    <div style="background:linear-gradient(135deg,${actionColor}15,transparent);border-left:4px solid ${actionColor};padding:18px;margin-bottom:20px;border-radius:4px;">
      <div style="color:#888;font-size:11px;margin-bottom:4px;">🎯 오늘의 결정</div>
      <div style="font-size:28px;font-weight:bold;color:${actionColor};margin:4px 0;">
        ${es.actionIcon || "💎"} ${es.todayAction || "보유 유지"}
      </div>
      <div style="color:${actionColor};font-weight:600;font-size:13px;margin-top:6px;">
        신뢰도 ${es.confidence || 55}% · ${es.headline || "명확한 시그널 없음"}
      </div>
    </div>
    
    <!-- 포트폴리오 -->
    <div style="margin-bottom:20px;">
      <h2 style="font-size:15px;color:#d97e00;border-bottom:1px solid #eee;padding-bottom:8px;">💼 포트폴리오</h2>
      <table style="width:100%;margin-top:10px;">
        <tr>
          <td style="padding:8px;background:#fff8ea;border-radius:4px;width:33%;">
            <div style="font-size:11px;color:#888;">총 평가액</div>
            <div style="font-size:18px;font-weight:bold;color:#d97e00;">$${(p.totalValueUsd ?? 0).toLocaleString()}</div>
          </td>
          <td style="padding:8px;background:#fff8ea;border-radius:4px;width:33%;">
            <div style="font-size:11px;color:#888;">수익률</div>
            <div style="font-size:18px;font-weight:bold;color:${gainColor};">
              ${(p.totalGainPct ?? 0) >= 0 ? "+" : ""}${(p.totalGainPct ?? 0).toFixed(2)}%
            </div>
          </td>
          <td style="padding:8px;background:#fff8ea;border-radius:4px;">
            <div style="font-size:11px;color:#888;">리스크</div>
            <div style="font-size:18px;font-weight:bold;color:${(p.riskScore ?? 0) > 50 ? '#cc2244' : '#00aa44'};">
              ${p.riskScore ?? 0}/100
            </div>
          </td>
        </tr>
      </table>
    </div>
    
    <!-- 매크로 -->
    <div style="margin-bottom:20px;">
      <h2 style="font-size:15px;color:#d97e00;border-bottom:1px solid #eee;padding-bottom:8px;">🌍 매크로 지표</h2>
      <table style="width:100%;margin-top:10px;font-size:13px;">
        <tr>
          <td style="padding:6px;"><strong>VIX:</strong> ${m.vix ?? "-"}</td>
          <td style="padding:6px;"><strong>10Y:</strong> ${m.tnx ?? "-"}%</td>
          <td style="padding:6px;"><strong>USD/KRW:</strong> ₩${m.krw ?? "-"}</td>
        </tr>
      </table>
    </div>

    ${actionItems.length > 0 ? `
    <!-- 오늘 할 일 -->
    <div style="margin-bottom:20px;">
      <h2 style="font-size:15px;color:#d97e00;border-bottom:1px solid #eee;padding-bottom:8px;">🎯 오늘 할 일 체크리스트</h2>
      ${actionItems.slice(0, 5).map((a: any, i: number) => {
        const pColor = a.priority === 'high' ? '#cc2244' : a.priority === 'medium' ? '#d19200' : '#4488cc';
        const pEmoji = a.priority === 'high' ? '🔴' : a.priority === 'medium' ? '🟡' : '🔵';
        return `
          <div style="border-left:3px solid ${pColor};padding:10px;margin:8px 0;background:#fafafa;border-radius:3px;">
            <div style="font-size:13px;font-weight:bold;color:${pColor};">${pEmoji} #${i+1} ${a.icon || ''} ${a.action}</div>
            <div style="font-size:11px;color:#888;margin-top:4px;">→ ${a.target} · ${a.timing || ''}</div>
            ${a.reason ? `<div style="font-size:11px;margin-top:4px;color:#555;">💭 ${a.reason}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
    ` : ''}

    ${scanner && scanner.success ? `
    <!-- 섹터 스캐너 -->
    <div style="margin-bottom:20px;">
      <h2 style="font-size:15px;color:#d97e00;border-bottom:1px solid #eee;padding-bottom:8px;">🔍 섹터 시그널</h2>
      <div style="font-size:13px;margin-top:8px;">
        섹터 방향: <strong style="color:${scanner.sectorDirection?.includes('강세') ? '#00aa44' : scanner.sectorDirection?.includes('약세') ? '#cc2244' : '#d19200'};">${scanner.sectorDirection || '-'}</strong>
      </div>
      ${(scanner.results?.strongBuys ?? []).slice(0, 3).map((r: any) => `
        <div style="padding:6px;margin:4px 0;border-left:3px solid #00aa44;background:#f0fff4;font-size:12px;">
          🟢 <strong>${r.symbol}</strong> $${r.currentPrice?.toFixed(2)} 점수 +${r.score} · ${r.rationale?.slice(0, 60)}
        </div>
      `).join('')}
      ${(scanner.results?.strongSells ?? []).slice(0, 3).map((r: any) => `
        <div style="padding:6px;margin:4px 0;border-left:3px solid #cc2244;background:#fff0f0;font-size:12px;">
          🔴 <strong>${r.symbol}</strong> $${r.currentPrice?.toFixed(2)} 점수 ${r.score} · ${r.rationale?.slice(0, 60)}
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- CTA -->
    <div style="text-align:center;margin:25px 0;">
      <a href="https://semi-dashboard.vercel.app/" style="display:inline-block;padding:12px 28px;background:#d97e00;color:white;text-decoration:none;border-radius:4px;font-weight:bold;font-size:14px;">📊 전체 대시보드 보기</a>
    </div>

    <!-- Footer -->
    <div style="text-align:center;color:#aaa;font-size:11px;margin-top:25px;padding-top:15px;border-top:1px solid #eee;">
      본 브리핑은 ${now.toLocaleString("ko-KR")} 기준 실시간 데이터로 자동 작성됩니다.<br>
      투자 결정은 본인 책임하에 이루어져야 합니다.<br><br>
      <strong>Kyle's Semiconductor Investment Terminal</strong>
    </div>
    
  </div>
</body>
</html>
  `.trim();
}

// ───────────────────────────────────────────────────────────
// 텍스트 버전
// ───────────────────────────────────────────────────────────
function buildEmailText(briefing: any, scanner: any): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString("ko-KR");
  const es = briefing?.executiveSummary ?? {};
  const p = briefing?.portfolioSummary ?? {};
  const m = briefing?.macro ?? {};

  return `
☕ 모닝 브리핑 (${dateStr})
${"=".repeat(60)}

🎯 오늘의 결정: ${es.actionIcon || "💎"} ${es.todayAction || "보유 유지"}
   신뢰도: ${es.confidence || 55}%
   ${es.headline || ""}

💼 포트폴리오
   평가액: $${(p.totalValueUsd ?? 0).toLocaleString()}
   수익률: ${(p.totalGainPct ?? 0) >= 0 ? "+" : ""}${(p.totalGainPct ?? 0).toFixed(2)}%
   리스크: ${p.riskScore ?? 0}/100

🌍 매크로
   VIX: ${m.vix ?? "-"}  |  10Y: ${m.tnx ?? "-"}%  |  USD/KRW: ₩${m.krw ?? "-"}

${scanner?.success ? `
🔍 섹터 방향: ${scanner.sectorDirection || "-"}
   🟢 강세: ${scanner.sectorSentiment?.bullish ?? 0}개 | 🔴 약세: ${scanner.sectorSentiment?.bearish ?? 0}개
` : ''}

📊 전체 대시보드: https://semi-dashboard.vercel.app/

---
본 브리핑은 자동 생성됩니다. 투자 결정은 본인 책임.
  `.trim();
}

// ═══════════════════════════════════════════════════════════
// POST
// ═══════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, mode = "preview" } = body;

    // 데이터 수집
    const [briefing, scanner, risk] = await Promise.all([
      fetchInternal("/api/daily-briefing"),
      fetchInternal("/api/sector-scanner"),
      fetchInternal("/api/portfolio-risk"),
    ]);

    const html = buildEmailHtml(briefing, scanner, risk);
    const text = buildEmailText(briefing, scanner);
    const subject = `☕ 반도체 투자 브리핑 ${new Date().toISOString().slice(0, 10)}`;

    // ─────────────────────────────────────────────
    // preview 모드: HTML/텍스트만 반환
    // ─────────────────────────────────────────────
    if (mode === "preview") {
      return NextResponse.json({
        success: true,
        subject,
        html,
        text,
        mailtoUrl: `mailto:${to || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`,
      });
    }

    // ─────────────────────────────────────────────
    // send 모드: 실제 발송 시도
    // ─────────────────────────────────────────────
    if (mode === "send") {
      if (!to) {
        return NextResponse.json({ success: false, error: "to 주소 필요" });
      }

      // SendGrid 우선 시도
      if (process.env.SENDGRID_API_KEY) {
        try {
          const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: to }] }],
              from: { email: process.env.SENDGRID_FROM || "noreply@semi-dashboard.app", name: "Kyle's Terminal" },
              subject,
              content: [
                { type: "text/plain", value: text },
                { type: "text/html", value: html },
              ],
            }),
          });
          if (res.ok || res.status === 202) {
            return NextResponse.json({ success: true, provider: "sendgrid", to });
          }
          const errorText = await res.text();
          return NextResponse.json({ success: false, error: `SendGrid: ${errorText}` });
        } catch (e) {
          return NextResponse.json({ success: false, error: `SendGrid 에러: ${(e as Error).message}` });
        }
      }

      // 환경변수 없으면 안내
      return NextResponse.json({
        success: false,
        error: "이메일 발송을 위해 SENDGRID_API_KEY를 Vercel 환경변수에 설정하세요",
        mailtoUrl: `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`,
        html,
        text,
      });
    }

    return NextResponse.json({ success: false, error: "알 수 없는 mode" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg, _soft_failure: true });
  }
}
