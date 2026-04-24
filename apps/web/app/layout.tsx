import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

// Geist — interface sans + mono. Loaded at build time via next/font
// so Next self-hosts the .woff2 and eliminates runtime font fetches.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

// Instrument Serif — loaded globally and kept available via the
// --font-instrument-serif CSS variable for future editorial copy
// (long-form content, narrative sections). The old Wordmark
// component that consumed it was retired in Phase 1 Sprint 2 when
// the Variant B logo (Logo.tsx) took over brand rendering. Kept
// loaded per the M6 audit decision so editorial additions don't
// have to re-wire font loading.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DwellVerdict",
  description:
    "Property-specific lifecycle app for real estate investors. Paste an address, get a CarFax-style report, follow the property through evaluation, buying, renovating, and managing.",
  icons: {
    // Primary favicon — SVG works natively in all modern browsers
    // (Chrome 80+, Safari 14+, Firefox 41+). No .ico fallback shipped
    // because this branch has no pre-existing favicon and we're not
    // supporting IE.
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    // Apple touch icon — points at the 52×52 mark SVG as an interim.
    // Safari prefers a 180×180 PNG and may downscale ugly. M5 handoff
    // flags this for manual PNG regeneration in Figma; see journal.
    apple: "/brand/logo-mark.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
      >
        <body className="min-h-screen font-sans antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
