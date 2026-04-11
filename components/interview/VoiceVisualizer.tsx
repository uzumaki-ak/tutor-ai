"use client";
// VoiceVisualizer — grainy blurred circle that expands/contracts with audio level
// Used on landing (mic-check) and during interview (listening state)

interface VoiceVisualizerProps {
  audioLevel: number; // 0-1
  isActive: boolean;  // whether mic is live
  isSpeaking?: boolean; // AI is speaking
}

export function VoiceVisualizer({ audioLevel, isActive, isSpeaking }: VoiceVisualizerProps) {
  // Scale circle based on audio level, with a floor so it's always visible
  const scale = isActive ? 1 + audioLevel * 0.6 : isSpeaking ? 1.15 : 1;
  const opacity = isActive || isSpeaking ? 0.9 : 0.3;

  return (
    <div className="relative flex items-center justify-center w-48 h-48">
      {/* Outer glow ring — blurred */}
      <div
        className="absolute inset-0 rounded-full transition-all duration-75"
        style={{
          background: "radial-gradient(circle, #F2F2F2 0%, transparent 70%)",
          transform: `scale(${scale * 1.3})`,
          opacity: opacity * 0.15,
          filter: "blur(24px)",
        }}
      />

      {/* Mid ring */}
      <div
        className="absolute inset-4 rounded-full transition-all duration-75"
        style={{
          background: "radial-gradient(circle, #F2F2F2 0%, transparent 60%)",
          transform: `scale(${scale * 1.1})`,
          opacity: opacity * 0.25,
          filter: "blur(12px)",
        }}
      />

      {/* Core circle — sharp */}
      <div
        className="w-20 h-20 rounded-full border border-white/20 flex items-center justify-center transition-all duration-75"
        style={{
          transform: `scale(${scale})`,
          background: isActive
            ? `rgba(242,242,242,${0.05 + audioLevel * 0.15})`
            : "rgba(242,242,242,0.04)",
        }}
      >
        {/* Center dot */}
        <div
          className="w-2 h-2 rounded-full bg-[#F2F2F2] transition-all duration-75"
          style={{ opacity: isActive || isSpeaking ? 1 : 0.4 }}
        />
      </div>

      {/* Grain overlay on visualizer */}
      <div
        className="absolute inset-0 rounded-full pointer-events-none opacity-20"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 128 128' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
