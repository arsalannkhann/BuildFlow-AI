import { z } from "zod";
import type { GroundedAnswer } from "../ports";

// Strict output contract for GroundedAnswerPort (rules.md §11: structured outputs,
// validate before anything is persisted or rendered). Providers that return anything
// else fail loudly — never a silently invented answer.
export const GROUNDED_SCHEMA_VERSION = "grounded-answer.v1";

export const groundedAnswerSchema: z.ZodType<GroundedAnswer> = z.object({
  answer: z.string(),
  citations: z.array(z.string()),
  insufficient_evidence: z.boolean(),
}).strict();
