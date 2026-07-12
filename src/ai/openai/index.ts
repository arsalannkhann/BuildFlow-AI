import type { AiRegistry } from "../registry";

// Real implementation lands in Task 13. Selected only when AI_PROVIDER=openai.
export function openAiRegistry(): AiRegistry {
  throw new Error("OpenAI provider not yet implemented (see Task 13)");
}
