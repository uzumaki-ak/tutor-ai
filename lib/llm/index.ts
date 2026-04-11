// LLM fallback router
// Tries providers in order: Groq → Gemini → OpenRouter → Euron
// Returns the response + which provider succeeded

import { ChatMessage, LLMProvider } from "@/types";
import { groqChat } from "./groq";
import { geminiChat } from "./gemini";
import { openrouterChat } from "./openrouter";
import { euronChat } from "./euron";

interface LLMResult {
  text: string;
  provider: LLMProvider;
}

type ProviderFn = (messages: ChatMessage[]) => Promise<string>;

// Ordered list of providers to try
const PROVIDERS: Array<{ name: LLMProvider; fn: ProviderFn }> = [
  { name: "groq", fn: groqChat },
  { name: "gemini", fn: geminiChat },
  { name: "openrouter", fn: openrouterChat },
  { name: "euron", fn: euronChat },
];

// Attempts each provider in sequence; throws only if all fail
export async function chatWithFallback(messages: ChatMessage[]): Promise<LLMResult> {
  const errors: string[] = [];

  for (const { name, fn } of PROVIDERS) {
    try {
      const text = await fn(messages);
      return { text, provider: name };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[LLM] ${name} failed: ${msg}`);
      errors.push(`${name}: ${msg}`);
    }
  }

  throw new Error(`All LLM providers failed:\n${errors.join("\n")}`);
}
