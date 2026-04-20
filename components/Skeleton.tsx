"use client";

// ═══════════════════════════════════════════════════════════
// 스켈레톤 로딩 UI
// 로딩 중에 빈 화면 대신 애니메이션된 placeholder 표시
// ═══════════════════════════════════════════════════════════

export function SkeletonBar({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`bg-gradient-to-r from-[var(--border)] via-[var(--border-bright)] to-[var(--border)] bg-[length:200%_100%] animate-[shimmer_1.5s_infinite] rounded ${className}`}
      style={style}
    />
  );
}

export function SkeletonPanel({
  title = "",
  rows = 3,
  className = "",
}: {
  title?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={`panel p-3 sm:p-5 ${className}`}>
      {title && (
        <div className="text-[10px] dim kr mb-3 opacity-60">{title} 로딩 중...</div>
      )}
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <SkeletonBar className="w-20 h-4" />
            <SkeletonBar className="flex-1 h-4" />
            <SkeletonBar className="w-16 h-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-[var(--border)] rounded p-3">
          <SkeletonBar className="w-16 h-3 mb-2" />
          <SkeletonBar className="w-24 h-6 mb-1" />
          <SkeletonBar className="w-20 h-3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ cols = 5, rows = 6 }: { cols?: number; rows?: number }) {
  return (
    <div className="w-full">
      {/* 헤더 */}
      <div className="flex gap-2 py-2 border-b border-[var(--border)]">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonBar key={i} className="flex-1 h-3 opacity-50" />
        ))}
      </div>
      {/* 로우들 */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2 py-2 border-b border-[var(--border)]">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBar key={c} className={`flex-1 h-4 ${c === 0 ? "w-16 flex-none" : ""}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ height = 200 }: { height?: number }) {
  return (
    <div
      className="w-full border border-[var(--border)] rounded relative overflow-hidden"
      style={{ height }}
    >
      <div className="absolute inset-0 flex items-center justify-center text-[10px] dim kr opacity-40">
        차트 로딩 중...
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex items-end gap-1 p-2">
        {Array.from({ length: 20 }).map((_, i) => (
          <SkeletonBar
            key={i}
            className="flex-1 opacity-30"
            style={{ height: `${20 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  );
}
