"use client";
// useConversation — central state machine for the interview
// Manages question turns, transcription, AI responses, and completion

import { useCallback, useState } from "react";
import { CandidateInfo, ConversationTurn, AssessmentResult, ChatResponse, TurnScore } from "@/types";

export type ConversationPhase =
  | "not-started"
  | "ai-speaking"
  | "user-turn"
  | "transcribing"
  | "ai-thinking"
  | "completed"
  | "error";

interface UseConversationReturn {
  phase: ConversationPhase;
  history: ConversationTurn[];
  currentAIMessage: string;
  questionNumber: number;
  totalQuestions: number;
  result: AssessmentResult | null;
  errorMsg: string | null;
  startInterview: (candidate: CandidateInfo, firstMessage: string) => void;
  markUserTurn: () => void;
  submitUserTurn: (audioBlob: Blob) => Promise<void>;
  reset: () => void;
}

const TOTAL_QUESTIONS = 6;

export function useConversation(): UseConversationReturn {
  const [phase, setPhase] = useState<ConversationPhase>("not-started");
  const [history, setHistory] = useState<ConversationTurn[]>([]);
  const [currentAIMessage, setCurrentAIMessage] = useState("");
  const [questionNumber, setQuestionNumber] = useState(0);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<CandidateInfo | null>(null);
  const [awaitingEvaluation, setAwaitingEvaluation] = useState(false);
  const [turnScores, setTurnScores] = useState<TurnScore[]>([]);

  // Add a turn to history
  const addTurn = useCallback((role: "user" | "assistant", content: string) => {
    setHistory((prev) => [...prev, { role, content, timestamp: Date.now() }]);
  }, []);

  // Kick off the interview with the AI's opening message
  const startInterview = useCallback(
    (info: CandidateInfo, firstMessage: string) => {
      setCandidate(info);
      setHistory([]);
      setQuestionNumber(1);
      setAwaitingEvaluation(false);
      setTurnScores([]);
      setCurrentAIMessage(firstMessage);
      addTurn("assistant", firstMessage);
      setPhase("ai-speaking");
    },
    [addTurn]
  );

  // Move from AI speaking to user response window.
  const markUserTurn = useCallback(() => {
    if (awaitingEvaluation) return;
    setPhase((prev) => (prev === "ai-speaking" ? "user-turn" : prev));
  }, [awaitingEvaluation]);

  // Called after the user finishes speaking — transcribes then gets AI response
  const submitUserTurn = useCallback(
    async (audioBlob: Blob) => {
      if (!candidate) return;
      setPhase("transcribing");
      setErrorMsg(null);

      try {
        // Step 1: Transcribe audio
        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");

        const transcribeRes = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!transcribeRes.ok) {
          const err = await transcribeRes.json();
          throw new Error(err.error ?? "Transcription failed");
        }

        const { text: userText } = await transcribeRes.json();
        addTurn("user", userText);
        setPhase("ai-thinking");

        // Step 2: Get AI response
        const updatedHistory: ConversationTurn[] = [
          ...history,
          { role: "user", content: userText, timestamp: Date.now() },
        ];

        const chatRes = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ candidate, history: updatedHistory }),
        });

        if (!chatRes.ok) {
          const err = await chatRes.json();
          throw new Error(err.error ?? "Chat failed");
        }

        const { message, isLastQuestion, turnScore }: ChatResponse = await chatRes.json();
        addTurn("assistant", message);
        setCurrentAIMessage(message);
        setQuestionNumber((n) => Math.min(n + 1, TOTAL_QUESTIONS));
        const latestTurnScores = turnScore ? [...turnScores, turnScore] : turnScores;
        if (turnScore) setTurnScores(latestTurnScores);

        if (isLastQuestion) {
          // Step 3: Evaluate full transcript
          setAwaitingEvaluation(true);
          setPhase("ai-speaking");
          setTimeout(async () => {
            try {
              const evalRes = await fetch("/api/evaluate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  candidate,
                  transcript: [
                    ...updatedHistory,
                    { role: "assistant", content: message, timestamp: Date.now() },
                  ],
                  turnScores: latestTurnScores,
                }),
              });

              const payload = await evalRes.json();
              if (!evalRes.ok || !payload?.result) {
                const errMessage =
                  (typeof payload?.error === "string" && payload.error) ||
                  "Evaluation failed";
                throw new Error(errMessage);
              }

              setResult(payload.result as AssessmentResult);
              setAwaitingEvaluation(false);
              setPhase("completed");
            } catch (evalErr) {
              const evalMsg =
                evalErr instanceof Error ? evalErr.message : "Evaluation failed";
              setErrorMsg(`Final scoring failed: ${evalMsg}. Please try again.`);
              setAwaitingEvaluation(false);
              setPhase("error");
            }
          }, 3000); // give TTS time to finish
        } else {
          setAwaitingEvaluation(false);
          setPhase("ai-speaking");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setErrorMsg(msg);
        setAwaitingEvaluation(false);
        setPhase("error");
      }
    },
    [candidate, history, addTurn, turnScores]
  );

  const reset = useCallback(() => {
    setPhase("not-started");
    setHistory([]);
    setCurrentAIMessage("");
    setQuestionNumber(0);
    setResult(null);
    setErrorMsg(null);
    setCandidate(null);
    setAwaitingEvaluation(false);
    setTurnScores([]);
  }, []);

  return {
    phase,
    history,
    currentAIMessage,
    questionNumber,
    totalQuestions: TOTAL_QUESTIONS,
    result,
    errorMsg,
    startInterview,
    markUserTurn,
    submitUserTurn,
    reset,
  };
}
