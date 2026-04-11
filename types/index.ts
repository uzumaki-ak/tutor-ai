// Central type definitions for the AI Tutor Screener

export type Gender = "male" | "female";

export type InterviewStatus =
  | "idle"
  | "mic-check"
  | "in-progress"
  | "completed"
  | "error";

export type VerdictType = "pass" | "review" | "fail";

// A single turn in the conversation
export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// Candidate info collected before interview starts
export interface CandidateInfo {
  name: string;
  gender: Gender;
  subject: string; // e.g. "Math", "Science"
  ageGroup: string; // e.g. "6-8", "9-12"
}

// One dimension of the rubric
export interface RubricDimension {
  label: string;
  score: number; // 1-5
  evidence: string; // quote from candidate
  feedback: string; // short explanation
}

// Per-turn rubric score (internal aggregation, not shown to candidate UI)
export interface TurnScore {
  turnNumber: number;
  dimensions: {
    clarity: RubricDimension;
    warmth: RubricDimension;
    simplicity: RubricDimension;
    patience: RubricDimension;
    fluency: RubricDimension;
  };
  overallScore: number;
}

// Full assessment result
export interface AssessmentResult {
  candidateName: string;
  verdict: VerdictType;
  overallScore: number; // average of 5 dimensions
  dimensions: {
    clarity: RubricDimension;
    warmth: RubricDimension;
    simplicity: RubricDimension;
    patience: RubricDimension;
    fluency: RubricDimension;
  };
  summary: string;
  createdAt: string;
}

// LLM provider identifiers for fallback chain
export type LLMProvider = "groq" | "gemini" | "openrouter" | "euron";

// Chat message format for LLM APIs
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// API response shape from /api/chat
export interface ChatResponse {
  message: string;
  provider: LLMProvider;
  isLastQuestion: boolean;
  turnScore?: TurnScore;
}

// API response shape from /api/transcribe
export interface TranscribeResponse {
  text: string;
}

// API response shape from /api/evaluate
export interface EvaluateResponse {
  result: AssessmentResult;
  warning?: string;
}

// Supabase DB row shape
export interface InterviewRecord {
  id: string;
  candidate_name: string;
  subject: string;
  age_group: string;
  verdict: VerdictType;
  overall_score: number;
  assessment: AssessmentResult;
  transcript: ConversationTurn[];
  created_at: string;
}
