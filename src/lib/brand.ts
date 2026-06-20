/**
 * Almonry platform brand tokens. The product is "Almonry" — the SaaS shell
 * (sign-in, admin app). Individual tenant orgs carry their own identity on
 * their public giving pages and receipts; this is the platform chrome only.
 *
 * These mirror the CSS variables defined in globals.css. Use the CSS vars
 * (`var(--brand)`) in JSX inline styles where possible; the JS constants are
 * here for places that need a literal string (canvas, charts, emails).
 */
export const brand = {
  name: "Almonry",
  tagline: "Where generosity is kept.",
  company: "MADe180 Digital Solutions",

  // palette (from the Almonry marketing identity)
  parchment: "#F2EBDC",
  parchmentDeep: "#E7DDC8",
  ink: "#2B2620",
  inkSoft: "#5A5246",
  oxblood: "#6E2A2A",
  oxbloodBright: "#8B3A36",
  brass: "#A9854B",
  brassLight: "#C8A86A",
  forest: "#2F4032",
  stone: "#D9CFB8",

  // semantic
  brandColor: "#6E2A2A", // primary action / links (oxblood)
  brandHover: "#8B3A36",
  accent: "#A9854B", // brass — eyebrows, badges
} as const;

/** Recharts / canvas palette, brand-aligned. */
export const chartPalette = [
  "#6E2A2A", // oxblood
  "#A9854B", // brass
  "#2F4032", // forest
  "#8B3A36",
  "#C8A86A",
  "#5A5246",
];
