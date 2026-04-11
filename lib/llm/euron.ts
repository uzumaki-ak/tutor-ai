// Euron API client — fourth LLM fallback
// Uses gpt-4.1-nano (free tier on euron.one)

import { ChatMessage } from "@/types";

const BASE_URL = "https://api.euron.one/api/v1/euri/chat/completions";

export async function euronChat(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.EURON_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-nano",
      messages,
      max_tokens: 300,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Euron error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Euron returned empty response");
  return text.trim();
}
