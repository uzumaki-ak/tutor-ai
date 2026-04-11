"use client";
// useSpeech — Text-to-speech via browser's window.speechSynthesis
// Supports male/female voice selection; no API key needed

import { useCallback, useEffect, useRef, useState } from "react";
import { Gender } from "@/types";

interface UseSpeechReturn {
  speak: (text: string, callbacks?: SpeakCallbacks) => void;
  stop: () => void;
  isSpeaking: boolean;
  voicesReady: boolean;
}

interface SpeakCallbacks {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

export function useSpeech(gender: Gender): UseSpeechReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voicesReady, setVoicesReady] = useState(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // Load available voices (async in most browsers)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
      if (voicesRef.current.length > 0) setVoicesReady(true);
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  // Pick a voice matching the requested gender
  const pickVoice = useCallback((g: Gender): SpeechSynthesisVoice | null => {
    const voices = voicesRef.current;
    if (!voices.length) return null;

    // Preference keywords for each gender
    const femaleKeywords = ["female", "woman", "girl", "zira", "samantha", "victoria", "karen"];
    const maleKeywords = ["male", "man", "guy", "david", "daniel", "mark", "alex", "james"];
    const keywords = g === "female" ? femaleKeywords : maleKeywords;

    // Try to find a matching English voice
    const match = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        keywords.some((k) => v.name.toLowerCase().includes(k))
    );

    // Fallback: any English voice, then first available
    return match ?? voices.find((v) => v.lang.startsWith("en")) ?? voices[0];
  }, []);

  const speak = useCallback(
    (text: string, callbacks?: SpeakCallbacks) => {
      if (typeof window === "undefined") return;
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = pickVoice(gender);
      utterance.rate = 0.95;
      utterance.pitch = gender === "female" ? 1.1 : 0.9;

      utterance.onstart = () => {
        setIsSpeaking(true);
        callbacks?.onStart?.();
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        callbacks?.onEnd?.();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        callbacks?.onError?.();
      };

      window.speechSynthesis.speak(utterance);
    },
    [gender, pickVoice]
  );

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  return { speak, stop, isSpeaking, voicesReady };
}
