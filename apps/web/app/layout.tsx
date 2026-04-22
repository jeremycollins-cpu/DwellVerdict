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

// Instrument Serif — brand wordmark only. Single weight/style to keep
// the .woff2 payload small. Used exclusively by <Wordmark /> — see
// docs/DESIGN.md for the "serif = brand / sans = interface / mono =
// data" typography system.
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
