import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import "./globals.css";

// No next/font. The v2 design uses a Helvetica/Arial stack (see globals.css
// and spec 2.1), so there is no webfont to self-host and nothing for the
// CSP's font-src 'self' to permit. Do not reintroduce next/font/google here.

export const metadata: Metadata = {
  // Without this, Next.js can't resolve relative OG/Twitter image URLs and
  // sitemap.ts's absolute URLs (already built from SITE.url) render fine
  // regardless — but metadataBase is what makes any relative URL a future
  // page's metadata sets resolve against the real domain instead of
  // whatever host the request happened to arrive on.
  metadataBase: new URL(SITE.url),
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
