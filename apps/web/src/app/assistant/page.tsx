import Link from "next/link";
import { getDb } from "@buildflow/db/client";
import { currentContext } from "@/app/session";
import { AppHeader } from "@/app/components/AppHeader";
import { ASSISTANT_SAMPLE_QUESTIONS, askAssistant } from "@/core/assistant-core";

export const dynamic = "force-dynamic";

// Read-only assistant: the page submits via GET and the core never imports a mutation
// module — asking a question can never change a record (rules.md §11).
export default async function AssistantPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const db = await getDb();
  const ctx = await currentContext();
  const result = q.trim() ? await askAssistant(db, ctx, q) : null;

  return (
    <>
      <AppHeader roleLabel="Member" canCapture={ctx.capabilities.includes("report.create")} />
      <main id="main-content" className="page-shell assistant-page">
        <header className="assistant-intro">
          <div>
            <h1 className="page-title">Project assistant</h1>
            <p>Ask what is late, missing, blocked, or over budget across the projects you can access.</p>
          </div>
          <span className="assistant-readonly"><span aria-hidden="true" />Read-only</span>
        </header>

        <section className="assistant-query" aria-labelledby="ask-form">
          <h2 id="ask-form">What do you need to know?</h2>
          <form method="get" action="/assistant" className="assistant-query__form">
            <input
              aria-label="Question about your projects"
              name="q"
              defaultValue={q}
              placeholder="Why is Tower A delayed?"
              autoComplete="off"
              required
            />
            <button className="primary-button" type="submit">Ask assistant</button>
          </form>
          <p className="assistant-query__note">
            Answers use stored records only, include source links, and never change project data.
          </p>
          <div className="assistant-suggestions" aria-label="Suggested questions">
            {ASSISTANT_SAMPLE_QUESTIONS.map((s) => (
              <Link key={s} href={`/assistant?q=${encodeURIComponent(s)}`}>{s}</Link>
            ))}
          </div>
        </section>

        {result ? (
          <section className={`assistant-answer ${result.insufficientEvidence ? "assistant-answer--insufficient" : ""}`} aria-labelledby="answer">
            <div className="assistant-answer__heading">
              <h2 id="answer">Answer</h2>
              <span>{result.mode === "deterministic" ? "Computed from records" : "Grounded response"}</span>
            </div>
            {result.insufficientEvidence ? (
              <>
                <p><strong>Not enough evidence to answer.</strong></p>
                <p className="assistant-answer__copy">
                  {result.answer || "No records in your projects support an answer to this question. The assistant only answers from stored records — it never guesses."}
                </p>
              </>
            ) : (
              <>
                <p className="assistant-answer__copy">{result.answer}</p>
                <p className="assistant-answer__method">
                  {result.mode === "deterministic"
                    ? "Computed directly from stored records (no AI model involved)."
                    : "Grounded answer over retrieved records only — verify against the cited sources."}
                </p>
                <h3>Sources</h3>
                <ul className="assistant-citations">
                  {result.citations.map((c, i) => (
                    <li key={`${c.ref}-${i}`}>
                      <Link href={c.href} className="assistant-citation__title">{c.title}</Link>
                      <span className={`status-badge ${c.approved ? "status-badge--success" : "status-badge--warning"}`}>
                        <span className="status-badge__dot" aria-hidden="true" />
                        <span>{c.approved ? `Approved record (${c.status})` : `Working record (${c.status})`}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        ) : null}
      </main>
    </>
  );
}
