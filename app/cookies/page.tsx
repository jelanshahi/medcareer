import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/LegalPage';
import { SITE } from '@/lib/site';
import { pageMeta } from '@/lib/seo';

// Nonce-based CSP needs dynamic rendering; see app/about/page.tsx.
export const dynamic = 'force-dynamic';

export const metadata = pageMeta({
  title: `Cookie notice — ${SITE.name}`,
  description: `${SITE.name} sets no tracking or advertising cookies. This page explains what is stored in your browser.`,
  path: '/cookies',
});

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookie notice"
      intro={`${SITE.name} does not set tracking, analytics or advertising cookies, so there is no cookie banner to accept.`}
    >
      <LegalSection title="What is stored in your browser">
        <ul>
          <li>
            <strong>Saved jobs (local storage).</strong> When you press Save on a job, its ID is
            kept in your browser under the key <code>carepotal:saved-jobs</code> so the Saved jobs
            page can show it. When you open that page, your browser sends the saved IDs to our
            database provider, Supabase, to look up the current listings; the list itself stays on
            your device, and you can clear it from your browser settings at any time.
          </li>
        </ul>
        <p>
          That is the only thing we store, and it exists only because you asked for it. We use no
          third-party scripts, so no other company places cookies through this site.
        </p>
      </LegalSection>

      <LegalSection title="If this changes">
        <p>
          If we ever add analytics or anything else that uses cookies, we will ask for your consent
          first and update this page. See also our <Link href="/privacy">privacy policy</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
