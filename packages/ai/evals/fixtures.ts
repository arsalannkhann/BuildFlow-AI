/**
 * Hinglish DPR extraction fixtures (T3.4).
 *
 * PROVENANCE: every transcript below was AUTHORED for this suite. None of it is customer
 * content, and none of it is transcribed from a real recording (rules.md §14, §12 — eval
 * fixtures are de-identified). No person, company, supplier or project name appears; roles
 * ("supplier", "client", "PM") and generic grid references ("C4", "Tower B") are used
 * instead. Keep it that way: if a real update inspires a case, rewrite it from scratch with
 * different numbers and no identifying detail.
 *
 * Each fixture pairs a transcript with what a CORRECT extraction must produce. The
 * expectations are written from the transcript's meaning, not from what any provider
 * currently does — a fixture that merely records current behaviour tests nothing.
 */

export type Slice =
  | "english" | "hindi" | "hinglish"
  | "noise" | "terminology" | "quantity" | "negation" | "dates" | "contradiction";

export type MaterialStatus = "received" | "used" | "delayed" | "required";

export type Expectation = {
  /** At least one work item's description must contain each phrase (case-insensitive). */
  workItemKeywords?: string[];
  /** Canonical site vocabulary that must appear as an activity / material / trade name. */
  terminology?: { kind: "activity" | "material" | "trade" | "equipment"; canonical: string }[];
  /** Value+unit pairs that must appear on some work item or material. */
  quantities?: { value: string; unit: string }[];
  /** Value+unit pairs that must be attached to a WORK ITEM, not merely present somewhere. */
  workItemQuantities?: { value: string; unit: string }[];
  materials?: { name: string; status?: MaterialStatus | null; notStatus?: MaterialStatus[] }[];
  labour?: { trade: string; count?: number | null }[];
  equipment?: { name: string; status?: "used" | "unavailable" | null }[];
  /** Sections the transcript gives no basis for; they must come back empty. */
  emptySections?: (
    "work_items" | "labour" | "materials" | "equipment" | "blockers" | "tomorrow_plan" | "safety_quality"
  )[];
  weather?: "present" | "absent";
  blockers?: "present" | "absent";
  tomorrowPlan?: "present" | "absent";
  /** Contradictory or truncated updates must not come back as proven work. */
  noSupportedWorkItems?: boolean;
  /** Strings that must not appear anywhere in the output — invention traps. */
  forbidden?: string[];
};

export type Fixture = {
  id: string;
  slices: Slice[];
  /** BCP-47-ish tag handed to the provider as the "detected" language. */
  language: string;
  transcript: string;
  /** Recording length, where the case is also about media quality. */
  durationMs?: number;
  /** Why this case exists / what it is allowed to get wrong. */
  notes: string;
  expect: Expectation;
};

export const FIXTURES: readonly Fixture[] = [
  // ---------------------------------------------------------------- English ----------
  {
    id: "en-01-basic-rcc",
    slices: ["english", "quantity"],
    language: "en-IN",
    transcript:
      "Today we completed casting of column C4 on level 3, about 2.5 cubic meters of concrete. " +
      "Six masons and four helpers worked on it. Tomorrow we plan slab shuttering.",
    notes: "Baseline: one activity, one measured quantity, two trades, one plan.",
    expect: {
      workItemKeywords: ["column c4"],
      terminology: [{ kind: "activity", canonical: "RCC" }],
      quantities: [{ value: "2.5", unit: "cum" }],
      labour: [{ trade: "mason", count: 6 }, { trade: "helper", count: 4 }],
      tomorrowPlan: "present",
      weather: "absent",
      forbidden: ["3.5", "Tower A"],
    },
  },
  {
    id: "en-02-no-work-basement",
    slices: ["english", "negation"],
    language: "en-IN",
    transcript:
      "No work at basement today because the pit was flooded. The pump could not be arranged. " +
      "Nothing was cast anywhere on site.",
    notes: "Negated work must not become a work item. A blocker is the correct output.",
    expect: {
      emptySections: ["work_items"],
      blockers: "present",
      forbidden: ["cum", "sqm"],
    },
  },
  {
    id: "en-03-rain-stop",
    slices: ["english", "negation"],
    language: "en-IN",
    transcript:
      "Heavy rain from two in the afternoon, so concreting was stopped after 8 cum was placed. " +
      "The site is waterlogged near the raft.",
    notes: "Weather present, partial work with a real quantity, blocker present.",
    expect: {
      quantities: [{ value: "8", unit: "cum" }],
      weather: "present",
      blockers: "present",
    },
  },
  {
    id: "en-04-materials-received",
    slices: ["english", "quantity"],
    language: "en-IN",
    transcript:
      "50 bags cement received in the morning and 3 brass sand received from the supplier. " +
      "Aggregate is still pending.",
    notes: "Two received materials with different unit families, one pending material.",
    expect: {
      materials: [
        { name: "cement", status: "received" },
        { name: "sand", status: "received" },
      ],
      quantities: [{ value: "50", unit: "bag" }, { value: "3", unit: "brass" }],
      emptySections: ["work_items"],
    },
  },
  {
    id: "en-05-six-second-update",
    slices: ["english"],
    language: "en-IN",
    durationMs: 6_000,
    transcript: "Slab work going on.",
    notes: "A six-second recording: almost nothing is stated, so almost nothing may be claimed.",
    expect: {
      emptySections: ["labour", "materials", "equipment"],
      noSupportedWorkItems: true,
      weather: "absent",
      forbidden: ["cum", "sqm"],
    },
  },
  {
    id: "en-06-safety-observation",
    slices: ["english"],
    language: "en-IN",
    transcript:
      "Toolbox talk was done in the morning for 20 workers. One worker was found without a helmet " +
      "at the lift shaft and was sent back. Cube test samples were taken for the slab pour.",
    notes: "Safety and quality notes are reviewable content; they were dropped entirely before v3.",
    expect: {
      blockers: "absent",
      weather: "absent",
    },
  },
  {
    id: "en-07-equipment-breakdown",
    slices: ["english"],
    language: "en-IN",
    transcript:
      "The concrete mixer had a breakdown at 11 am and the mechanic is coming tomorrow. " +
      "Excavation continued by hand, roughly 15 cum was dug near the trench.",
    notes: "Equipment unavailable plus a real quantity on a different activity.",
    expect: {
      equipment: [{ name: "concrete mixer", status: "unavailable" }],
      quantities: [{ value: "15", unit: "cum" }],
      terminology: [{ kind: "activity", canonical: "Excavation" }],
      blockers: "present",
    },
  },

  // ---------------------------------------------------------------- Hindi -------------
  {
    id: "hi-01-chhat-dhalai",
    slices: ["hindi", "terminology", "quantity"],
    language: "hi-IN",
    transcript:
      "आज छत की ढलाई हुई, 18 cum कंक्रीट लगा। दस मजदूर और चार मिस्त्री काम पर थे।",
    notes: "Devanagari with a Latin unit — the common real-world mix.",
    expect: {
      terminology: [{ kind: "activity", canonical: "RCC" }],
      quantities: [{ value: "18", unit: "cum" }],
      labour: [{ trade: "labourer", count: 10 }, { trade: "mason", count: 4 }],
    },
  },
  {
    id: "hi-02-cement-nahi-aaya",
    slices: ["hindi", "negation"],
    language: "hi-IN",
    transcript:
      "सीमेंट नहीं आया, इसलिए आज ढलाई नहीं हुई। सप्लायर ने कल भेजने को कहा है।",
    notes: "The critical negation case in Devanagari: cement must never read as received.",
    expect: {
      materials: [{ name: "cement", notStatus: ["received", "used"] }],
      emptySections: ["work_items"],
      blockers: "present",
    },
  },
  {
    id: "hi-03-labour-and-plan",
    slices: ["hindi"],
    language: "hi-IN",
    transcript:
      "बीस मजदूर आए थे। आज खुदाई का काम चला। कल सुबह शटरिंग शुरू करेंगे।",
    notes: "Devanagari counts, an activity, and a plan marked by a future verb.",
    expect: {
      labour: [{ trade: "labourer", count: 20 }],
      terminology: [{ kind: "activity", canonical: "Excavation" }],
      tomorrowPlan: "present",
    },
  },
  {
    id: "hi-04-barish",
    slices: ["hindi", "negation"],
    language: "hi-IN",
    transcript:
      "दोपहर से तेज़ बारिश थी, काम बंद रहा। बिजली भी नहीं थी।",
    notes: "Weather plus two blockers, and no work at all.",
    expect: {
      weather: "present",
      blockers: "present",
      emptySections: ["work_items"],
      forbidden: ["cum", "sqm", "bag"],
    },
  },
  {
    id: "hi-05-sariya-gitti",
    slices: ["hindi", "terminology", "quantity"],
    language: "hi-IN",
    transcript:
      "आज 2 MT सरिया आया और 4 brass गिट्टी भी आयी। रेत नहीं आयी।",
    notes: "Two materials received with units, one material explicitly NOT received.",
    expect: {
      materials: [
        { name: "steel", status: "received" },
        { name: "sand", notStatus: ["received"] },
      ],
      quantities: [{ value: "2", unit: "MT" }, { value: "4", unit: "brass" }],
    },
  },

  // ---------------------------------------------------------------- Hinglish ----------
  {
    id: "hg-01-pcc-dhalai",
    slices: ["hinglish", "terminology", "quantity"],
    language: "en-IN",
    transcript:
      "Aaj basement mein PCC ki dhalai hui, 12 cum concrete laga. Char mistri aur aath beldar site par the.",
    notes: "Transliterated Hindi labelled 'en' by the provider — the normalization trigger case.",
    expect: {
      terminology: [{ kind: "trade", canonical: "mason" }, { kind: "trade", canonical: "helper" }],
      quantities: [{ value: "12", unit: "cum" }],
      labour: [{ trade: "mason", count: 4 }, { trade: "helper", count: 8 }],
    },
  },
  {
    id: "hg-02-cement-nahi-aaya",
    slices: ["hinglish", "negation"],
    language: "en-IN",
    transcript:
      "Cement NAHI aaya aaj, isliye chhat ki dhalai nahi ho payi. Supplier ne kal ka bola hai.",
    notes: "The headline negation case. 'received' here would be a release blocker.",
    expect: {
      materials: [{ name: "cement", notStatus: ["received", "used"] }],
      emptySections: ["work_items"],
      blockers: "present",
    },
  },
  {
    id: "hg-03-mistri-beldar",
    slices: ["hinglish", "terminology"],
    language: "en-IN",
    transcript:
      "Site par aaj chaar mistri, do beldar aur ek carpenter the. Chinai ka kaam chalta raha.",
    notes: "Trade vocabulary that only exists in Hindi on Indian sites.",
    expect: {
      labour: [
        { trade: "mason", count: 4 }, { trade: "helper", count: 2 }, { trade: "carpenter", count: 1 },
      ],
      terminology: [{ kind: "activity", canonical: "Brickwork" }],
    },
  },
  {
    id: "hg-04-curing-tarai",
    slices: ["hinglish", "terminology"],
    language: "en-IN",
    transcript:
      "Chhat ki tarai teen din se chal rahi hai. Aaj 200 sqm area ki curing hui.",
    notes: "Curing with an area quantity; 'teen din' is a duration, not a work quantity.",
    expect: {
      terminology: [{ kind: "activity", canonical: "Curing" }],
      quantities: [{ value: "200", unit: "sqm" }],
      forbidden: ["3 cum"],
    },
  },
  {
    id: "hg-05-kal-shuttering",
    slices: ["hinglish"],
    language: "en-IN",
    transcript:
      "Aaj column ka shuttering khatam hua. Kal slab ki shuttering shuru karenge.",
    notes: "'kal' means tomorrow ONLY because of the future verb; today's work is separate.",
    expect: {
      terminology: [{ kind: "activity", canonical: "Shuttering" }],
      tomorrowPlan: "present",
    },
  },
  {
    id: "hg-06-gitti-reta",
    slices: ["hinglish", "terminology", "quantity"],
    language: "en-IN",
    transcript:
      "Do brass reta aur teen brass gitti aaj aa gayi. 25 bag cement bhi mila.",
    notes: "Three materials with Hindi names and brass/bag units in one clause.",
    expect: {
      materials: [
        { name: "sand", status: "received" },
        { name: "aggregate", status: "received" },
        { name: "cement", status: "received" },
      ],
      quantities: [{ value: "25", unit: "bag" }],
    },
  },
  {
    id: "hg-07-sariya-bar-bending",
    slices: ["hinglish", "terminology", "quantity"],
    language: "en-IN",
    transcript:
      "Sariya ki cutting bending chal rahi hai, 1.5 MT steel laga. Do bar bender kaam par the.",
    notes: "Steel work with a decimal MT quantity; 'sariya' must map to steel, not invent an activity.",
    expect: {
      terminology: [{ kind: "activity", canonical: "Reinforcement" }],
      quantities: [{ value: "1.5", unit: "MT" }],
      labour: [{ trade: "bar bender", count: 2 }],
    },
  },
  {
    id: "hg-08-plaster-sqm",
    slices: ["hinglish", "quantity"],
    language: "en-IN",
    transcript:
      "Tower B ke second floor par 180 sqm plaster ka kaam hua. Pani ki kami thi isliye tarai nahi ho payi.",
    notes: "Work with an area quantity plus a negated follow-up activity.",
    expect: {
      quantities: [{ value: "180", unit: "sqm" }],
      terminology: [{ kind: "activity", canonical: "Plaster" }],
      blockers: "present",
    },
  },

  // ---------------------------------------------------------------- Noise -------------
  {
    id: "nz-01-mixer-noise",
    slices: ["noise", "hinglish", "quantity"],
    language: "en-IN",
    transcript:
      "[machine noise] haan toh aaj... [inaudible] ... slab ki dhalai hui 6 cum ... [mixer running] " +
      "... theek hai.",
    notes: "One recoverable fact inside noise markers. Everything else must stay unclaimed.",
    expect: {
      quantities: [{ value: "6", unit: "cum" }],
      emptySections: ["labour"],
      forbidden: ["inaudible"],
    },
  },
  {
    id: "nz-02-cut-off",
    slices: ["noise", "contradiction"],
    language: "en-IN",
    transcript: "Aaj ka kaam... [inaudible] ... mistri ne bola tha ki... [recording ends]",
    notes: "Nothing survives the noise. An empty report is the correct answer.",
    expect: {
      emptySections: ["work_items", "materials", "equipment"],
      weather: "absent",
      forbidden: ["cum", "bag", "sqm", "brass"],
    },
  },
  {
    id: "nz-03-repeated-fragments",
    slices: ["noise", "english"],
    language: "en-IN",
    transcript:
      "Slab slab slab... sorry, [drilling] ... the the shuttering at level two is done, done. " +
      "[hammering] Nothing else to report.",
    notes: "Stutter and repetition must not multiply into several work items.",
    expect: {
      terminology: [{ kind: "activity", canonical: "Shuttering" }],
      emptySections: ["materials"],
      forbidden: ["cum", "sqm"],
    },
  },

  // ---------------------------------------------------------------- Terminology -------
  {
    id: "tm-01-pcc-rcc",
    slices: ["terminology", "english"],
    language: "en-IN",
    transcript:
      "PCC was laid in the footing area, 9 cum. RCC for the raft is planned tomorrow after the " +
      "reinforcement check.",
    notes: "PCC and RCC are different activities; only one of them happened today.",
    expect: {
      quantities: [{ value: "9", unit: "cum" }],
      terminology: [{ kind: "activity", canonical: "PCC" }],
      tomorrowPlan: "present",
    },
  },
  {
    id: "tm-02-dhalai-chhat-beldar",
    slices: ["terminology", "hinglish"],
    language: "en-IN",
    transcript:
      "Chhat ki dhalai poori hui aaj. Aath beldar aur do mistri lage the. Vibrator theek chal raha tha.",
    notes: "Three Hindi site terms at once, plus equipment in working order.",
    expect: {
      terminology: [
        { kind: "activity", canonical: "RCC" },
        { kind: "trade", canonical: "helper" },
      ],
      labour: [{ trade: "helper", count: 8 }, { trade: "mason", count: 2 }],
      equipment: [{ name: "needle vibrator" }],
    },
  },

  // ---------------------------------------------------------------- Units -------------
  {
    id: "qu-01-cft-and-sqm",
    slices: ["quantity", "english"],
    language: "en-IN",
    transcript:
      "Brickwork of 320 cft was completed in the north wing and 95 sqm of plaster was finished " +
      "on the second floor.",
    notes: "Two activities, two different unit families, both explicitly stated.",
    expect: {
      quantities: [{ value: "320", unit: "cft" }, { value: "95", unit: "sqm" }],
    },
  },
  {
    id: "qu-02-bare-number",
    slices: ["quantity", "english"],
    language: "en-IN",
    transcript:
      "We finished about 40 of the slab today. The rest continues tomorrow.",
    notes:
      "A bare number with no unit. The correct answer is NO quantity — 40 cum, 40 sqm and 40% " +
      "are all guesses, and this is exactly how an invented measurement gets into a claim.",
    expect: {
      forbidden: ["cum", "sqm", "cft", "%"],
      tomorrowPlan: "present",
    },
  },
  {
    id: "qu-03-mixed-units",
    slices: ["quantity", "hinglish"],
    language: "en-IN",
    transcript:
      "Aaj 12.5 cum concrete, 2 MT sariya aur 60 bag cement ka use hua. 4 trip malba bahar gaya.",
    notes: "Four numbers, four unit families, one clause each.",
    expect: {
      quantities: [
        { value: "12.5", unit: "cum" }, { value: "2", unit: "MT" }, { value: "60", unit: "bag" },
      ],
      materials: [{ name: "cement", status: "used" }],
    },
  },

  // ---------------------------------------------------------------- Dates -------------
  {
    id: "dt-01-relative-date",
    slices: ["dates", "hinglish"],
    language: "en-IN",
    transcript:
      "Supplier ne bola hai ki sariya agle hafte aayega. Aaj koi delivery nahi hui.",
    notes:
      "'Next week' is not a date. Turning it into a calendar date is an invented fact — the " +
      "expected resolution must stay unresolved.",
    expect: {
      materials: [{ name: "steel", notStatus: ["received", "used"] }],
      blockers: "present",
      forbidden: ["2026-", "2025-"],
    },
  },
  {
    id: "dt-02-explicit-date",
    slices: ["dates", "english"],
    language: "en-IN",
    transcript:
      "The client inspection is fixed for the 28th of this month. Shuttering must be complete before that.",
    notes: "A partial date is stated; nothing licenses a full ISO date with a year.",
    expect: {
      forbidden: ["2026-", "2025-"],
    },
  },

  // ---------------------------------------------------------------- Contradiction -----
  {
    id: "cn-01-self-correction",
    slices: ["contradiction", "english"],
    language: "en-IN",
    transcript:
      "The slab is complete. Actually no, only half of it is done, the rest is tomorrow. " +
      "I will confirm the exact quantity later.",
    notes:
      "The speaker contradicts himself and explicitly defers the quantity. Nothing here may be " +
      "reported as proven, and no quantity may be produced.",
    expect: {
      noSupportedWorkItems: true,
      tomorrowPlan: "present",
      forbidden: ["cum", "sqm", "50%"],
    },
  },
  {
    id: "cn-02-conflicting-counts",
    slices: ["contradiction", "hinglish", "negation"],
    language: "en-IN",
    transcript:
      "Aaj das mazdoor the... nahi nahi, aath the. Cement aaya tha lekin use nahi hua.",
    notes:
      "A corrected headcount and a material that arrived but was not used. Reporting it as used " +
      "would overstate consumption.",
    expect: {
      materials: [{ name: "cement", notStatus: ["used"] }],
      noSupportedWorkItems: true,
    },
  },

  // ------------------------------------------------- Comprehension (hard) -------------
  // These cases need language understanding rather than keyword spotting. The deterministic
  // stub is expected to fail several of them — that is the point: a suite the offline floor
  // passes completely cannot tell you whether a real model is any good.
  {
    id: "hd-01-coreference",
    slices: ["hinglish", "quantity"],
    language: "en-IN",
    transcript: "Column C4 ka kaam aaj hua. Usme dhai cum concrete laga.",
    notes:
      "The quantity is in the SECOND sentence and refers back to the first. Attaching it to " +
      "the column work item needs coreference, not keyword matching.",
    expect: {
      workItemQuantities: [{ value: "2.5", unit: "cum" }],
      workItemKeywords: ["column c4"],
    },
  },
  {
    id: "hd-02-corrected-count",
    slices: ["contradiction", "hinglish", "quantity"],
    language: "en-IN",
    transcript: "Aaj das mazdoor the... nahi nahi, aath the. Sab basement mein lage the.",
    notes:
      "The speaker corrects himself. The corrected value (8) is the report; taking the first " +
      "number heard overstates labour by 25%.",
    expect: {
      labour: [{ trade: "labourer", count: 8 }],
      forbidden: ["cum", "sqm"],
    },
  },
  {
    id: "hd-03-implicit-consumption",
    slices: ["hinglish", "terminology"],
    language: "en-IN",
    transcript:
      "Level 5 par aaj 40 bag cement aur 3 brass reta khap gaya. Kaam theek chala.",
    notes:
      "'khap gaya' is consumption stated in colloquial Hindi with no English cue, and no " +
      "activity word appears at all — the materials are used, the activity stays unknown.",
    expect: {
      materials: [{ name: "cement", status: "used" }, { name: "sand", status: "used" }],
      quantities: [{ value: "40", unit: "bag" }, { value: "3", unit: "brass" }],
    },
  },
  {
    id: "hd-04-kal-means-yesterday",
    slices: ["hinglish", "dates"],
    language: "en-IN",
    transcript: "Kal chhat ki dhalai hui thi, aaj uski curing chal rahi hai.",
    notes:
      "Here 'kal' is YESTERDAY — the verb is past. Filing this as tomorrow's plan would " +
      "report work that has already happened as work that has not.",
    expect: {
      tomorrowPlan: "absent",
      terminology: [{ kind: "activity", canonical: "Curing" }],
    },
  },
  {
    id: "hd-05-numbers-in-words",
    slices: ["hinglish", "quantity"],
    language: "en-IN",
    transcript: "Pachaas bag cement aur dhai brass reta aaj aaya.",
    notes: "Numbers spoken as Hindi words, including the half-quantity 'dhai' (2.5).",
    expect: {
      quantities: [{ value: "50", unit: "bag" }, { value: "2.5", unit: "brass" }],
      materials: [{ name: "cement", status: "received" }],
    },
  },
  {
    id: "hd-06-two-floors-one-activity",
    slices: ["quantity", "hinglish"],
    language: "en-IN",
    transcript:
      "Pehle floor par 60 sqm plaster hua aur doosre floor par 40 sqm. Total 100 sqm ho gaya.",
    notes:
      "Two measurements of the SAME activity at different locations, then a stated total. " +
      "Both parts must survive and the total must not be double counted as extra work.",
    expect: {
      quantities: [{ value: "60", unit: "sqm" }, { value: "40", unit: "sqm" }],
      terminology: [{ kind: "activity", canonical: "Plaster" }],
    },
  },
  {
    id: "hd-07-blocker-without-cause",
    slices: ["hinglish", "negation"],
    language: "en-IN",
    transcript: "Site par kaam ruka hua hai. Aage ka pata nahi.",
    notes:
      "A blocker with NO stated cause and no stated resolution. Both must stay null — this " +
      "is where a helpful-sounding model invents 'material shortage'.",
    expect: {
      blockers: "present",
      forbidden: ["cement", "rain", "shortage", "labour"],
    },
  },
  {
    id: "hd-08-mid-sentence-switch",
    slices: ["hinglish", "negation", "contradiction"],
    language: "en-IN",
    transcript:
      "The client asked for a change at the lift shaft, isliye aaj wahan kuch nahi hua, " +
      "baaki jagah normal kaam chala.",
    notes:
      "English and Hindi inside one sentence, a negation in the middle, and a deliberately " +
      "vague 'work went on elsewhere' that licenses no quantity and no location.",
    expect: {
      blockers: "present",
      noSupportedWorkItems: true,
      forbidden: ["cum", "sqm", "cft"],
    },
  },
  {
    id: "hd-09-noise-fragments",
    slices: ["noise", "quantity"],
    language: "en-IN",
    transcript: "[drilling] ... 15 ... [inaudible] ... bag ... cement ... [drilling]",
    notes:
      "A number, a unit word and a material survive the noise, but nothing connects them. " +
      "'15 bag cement' is a plausible guess and an invented measurement.",
    expect: {
      forbidden: ["15"],
      emptySections: ["work_items", "labour"],
    },
  },
];

export const FIXTURE_COUNT = FIXTURES.length;
