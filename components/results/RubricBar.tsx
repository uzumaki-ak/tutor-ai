"use client";
// RubricBar — animated vertical loading bar for one rubric dimension
// Fills from bottom up based on score (1-5)

import { useEffect, useRef } from "react";
import { RubricDimension } from "@/types";

interface RubricBarProps {
  dimension: RubricDimension;
  delay?: number; // animation stagger in ms
}

export function RubricBar({ dimension, delay = 0 }: RubricBarProps) {
  const fillRef = useRef<HTMLDivElement>(null);
  const percent = ((dimension.score - 1) / 4) * 100; // 1→0%, 5→100%

  // Animate fill after mount with delay for stagger effect
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (fillRef.current) {
        fillRef.current.style.height = `${percent}%`;
      }
    }, delay + 200);
    return () => clearTimeout(timeout);
  }, [percent, delay]);

  // Score color — white for high, muted for low
  const scoreColor =
    dimension.score >= 4 ? "#F2F2F2" : dimension.score >= 3 ? "#999" : "#555";

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Score number */}
      <span
        className="text-2xl font-bold tabular-nums"
        style={{ fontFamily: "var(--font-mono)", color: scoreColor }}
      >
        {dimension.score}
        <span className="text-xs text-white/20">/5</span>
      </span>

      {/* Vertical bar track */}
      <div className="relative w-12 h-32 border border-white/10 bg-white/[0.02] overflow-hidden">
        {/* Fill — animates from 0 to percent */}
        <div
          ref={fillRef}
          className="absolute bottom-0 left-0 right-0 transition-all duration-700"
          style={{
            height: "0%",
            background: `linear-gradient(to top, ${scoreColor}, ${scoreColor}66)`,
            transitionDelay: `${delay}ms`,
          }}
        />
      </div>

      {/* Dimension label */}
      <div className="text-center space-y-1">
        <p
          className="text-[9px] tracking-[0.15em] uppercase text-white/40"
          style={{ fontFamily: "var(--font-geist)", maxWidth: "5rem" }}
        >
          {dimension.label}
        </p>
      </div>

      {/* Evidence quote */}
      <p
        className="text-[11px] text-white/50 text-center max-w-[8rem] leading-relaxed hidden md:block"
        style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic" }}
      >
        &ldquo;{dimension.evidence}&rdquo;
      </p>
    </div>
  );
}
