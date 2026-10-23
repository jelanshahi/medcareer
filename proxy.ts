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
 *
 * connect-src explicitly allows the Supabase project URL because /saved
 * (components/SavedJobsView.tsx) fetches from Supabase client-side — the
 * only client-side Supabase call in this app, since every other call runs
 * server-side in a Server Component where the browser's CSP never applies.
 * Without this, connect-src falls back to default-src 'self' and the
 * browser blocks that fetch outright.
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const header = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''};
    style-src 'self' 'unsafe-inline';
    img-src 'self' data:;
    font-src 'self';
    connect-src 'self'${supabaseUrl ? ` ${supabaseUrl}` : ''};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
  `;
  return header.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Category slugs in URLs switched from snake_case to hyphens (lib/taxonomy/categories.ts
 * categorySlug). /jobs?category=allied_health still parses, but is permanently redirected
 * to /jobs?category=allied-health so search engines consolidate on one URL. The
 * /browse/[city]/[discipline] path form is redirected in its page, where the category
 * is already resolved.
 */
function redirectLegacyCategoryQuery(request: NextRequest): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname !== '/jobs') return null;
  const categories = searchParams.getAll('category');
  if (!categories.some((c) => c.includes('_'))) return null;

  const url = request.nextUrl.clone();
  url.searchParams.delete('category');
  for (const c of categories) url.searchParams.append('category', c.replace(/_/g, '-'));
  return NextResponse.redirect(url, 308);
}

export async function proxy(request: NextRequest) {
  const legacy = redirectLegacyCategoryQuery(request);
  if (legacy) return legacy;

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
      //
      // /browse and /jobs/:slug are excluded too: those pages are ISR-cached
      // (see app/browse/[city]/page.tsx and app/jobs/[slug]/page.tsx), so a
      // nonce would be stale on every cached hit. They get a static CSP from
      // next.config.ts instead. `jobs/` (with the slash) leaves /jobs itself
      // here, where the legacy category redirect below still applies.
      //
      // Closed jobs used to get a 410 from a Supabase lookup here on every job
      // request. They now 404 from the cached page itself: Google drops both,
      // and the lookup was a function invocation per crawler hit.
      source: '/((?!api|_next/static|_next/image|favicon.ico|browse|jobs/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
