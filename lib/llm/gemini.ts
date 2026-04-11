// Gemini 2.5 Flash client — secondary LLM fallback
// Free tier: 10 RPM, 250 req/day — no credit card needed

import { GoogleGenerativeAI } from "@google/generative-ai";
import { ChatMessage } from "@/types";

let _client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!_client) {
    _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  }
  return _client;
}

// Convert our generic ChatMessage[] to Gemini's format
// Gemini doesn't support "system" role in history — inject it as first user turn
export async function geminiChat(messages: ChatMessage[]): Promise<string> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Extract system prompt
  const systemMsg = messages.find((m) => m.role === "system");
  const history = messages.filter((m) => m.role !== "system");

  // Build Gemini history (all but last message)
  const geminiHistory = history.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // Start chat with optional system instruction
  const chat = model.startChat({
    history: geminiHistory,
    ...(systemMsg && {
      systemInstruction: { role: "system", parts: [{ text: systemMsg.content }] },
    }),
  });

  const lastMessage = history[history.length - 1]?.content ?? "";
  const result = await chat.sendMessage(lastMessage);
  const text = result.response.text();

  if (!text) throw new Error("Gemini returned empty response");
  return text.trim();
}
