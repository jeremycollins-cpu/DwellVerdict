/**
 * DwellVerdict Brand Tokens
 *
 * Single source of truth for brand colors, typography, and spacing.
 * Consumed by Logo component, Tailwind config, and global CSS variables.
 *
 * DO NOT hardcode these values elsewhere. Import from this file.
 */

export const brandColors = {
  // Primary brand
  terracotta: '#c55a3f',
  terracottaDeep: '#a8472f',
  terracottaSoft: 'rgba(197, 90, 63, 0.08)',
  terracottaWash: 'rgba(197, 90, 63, 0.04)',
  terracottaBorder: 'rgba(197, 90, 63, 0.3)',

  // Ink (primary text + dark mode background)
  ink: '#1c1917',
  ink70: '#44403c',
  inkMuted: '#78716c',
  inkSubtle: '#a8a29e',
  inkFaint: '#d6d3d1',

  // Paper (backgrounds)
  paper: '#fafaf7',
  paperWarm: '#f5f2ec',
  paperDeep: '#ebe6da',
  cardInk: '#ffffff',
  sidebarBg: '#f7f5f0',

  // Hairlines
  hairline: 'rgba(28, 25, 23, 0.07)',
  hairlineStrong: 'rgba(28, 25, 23, 0.13)',

  // Verdict state colors
  buy: '#0e9467',
  buySoft: 'rgba(14, 148, 103, 0.08)',
  buyBorder: 'rgba(14, 148, 103, 0.25)',
  watch: '#c77a14',
  watchSoft: 'rgba(199, 122, 20, 0.08)',
  watchBorder: 'rgba(199, 122, 20, 0.25)',
  pass: '#c43d3d',
  passSoft: 'rgba(196, 61, 61, 0.08)',
  passBorder: 'rgba(196, 61, 61, 0.25)',
} as const;

/**
 * Contact-role gradient backgrounds (mockup #14).
 * Used by Avatar's `role` variant. Linear gradients are not expressible
 * as a single HSL token, so they live here as canonical CSS strings.
 */
export const contactRoleGradients = {
  agent: 'linear-gradient(135deg, #c55a3f, #a8472f)',
  lender: 'linear-gradient(135deg, #0e9467, #0a6e4e)',
  inspector: 'linear-gradient(135deg, #c77a14, #9d6010)',
  title: 'linear-gradient(135deg, #44403c, #1c1917)',
  default: 'linear-gradient(135deg, #1c1917, #44403c)',
} as const;

export const brandTypography = {
  fontSans: "'Geist', -apple-system, BlinkMacSystemFont, sans-serif",
  fontMono: "'Geist Mono', ui-monospace, monospace",
  fontSerif: "'Instrument Serif', 'Times New Roman', serif",

  // Wordmark-specific (used in Logo component — do not use elsewhere)
  wordmarkWeight: 800,
  wordmarkKerning: '-0.045em',
} as const;

export type BrandColor = keyof typeof brandColors;
export type ContactRoleGradient = keyof typeof contactRoleGradients;
