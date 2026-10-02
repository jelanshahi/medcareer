import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/LegalPage';
import { SITE } from '@/lib/site';
import { pageMeta } from '@/lib/seo';

// Nonce-based CSP needs dynamic rendering; see app/about/page.tsx.
export const dynamic = 'force-dynamic';

export const metadata = pageMeta({
  title: `Terms of use — ${SITE.name}`,
  description: `The rules for using ${SITE.name}: what the site is, what we do not guarantee, and how employers can request removal.`,
  path: '/terms',
});

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      intro={`By using ${SITE.name} you agree to these terms. If you do not agree, please do not use the site.`}
    >
      <LegalSection title="What the site is">
        <p>
          {SITE.name} is a search tool that collects publicly posted healthcare job listings from
          employers&rsquo; own career sites and links you to them. We are not an employer, a
          recruiter or an agent for any employer, and we do not take applications. When you apply,
          you deal directly with the employer on their site.
        </p>
      </LegalSection>

      <LegalSection title="Listings: no guarantee">
        <p>
          Listings belong to the employers who posted them. We refresh them regularly but they may be
          out of date, incomplete, duplicated or wrong: a job may already be filled, and pay,
          location or requirements may have changed. Always confirm details on the employer&rsquo;s
          own page before relying on them. Pay figures and summaries on the site come from
          employer postings and are not offers, averages you can rely on, or advice.
        </p>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>You agree not to:</p>
        <ul>
          <li>scrape, copy or resell the site&rsquo;s content in bulk, or use bots against it, without our written permission;</li>
          <li>attempt to disrupt, probe or gain unauthorized access to the site or its data;</li>
          <li>use the alert form with an email address that is not yours, or to send spam.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Intellectual property and employer removal">
        <p>
          Job titles, descriptions and employer names and logos belong to their owners and are shown
          only to help you find and apply for the job. The rest of the site, including its design and
          the way listings are organized, belongs to us.
        </p>
        <p>
          Employers or rights holders who want their listings removed, or who believe content here
          infringes their rights, should email{' '}
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>. We will stop collecting
          from your site and take listings down promptly. See also{' '}
          <Link href="/about#employer-removal">employer removal requests</Link>.
        </p>
      </LegalSection>

      <LegalSection title="Links to other sites">
        <p>
          Every listing links to a site we do not control. We are not responsible for their content,
          security or privacy practices.
        </p>
      </LegalSection>

      <LegalSection title="Disclaimer and limit of liability">
        <p>
          The site is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
          warranties of any kind. To the fullest extent permitted by law, we are not liable for any
          loss or damage arising from your use of the site or from relying on a listing, including a
          missed opportunity, an inaccurate listing, or a dealing with an employer. Nothing in these
          terms limits liability that cannot be limited by law, including consumer protection rights
          you may have.
        </p>
      </LegalSection>

      <LegalSection title="Privacy, changes and governing law">
        <p>
          How we handle personal information is described in our{' '}
          <Link href="/privacy">privacy policy</Link>. We may update these terms; continued use after
          an update means you accept it. These terms are governed by the laws of Ontario and the
          federal laws of Canada that apply there, and disputes go to the courts of Ontario, except
          where your local consumer law says otherwise.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
