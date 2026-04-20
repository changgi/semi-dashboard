"use client";

import { ReactNode } from "react";
import { useSectionVisibility } from "./DashboardSettings";

// ═══════════════════════════════════════════════════════════
// SectionWrapper
// 설정에 따라 섹션을 표시/숨김
// ═══════════════════════════════════════════════════════════
export function SectionWrapper({
  id,
  children,
  className = "col-span-12",
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const isVisible = useSectionVisibility();

  if (!isVisible(id)) return null;

  return (
    <div id={id} className={className}>
      {children}
    </div>
  );
}
