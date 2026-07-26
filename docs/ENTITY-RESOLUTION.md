# Entity resolution: from site speech to the project's own records

**Status:** implemented (Phase G). Owner: founder.

## Why this is the load-bearing part of the product

A site engineer says:

> "aaj tower B ki chhat par dhalai hui, do point paanch cum, chhe mistri the, aur sariya khatam ho gaya"

A voice note plus an LLM gets you a paragraph. A paragraph is not a project record. Nothing
downstream — schedule progress, a stock ledger, an RA bill, a productivity number — can consume
"chhat par dhalai hui". Those systems consume **rows**: this project's `Slab work` activity, at
this project's `Tower B` location, 2.5 m³, six masons, and a shortage against this project's
own TMT steel line.

Resolution is the step that crosses that gap. It is also the step where a mistake is most
expensive, because a wrong link does not look like a mistake — it looks like data. A false
`Supported` quantity against the wrong BOQ item gets billed.

So the design goal is not "resolve as much as possible". It is: **resolve what is certain,
surface what is not, and never invent.**

## The cascade

Techniques run cheapest-and-most-auditable first. Every tier records *how* it decided, so a
reviewer today and an auditor next year see the reasoning and not just the answer.

| # | Tier | Where | Cost | Decides when |
|---|------|-------|------|--------------|
| 1 | `exact` | `packages/domain/src/resolve` | free | normalized equality with a project record |
| 2 | `alias` | `packages/domain/src/resolve` | free | seeded **or learned** dictionary (en / hi / hinglish) |
| 3 | `fuzzy` | `packages/domain/src/resolve` | free | trigram + token similarity, with an ambiguity guard |
| 4 | `semantic` | `packages/pipeline/src/entity-resolution.ts` | 1 embedding call/report | nearest neighbour clears a floor **and** a margin |
| 5 | `llm` | `packages/pipeline/src/entity-resolution.ts` | ≤1 model call/report | model picks from a shortlist, or abstains |
| 6 | `unresolved` | — | free | raw words kept, reviewer decides |

Tiers 1–3 are pure functions and stay in the base layer, so they are unit-testable with no I/O
and produce the same answer on every machine. Tiers 4–5 need network calls, so they live in the
pipeline package.

A normal report never reaches tiers 4–5: the dictionary and the project's learned aliases cover
it, at zero marginal cost.

### Tier 2 does the heavy lifting — and it learns

`packages/domain/src/resolve/vocabulary.ts` seeds ~90 canonical trades, materials, activities and
equipment with their English, Hindi and Hinglish forms: `mistri → mason`, `beldar → helper`,
`sariya`/`loha → tmt steel`, `gitti`/`kapchi → aggregate`, `reta`/`baalu → sand`,
`dhalai → concreting`, `chhat → slab work`, `chinai → masonry`.

Numbers and units get the same treatment, because site speech does not contain decimals:
`dhai`, `साढ़े दो`, `do point paanch`, `two and a half` all read as `2.5`
(`resolve/numbers.ts`), and `cum`/`CBM`/`ghan meter`/`घन मीटर` all read as one canonical unit
with an exact conversion factor (`resolve/units.ts`). A `bag`/`bori` stays a **count** and is
never silently converted to kilograms — the pack weight is kept separately, because guessing it
corrupts a measured quantity.

The part that actually makes accuracy improve over time is the feedback loop: when a reviewer
confirms or corrects a mapping, that wording is stored as a **project-scoped alias**. The same
phrase resolves on its own in the next report. A site's dialect is learned from that site's own
history — not from prompt tuning.

### Tier 4, semantic: a floor *and* a margin

Embedding nearest-neighbour catches what lexical similarity cannot: `chhat` and `Slab work`
share no trigrams at all.

The guard that matters is the **margin**. Embedding neighbourhoods are dense — every location on
a project is "similar" to every other location — so a bare top-1 would confidently link
`Block A basement` to `Block A`. The winner must clear `SEMANTIC_THRESHOLD` (0.78) *and* hold
`SEMANTIC_MARGIN` (0.04) over the runner-up. A near-tie becomes a reviewer question, which is
the correct outcome when the answer is genuinely unclear.

### Tier 5, LLM: index-only, and allowed to abstain

This is the tier most likely to be built badly, so the safety property is **structural rather
than a prompt promise**.

The model is handed the transcript for context, the spoken phrase, and a shortlist of at most
five project records the server chose. Its output schema (`entity-resolution.v1`) contains
`choice_index`, `confidence` and `reason` — and **no field in which a record name, id, quantity
or status could be written**. Extra keys are stripped by zod. The model therefore *cannot*
introduce an entity that does not exist in the project; the worst it can do is pick the wrong
one of five real records, which a reviewer can see and overturn.

Server-side gates applied to every provider's answer, at both the provider boundary and the
point of use:

- an index outside the shortlist → abstention (a fabricated pointer, not a match);
- `confidence: "low"` → abstention;
- `confidence: "medium"` → recorded, but **not** applied without confirmation;
- only `confidence: "high"` is treated as settled;
- a missing, duplicated or misaligned answer → that phrase stays unresolved.

The prompt states plainly that a missing record is a normal and valid answer, because the
failure mode being defended against is a model that feels obliged to choose something. It also
declares the transcript untrusted: a person can say anything into a recording, including
instructions.

Caps: `LLM_SHORTLIST` = 5 (long lists invite plausible wrong picks), `LLM_MAX_QUESTIONS` = 12 per
report, and anything dropped by that cap is **counted in the stats** — silent truncation would
read as "everything was considered".

## Failure behaviour

Resolution runs *after* the revision is written and cannot fail a report. If the embedding
backend is down, the cascade drops to a lexical shortlist and records `embeddingFailed`. If the
model is unavailable, the phrases stay open for a human. Either way the engineer's words are
already stored and the DPR is already reviewable — a degraded resolution costs reviewer
convenience, never the record.

Two invariants hold across every tier:

1. **Resolution never edits a claim.** It appends rows to `report_entity_link` beside the
   engineer's words. The revision itself is never rewritten.
2. **An unconfident mapping is an open question, not an applied value.** A wrong link that looks
   settled is worse than a visible gap, because nobody re-reads a mapping that appears decided.

## What the reviewer sees

The review screen shows *"What the site said → project records"*, split into **Needs your
decision** and **Mapped**. Anything decided by tier 4 or 5, and anything unmatched, appears in the
first group with:

- the phrase as spoken;
- the proposed reading, if there is one;
- the model's stated reason, where there is one — displayed for judgement, never used as a value;
- a dropdown whose **Suggested** group is the ranked shortlist, with every project record
  available underneath.

Confirming both links the record and teaches the wording. That single click is the product's
accuracy flywheel.

## Auditability

`report_entity_link` is append-only and carries `raw_text`, `method`, `score`, `candidates`
(the ranked shortlist), `reason`, `confirmed_at` and `confirmed_by`. Recomputation appends a
fresh trail rather than editing history. The processing run records a `resolveEntities` stage, and
the audit event carries **counts only** — how many phrases, how many linked, how many by which
tier — never a phrase, a quote or a transcript line (rules.md §14).

## Where the numbers come from

`packages/ai/evals/` scores the extraction path over 41 Hinglish/Hindi/English fixtures with 158
assertions across presence, quantity+unit, negation, terminology, absence and invention. Against
the deterministic mock it scores 94.9% with zero critical errors.

That number is a **floor on the plumbing, not a measurement of Gemini.** The mock and the
fixtures share an author, and nine `hd-*` comprehension fixtures (coreference, self-correction,
ambiguous `kal`, mid-sentence code-switching) exist specifically because a keyword matcher cannot
pass them. Benchmarking real providers on consented field audio is still open — see
`docs/EXPANSION-ROADMAP.md` R1.
