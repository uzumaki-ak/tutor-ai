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
  VerdictType,
} from "@/types";

export const runtime = "nodejs";

interface RequestBody {
  candidate: CandidateInfo;
  transcript: ConversationTurn[];
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
  return JSON.parse(candidate);
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
  const lastUserTurn =
    [...transcript].reverse().find((t) => t.role === "user")?.content ??
    "Candidate completed the interview.";
  const snippet = lastUserTurn.split(/\s+/).slice(0, 24).join(" ").trim();
  const evidence = snippet || "Candidate completed the interview.";

  const baseDimension = (key: DimensionKey): RubricDimension => ({
    label: DIMENSION_LABELS[key],
    score: 3,
    evidence,
    feedback: "Score generated from fallback mode because evaluator output was malformed.",
  });

  return {
    verdict: "review",
    overallScore: 3,
    summary:
      "Interview completed successfully. A fallback score was used because the evaluator response format was invalid.",
    dimensions: {
      clarity: baseDimension("clarity"),
      warmth: baseDimension("warmth"),
      simplicity: baseDimension("simplicity"),
      patience: baseDimension("patience"),
      fluency: baseDimension("fluency"),
    },
  };
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();
    const { candidate, transcript } = body;

    if (!candidate?.name || !transcript?.length) {
      return NextResponse.json({ error: "Missing candidate or transcript" }, { status: 400 });
    }

    const prompt = buildEvaluatorPrompt(transcript, candidate);
    let parsed: ParsedEvaluation;
    let warning: string | undefined;
    let providersUsed: LLMProvider[] = [];
    let wasRepairPass = false;
    let interviewId: string | undefined;

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
