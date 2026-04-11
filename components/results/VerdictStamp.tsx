"use client";
// VerdictStamp — physical ink stamp aesthetic, rotated -5deg
// Animates in with a stamp-press effect on mount

import { VerdictType } from "@/types";

interface VerdictStampProps {
  verdict: VerdictType;
}

const STAMP_CONFIG: Record<VerdictType, { label: string; color: string; border: string }> = {
  pass: {
    label: "PASS",
    color: "rgba(242,242,242,0.9)",
    border: "rgba(242,242,242,0.6)",
  },
  review: {
    label: "REVIEW",
    color: "rgba(180,180,180,0.9)",
    border: "rgba(180,180,180,0.6)",
  },
  fail: {
    label: "FAIL",
    color: "rgba(80,80,80,0.9)",
    border: "rgba(80,80,80,0.6)",
  },
};

export function VerdictStamp({ verdict }: VerdictStampProps) {
  const config = STAMP_CONFIG[verdict];

  return (
    <div
      className="inline-block animate-stamp"
      style={{ transform: "rotate(-5deg)", transformOrigin: "center" }}
    >
      <div
        className="px-8 py-4 border-4"
        style={{
          borderColor: config.border,
          color: config.color,
          fontFamily: "var(--font-syne)",
          fontWeight: 800,
          fontSize: "2.5rem",
          letterSpacing: "0.25em",
          // Distressed stamp look via box-shadow
          boxShadow: `inset 0 0 0 2px ${config.border}, 0 0 0 1px ${config.border}33`,
          textShadow: `2px 2px 0 ${config.border}44`,
        }}
      >
        {config.label}
      </div>
    </div>
  );
}
