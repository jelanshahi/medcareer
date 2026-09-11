import type { NextConfig } from "next";

// Content-Security-Policy is deliberately NOT set here. It needs a fresh
// per-request nonce (see proxy.ts) so App Router's inline RSC bootstrap
// scripts can run — a static header here would have no way to vary the
// nonce per request and would either block hydration or fall back to
// 'unsafe-inline', which defeats the point of a script-src allowlist.
const nextConfig: NextConfig = {
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
    ];
  },
};

export default nextConfig;
