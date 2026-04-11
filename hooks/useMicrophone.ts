"use client";
// useMicrophone — handles mic permission, recording start/stop
// Returns audio as a Blob when recording stops

import { useCallback, useEffect, useRef, useState } from "react";

export type MicState = "idle" | "requesting" | "ready" | "recording" | "error";

interface UseMicrophoneReturn {
  micState: MicState;
  isRecording: boolean;
  audioLevel: number; // 0-1 for visualizer
  startRecording: () => void;
  stopRecording: () => Promise<Blob | null>;
  requestPermission: () => Promise<boolean>;
  error: string | null;
}

export function useMicrophone(): UseMicrophoneReturn {
  const [micState, setMicState] = useState<MicState>("idle");
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const resolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const pollAudioLevelRef = useRef<() => void>(() => {});

  // Continuously poll audio level from AnalyserNode
  const pollAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    setAudioLevel(avg / 255);
    animFrameRef.current = requestAnimationFrame(pollAudioLevelRef.current);
  }, []);

  // Keep recursive animation callback stable without self-reference lint issues
  useEffect(() => {
    pollAudioLevelRef.current = pollAudioLevel;
  }, [pollAudioLevel]);

  // Request mic permission and set up audio context
  const requestPermission = useCallback(async (): Promise<boolean> => {
    setMicState("requesting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Set up Web Audio API analyser for visualizer
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      setMicState("ready");
      return true;
    } catch {
      setError("Microphone permission denied. Please allow access and refresh.");
      setMicState("error");
      return false;
    }
  }, []);

  // Start recording audio
  const startRecording = useCallback(() => {
    if (!streamRef.current || micState === "recording") return;

    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm",
    });

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      resolveRef.current?.(blob);
      resolveRef.current = null;
      cancelAnimationFrame(animFrameRef.current);
      setAudioLevel(0);
      setMicState("ready");
    };

    recorderRef.current = recorder;
    recorder.start(100); // collect data every 100ms
    setMicState("recording");
    pollAudioLevelRef.current();
  }, [micState]);

  // Stop recording and return audio blob via Promise
  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!recorderRef.current || recorderRef.current.state !== "recording") {
        resolve(null);
        return;
      }
      resolveRef.current = resolve;
      recorderRef.current.stop();
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    micState,
    isRecording: micState === "recording",
    audioLevel,
    startRecording,
    stopRecording,
    requestPermission,
    error,
  };
}
