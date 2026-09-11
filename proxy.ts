import { NextResponse, type NextRequest } from 'next/server';

/**
 * Content-Security-Policy, per request, with a fresh nonce (Next.js 16 docs:
 * docs/01-app/02-guides/content-security-policy.md). App Router injects inline
 * <script> tags carrying the RSC flight payload, so script-src cannot be a
 * static 'self'-only policy without breaking hydration — it needs
 * 'nonce-<value>' plus 'strict-dynamic' so the nonce'd bootstrap script can load
 * the rest of the framework/page bundles it references.
 *
 * style-src uses 'unsafe-inline' rather than a nonce: Tailwind's dev-mode
 * style injection does not carry the nonce Next.js hands out, so a
 * nonce-only style-src breaks styling in dev. This is the documented
 * fallback (see content-security-policy.md, "Development vs Production") —
 * styles are a much smaller XSS vector than scripts, and script-src is not
 * weakened.
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';
  const header = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data:;
    font-src 'self';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
  `;
  return header.replace(/\s{2,}/g, ' ').trim();
}

/**
 * 410 Gone for job detail URLs whose slug has no visible row.
 *
 * App Router pages cannot set an arbitrary status code, so this is handled
 * here before the page renders. Gated to /jobs/ paths only — this issues a
 * live Supabase fetch, and running that on every request to every route
 * (static assets included, if they ever hit proxy) would be wasteful and
 * slow down the whole site for a check only job pages need.
 *
 * RLS hides inactive jobs from the anon key (tests/db/rls.test.ts), so a
 * closed job and a slug that never existed both come back as zero rows here
 * and both get 410. That is a deliberate, accepted tradeoff from the task
 * plan, not a bug: sharpening it would require the service-role key, which
 * must never reach the web runtime.
 *
 * If the existence check itself fails (network error, non-OK response,
 * unparsable body) this deliberately does NOT 410 — an ambiguous check must
 * not manufacture a false "gone". It falls through and lets the page's own
 * (error-checked) query decide, surfacing a real error instead of a wrong
 * 410 if the database is actually broken.
 */
async function checkJobGone(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/jobs/')) return null;

  const slug = pathname.split('/')[2];
  if (!slug) return null;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return null;

  let res: Response;
  try {
    res = await fetch(
      `${base}/rest/v1/jobs?slug=eq.${encodeURIComponent(slug)}&select=slug&limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const rows: unknown = await res.json().catch(() => null);
  if (Array.isArray(rows) && rows.length === 0) {
    return new NextResponse('This job posting has closed.', {
      status: 410,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const gone = await checkJobGone(request);
  if (gone) return gone;

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Every route needs the CSP nonce header (App Router's inline RSC
      // bootstrap script needs it everywhere, not just on /jobs/:slug).
      // Static assets and Next internals are excluded since they carry no
      // inline scripts and don't need a nonce.
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
