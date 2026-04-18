import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0a0e0a",
        "bg-panel": "#0f1411",
        "bg-hover": "#141a15",
        border: {
          DEFAULT: "#1f2a20",
          bright: "#2d3d2f",
        },
        text: {
          DEFAULT: "#c8d4c9",
          dim: "#6b7a6c",
          bright: "#ffffff",
        },
        amber: {
          DEFAULT: "#ffb000",
          dim: "#8f6400",
        },
        green: {
          DEFAULT: "#00ff88",
          dim: "#00a855",
        },
        red: {
          DEFAULT: "#ff3860",
          dim: "#a02040",
        },
        cyan: "#00d4ff",
        magenta: "#ff00aa",
      },
      fontFamily: {
        mono: ["JetBrains Mono", "monospace"],
        serif: ["Fraunces", "serif"],
        kr: ["Noto Sans KR", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
