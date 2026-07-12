import type { SummaryPort } from "../ports";
import type { DprStructuredData } from "@/domain/dpr/schema";

export class MockSummary implements SummaryPort {
  async summarize({ data }: { data: DprStructuredData }): Promise<{ internal: string; clientSafe: string }> {
    const work = data.work_items.map((w) => w.description).join("; ") || "No work items recorded";
    const blockers = data.blockers.length ? ` Blockers: ${data.blockers.map((b) => b.description).join("; ")}.` : "";
    return {
      internal: `${work}.${blockers} ${data.labour.length} labour entries.`,
      clientSafe: `${work}.`,
    };
  }
}
