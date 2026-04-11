import Link from "next/link";

export default function InterviewCompletePage() {
  return (
    <main className="min-h-screen bg-[#050505] flex items-center justify-center px-6">
      <div className="w-full max-w-2xl border border-white/10 bg-[#0A0A0A] p-10 md:p-14 space-y-8 text-center">
        <p
          className="text-[10px] tracking-[0.35em] uppercase text-white/35"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          Interview Complete
        </p>

        <h1
          className="text-3xl md:text-5xl font-extrabold text-[#F2F2F2]"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          Thank You For Your Time
        </h1>

        <p
          className="text-base md:text-lg text-white/70 leading-relaxed"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          Your responses were recorded and shared with our hiring team. We&rsquo;ll review them and be in touch soon.
        </p>

        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center border border-white/20 px-8 py-3 text-sm tracking-[0.2em] uppercase text-[#F2F2F2] hover:bg-[#F2F2F2] hover:text-[#050505] transition-all"
            style={{ fontFamily: "var(--font-bricolage)" }}
          >
            Back To Home
          </Link>
        </div>
      </div>
    </main>
  );
}
