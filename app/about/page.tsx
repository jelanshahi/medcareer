import { SITE } from '@/lib/site';

// Nonce-based CSP requires dynamic rendering (see proxy.ts): a statically
// prerendered page bakes its inline/bootstrap <script> tags at build time,
// before any per-request nonce exists, so they come back with no nonce
// attribute at all and a browser enforcing this CSP refuses to run them —
// the page never hydrates. Confirmed against a `next build` + `next start`:
// without this export, /about built as a static route (○) and its inline
// scripts carried no nonce.
export const dynamic = 'force-dynamic';

export const metadata = { title: `About ${SITE.name}` };

export default function AboutPage() {
  return (
    <article className="px-4 py-8">
      <h1 className="text-2xl font-semibold">About {SITE.name}</h1>

      <p className="mt-4">
        {SITE.name} is a job search site for healthcare work in Ontario. Every listing links
        directly to the employer&rsquo;s own application page. We never take applications ourselves.
      </p>

      <h2 className="mt-8 text-xl font-semibold">How we collect listings</h2>
      <p className="mt-2">
        We read the public job feeds that employers&rsquo; own career sites use. We identify
        ourselves on every request as <code>{SITE.userAgent}</code>, we send no more than one
        request per second to any single site, and we respect <code>robots.txt</code>. We do not
        log in, submit applications, or attempt to reach anything that requires authentication.
      </p>

      <h2 className="mt-8 text-xl font-semibold">Employers: removing your listings</h2>
      <p className="mt-2">
        Email <a className="text-[var(--color-signal)] underline"
        href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> and we will stop collecting
        from your site. No justification needed.
      </p>
    </article>
  );
}
