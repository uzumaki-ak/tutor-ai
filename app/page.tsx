"use client";
// app/page.tsx — Landing page
// Hero headline, candidate form, mic-check step, bento feature grid

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CandidateInfo, Gender } from "@/types";
import { VoiceVisualizer } from "@/components/interview/VoiceVisualizer";
import { MarqueeFooter } from "@/components/ui/MarqueeFooter";
import { useMicrophone } from "@/hooks/useMicrophone";

const SUBJECTS = ["Mathematics", "Science", "English", "Hindi", "Social Studies"];
const AGE_GROUPS = ["5-7", "8-10", "11-13", "14-16"];
const FEATURES = [
  { title: "Real-time\nWhisper STT", ascii: "[ ▶ ░░░░░░░░ ]", desc: "Groq-powered transcription" },
  { title: "Llama 3\nPedagogical Logic", ascii: "⟨ φ(x) → Y ⟩", desc: "Adaptive AI questioning" },
  { title: "Rubric-Based\nEvaluation", ascii: "█ █ ▒ ░ ░", desc: "5-dimension assessment" },
  { title: "Zero-Latency\nFeedback", ascii: "◦ ─── ●", desc: "Instant scoring report" },
];

export default function HomePage() {
  const router = useRouter();
  const { micState, audioLevel, requestPermission } = useMicrophone();
  const [candidate, setCandidate] = useState<CandidateInfo>({ name: "", gender: "male", subject: "Mathematics", ageGroup: "8-10" });
  const [step, setStep] = useState<"form" | "mic-check">("form");
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (step === "mic-check" && micState === "idle") requestPermission();
  }, [step, micState, requestPermission]);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate.name.trim()) return;
    setStep("mic-check");
  };

  const handleStart = () => {
    setIsStarting(true);
    sessionStorage.setItem("candidate", JSON.stringify(candidate));
    router.push("/interview");
  };

  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6 border-b border-white/[0.06]">
        <span className="text-xs tracking-[0.3em] text-white/40 uppercase" style={{ fontFamily: "var(--font-mono)" }}>CUEMATH / AI SCREENER</span>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] tracking-[0.2em] text-white/30 uppercase" style={{ fontFamily: "var(--font-mono)" }}>SYSTEM OPTIMIZED</span>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 px-8 md:px-16 pt-20 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="mb-16">
            <p className="text-[10px] tracking-[0.4em] text-white/30 uppercase mb-6" style={{ fontFamily: "var(--font-mono)" }}>V 1.0 — INTELLIGENT SCREENER</p>
            <h1 className="text-5xl md:text-7xl font-extrabold leading-[1.0] mb-4" style={{ fontFamily: "var(--font-syne)" }}>
              Empathetic{" "}
              <em style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontWeight: 400 }}>Tutoring</em>
              <br />Scaled by Intelligence.
            </h1>
            <p className="text-white/40 max-w-lg text-sm leading-relaxed mt-6" style={{ fontFamily: "var(--font-inter)" }}>
              A short voice conversation. An AI that listens, adapts, and evaluates. Find tutors who know the student, not just the subject.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-start">
            {/* Left: Form or Mic Check */}
            {step === "form" ? (
              <form onSubmit={handleFormSubmit} className="space-y-6">
                <h2 className="text-xs tracking-[0.3em] text-white/40 uppercase" style={{ fontFamily: "var(--font-mono)" }}>CANDIDATE DETAILS</h2>
                <div className="space-y-2">
                  <label className="text-[10px] tracking-[0.2em] text-white/30 uppercase block" style={{ fontFamily: "var(--font-mono)" }}>Full Name</label>
                  <input type="text" required placeholder="Enter your name" value={candidate.name}
                    onChange={(e) => setCandidate(p => ({ ...p, name: e.target.value }))}
                    className="w-full bg-transparent border border-white/10 px-4 py-3 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
                    style={{ fontFamily: "var(--font-inter)" }} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] tracking-[0.2em] text-white/30 uppercase block" style={{ fontFamily: "var(--font-mono)" }}>AI Voice Gender</label>
                  <div className="flex gap-3">
                    {(["male", "female"] as Gender[]).map(g => (
                      <button key={g} type="button" onClick={() => setCandidate(p => ({ ...p, gender: g }))}
                        className={`flex-1 py-2.5 text-xs tracking-[0.15em] uppercase border transition-all ${candidate.gender === g ? "bg-[#F2F2F2] text-[#050505] border-[#F2F2F2]" : "bg-transparent text-white/50 border-white/10 hover:border-white/30"}`}
                        style={{ fontFamily: "var(--font-bricolage)" }}>{g}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] tracking-[0.2em] text-white/30 uppercase block" style={{ fontFamily: "var(--font-mono)" }}>Subject You Teach</label>
                  <select value={candidate.subject} onChange={e => setCandidate(p => ({ ...p, subject: e.target.value }))}
                    className="w-full bg-[#0A0A0A] border border-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:border-white/30 transition-colors"
                    style={{ fontFamily: "var(--font-inter)" }}>
                    {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] tracking-[0.2em] text-white/30 uppercase block" style={{ fontFamily: "var(--font-mono)" }}>Student Age Group</label>
                  <div className="grid grid-cols-4 gap-2">
                    {AGE_GROUPS.map(ag => (
                      <button key={ag} type="button" onClick={() => setCandidate(p => ({ ...p, ageGroup: ag }))}
                        className={`py-2 text-xs tracking-[0.1em] border transition-all ${candidate.ageGroup === ag ? "bg-[#F2F2F2] text-[#050505] border-[#F2F2F2]" : "bg-transparent text-white/50 border-white/10 hover:border-white/30"}`}
                        style={{ fontFamily: "var(--font-mono)" }}>{ag}</button>
                    ))}
                  </div>
                </div>
                <button type="submit"
                  className="w-full py-4 border border-white/30 text-sm tracking-[0.2em] uppercase hover:bg-[#F2F2F2] hover:text-[#050505] hover:border-[#F2F2F2] transition-all duration-200"
                  style={{ fontFamily: "var(--font-bricolage)" }}>CHECK MICROPHONE →</button>
              </form>
            ) : (
              <div className="space-y-8">
                <h2 className="text-xs tracking-[0.3em] text-white/40 uppercase" style={{ fontFamily: "var(--font-mono)" }}>MIC CHECK</h2>
                <p className="text-sm text-white/50" style={{ fontFamily: "var(--font-inter)" }}>Say something to test your microphone. Make sure you are in a quiet environment.</p>
                <div className="flex flex-col items-center gap-6 py-4">
                  <VoiceVisualizer audioLevel={audioLevel} isActive={micState === "recording"} />
                  <span className="text-[10px] tracking-[0.3em] text-white/30 uppercase" style={{ fontFamily: "var(--font-mono)" }}>
                    {micState === "requesting" && "REQUESTING ACCESS..."}
                    {micState === "ready" && "MIC READY — SPEAK TO TEST"}
                    {micState === "error" && "ACCESS DENIED — REFRESH AND ALLOW"}
                    {micState === "idle" && "INITIALIZING..."}
                  </span>
                </div>
                <div className="space-y-3">
                  <button onClick={handleStart} disabled={micState !== "ready" || isStarting}
                    className="w-full py-4 border border-white/30 text-sm tracking-[0.2em] uppercase hover:bg-[#F2F2F2] hover:text-[#050505] hover:border-[#F2F2F2] transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
                    style={{ fontFamily: "var(--font-bricolage)" }}>{isStarting ? "STARTING..." : "BEGIN INTERVIEW →"}</button>
                  <button onClick={() => setStep("form")}
                    className="w-full py-2 text-xs text-white/20 hover:text-white/40 tracking-[0.2em] uppercase transition-colors"
                    style={{ fontFamily: "var(--font-mono)" }}>← BACK</button>
                </div>
              </div>
            )}

            {/* Right: Bento Grid */}
            <div className="grid grid-cols-2 gap-3">
              {FEATURES.map((f, i) => (
                <div key={i} className="border border-white/[0.08] p-5 space-y-4 hover:border-white/20 transition-colors">
                  <div className="text-white/20 text-sm" style={{ fontFamily: "var(--font-mono)", whiteSpace: "pre" }}>{f.ascii}</div>
                  <div>
                    <h3 className="text-sm font-bold leading-tight whitespace-pre-line" style={{ fontFamily: "var(--font-syne)" }}>{f.title}</h3>
                    <p className="text-[11px] text-white/30 mt-1" style={{ fontFamily: "var(--font-inter)" }}>{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <MarqueeFooter />
    </main>
  );
}
