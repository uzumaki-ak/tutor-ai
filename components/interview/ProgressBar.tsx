"use client";
// ProgressBar — shows Q{n} of {total} with filled segments
// IBM Plex Mono for numbers, thin lines for segments

interface ProgressBarProps {
  current: number;
  total: number;
}

export function ProgressBar({ current, total }: ProgressBarProps) {
  return (
    <div className="w-full max-w-2xl space-y-2">
      {/* Label */}
      <div
        className="flex justify-between text-[10px] tracking-[0.2em] text-white/30"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <span>QUESTION {current} OF {total}</span>
        <span>{Math.round((current / total) * 100)}%</span>
      </div>

      {/* Segment bar */}
      <div className="flex gap-1 h-[2px]">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className="flex-1 transition-all duration-500"
            style={{
              background: i < current ? "#F2F2F2" : "rgba(242,242,242,0.1)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
