import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { SITE } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <header className="bg-[var(--color-ink)] px-4 py-3">
          <Link href="/" className="font-semibold tracking-tight text-[var(--color-paper)]">
            {SITE.name}
          </Link>
        </header>
        <main className="mx-auto w-full max-w-3xl flex-1">{children}</main>
        <footer className="mx-auto w-full max-w-3xl px-4 py-8 text-sm text-[var(--color-slate)]">
          <Link href="/about" className="underline">About {SITE.name}</Link>
        </footer>
      </body>
    </html>
  );
}
