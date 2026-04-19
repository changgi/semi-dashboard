"use client";

import { Component, ReactNode } from "react";

// ═══════════════════════════════════════════════════════════
// Panel Error Boundary
// 개별 패널이 에러로 crash해도 나머지 대시보드는 정상 작동
// ═══════════════════════════════════════════════════════════

interface Props {
  children: ReactNode;
  panelName?: string;
  compact?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorCount: number;
}

export class PanelErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error(`[Panel Error: ${this.props.panelName ?? "unknown"}]`, error);
  }

  retry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorCount: prev.errorCount + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      const { panelName = "패널", compact = false } = this.props;

      if (compact) {
        return (
          <div className="border border-[#ff3860]/30 bg-[rgba(255,56,96,0.05)] rounded p-2 text-[9px] dim text-center kr">
            ⚠️ 일시적으로 불러올 수 없습니다
          </div>
        );
      }

      return (
        <div className="panel p-4 sm:p-6 border-[#ff3860]/30 bg-[rgba(255,56,96,0.03)]">
          <div className="flex flex-col items-center gap-2 py-4">
            <div className="text-[24px]">🔧</div>
            <div className="text-[12px] font-bold down kr">
              {panelName} 로딩 오류
            </div>
            <div className="text-[9px] dim kr max-w-md text-center">
              이 섹션을 일시적으로 표시할 수 없습니다. 나머지 대시보드는 정상 작동 중입니다.
            </div>
            {this.state.error && (
              <details className="text-[8px] dim mt-2 max-w-md">
                <summary className="cursor-pointer hover:bright">기술적 상세</summary>
                <code className="block mt-1 p-2 bg-black/30 rounded break-all">
                  {this.state.error.message}
                </code>
              </details>
            )}
            <button
              onClick={this.retry}
              className="mt-2 px-3 py-1 text-[9px] border border-[var(--amber)] text-[var(--amber)] hover:bg-[rgba(255,176,0,0.1)]"
            >
              ↻ 다시 시도
            </button>
          </div>
        </div>
      );
    }

    return <>{this.props.children}</>;
  }
}
