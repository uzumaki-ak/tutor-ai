"use client";
// MicButton — record button + spacebar shortcut
// Shows full-screen RECORDING overlay with animated dot when active

import { useEffect } from "react";

type ButtonState = "idle" | "recording" | "processing" | "disabled";

interface MicButtonProps {
  state: ButtonState;
  onStart: () => void;
  onStop: () => void;
}

export function MicButton({ state, onStart, onStop }: MicButtonProps) {
  const isRecording = state === "recording";
  const isDisabled = state === "processing" || state === "disabled";

  // Spacebar: press to start, release to stop
  // Removed e.target === document.body — that was blocking it when focus was elsewhere
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space" && !e.repeat && state === "idle") {
        e.preventDefault();
        onStart();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && state === "recording") {
        e.preventDefault();
        onStop();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [state, onStart, onStop]);

  return (
    <>
      {/* ── Full-screen recording indicator overlay ── */}
      {isRecording && (
        <div className="fixed inset-0 z-40 pointer-events-none flex flex-col items-center justify-end pb-32">
          {/* Top-left pill badge */}
          <div className="fixed top-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-[#F2F2F2] text-[#050505] px-5 py-2.5">
            {/* Pulsing red dot */}
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 bg-red-500" />
            </span>
            <span
              className="text-[11px] tracking-[0.25em] uppercase font-semibold"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              RECORDING — SPEAK NOW
            </span>
          </div>

          {/* Bottom hint */}
          <span
            className="text-[10px] tracking-[0.2em] text-white/30 uppercase"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            RELEASE SPACEBAR OR BUTTON TO SEND
          </span>
        </div>
      )}

      {/* ── The button ── */}
      <button
        onMouseDown={() => !isDisabled && state === "idle" && onStart()}
        onMouseUp={() => state === "recording" && onStop()}
        onMouseLeave={() => state === "recording" && onStop()} // safety: stop if mouse leaves while held
        onTouchStart={(e) => {
          e.preventDefault();
          if (state === "idle") onStart();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          if (state === "recording") onStop();
        }}
        disabled={isDisabled}
        className={`
          relative w-56 h-16 border text-xs tracking-[0.2em] uppercase
          transition-all duration-150 select-none
          ${isRecording
            ? "bg-[#F2F2F2] text-[#050505] border-[#F2F2F2]"
            : isDisabled
            ? "bg-transparent text-white/15 border-white/[0.06] cursor-not-allowed"
            : "bg-transparent text-[#F2F2F2] border-white/25 hover:bg-[#F2F2F2] hover:text-[#050505] hover:border-[#F2F2F2] cursor-pointer active:scale-[0.98]"
          }
        `}
        style={{ fontFamily: "var(--font-bricolage)" }}
      >
        {/* Ping border when recording */}
        {isRecording && (
          <span className="absolute inset-0 border border-white/50 animate-ping" />
        )}

        {/* Label */}
        <span className="flex items-center justify-center gap-2">
          {isRecording && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute h-full w-full bg-red-400 opacity-75" />
              <span className="relative h-2 w-2 bg-red-400" />
            </span>
          )}
          {state === "idle" && "● HOLD TO SPEAK"}
          {state === "recording" && "■ RECORDING..."}
          {state === "processing" && "⟳ PROCESSING"}
          {state === "disabled" && "WAIT FOR AI"}
        </span>
      </button>
    </>
  );
}
