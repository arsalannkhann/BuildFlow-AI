# DPR extraction evals — Hinglish site updates

A release gate (`rules.md` §12), not a demo. It answers one question about whichever
extraction provider is configured:

> On real-shaped Indian site speech — English, Hindi, Hinglish, machinery noise — does the
> model report what the engineer said, and does it ever report something the engineer
> did **not** say?

## Run it

```bash
# offline, deterministic, safe in CI — scores the built-in rule-based provider
pnpm --filter @buildflow/ai eval

# scores the real model (needs GOOGLE_CLOUD_PROJECT and Vertex credentials)
AI_PROVIDER=gemini pnpm --filter @buildflow/ai eval

pnpm --filter @buildflow/ai eval -- --json              # machine-readable report
pnpm --filter @buildflow/ai eval -- --update-baseline   # record this run as the new bar
```

Exit code `0` means the gate passed; `1` means it failed and prints why.

The runner uses the workspace-root `tsx` binary rather than declaring its own, so that
`package.json` stays in step with the committed lockfile (CI installs with
`--frozen-lockfile`). Add `tsx` to this package's `devDependencies` the next time the
lockfile is regenerated.

## Reading the report

```
Assertions passed : 150/158 (94.9%)
Fixtures clean    : 35/41 (85.4%)
Critical errors   : 0
```

* **Assertions passed** — individual facts the transcript states that the extraction had to
  contain (a quantity with its unit, a trade with its count, a material with its status, a
  section that must stay empty). This is a recall-style number.
* **Fixtures clean** — fixtures where *every* assertion passed *and* there were no critical
  errors. Harsher and more honest than the assertion average: one bad field spoils the
  fixture, which is roughly how a reviewer experiences a bad draft.
* **Critical errors** — the extraction stated something the transcript never contained:
  `invented_quantity`, `invented_labour_count`, `invented_material`, `invented_date`,
  `invented_value`, `fabricated_citation`. **Any** critical error fails the gate regardless
  of the pass rates. A high average with one invented quantity is a worse product than a
  lower average with none — that is the difference between a draft a PM corrects and a
  report a PM stops trusting.

### By slice

Slices are properties of the *fixture*: `english`, `hindi`, `hinglish`, `noise`,
`terminology`, `quantity`, `negation`, `dates`, `contradiction`. A model that averages 94%
but sits at 60% on `negation` is not shippable in India — "cement nahi aaya" reported as
*received* is a supply decision made on a false premise. Read the slices before the average
(`rules.md` §12: never optimise only for average quality).

### By assertion kind

Cuts the same assertions a different way: `presence`, `quantity_unit`, `negation`,
`terminology`, `absence` (things that must **not** be reported), `invention`.

### Failed assertions

Listed individually with the fixture id, so a failure is directly reproducible: open
`fixtures.ts`, find the id, read `notes` for why that case exists.

## The gate

`baseline.json` holds one entry per provider:

| field | meaning |
| --- | --- |
| `maxCriticalErrors` | always `0` for a release |
| `minAssertionRate` | overall assertion pass rate floor |
| `minFixtureRate` | clean-fixture floor |
| `slices` | per-slice floors — this is what stops a Hindi regression hiding behind English |
| `measured` | `true` = recorded from a real run, `false` = an aspirational target |

A provider with no baseline entry is **reported but not gated** (numbers printed, exit 0), so
adding a provider does not fail CI before anyone has measured it.

Changing a prompt, a model id or a provider means re-running this suite and comparing
against the recorded baseline before the change ships (`rules.md` §12).

## Honest caveats

1. **The mock's score is a floor, not evidence of model quality.** The offline provider is a
   rule-based stub over a hand-written site lexicon, and the same author wrote both it and
   these fixtures. Its ~95% therefore proves only that the harness works and that the
   deterministic path never invents. It says nothing about Gemini. The `hd-*` fixtures
   (coreference, self-correction, colloquial consumption, ambiguous `kal`) exist precisely
   because a keyword matcher cannot pass them — that is why the stub does not score 100%.
2. **`AI_PROVIDER=gemini` has never been run against this suite.** The `gemini` baseline is a
   target, not a measurement. Replace it with `--update-baseline` on the first real run, and
   treat "cannot beat the offline stub" as a blocking result.
3. **Coverage is 41 fixtures.** It covers the failure modes seen in the field so far
   (negation, units, terminology, noise, contradiction). It is not a statistical sample of
   any customer's audio, and it cannot tell you a percentage of real reports that will be
   correct.
4. **Transcription is out of scope here.** Fixtures start from transcript text, so this
   measures extraction only. ASR quality on noisy Hinglish audio needs its own benchmark —
   see the open question in `memory.md` §14 about word timings and ASR providers.

## Fixture data policy

Every transcript is **authored, synthetic and de-identified** (`rules.md` §14, §12). No
customer content, no real recording, no person, company, supplier or project name. If a real
update inspires a new case, rewrite it from scratch with different numbers and no
identifying detail before it goes in this directory.

## Adding a fixture

1. Add an entry to `FIXTURES` in `fixtures.ts` with `slices`, the `transcript`, a `notes`
   line saying *why the case exists*, and `expect`.
2. Write `expect` from what the transcript **means**, never from what the current provider
   happens to return. A fixture that records current behaviour tests nothing.
3. Use `forbidden` for invention traps — strings that would only appear if the model made
   something up. They are checked against claim fields always, and against narrative text
   only when the speaker never said them (quoting the engineer is required behaviour).
4. Re-run the eval. If it now fails, decide honestly which is wrong — the provider or the
   expectation — and only then re-record the baseline.
