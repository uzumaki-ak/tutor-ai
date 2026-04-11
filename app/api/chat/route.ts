// POST /api/chat
// Accepts conversation history + candidate info
// Returns next AI question/response using 4-provider fallback chain

import { NextRequest, NextResponse } from "next/server";
import { chatWithFallback } from "@/lib/llm";
import { buildInterviewerPrompt } from "@/lib/prompts";
import { CandidateInfo, ConversationTurn } from "@/types";

export const runtime = "nodejs";
const TOTAL_QUESTIONS = 6;
const CLOSING_LINE = "that concludes our screening";

interface RequestBody {
  candidate: CandidateInfo;
  history: ConversationTurn[];
}

// Checks if the AI response signals the interview is done
function detectLastQuestion(text: string): boolean {
  return text.toLowerCase().includes(CLOSING_LINE);
}

function buildForcedClosing(name: string): string {
  return `Thank you ${name}, that concludes our screening. We'll be in touch soon!`;
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();
    const { candidate, history } = body;

    if (!candidate?.name) {
      return NextResponse.json({ error: "Missing candidate info" }, { status: 400 });
    }

    // Build messages array: system prompt + full conversation history
    const messages = [
      { role: "system" as const, content: buildInterviewerPrompt(candidate) },
      ...history.map((t) => ({
        role: t.role as "user" | "assistant",
        content: t.content,
      })),
    ];

    const { text, provider } = await chatWithFallback(messages);
    const userTurns = history.filter((t) => t.role === "user").length;
    const reachedQuestionLimit = userTurns >= TOTAL_QUESTIONS;
    const modelMarkedFinal = detectLastQuestion(text);

    const isLastQuestion = reachedQuestionLimit || modelMarkedFinal;
    const message =
      reachedQuestionLimit && !modelMarkedFinal
        ? buildForcedClosing(candidate.name)
        : text;

    return NextResponse.json({
      message,
      provider,
      isLastQuestion,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[/api/chat]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
