"use client";
// MarqueeFooter — horizontally scrolling text strip at bottom of page
// Uses CSS animation only (no GSAP dependency for this simple element)

export function MarqueeFooter() {
  const text =
    "BUILT FOR THE FUTURE OF EDUCATION • OPERATING ON GROQ L3 • DESIGNED FOR EMPATHY • CUEMATH AI SCREENER • ";

  return (
    <div className="border-t border-white/10 overflow-hidden py-3 bg-[#050505]">
      <div className="flex whitespace-nowrap animate-marquee">
        {/* Duplicate for seamless loop */}
        {[0, 1].map((i) => (
          <span
            key={i}
            className="text-white/30 text-[10px] tracking-[0.25em] font-mono uppercase mr-8"
            style={{ fontFamily: "'Geist Mono', monospace" }}
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
