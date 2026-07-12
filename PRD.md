# BuildFlow AI — Product Requirements Document

**Status:** Working specification  
**Version:** 0.1  
**Last updated:** 2026-07-13  
**Initial market:** Delhi NCR, India  
**Initial product:** Voice-and-photo-to-Daily Progress Report (DPR)

## 1. Executive decision

BuildFlow AI will not begin as a full construction ERP or an autonomous “AI operating system.” The first product will own one high-frequency workflow:

> A site engineer records a short voice update and adds site photos. BuildFlow converts the evidence into a structured, reviewable Daily Progress Report, preserves the original inputs, and gives management a concise project update.

This wedge is the foundation for later material, schedule, Measurement Book, compliance, procurement, budget, and portfolio intelligence. Expansion happens only after the daily project record is trusted and consistently used.

## 2. Product vision

BuildFlow becomes the trusted operational record for construction projects by making field reporting easier than WhatsApp and more useful than spreadsheets.

### Positioning

**Initial promise:** “Turn site voice notes and photos into accurate daily progress reports in minutes.”

**Long-term vision:** “The AI operating layer for construction.”

The long-term vision is not the launch message. Early sales must describe a concrete workflow and measurable result.

## 3. Problem

Construction information is created continuously but fragmented across voice notes, WhatsApp groups, photos, paper registers, spreadsheets, PDFs, drawings, bills, and individual memory. Existing software often fails at the site because it expects clean, form-based entry in conditions with noise, glare, dust, intermittent connectivity, and time pressure.

This produces four costly outcomes:

1. Site engineers spend too much time preparing reports.
2. Project managers receive late, incomplete, or inconsistent information.
3. Management cannot explain delays without chasing several people.
4. Evidence becomes difficult to find when billing, compliance, quality, or client disputes arise.

## 4. Product principles

1. **Capture naturally.** Voice, photo, video, and documents come before forms.
2. **Review before record.** AI drafts; an accountable person approves.
3. **Evidence over prose.** Every material claim should link to its source input.
4. **Offline is normal.** Core capture must work without a reliable network.
5. **Fast on low-end Android.** The field experience is the primary product.
6. **One source of truth.** Approved facts become reusable structured data.
7. **Earn expansion.** New modules follow observed workflow demand.

## 5. Target customer

### Initial ideal customer profile

- Indian contractor, EPC firm, or real-estate developer.
- 3–20 active projects.
- 20–250 office and site staff.
- DPRs are currently assembled through WhatsApp, spreadsheets, Word, or PDFs.
- A director or project head experiences reporting delays personally.
- Management can approve a paid pilot without a long enterprise procurement cycle.

### Excluded from the initial ICP

- Individual homeowners managing a single renovation.
- Very large infrastructure enterprises requiring SAP integration before a pilot.
- Firms unwilling to provide real examples or nominate an accountable pilot owner.
- Customers demanding automated visual progress percentages as a prerequisite.

## 6. Personas and jobs to be done

### Site engineer — primary contributor

**Job:** “At the end of a difficult site day, let me report what happened in under five minutes without typing a long form.”

Needs fast recording, photo capture, offline operation, simple correction, and clear confirmation that the update reached the manager.

### Project manager — primary reviewer

**Job:** “Give me a reliable daily picture of progress, blockers, labour, materials, and tomorrow’s plan without chasing every engineer.”

Needs an editable draft, source evidence, missing-information warnings, approval controls, and a concise project summary.

### Director or portfolio head — economic buyer

**Job:** “Tell me which projects need attention and why, using information I can trust.”

Needs exceptions rather than activity feeds, portfolio visibility, adoption metrics, and an audit trail.

### Client or consultant — controlled recipient

**Job:** “Give me a professional progress report with relevant evidence, without exposing internal notes.”

Needs a curated PDF or link generated from approved information only.

## 7. Goals and non-goals

### MVP goals

- Reduce site-engineer DPR effort to five minutes or less.
- Produce a manager-ready draft within three minutes after upload completes.
- Preserve the original audio, photos, transcript, extracted facts, edits, and approval history.
- Support English, Hindi, and common Hinglish reporting.
- Work reliably through intermittent connectivity.
- Prove willingness to pay on live projects.

### MVP non-goals

- Full ERP replacement.
- Automated procurement or payments.
- Automated DPCC, GRAP, or RERA submission.
- Legally authoritative Electronic Measurement Book.
- Face-recognition attendance.
- BIM or drawing comparison.
- Equipment maintenance prediction.
- Computer-vision progress percentage.
- General-purpose portfolio chatbot.
- Neo4j or a construction ontology implementation.

## 8. MVP scope

### 8.1 Organization and project setup

- Create an organization and one or more projects.
- Invite users by mobile number or email.
- Assign organization and project roles.
- Configure project timezone, address, client name, reporting cutoff, work locations, and report template.
- Import a lightweight activity/location list from CSV; a full schedule or BOQ import is deferred.

### 8.2 Field capture

- Start a daily update for a selected project and date.
- Record or attach audio.
- Capture or attach photos, preserving timestamp and available GPS metadata.
- Add an optional short text note.
- Save the draft locally before network upload.
- Display upload status per attachment.
- Retry failed uploads without duplicating the report.
- Allow submission even when optional information is missing.

### 8.3 AI processing

- Transcribe the audio and identify its language.
- Extract structured facts into a versioned schema:
  - work completed;
  - work location;
  - measured or estimated quantity and unit;
  - labour by trade;
  - materials received, used, delayed, or required;
  - equipment used or unavailable;
  - safety or quality observations;
  - blockers, causes, owners, and expected resolution;
  - weather or site conditions stated by the user;
  - tomorrow’s plan.
- Mark uncertain, contradictory, or unsupported fields for review.
- Never invent a quantity, date, person, material, or progress percentage.
- Generate an internal manager summary and an optional client-safe summary.

### 8.4 Review and approval

- Show the original transcript beside the structured draft.
- Link extracted items to transcript timestamps and relevant photos where possible.
- Allow a reviewer to edit, confirm, remove, or mark an item unknown.
- Record every edit with actor, timestamp, before value, and after value.
- Prevent a client report from being sent until an authorized user approves it.
- Allow rejection back to the contributor with a short reason.

### 8.5 DPR output

- Generate a branded PDF from approved data.
- Include project, report date, weather/site condition if supplied, progress narrative, work items, labour, materials, blockers, next-day plan, and selected photos.
- Label estimates and unverified statements clearly.
- Store an immutable copy of each issued PDF version.
- Share by secure link, email, or approved WhatsApp template.

### 8.6 Manager dashboard

- Show expected, draft, awaiting-review, approved, rejected, failed, and missing reports.
- Surface blockers and overdue unresolved items.
- Show submission and approval time.
- Show adoption by project without creating a surveillance-oriented employee score.

### 8.7 Search and history

- Filter reports by project, date, status, location, activity, and blocker.
- Search approved transcripts and reports.
- Open the source audio, photos, structured data, and issued PDFs from one timeline.

## 9. Functional requirements

| ID | Requirement | Priority | Acceptance signal |
|---|---|---:|---|
| FR-001 | A contributor can create a DPR draft while offline. | P0 | Draft survives app restart and later syncs. |
| FR-002 | Audio and photos upload with resumable, idempotent behavior. | P0 | Network interruption does not duplicate the DPR. |
| FR-003 | The system produces a transcript and structured draft. | P0 | Processing completes or exposes a recoverable failure. |
| FR-004 | A reviewer can compare AI output with source evidence. | P0 | Each extracted claim carries source references when available. |
| FR-005 | An authorized reviewer can approve and issue a PDF. | P0 | Issued PDF is versioned and immutable. |
| FR-006 | Tenant and project boundaries are enforced. | P0 | Cross-tenant authorization tests always fail closed. |
| FR-007 | Users can see sync and processing status. | P0 | No silent background failure. |
| FR-008 | English, Hindi, and Hinglish audio are supported. | P0 | Field benchmark meets the pilot accuracy threshold. |
| FR-009 | A manager can see missing reports and current blockers. | P1 | Dashboard reflects approved and pending states. |
| FR-010 | Approved reports can be shared through controlled channels. | P1 | No unapproved draft reaches an external recipient. |
| FR-011 | Project templates can customize labels and visible sections. | P1 | Template changes do not alter historical PDFs. |
| FR-012 | Approved report content is searchable. | P1 | Search results preserve tenant permissions. |

## 10. Key workflows

### Workflow A — site update

1. Engineer opens the project.
2. Engineer taps **Record update**.
3. Engineer speaks for 30–90 seconds.
4. Engineer adds 3–10 photos.
5. Engineer taps **Submit**.
6. The app saves immediately and uploads when connected.
7. The engineer sees `Saved → Uploading → Processing → Ready for review`.

### Workflow B — manager review

1. Manager opens an “Awaiting review” report.
2. Manager sees the generated report and highlighted uncertainties.
3. Manager checks source transcript/audio/photos.
4. Manager corrects or confirms the data.
5. Manager approves the report.
6. BuildFlow issues a versioned PDF and sends only to configured recipients.

### Workflow C — failed processing

1. A processing stage fails or times out.
2. The report remains available with the completed inputs.
3. The system retries safe operations automatically.
4. The user receives a clear status and can retry or prepare the report manually.
5. Support receives a traceable error without access to tenant content by default.

## 11. AI product requirements

### Output contract

- AI extraction must use a strict, versioned JSON Schema.
- Every field includes `value`, `source_refs`, and `confidence_band` where applicable.
- Confidence is a review aid, not proof of correctness.
- Unsupported values remain `null`; the system must not infer convenient facts.
- Prompt, model, provider, schema, and processing version are stored for each run.

### Human control

- AI may draft reports, summaries, classifications, and suggested actions.
- AI may not approve reports, submit compliance filings, alter budgets, create purchase orders, authorize payments, or finalize Measurement Book entries.
- High-impact automation requires an explicit future product decision, permission model, audit design, and customer-controlled approval.

### Evaluation

Maintain a consented, de-identified field evaluation set covering:

- English, Hindi, and Hinglish;
- machinery and traffic noise;
- common Indian construction terminology;
- names, quantities, dates, units, and negations;
- incomplete or contradictory updates;
- low-quality photos and audio.

Release gates are based on field-level accuracy and critical-error rate, not subjective “looks good” review.

## 12. Non-functional requirements

### Reliability

- No acknowledged field draft may be lost.
- All mutating requests use idempotency keys.
- AI processing is asynchronous, retryable, and stage-aware.
- Recovery does not require re-uploading successful attachments.

### Performance targets

- Capture screen usable within two seconds on a representative low-end Android device after launch.
- Local save acknowledgment within 300 ms under normal device conditions.
- Web dashboard p75 interaction latency under 2.5 seconds on a typical Indian 4G connection.
- AI draft available within three minutes after all inputs upload for 90% of pilot reports.

### Security and privacy

- Encryption in transit and at rest.
- Tenant isolation at API and database layers.
- Least-privilege role and project access.
- Short-lived signed media URLs.
- Audited access to sensitive artifacts.
- Configurable retention and deletion workflows.
- No customer content in logs, analytics events, or test fixtures.

### Accessibility and localization

- Web interface targets WCAG 2.2 AA.
- Large touch targets and high-contrast outdoor mode for mobile.
- User-visible dates, numbers, units, and currency are locale-aware.
- Initial interface languages: English and Hindi; data entry may mix languages.

## 13. Roles and permissions

| Role | Default capability |
|---|---|
| Organization owner | Billing, organization settings, all projects, data export, retention. |
| Project admin | Project settings, membership, templates, all project reports. |
| Project manager | Review, approve, issue, view project dashboards. |
| Site engineer | Create and edit own drafts, respond to rejections, view permitted project history. |
| Client viewer | View only specifically issued client-safe reports. |
| Auditor | Read approved records and audit trail; no edits. |

Permissions must be explicit capabilities, not hard-coded UI labels. A user may hold different roles across projects.

## 14. Success metrics

### North-star metric

**Trusted approved project-days:** number of expected project-days with an approved DPR that the project manager considers operationally usable.

### Activation

- First project configured within one business day.
- First field report submitted within 48 hours of onboarding.
- At least three contributors submit during the first week.

### Engagement and quality

- At least 70% of expected pilot DPRs submitted on time.
- Median contributor effort at or below five minutes.
- At least 90% of drafts accepted with minor or no correction by the end of the pilot.
- Zero invented critical values in the release evaluation set.
- At least 60% of manager summaries opened on working days.

### Commercial validation

- Three paying design partners.
- At least two renew after the pilot.
- At least one expands to another project.
- Pilot owner can quantify time saved, reporting improvement, or avoided follow-up.

## 15. Pilot and pricing experiment

- Four-week pilot on one live project.
- Target price: ₹10,000–₹25,000 per project, depending on onboarding and support.
- Include a fixed number of contributors, reports, and storage.
- Do not promise the roadmap as contracted scope.
- Do not anchor the first paid product at ₹2,999/month until support and AI unit economics are measured.

## 16. Launch gates

The MVP can enter paid beta only when:

1. Three design partners have used it on live sites.
2. No acknowledged draft is lost during an offline/retry test.
3. Tenant-isolation and authorization tests pass.
4. Critical extraction accuracy meets the benchmark agreed with pilot managers.
5. A report can be created, reviewed, issued, and retrieved end to end.
6. Every AI-generated claim remains traceable to inputs or explicitly marked unsupported.
7. Support can diagnose failures without manually querying production content.

## 17. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Site users revert to WhatsApp. | Make capture faster than sending a formatted WhatsApp update; allow approved WhatsApp ingestion later. |
| AI misstates quantities or blockers. | Strict schemas, evidence links, null-by-default extraction, review gates, field evals. |
| Connectivity causes data loss. | Local SQLite, durable upload queue, resumable media, idempotency. |
| Managers do not review reports. | Exception-first inbox, reminders, delegated reviewers, measure review latency. |
| Compliance positioning creates liability. | Treat outputs as review-ready drafts; obtain current legal and domain validation before launch claims. |
| Scope expands into ERP too early. | Enforce phase exit gates and MVP non-goals. |
| AI costs exceed price. | Track cost per approved report, cache deterministic stages, route by task, batch non-urgent work. |
| Customer data leaks across tenants. | Tenant ID on every business row, RLS, API authorization, automated isolation tests. |

## 18. Open product questions

1. Is the strongest initial buyer a developer, general contractor, or specialist contractor?
2. Does direct WhatsApp ingestion materially improve adoption, or create consent and context problems?
3. What minimum set of DPR fields is common across the first three customers?
4. Who is accountable for approval when a project manager is absent?
5. Which Indic speech provider performs best on real site audio and code-mixed terminology?
6. How much report customization is necessary before it becomes professional services work?
7. What retention period do pilot customers require for audio and photos?
8. Which compliance workflow, if any, produces the first repeatable expansion sale?

## 19. Future expansion sequence

Expansion is evidence-driven, but the expected order is:

1. Material challan and invoice extraction tied to daily reports.
2. Blocker ownership and schedule-impact tracking.
3. Measurement capture and append-only e-MB workflow.
4. Portfolio dashboard and grounded natural-language queries.
5. RERA/DPCC evidence packs after domain and legal validation.
6. Procurement, budget, labour, equipment, and vision intelligence only when the underlying data is trustworthy.

## 20. Glossary

- **DPR:** Daily Progress Report.
- **e-MB:** Electronic Measurement Book.
- **Design partner:** A customer who provides workflow access, recurring feedback, and paid live usage.
- **Issued report:** An approved, immutable report version shared with its intended audience.
- **Source reference:** A pointer to the audio timestamp, photo, document region, or user entry supporting a value.
- **Trusted project-day:** A project-day with an approved and operationally usable DPR.
