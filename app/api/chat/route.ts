// POST /api/chat
// Accepts conversation history + candidate info
// Returns next AI question/response using 4-provider fallback chain
// Also returns hidden per-turn rubric scoring for backend aggregation

import { NextRequest, NextResponse } from "next/server";
import { chatWithFallback } from "@/lib/llm";
import { buildInterviewerPrompt, buildTurnScorerPrompt } from "@/lib/prompts";
import { CandidateInfo, ConversationTurn, RubricDimension, TurnScore } from "@/types";

export const runtime = "nodejs";
const TOTAL_QUESTIONS = 6;
const CLOSING_LINE = "that concludes our screening";

type DimKey = keyof TurnScore["dimensions"];

interface RequestBody {
  candidate: CandidateInfo;
  history: ConversationTurn[];
}

const DIMENSION_LABELS: Record<DimKey, string> = {
  clarity: "Clarity of Explanation",
  warmth: "Warmth & Empathy",
  simplicity: "Ability to Simplify",
  patience: "Patience",
  fluency: "English Fluency",
};

function detectLastQuestion(text: string): boolean {
  return text.toLowerCase().includes(CLOSING_LINE);
}

function buildForcedClosing(name: string): string {
  return `Thank you ${name}, that concludes our screening. We'll be in touch soon!`;
}

function stripMarkdownFences(text: string): string {
  return text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
}

function extractFirstJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No JSON object found");

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") inString = false;
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  throw new Error("Incomplete JSON object");
}

function repairLikelyInvalidJson(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;

  const nextNonWhitespace = (source: string, start: number): string => {
    for (let i = start; i < source.length; i++) {
      const ch = source[i];
      if (!/\s/.test(ch)) return ch;
    }
    return "";
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (!inString) {
      if (ch === "\"") inString = true;
      out += ch;
      continue;
    }

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === "\n" || ch === "\r") {
      out += "\\n";
      continue;
    }

    if (ch === "\"") {
      const next = nextNonWhitespace(input, i + 1);
      if (next && ![",", "}", "]", ":"].includes(next)) {
        out += "\\\"";
        continue;
      }
      inString = false;
      out += ch;
      continue;
    }

    out += ch;
  }

  if (inString) out += "\"";
  return out.replace(/,\s*([}\]])/g, "$1");
}

function parseModelJson(raw: string): unknown {
  const cleaned = stripMarkdownFences(raw);
  const candidate = cleaned.startsWith("{") ? cleaned : extractFirstJsonObject(cleaned);

  try {
    return JSON.parse(candidate);
  } catch {
    return JSON.parse(repairLikelyInvalidJson(candidate));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || fallback;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(5, Math.round(value)));
}

function snippet(text: string, maxWords = 22): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

function countHits(text: string, keywords: string[]): number {
  const normalized = ` ${text.toLowerCase()} `;
  let hits = 0;
  for (const keyword of keywords) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "g");
    const matches = normalized.match(regex);
    if (matches) hits += matches.length;
  }
  return hits;
}

function heuristicDimension(
  answer: string,
  key: DimKey,
  keywords: string[],
  base: number
): RubricDimension {
  const hits = countHits(answer, keywords);
  const words = answer.trim().split(/\s+/).filter(Boolean).length;
  const lengthBoost = words > 24 ? 0.8 : words > 12 ? 0.4 : 0;
  const score = clampScore(base + hits * 0.5 + lengthBoost);

  return {
    label: DIMENSION_LABELS[key],
    score,
    evidence: snippet(answer, 24) || "Candidate answer provided.",
    feedback: "Turn-level fallback scoring inferred from this response.",
  };
}

function buildHeuristicTurnScore(answer: string, turnNumber: number): TurnScore {
  const dimensions: TurnScore["dimensions"] = {
    clarity: heuristicDimension(
      answer,
      "clarity",
      ["explain", "because", "example", "first", "then", "step", "understand"],
      2
    ),
    warmth: heuristicDimension(
      answer,
      "warmth",
      ["encourage", "support", "care", "listen", "kind", "safe", "confidence"],
      2
    ),
    simplicity: heuristicDimension(
      answer,
      "simplicity",
      ["simple", "easy", "step by step", "example", "story", "visual"],
      2
    ),
    patience: heuristicDimension(
      answer,
      "patience",
      ["patient", "again", "repeat", "slow", "practice", "guide", "wait"],
      2
    ),
    fluency: heuristicDimension(
      answer,
      "fluency",
      ["therefore", "however", "for example", "approach", "understand"],
      2.2
    ),
  };

  const overallScore = Number(
    (
      (dimensions.clarity.score +
        dimensions.warmth.score +
        dimensions.simplicity.score +
        dimensions.patience.score +
        dimensions.fluency.score) /
      5
    ).toFixed(1)
  );

  return { turnNumber, dimensions, overallScore };
}

function normalizeTurnScore(
  raw: unknown,
  turnNumber: number,
  answerFallback: string
): TurnScore {
  if (!isRecord(raw)) throw new Error("Turn score payload is not an object");
  const dimsRaw = isRecord(raw.dimensions) ? raw.dimensions : {};

  const toDimension = (key: DimKey): RubricDimension => {
    const obj = isRecord(dimsRaw[key]) ? dimsRaw[key] : {};
    return {
      label: cleanText(obj.label, DIMENSION_LABELS[key]),
      score: clampScore(Number(obj.score)),
      evidence: cleanText(obj.evidence, snippet(answerFallback, 24) || "Candidate response."),
      feedback: cleanText(obj.feedback, "Turn-level score inferred from this response."),
    };
  };

  const dimensions: TurnScore["dimensions"] = {
    clarity: toDimension("clarity"),
    warmth: toDimension("warmth"),
    simplicity: toDimension("simplicity"),
    patience: toDimension("patience"),
    fluency: toDimension("fluency"),
  };

  const requestedOverall = Number(raw.overallScore);
  const overallScore = Number.isFinite(requestedOverall)
    ? Math.max(1, Math.min(5, Number(requestedOverall.toFixed(1))))
    : Number(
        (
          (dimensions.clarity.score +
            dimensions.warmth.score +
            dimensions.simplicity.score +
            dimensions.patience.score +
            dimensions.fluency.score) /
          5
        ).toFixed(1)
      );

  return { turnNumber, dimensions, overallScore };
}

async function scoreLatestTurn(
  candidate: CandidateInfo,
  history: ConversationTurn[]
): Promise<TurnScore | undefined> {
  const userTurns = history.filter((t) => t.role === "user");
  if (userTurns.length === 0) return undefined;

  const latestUserAnswer = userTurns[userTurns.length - 1].content?.trim() ?? "";
  if (!latestUserAnswer) return undefined;

  const turnNumber = userTurns.length;
  const prompt = buildTurnScorerPrompt(latestUserAnswer, candidate, turnNumber);
  let modelOutput = "";

  try {
    const { text } = await chatWithFallback([{ role: "user", content: prompt }]);
    modelOutput = text;
    return normalizeTurnScore(parseModelJson(text), turnNumber, latestUserAnswer);
  } catch (firstErr) {
    const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    console.warn("[/api/chat] turn-score parse failed, retrying repair:", firstMsg);

    if (!modelOutput) {
      return buildHeuristicTurnScore(latestUserAnswer, turnNumber);
    }

    try {
      const repairPrompt = `Convert this content into strict valid JSON using the exact schema below.
Return ONLY JSON:
{
  "turnNumber": number,
  "overallScore": number,
  "dimensions": {
    "clarity": { "label": "Clarity of Explanation", "score": number, "evidence": "string", "feedback": "string" },
    "warmth": { "label": "Warmth & Empathy", "score": number, "evidence": "string", "feedback": "string" },
    "simplicity": { "label": "Ability to Simplify", "score": number, "evidence": "string", "feedback": "string" },
    "patience": { "label": "Patience", "score": number, "evidence": "string", "feedback": "string" },
    "fluency": { "label": "English Fluency", "score": number, "evidence": "string", "feedback": "string" }
  }
}

MODEL OUTPUT TO REPAIR:
${modelOutput || "No model output captured."}`;

      const { text: repaired } = await chatWithFallback([{ role: "user", content: repairPrompt }]);
      return normalizeTurnScore(parseModelJson(repaired), turnNumber, latestUserAnswer);
    } catch (repairErr) {
      const repairMsg = repairErr instanceof Error ? repairErr.message : String(repairErr);
      console.warn("[/api/chat] turn-score repair failed, using heuristic:", repairMsg);
      return buildHeuristicTurnScore(latestUserAnswer, turnNumber);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();
    const { candidate, history } = body;

    if (!candidate?.name) {
      return NextResponse.json({ error: "Missing candidate info" }, { status: 400 });
    }

    const messages = [
      { role: "system" as const, content: buildInterviewerPrompt(candidate) },
      ...history.map((t) => ({
        role: t.role as "user" | "assistant",
        content: t.content,
      })),
    ];

    const [chat, turnScore] = await Promise.all([
      chatWithFallback(messages),
      scoreLatestTurn(candidate, history),
    ]);

    const userTurns = history.filter((t) => t.role === "user").length;
    const reachedQuestionLimit = userTurns >= TOTAL_QUESTIONS;
    const modelMarkedFinal = detectLastQuestion(chat.text);

    const isLastQuestion = reachedQuestionLimit || modelMarkedFinal;
    const message =
      reachedQuestionLimit && !modelMarkedFinal
        ? buildForcedClosing(candidate.name)
        : chat.text;

    return NextResponse.json({
      message,
      provider: chat.provider,
      isLastQuestion,
      turnScore,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/chat]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
