import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEMI TERMINAL // Real-time Semiconductor Dashboard",
  description:
    "Real-time semiconductor sector dashboard. NVDA, TSM, AVGO, AMD, MU and more.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>◢</text></svg>",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Semi Terminal",
  },
};

// 모바일 뷰포트 - 가로 스크롤 방지 + 차트 핀치 줌 허용
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#0a0a0a",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
