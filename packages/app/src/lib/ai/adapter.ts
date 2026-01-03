/**
 * AI Model Adapter Configuration
 *
 * Configures AI model providers using TanStack AI.
 * Currently uses OpenAI, with support for future expansion.
 */

import { openaiText } from "@tanstack/ai-openai";

// Primary adapter using OpenAI
export const aiAdapter = openaiText("gpt-4o", {
  apiKey: process.env.OPENAI_API_KEY,
});

// Model options for future expansion
export type AIModel = "gpt-4o" | "gpt-4o-mini" | "gpt-3.5-turbo";

/**
 * Get an adapter instance by model name
 */
export function getAdapter(model: AIModel = "gpt-4o") {
  const apiKey = process.env.OPENAI_API_KEY;

  switch (model) {
    case "gpt-4o":
      return openaiText("gpt-4o", { apiKey });
    case "gpt-4o-mini":
      return openaiText("gpt-4o-mini", { apiKey });
    case "gpt-3.5-turbo":
      return openaiText("gpt-3.5-turbo", { apiKey });
    default:
      return openaiText("gpt-4o", { apiKey });
  }
}
