import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // 서버 컴포넌트 최적화
    typedRoutes: false,
  },
  // Vercel 환경 변수 타입 체크 건너뛰기 (빌드 가속)
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
