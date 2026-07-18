// Design tokens from design.md §10–§12. Calm, industrial, trustworthy.

export const colors = {
  brand900: "#102A43",
  brand700: "#1F4E6D",
  brand100: "#DCEAF2",
  accent600: "#C65D16", // reserved for the primary capture action only
  accent100: "#FCE8D5",
  success700: "#16794B",
  success100: "#DDF3E8",
  warning700: "#996A00",
  warning100: "#FFF2C6",
  danger700: "#B42318",
  danger100: "#FEE4E2",
  neutral950: "#111827",
  neutral700: "#374151",
  neutral500: "#6B7280",
  neutral200: "#E5E7EB",
  neutral50: "#F9FAFB",
  surface: "#FFFFFF",
} as const;

/** Base spacing unit is 4px (design.md §12). */
export const spacing = (steps: number): number => steps * 4;

export const radius = {
  card: 12,
  control: 10,
} as const;

/** Minimum primary touch target (dp). */
export const TOUCH_TARGET = 48;

export const typography = {
  pageTitle: { fontSize: 28, lineHeight: 36, fontWeight: "700" },
  sectionTitle: { fontSize: 22, lineHeight: 30, fontWeight: "700" },
  cardTitle: { fontSize: 18, lineHeight: 26, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: "600" },
  supporting: { fontSize: 14, lineHeight: 20, fontWeight: "400" },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "600" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
} as const;
