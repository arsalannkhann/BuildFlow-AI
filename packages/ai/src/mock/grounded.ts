import { groundedAnswerSchema } from "../grounded/schema";
import { GROUNDED_ANSWER_PROMPT_VERSION } from "../grounded/prompt";
import type { GroundedAnswer, GroundedAnswerPort, GroundedPassage } from "../ports";

// Extractive mock: no generation at all. It quotes the retrieved record titles and cites
// every passage it used, so the citation-filtering and insufficient-evidence paths are
// fully exercised offline. With no passages it declares insufficient evidence.
export class MockGroundedAnswer implements GroundedAnswerPort {
  readonly meta = { provider: "mock", model: "mock-grounded-1", promptVersion: GROUNDED_ANSWER_PROMPT_VERSION };

  async answer({ question, passages }: {
    question: string; passages: GroundedPassage[];
  }): Promise<GroundedAnswer> {
    if (passages.length === 0) {
      return groundedAnswerSchema.parse({
        answer: "", citations: [], insufficient_evidence: true,
      });
    }
    const lines = passages.slice(0, 5).map((p) => `- "${p.title}" (${p.kind}, ${p.status})`);
    return groundedAnswerSchema.parse({
      answer: [
        `Records matching "${question.trim()}":`,
        ...lines,
        "Open the cited records for the underlying facts.",
      ].join("\n"),
      citations: passages.slice(0, 5).map((p) => p.ref),
      insufficient_evidence: false,
    });
  }
}
