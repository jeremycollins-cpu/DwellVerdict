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
        // Resolved via next/font/google at build time. The CSS variable
        // is set on <html> in apps/web/app/layout.tsx; the fallback stack
        // covers the fraction of a second before the self-hosted woff2
        // lands.
        sans: ["var(--font-geist-sans)", ...defaultTheme.fontFamily.sans],
        mono: ["var(--font-geist-mono)", ...defaultTheme.fontFamily.mono],
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
        // ─── DwellVerdict deal signals ─────────────────────────────
        // Usage: text-signal-buy, bg-signal-watch, border-signal-pass.
        // See docs/DESIGN.md for semantic meaning and usage rules.
        signal: {
          buy: "hsl(var(--signal-buy))",
          watch: "hsl(var(--signal-watch))",
          pass: "hsl(var(--signal-pass))",
        },
        // ─── Verdict surface tokens ────────────────────────────────
        // The property report verdict panel. Use as bg-verdict and
        // border-verdict-border. Deliberately near-neutral so signal
        // colors do the work.
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
    },
  },
  plugins: [animate],
};

export default config;
