export const COMPLIANCE_PACK_KINDS = [
  "dpcc_dust", "grap", "rera_quarterly", "custom",
] as const;

export type CompliancePackKind = (typeof COMPLIANCE_PACK_KINDS)[number];

export const COMPLIANCE_PACK_LABELS: Record<CompliancePackKind, string> = {
  dpcc_dust: "Dust-control evidence pack",
  grap: "GRAP readiness evidence pack",
  rera_quarterly: "Quarterly project update pack",
  custom: "Custom evidence pack",
};

export const COMPLIANCE_LEGAL_CAUTION =
  "Operational evidence organizer only. Requirements and exports are not legal advice, a certification of compliance, or a submission to any authority. Verify the current rules, forms, portal requirements, deadlines, and signatories with qualified professionals before use.";

export type ComplianceTemplateRequirement = {
  text: string;
  ownerName: string;
  dueOffsetDays: number;
};

const templates: Record<CompliancePackKind, ComplianceTemplateRequirement[]> = {
  dpcc_dust: [
    { text: "Dust-control method and responsible person recorded", ownerName: "Site manager", dueOffsetDays: -14 },
    { text: "Recent water-sprinkling or misting evidence attached", ownerName: "Site engineer", dueOffsetDays: -7 },
    { text: "Perimeter barrier, screens, and debris containment evidenced", ownerName: "Safety officer", dueOffsetDays: -7 },
    { text: "Material transport and wheel-cleaning controls evidenced", ownerName: "Logistics lead", dueOffsetDays: -3 },
    { text: "Current monitoring or inspection record attached where applicable", ownerName: "Environment lead", dueOffsetDays: 0 },
  ],
  grap: [
    { text: "Applicable alert or restriction stage recorded with source and date", ownerName: "Project manager", dueOffsetDays: -14 },
    { text: "Site action checklist for the recorded stage completed", ownerName: "Site manager", dueOffsetDays: -7 },
    { text: "Equipment, vehicle, and material-handling restrictions evidenced", ownerName: "Plant lead", dueOffsetDays: -5 },
    { text: "Work stoppage or resumption decision recorded where applicable", ownerName: "Project manager", dueOffsetDays: -2 },
    { text: "Final internal review of evidence and current applicability completed", ownerName: "Compliance reviewer", dueOffsetDays: 0 },
  ],
  rera_quarterly: [
    { text: "Quarter-period physical progress summary attached", ownerName: "Project manager", dueOffsetDays: -21 },
    { text: "Financial and collection summary reviewed against source records", ownerName: "Finance lead", dueOffsetDays: -14 },
    { text: "Current certificates or professional confirmations attached where required", ownerName: "Project manager", dueOffsetDays: -10 },
    { text: "Time-stamped site elevation or progress evidence attached", ownerName: "Site engineer", dueOffsetDays: -7 },
    { text: "Authorized reviewer has confirmed pack completeness", ownerName: "Compliance reviewer", dueOffsetDays: 0 },
  ],
  custom: [],
};

export function complianceTemplate(kind: CompliancePackKind): ComplianceTemplateRequirement[] {
  return templates[kind].map((item) => ({ ...item }));
}

export function isCompliancePackKind(value: string): value is CompliancePackKind {
  return (COMPLIANCE_PACK_KINDS as readonly string[]).includes(value);
}
