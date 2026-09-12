import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import "./globals.css";

// No next/font. The v2 design uses a Helvetica/Arial stack (see globals.css
// and spec 2.1), so there is no webfont to self-host and nothing for the
// CSP's font-src 'self' to permit. Do not reintroduce next/font/google here.

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-[var(--color-canvas)] font-sans text-[var(--color-ink)]">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
