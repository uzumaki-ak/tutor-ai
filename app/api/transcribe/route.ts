// POST /api/transcribe
// Accepts multipart/form-data with an "audio" file
// Returns { text: string } using Groq Whisper Large v3 Turbo

import { NextRequest, NextResponse } from "next/server";
import { groqTranscribe } from "@/lib/llm/groq";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audio = formData.get("audio");

    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    // Convert Blob to File with proper name for Groq SDK
    const file = new File([audio], "recording.webm", { type: audio.type || "audio/webm" });

    const text = await groqTranscribe(file, {
      language: process.env.TRANSCRIBE_LANGUAGE ?? "en",
      prompt:
        process.env.TRANSCRIBE_PROMPT ??
        "Transcribe exactly what is spoken. Keep mixed English and Hindi words in Latin script and do not translate into Urdu script.",
    });

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "Empty transcript — please speak clearly" }, { status: 422 });
    }

    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Transcription failed";
    console.error("[/api/transcribe]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
