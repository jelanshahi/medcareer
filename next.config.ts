import type { NextConfig } from "next";

// Content-Security-Policy is set per request with a fresh nonce (see proxy.ts)
// so App Router's inline RSC bootstrap scripts can run without 'unsafe-inline'.
//
// The one exception is /browse, which proxy.ts skips. Those pages are
// ISR-cached because crawler traffic rendering them per request used up the
// Fluid CPU allowance, and a cached page cannot carry a per-request nonce, so
// they fall back to 'unsafe-inline'. That is acceptable there because /browse
// renders no raw HTML: every feed string goes through React escaping, and
// there is no JsonLd or dangerouslySetInnerHTML. /jobs/[slug], which does render
// employer HTML, stays on the nonce policy.
const BROWSE_CSP = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  font-src 'self';
  connect-src 'self'${process.env.NEXT_PUBLIC_SUPABASE_URL ? ` ${process.env.NEXT_PUBLIC_SUPABASE_URL}` : ""};
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
`
  .replace(/\s{2,}/g, " ")
  .trim();

const nextConfig: NextConfig = {
  // Drops the "X-Powered-By: Next.js" response header — no functional effect,
  // just stops advertising the framework/version to anyone fingerprinting the
  // stack.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      ...["/browse", "/browse/:path*"].map((source) => ({
        source,
        headers: [{ key: "Content-Security-Policy", value: BROWSE_CSP }],
      })),
    ];
  },
};

export default nextConfig;
