"use client";
// app/interview/page.tsx — live interview engine
// Fixed: init runs exactly once via ref guard; mute button added; speech cancelled on unmount

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CandidateInfo } from "@/types";
import { useMicrophone } from "@/hooks/useMicrophone";
import { useSpeech } from "@/hooks/useSpeech";
import { useConversation } from "@/hooks/useConversation";
import { VoiceVisualizer } from "@/components/interview/VoiceVisualizer";
import { MicButton } from "@/components/interview/MicButton";
import { LiveTranscript } from "@/components/interview/LiveTranscript";
import { ProgressBar } from "@/components/interview/ProgressBar";

export default function InterviewPage() {
  const router = useRouter();
  const hasInit = useRef(false); // guard: prevent initInterview from running more than once
  const completionRedirectedRef = useRef(false);
  const [isMuted, setIsMuted] = useState(false);

  // Read candidate once — stable ref, never changes
  const candidateRef = useRef<CandidateInfo | null>(
    typeof window !== "undefined"
      ? JSON.parse(sessionStorage.getItem("candidate") ?? "null")
      : null
  );
  const candidate = candidateRef.current;

  const { audioLevel, isRecording, startRecording, stopRecording, requestPermission } =
    useMicrophone();
  const { speak, stop: stopSpeech, isSpeaking } = useSpeech(candidate?.gender ?? "male");
  const {
    phase, history, currentAIMessage, questionNumber,
    totalQuestions, result, errorMsg, startInterview, markUserTurn, submitUserTurn, reset,
  } = useConversation();

  // Cancel any ongoing speech immediately when page unmounts or browser refreshes
  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

  // Redirect to home if no candidate info
  useEffect(() => {
    if (!candidate) router.push("/");
  }, [candidate, router]);

  // Redirect to completion only after final TTS is done (or timeout fallback),
  // so the last AI sentence is not cut off.
  useEffect(() => {
    if (phase !== "completed" || !result || completionRedirectedRef.current) return;

    if (!isSpeaking || isMuted) {
      completionRedirectedRef.current = true;
      sessionStorage.removeItem("result");
      router.push("/interview/complete");
      return;
    }

    const failSafe = window.setTimeout(() => {
      if (completionRedirectedRef.current) return;
      completionRedirectedRef.current = true;
      sessionStorage.removeItem("result");
      router.push("/interview/complete");
    }, 15000);

    return () => window.clearTimeout(failSafe);
  }, [phase, result, isSpeaking, isMuted, router]);

  // Init interview exactly once — ref guard prevents re-runs when phase/deps change
  useEffect(() => {
    if (hasInit.current || !candidate) return;
    hasInit.current = true;

    const init = async () => {
      await requestPermission();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate, history: [] }),
      });
      const { message } = await res.json();
      startInterview(candidate, message);
    };

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty — runs once on mount only

  // Speak when AI produces a new message AND not muted
  const lastSpokenRef = useRef(""); // prevent re-speaking same message
  useEffect(() => {
    if (!currentAIMessage || phase !== "ai-speaking") return;

    if (isMuted) {
      markUserTurn();
      return;
    }

    if (currentAIMessage === lastSpokenRef.current) return;
    lastSpokenRef.current = currentAIMessage;

    speak(currentAIMessage, {
      onEnd: markUserTurn,
      onError: markUserTurn,
    });
  }, [currentAIMessage, phase, isMuted, speak, markUserTurn]);

  // Reset duplicate-speech guard after each turn.
  useEffect(() => {
    if (phase !== "ai-speaking") lastSpokenRef.current = "";
  }, [phase]);

  // Stop speech immediately when muted
  useEffect(() => {
    if (!isMuted) return;
    stopSpeech();
    if (phase === "ai-speaking") markUserTurn();
  }, [isMuted, stopSpeech, phase, markUserTurn]);

  // Mic handlers — stop AI speech before recording
  const handleMicStart = () => {
    stopSpeech();
    startRecording();
  };

  const handleMicStop = async () => {
    const blob = await stopRecording();
    if (blob) await submitUserTurn(blob);
  };

  const micButtonState =
    isRecording ? "recording"
    : phase === "transcribing" || phase === "ai-thinking" ? "processing"
    : phase === "ai-speaking" || phase === "not-started" || phase === "completed" || phase === "error" ? "disabled"
    : "idle";

  // Subtle background breathe when AI is thinking
  const bgColor = phase === "ai-thinking" ? "#0A0A0A" : "#050505";

  if (!candidate) return null;

  return (
    <main
      className="min-h-screen flex flex-col transition-colors duration-1000"
      style={{ backgroundColor: bgColor }}
    >
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.06]">
        <span
          className="text-xs tracking-[0.3em] text-white/30 uppercase"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {candidate.name.toUpperCase()} — {candidate.subject.toUpperCase()}
        </span>

        {/* Status */}
        <div
          className="text-xs tracking-[0.2em] text-white/20 uppercase"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {phase === "ai-speaking" && "▶ AI SPEAKING"}
          {phase === "user-turn" && "◉ YOUR TURN"}
          {phase === "transcribing" && "... TRANSCRIBING"}
          {phase === "ai-thinking" && "⟳ PROCESSING"}
          {phase === "not-started" && "INITIALIZING"}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4">
          {/* Mute toggle */}
          <button
            onClick={() => { setIsMuted(m => !m); if (!isMuted) stopSpeech(); }}
            className={`text-[10px] tracking-[0.2em] uppercase transition-colors px-3 py-1 border ${
              isMuted
                ? "border-white/40 text-white/60"
                : "border-white/10 text-white/20 hover:border-white/30 hover:text-white/40"
            }`}
            style={{ fontFamily: "var(--font-mono)" }}
            title="Toggle AI voice"
          >
            {isMuted ? "UNMUTE" : "MUTE"}
          </button>

          {/* End interview */}
          <button
            onClick={() => { window.speechSynthesis?.cancel(); reset(); router.push("/"); }}
            className="text-[10px] tracking-[0.2em] text-white/20 hover:text-white/40 uppercase transition-colors"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            END ×
          </button>
        </div>
      </div>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12 space-y-12">

        <VoiceVisualizer
          audioLevel={audioLevel}
          isActive={isRecording}
          isSpeaking={isSpeaking && !isMuted}
        />

        <div className="text-center">
          <p
            className="text-[10px] tracking-[0.3em] text-white/25 uppercase"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {phase === "ai-speaking" && (isMuted ? "AI RESPONDED — YOUR TURN WHEN READY" : "INTERVIEWER IS SPEAKING — LISTEN")}
            {phase === "user-turn" && "PRESS & HOLD TO RESPOND"}
            {phase === "transcribing" && "TRANSCRIBING YOUR RESPONSE..."}
            {phase === "ai-thinking" && "PROCESSING YOUR ANSWER..."}
            {phase === "not-started" && "PREPARING INTERVIEW..."}
          </p>
        </div>

        <MicButton state={micButtonState} onStart={handleMicStart} onStop={handleMicStop} />

        <div className="w-full max-w-2xl">
          <ProgressBar current={questionNumber} total={totalQuestions} />
        </div>

        <LiveTranscript
          history={history}
          currentAIMessage={currentAIMessage}
          isTyping={phase === "ai-speaking"}
        />

        {errorMsg && (
          <div className="border border-white/10 px-6 py-4 max-w-lg text-center space-y-3">
            <p className="text-xs text-white/40" style={{ fontFamily: "var(--font-mono)" }}>
              {errorMsg}
            </p>
            <p className="text-[10px] text-white/20" style={{ fontFamily: "var(--font-mono)" }}>
              Try speaking again or check your connection.
            </p>
          </div>
        )}
      </div>

      {/* ── Bottom hint ── */}
      <div className="px-8 py-4 border-t border-white/[0.04] text-center">
        <span
          className="text-[10px] tracking-[0.2em] text-white/15 uppercase"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          SPACEBAR TO RECORD · RELEASE TO SEND · MUTE BUTTON TOP RIGHT
        </span>
      </div>
    </main>
  );
}
