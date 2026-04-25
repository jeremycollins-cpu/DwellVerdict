import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", ...defaultTheme.fontFamily.sans],
        mono: ["var(--font-geist-mono)", ...defaultTheme.fontFamily.mono],
        serif: [
          "var(--font-instrument-serif)",
          ...defaultTheme.fontFamily.serif,
        ],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // ─── DwellVerdict Verdict Ledger palette ───────────────────
        // Semantic warm tokens used alongside shadcn's primitive set.
        // See docs/DESIGN.md for usage rules.
        paper: {
          DEFAULT: "hsl(var(--paper))",
          warm: "hsl(var(--paper-warm))",
          deep: "hsl(var(--paper-deep))",
        },
        "card-ink": "hsl(var(--card-ink))",
        "sidebar-bg": "hsl(var(--sidebar-bg))",
        ink: {
          DEFAULT: "hsl(var(--ink))",
          70: "hsl(var(--ink-70))",
          muted: "hsl(var(--ink-muted))",
          subtle: "hsl(var(--ink-subtle))",
          faint: "hsl(var(--ink-faint))",
        },
        terracotta: {
          DEFAULT: "hsl(var(--terracotta))",
          // Use as bg-terracotta/10 etc. via Tailwind's slash-opacity.
          deep: "hsl(var(--terracotta-deep))",
          soft: "hsl(var(--terracotta-soft))",
          wash: "hsl(var(--terracotta-wash))",
          border: "hsl(var(--terracotta-border))",
        },
        hairline: {
          DEFAULT: "hsl(var(--hairline))",
          strong: "hsl(var(--hairline-strong))",
        },
        // ─── Deal signals ──────────────────────────────────────────
        // `signal.*` keeps the original Phase B emerald/amber/red palette
        // (used by older surfaces). `buy`/`watch`/`pass` are the warm
        // brand variants used by the M1.1+ refactor mockups.
        signal: {
          buy: "hsl(var(--signal-buy))",
          watch: "hsl(var(--signal-watch))",
          pass: "hsl(var(--signal-pass))",
        },
        buy: {
          DEFAULT: "hsl(var(--buy))",
          soft: "hsl(var(--buy-soft))",
          border: "hsl(var(--buy-border))",
        },
        watch: {
          DEFAULT: "hsl(var(--watch))",
          soft: "hsl(var(--watch-soft))",
          border: "hsl(var(--watch-border))",
        },
        pass: {
          DEFAULT: "hsl(var(--pass))",
          soft: "hsl(var(--pass-soft))",
          border: "hsl(var(--pass-border))",
        },
        // ─── Verdict surface tokens (kept for compat) ──────────────
        verdict: {
          DEFAULT: "hsl(var(--verdict-background))",
          border: "hsl(var(--verdict-border))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        // ─── Layered warm shadows for the Verdict Ledger direction ─
        // `shadow-card` is the baseline for elevated surfaces (verdict
        // card, how-it-works cards). Two stacked shadows — a tight
        // near-shadow for edge definition, a soft far-shadow for
        // depth. Shadow color is warm charcoal, not pure black, so
        // it sits naturally against the cream ground.
        card: "0 1px 3px 0 hsl(var(--shadow-warm) / 0.06), 0 18px 40px -16px hsl(var(--shadow-warm) / 0.12)",
        "card-hover":
          "0 2px 4px 0 hsl(var(--shadow-warm) / 0.08), 0 28px 56px -18px hsl(var(--shadow-warm) / 0.18)",
      },
    },
  },
  plugins: [animate],
};

export default config;
