// Groq client — primary LLM provider
// Uses Llama 3.3 70B Versatile (fastest free tier, 14400 req/day)

import Groq from "groq-sdk";
import { ChatMessage } from "@/types";

// Lazy-init so it doesn't crash at import if key is missing
let _client: Groq | null = null;

function getClient(): Groq {
  if (!_client) {
    _client = new Groq({ apiKey: process.env.GROQ_API_KEY! });
  }
  return _client;
}

// Send a chat request to Groq; throws on failure so fallback chain can catch
export async function groqChat(messages: ChatMessage[]): Promise<string> {
  const client = getClient();

  const res = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages,
    max_tokens: 300,
    temperature: 0.7,
  });

  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error("Groq returned empty response");
  return text.trim();
}

interface TranscribeOptions {
  language?: string;
  prompt?: string;
}

// Transcribe audio blob to text using Groq Whisper
// Accepts a File or Blob; returns plain text transcript
export async function groqTranscribe(
  audio: File | Blob,
  options: TranscribeOptions = {}
): Promise<string> {
  const client = getClient();

  // Groq SDK expects a File with a name property
  const file = audio instanceof File ? audio : new File([audio], "audio.webm", { type: audio.type });

  const res = await client.audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
    response_format: "text",
    ...(options.language ? { language: options.language } : {}),
    ...(options.prompt ? { prompt: options.prompt } : {}),
  }) as unknown;

  if (typeof res === "string") return res.trim();
  if (typeof res === "object" && res !== null && "text" in res) {
    const text = (res as { text?: string }).text;
    if (typeof text === "string" && text.trim()) return text.trim();
  }

  throw new Error("Whisper returned empty transcript");
}
