import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DwellVerdict",
  description:
    "Property-specific lifecycle app for real estate investors. Paste an address, get a CarFax-style report, follow the property through evaluation, buying, renovating, and managing.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
