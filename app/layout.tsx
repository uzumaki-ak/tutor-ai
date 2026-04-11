// app/layout.tsx — root layout
// Loads Google Fonts via <link> (CDN) instead of next/font to avoid build-time fetch
// This works both locally and on Vercel

import type { Metadata } from "next";
import { GrainOverlay } from "@/components/ui/GrainOverlay";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cuemath AI Tutor Screener",
  description: "Intelligent voice-based screening for tutor candidates",
  authors: [{ name: "Anikesh Kumar", url: "https://anikeshiro.vercel.app" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&family=IBM+Plex+Mono:wght@400;500&family=Bricolage+Grotesque:wght@400;500;600&family=Inter:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#050505] text-[#F2F2F2] antialiased min-h-screen">
        <GrainOverlay />
        {children}
      </body>
    </html>
  );
}
