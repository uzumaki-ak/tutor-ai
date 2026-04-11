// OpenRouter client — third LLM fallback
// Uses Llama 3.3 70B free (OpenAI-compatible API, 200 req/day)

import { ChatMessage } from "@/types";

const BASE_URL = "https://openrouter.ai/api/v1/chat/completions";

// OpenRouter uses OpenAI-compatible endpoint with Bearer auth
export async function openrouterChat(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      "X-Title": "Cuemath Tutor Screener",
    },
    body: JSON.stringify({
      model: "meta-llama/llama-3.3-70b-instruct:free",
      messages,
      max_tokens: 300,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenRouter returned empty response");
  return text.trim();
}
