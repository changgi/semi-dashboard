"use client";

import { Component, ReactNode } from "react";

// ═══════════════════════════════════════════════════════════
// Global App Error Boundary
// 전체 페이지가 크래시해도 복구 가능한 UI 제공
// ═══════════════════════════════════════════════════════════

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: "" };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    console.error("[Global Error]", error, errorInfo);
    this.setState({
      errorInfo: errorInfo.componentStack?.split("\n").slice(0, 5).join("\n") || "",
    });
  }

  retry = () => {
    this.setState({ hasError: false, error: null, errorInfo: "" });
    // SWR 캐시 무효화 + 페이지 새로고침
    if (typeof window !== "undefined") {
      // localStorage 캐시 초기화 (이전 nested undefined가 캐싱된 경우 제거)
      try {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith("semi_cache_"));
        for (const k of keys) localStorage.removeItem(k);
      } catch {
        // 무시
      }
    }
  };

  hardReload = () => {
    if (typeof window !== "undefined") {
      try {
        const keys = Object.keys(localStorage).filter((k) => k.startsWith("semi_cache_"));
        for (const k of keys) localStorage.removeItem(k);
      } catch {
        // 무시
      }
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          background: "#0a0e0a",
          color: "#c8d4c9",
          fontFamily: "'JetBrains Mono', monospace",
          padding: "2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div style={{
            maxWidth: 600,
            border: "1px solid #1f2a20",
            borderRadius: 8,
            padding: "2rem",
            background: "#0f1411",
            position: "relative",
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, width: 16, height: 16, borderTop: "2px solid #ffb000", borderLeft: "2px solid #ffb000" }} />
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 16, height: 16, borderBottom: "2px solid #ffb000", borderRight: "2px solid #ffb000" }} />
            
            <div style={{ fontSize: 48, textAlign: "center", marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 18, fontWeight: "bold", color: "#ffb000", textAlign: "center", marginBottom: 8, fontFamily: "'Noto Sans KR', sans-serif" }}>
              일시적 오류 발생
            </div>
            <div style={{ fontSize: 12, color: "#6b7a6c", textAlign: "center", marginBottom: 24, lineHeight: 1.6, fontFamily: "'Noto Sans KR', sans-serif" }}>
              대시보드를 불러오는 중 문제가 발생했어요.<br />
              대부분 Vercel 일시 장애나 캐시 문제로, 잠시 후 정상화됩니다.
            </div>

            {/* 에러 상세 (접힘) */}
            {this.state.error && (
              <details style={{ marginBottom: 20 }}>
                <summary style={{ cursor: "pointer", fontSize: 11, color: "#ff3860", fontFamily: "'Noto Sans KR', sans-serif" }}>
                  기술적 세부사항 (펼치기)
                </summary>
                <pre style={{
                  marginTop: 8,
                  padding: 12,
                  background: "rgba(255,56,96,0.05)",
                  border: "1px solid rgba(255,56,96,0.2)",
                  borderRadius: 4,
                  fontSize: 10,
                  color: "#ff3860",
                  overflow: "auto",
                  maxHeight: 200,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}>
                  {this.state.error.message}
                  {this.state.errorInfo && "\n\n" + this.state.errorInfo}
                </pre>
              </details>
            )}

            {/* 복구 버튼들 */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              <button
                onClick={this.retry}
                style={{
                  padding: "10px 20px",
                  border: "1px solid #ffb000",
                  background: "transparent",
                  color: "#ffb000",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "'Noto Sans KR', sans-serif",
                  fontWeight: "bold",
                }}
              >
                ↻ 다시 시도
              </button>
              <button
                onClick={this.hardReload}
                style={{
                  padding: "10px 20px",
                  border: "1px solid #ffb000",
                  background: "#ffb000",
                  color: "#111",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontSize: 12,
                  fontFamily: "'Noto Sans KR', sans-serif",
                  fontWeight: "bold",
                }}
              >
                🔄 캐시 삭제 + 새로고침
              </button>
              <a
                href="/"
                style={{
                  padding: "10px 20px",
                  border: "1px solid #1f2a20",
                  background: "transparent",
                  color: "#6b7a6c",
                  borderRadius: 4,
                  textDecoration: "none",
                  fontSize: 12,
                  fontFamily: "'Noto Sans KR', sans-serif",
                }}
              >
                🏠 홈으로
              </a>
            </div>

            <div style={{
              marginTop: 24,
              paddingTop: 16,
              borderTop: "1px solid #1f2a20",
              fontSize: 9,
              color: "#6b7a6c",
              textAlign: "center",
              fontFamily: "'Noto Sans KR', sans-serif",
              lineHeight: 1.6,
            }}>
              💡 팁: 브라우저 Ctrl+Shift+R (강력 새로고침)으로도 해결될 수 있어요<br />
              대부분 30초~1분 이내에 자동 복구됩니다
            </div>
          </div>
        </div>
      );
    }

    return <>{this.props.children}</>;
  }
}
