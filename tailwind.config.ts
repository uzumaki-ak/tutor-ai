// tailwind.config.ts — custom design tokens for Matte Noir theme

import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        noir: {
          bg: "#050505",
          surface: "#0A0A0A",
          stroke: "#1A1A1A",
          text: "#F2F2F2",
          muted: "#666666",
          accent: "#F2F2F2",
        },
      },
      fontFamily: {
        syne: ["Syne", "sans-serif"],
        cormorant: ["Cormorant Garamond", "serif"],
        mono: ["IBM Plex Mono", "monospace"],
        bricolage: ["Bricolage Grotesque", "sans-serif"],
        geist: ["Geist Mono", "monospace"],
        inter: ["Inter", "sans-serif"],
      },
      animation: {
        marquee: "marquee 30s linear infinite",
        pulse2: "pulse2 2s ease-in-out infinite",
        breathe: "breathe 3s ease-in-out infinite",
        stamp: "stamp 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) forwards",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
        pulse2: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.4", transform: "scale(0.95)" },
        },
        breathe: {
          "0%, 100%": { backgroundColor: "#050505" },
          "50%": { backgroundColor: "#0A0A0A" },
        },
        stamp: {
          "0%": { opacity: "0", transform: "rotate(-5deg) scale(1.4)" },
          "60%": { opacity: "1", transform: "rotate(-5deg) scale(0.95)" },
          "100%": { opacity: "1", transform: "rotate(-5deg) scale(1)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
