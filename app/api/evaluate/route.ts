// POST /api/evaluate
// Accepts full transcript + candidate info
// Returns structured AssessmentResult, stores it, and emails admin report

import { NextRequest, NextResponse } from "next/server";
import { chatWithFallback } from "@/lib/llm";
import { buildEvaluatorPrompt } from "@/lib/prompts";
import { getServiceClient } from "@/lib/supabase";
import { sendAdminReportEmail } from "@/lib/adminReport";
import {
  AssessmentResult,
  CandidateInfo,
  ConversationTurn,
  LLMProvider,
  RubricDimension,
  TurnScore,
  VerdictType,
} from "@/types";

export const runtime = "nodejs";

interface RequestBody {
  candidate: CandidateInfo;
  transcript: ConversationTurn[];
  turnScores?: TurnScore[];
}

type DimensionKey = keyof AssessmentResult["dimensions"];
type ParsedEvaluation = Omit<AssessmentResult, "candidateName" | "createdAt">;

interface EvaluationAttempt {
  parsed: ParsedEvaluation;
  providers: LLMProvider[];
  repaired: boolean;
}

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  clarity: "Clarity of Explanation",
  warmth: "Warmth & Empathy",
  simplicity: "Ability to Simplify",
  patience: "Patience",
  fluency: "English Fluency",
};

interface ScoredSignal {
  score: number;
  evidence: string;
}

function stripMarkdownFences(text: string): string {
  return text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
}

function extractFirstJsonObject(text: string): string {
  const start = text.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in evaluator response");

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

    if (ch === "{") {
      depth++;
      continue;
    }

    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  throw new Error("Incomplete JSON object in evaluator response");
}

function parseModelJson(raw: string): unknown {
  const cleaned = stripMarkdownFences(raw);
  const candidate = cleaned.trim().startsWith("{")
    ? cleaned.trim()
    : extractFirstJsonObject(cleaned);

  try {
    return JSON.parse(candidate);
  } catch {
    const repaired = repairLikelyInvalidJson(candidate);
    return JSON.parse(repaired);
  }
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
      if (ch === "\"") {
        inString = true;
        out += ch;
        continue;
      }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 3;
  return Math.max(1, Math.min(5, Math.round(value)));
}

function cleanText(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const text = value.trim().replace(/\s+/g, " ");
  return text || fallback;
}

function fallbackDimensionFeedback(key: DimensionKey, score: number): string {
  if (score >= 4) {
    if (key === "clarity") return "Clear structure and understandable explanations in most answers.";
    if (key === "warmth") return "Consistently supportive and student-friendly tone.";
    if (key === "simplicity") return "Breaks down concepts in an easy-to-follow way.";
    if (key === "patience") return "Shows calm and stepwise guidance when handling confusion.";
    return "Strong spoken fluency and coherent delivery.";
  }

  if (score >= 3) {
    if (key === "clarity") return "Reasonably clear, with room for tighter structure.";
    if (key === "warmth") return "Moderate empathy; could be more consistently reassuring.";
    if (key === "simplicity") return "Some simplification present but can be made more concrete.";
    if (key === "patience") return "Shows basic patience, but depth of support can improve.";
    return "Generally understandable speech with occasional rough phrasing.";
  }

  if (key === "clarity") return "Needs clearer sequencing and simpler sentence framing.";
  if (key === "warmth") return "Empathy and encouragement signals were limited in responses.";
  if (key === "simplicity") return "Needs stronger use of child-friendly examples and analogies.";
  if (key === "patience") return "Needs more explicit patience strategies for struggling students.";
  return "Fluency was inconsistent and needs clearer expression.";
}

function transcriptFallbackEvidence(transcript: ConversationTurn[]): string {
  const latestUser =
    [...transcript].reverse().find((t) => t.role === "user")?.content?.trim() ?? "";
  if (!latestUser) return "Candidate completed the interview.";
  return latestUser.split(/\s+/).slice(0, 24).join(" ");
}

function aggregateTurnScores(
  turnScores: TurnScore[],
  transcript: ConversationTurn[]
): ParsedEvaluation {
  const fallbackEvidence = transcriptFallbackEvidence(transcript);

  const aggregateDimension = (key: DimensionKey): RubricDimension => {
    const entries = turnScores
      .map((t) => t.dimensions[key])
      .filter((d): d is RubricDimension => !!d && Number.isFinite(Number(d.score)));

    if (entries.length === 0) {
      return {
        label: DIMENSION_LABELS[key],
        score: 3,
        evidence: fallbackEvidence,
        feedback: fallbackDimensionFeedback(key, 3),
      };
    }

    const avg = entries.reduce((sum, d) => sum + Number(d.score), 0) / entries.length;
    const rounded = clampScore(avg);
    const bestEvidence = [...entries]
      .sort((a, b) => Number(b.score) - Number(a.score) || b.evidence.length - a.evidence.length)[0]
      ?.evidence;
    const evidence = cleanText(bestEvidence, fallbackEvidence);

    return {
      label: DIMENSION_LABELS[key],
      score: rounded,
      evidence,
      feedback: fallbackDimensionFeedback(key, rounded),
    };
  };

  const dimensions: AssessmentResult["dimensions"] = {
    clarity: aggregateDimension("clarity"),
    warmth: aggregateDimension("warmth"),
    simplicity: aggregateDimension("simplicity"),
    patience: aggregateDimension("patience"),
    fluency: aggregateDimension("fluency"),
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

  const verdict = deriveVerdict(overallScore);
  const ranked = Object.entries(dimensions)
    .map(([key, dim]) => ({ key, label: dim.label, score: dim.score }))
    .sort((a, b) => b.score - a.score);
  const strengths = ranked.slice(0, 2).map((r) => r.label).join(" and ");
  const improvements = ranked.slice(-2).map((r) => r.label).join(" and ");

  const summary =
    verdict === "pass"
      ? `Strong interview performance with clear strengths in ${strengths}. Overall communication quality indicates readiness for the next round.`
      : verdict === "review"
      ? `Moderate interview performance with positive signals in ${strengths}. Further improvement is recommended in ${improvements} before final decision.`
      : `Current interview performance needs development, especially in ${improvements}. Additional coaching and reassessment are recommended.`;

  return {
    verdict,
    overallScore,
    summary,
    dimensions,
  };
}

function clampToRubric(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function snippet(text: string, maxWords = 24): string {
  const words = text.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (words.length === 0) return "";
  return words.slice(0, maxWords).join(" ");
}

function countKeywordHits(text: string, keywords: string[]): number {
  let total = 0;
  const normalized = ` ${text.toLowerCase()} `;

  for (const keyword of keywords) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "g");
    const matches = normalized.match(regex);
    if (matches) total += matches.length;
  }

  return total;
}

function bestEvidence(
  answers: string[],
  keywords: string[],
  fallbackText: string
): string {
  if (answers.length === 0) return fallbackText;

  let best = answers[0];
  let bestScore = -1;
  for (const answer of answers) {
    const score = countKeywordHits(answer, keywords) + Math.min(answer.split(/\s+/).length / 30, 1);
    if (score > bestScore) {
      best = answer;
      bestScore = score;
    }
  }

  return snippet(best, 24) || fallbackText;
}

function scoreSignal(
  answers: string[],
  keywords: string[],
  base: number,
  fallbackText: string
): ScoredSignal {
  const joined = answers.join(" ").toLowerCase();
  const hits = countKeywordHits(joined, keywords);
  const avgWords =
    answers.length === 0
      ? 0
      : answers.reduce((sum, answer) => sum + answer.split(/\s+/).filter(Boolean).length, 0) /
        answers.length;

  const lengthBoost = avgWords > 25 ? 1 : avgWords > 12 ? 0.5 : 0;
  const rawScore = base + hits * 0.45 + lengthBoost;

  return {
    score: clampToRubric(rawScore),
    evidence: bestEvidence(answers, keywords, fallbackText),
  };
}

function normalizeDimension(raw: unknown, key: DimensionKey): RubricDimension {
  const fallbackLabel = DIMENSION_LABELS[key];
  const obj = isRecord(raw) ? raw : {};

  return {
    label: cleanText(obj.label, fallbackLabel),
    score: clampScore(Number(obj.score)),
    evidence: cleanText(obj.evidence, "Evidence unavailable in this run."),
    feedback: cleanText(obj.feedback, "Detailed feedback unavailable in this run."),
  };
}

function deriveVerdict(overallScore: number): VerdictType {
  if (overallScore >= 3.5) return "pass";
  if (overallScore >= 2.5) return "review";
  return "fail";
}

function normalizeVerdict(value: unknown, overallScore: number): VerdictType {
  if (value === "pass" || value === "review" || value === "fail") return value;
  return deriveVerdict(overallScore);
}

function normalizeEvaluation(raw: unknown): ParsedEvaluation {
  if (!isRecord(raw)) throw new Error("Evaluator response is not an object");

  const dimsRaw = isRecord(raw.dimensions) ? raw.dimensions : {};
  const dimensions: AssessmentResult["dimensions"] = {
    clarity: normalizeDimension(dimsRaw.clarity, "clarity"),
    warmth: normalizeDimension(dimsRaw.warmth, "warmth"),
    simplicity: normalizeDimension(dimsRaw.simplicity, "simplicity"),
    patience: normalizeDimension(dimsRaw.patience, "patience"),
    fluency: normalizeDimension(dimsRaw.fluency, "fluency"),
  };

  const average =
    (dimensions.clarity.score +
      dimensions.warmth.score +
      dimensions.simplicity.score +
      dimensions.patience.score +
      dimensions.fluency.score) /
    5;

  const requestedScore = Number(raw.overallScore);
  const overallScore = Number.isFinite(requestedScore)
    ? Math.max(1, Math.min(5, Number(requestedScore.toFixed(1))))
    : Number(average.toFixed(1));

  const summary = cleanText(
    raw.summary,
    "Interview completed. Automated summary was not available for this run."
  );

  return {
    verdict: normalizeVerdict(raw.verdict, overallScore),
    overallScore,
    summary,
    dimensions,
  };
}

async function evaluateWithRetry(prompt: string): Promise<EvaluationAttempt> {
  const { text: firstText, provider: firstProvider } = await chatWithFallback([
    { role: "user", content: prompt },
  ]);

  try {
    return {
      parsed: normalizeEvaluation(parseModelJson(firstText)),
      providers: [firstProvider],
      repaired: false,
    };
  } catch (firstErr) {
    const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
    console.warn("[/api/evaluate] first parse failed, retrying with repair prompt:", firstMsg);

    const repairPrompt = `Convert the following content into strict valid JSON.
Return ONLY a JSON object and preserve the intended scoring/feedback meaning.
Required keys:
- verdict
- overallScore
- summary
- dimensions.clarity / warmth / simplicity / patience / fluency (each with label, score, evidence, feedback)

CONTENT TO REPAIR:
${firstText}`;

    const { text: repairedText, provider: repairedProvider } = await chatWithFallback([
      { role: "user", content: repairPrompt },
    ]);

    return {
      parsed: normalizeEvaluation(parseModelJson(repairedText)),
      providers: [firstProvider, repairedProvider],
      repaired: true,
    };
  }
}

function buildFallbackEvaluation(transcript: ConversationTurn[]): ParsedEvaluation {
  const answers = transcript
    .filter((t) => t.role === "user")
    .map((t) => t.content.trim())
    .filter(Boolean);

  const defaultEvidence =
    snippet(answers.at(-1) ?? "", 24) || "Candidate completed the interview.";

  const clarity = scoreSignal(
    answers,
    ["explain", "because", "for example", "first", "then", "step", "understand"],
    2,
    defaultEvidence
  );
  const warmth = scoreSignal(
    answers,
    ["encourage", "support", "care", "listen", "kind", "safe", "empathy", "confidence"],
    1.8,
    defaultEvidence
  );
  const simplicity = scoreSignal(
    answers,
    ["simple", "easy", "break down", "step by step", "example", "story", "visual"],
    2,
    defaultEvidence
  );
  const patience = scoreSignal(
    answers,
    ["patient", "repeat", "again", "slow", "pause", "guide", "practice", "wait"],
    1.8,
    defaultEvidence
  );
  const fluency = scoreSignal(
    answers,
    ["therefore", "however", "for example", "understand", "approach"],
    2.2,
    defaultEvidence
  );

  const dimensions: AssessmentResult["dimensions"] = {
    clarity: {
      label: DIMENSION_LABELS.clarity,
      score: clarity.score,
      evidence: clarity.evidence,
      feedback: "Fallback rubric inference from response structure and clarity cues.",
    },
    warmth: {
      label: DIMENSION_LABELS.warmth,
      score: warmth.score,
      evidence: warmth.evidence,
      feedback: "Fallback rubric inference from empathy and supportive language signals.",
    },
    simplicity: {
      label: DIMENSION_LABELS.simplicity,
      score: simplicity.score,
      evidence: simplicity.evidence,
      feedback: "Fallback rubric inference from simplification and teaching-style cues.",
    },
    patience: {
      label: DIMENSION_LABELS.patience,
      score: patience.score,
      evidence: patience.evidence,
      feedback: "Fallback rubric inference from patience-oriented strategy cues.",
    },
    fluency: {
      label: DIMENSION_LABELS.fluency,
      score: fluency.score,
      evidence: fluency.evidence,
      feedback: "Fallback rubric inference from language flow and expression quality cues.",
    },
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
  const verdict = deriveVerdict(overallScore);

  return {
    verdict,
    overallScore,
    summary:
      "Interview completed successfully. A fallback rubric inference was used because evaluator JSON output was malformed.",
    dimensions,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();
    const { candidate, transcript, turnScores } = body;

    if (!candidate?.name || !transcript?.length) {
      return NextResponse.json({ error: "Missing candidate or transcript" }, { status: 400 });
    }

    let parsed: ParsedEvaluation;
    let warning: string | undefined;
    let providersUsed: LLMProvider[] = [];
    let wasRepairPass = false;
    let interviewId: string | undefined;

    if (Array.isArray(turnScores) && turnScores.length > 0) {
      parsed = aggregateTurnScores(turnScores, transcript);
      warning = "Final result aggregated from incremental per-turn scoring.";
    } else {
      const prompt = buildEvaluatorPrompt(transcript, candidate);
      try {
        const evalAttempt = await evaluateWithRetry(prompt);
        parsed = evalAttempt.parsed;
        providersUsed = evalAttempt.providers;
        wasRepairPass = evalAttempt.repaired;
      } catch (evalErr) {
        const evalMsg = evalErr instanceof Error ? evalErr.message : String(evalErr);
        console.warn("[/api/evaluate] evaluator parse retry failed, using fallback:", evalMsg);
        parsed = buildFallbackEvaluation(transcript);
        warning = "Used fallback evaluation due to malformed model JSON output.";
      }
    }

    const result: AssessmentResult = {
      candidateName: candidate.name,
      verdict: parsed.verdict,
      overallScore: parsed.overallScore,
      summary: parsed.summary,
      dimensions: parsed.dimensions,
      createdAt: new Date().toISOString(),
    };

    try {
      const db = getServiceClient();
      const { data, error } = await db
        .from("interviews")
        .insert({
          candidate_name: candidate.name,
          subject: candidate.subject,
          age_group: candidate.ageGroup,
          verdict: result.verdict,
          overall_score: result.overallScore,
          assessment: result,
          transcript,
        })
        .select("id")
        .single();

      if (error) throw error;
      interviewId = data?.id;
    } catch (dbErr) {
      console.warn("[/api/evaluate] DB save failed:", dbErr);
    }

    try {
      const deliveryWarning =
        warning ??
        (wasRepairPass
          ? "Evaluator output needed one JSON repair pass before final scoring."
          : undefined);
      await sendAdminReportEmail({
        candidate,
        transcript,
        result,
        interviewId,
        evaluationProviders: providersUsed,
        warning: deliveryWarning,
      });
    } catch (emailErr) {
      console.warn("[/api/evaluate] admin email failed:", emailErr);
    }

    return NextResponse.json(warning ? { result, warning } : { result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Evaluation failed";
    console.error("[/api/evaluate]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
