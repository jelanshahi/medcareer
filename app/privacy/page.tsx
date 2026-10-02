import Link from 'next/link';
import { LegalPage, LegalSection } from '@/components/LegalPage';
import { SITE } from '@/lib/site';
import { pageMeta } from '@/lib/seo';

// Nonce-based CSP needs dynamic rendering; see app/about/page.tsx.
export const dynamic = 'force-dynamic';

export const metadata = pageMeta({
  title: `Privacy policy — ${SITE.name}`,
  description: `What personal information ${SITE.name} collects, why, who it is shared with, and how to access or delete it.`,
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={`${SITE.name} is a healthcare job search site for Canada. There are no accounts. We collect very little, and this page lists all of it.`}
    >
      <LegalSection title="Who is responsible">
        <p>
          {SITE.name} is operated by the site owner, reachable at{' '}
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>. That person is also the
          contact for privacy questions and requests under Canada&rsquo;s PIPEDA and, for Quebec
          residents, Law 25.
        </p>
      </LegalSection>

      <LegalSection title="What we collect">
        <ul>
          <li>
            <strong>Job alert email address.</strong> If you sign up for alerts we store your
            email, the city and job category you chose, when you signed up and confirmed, and
            whether you have unsubscribed. We collect it only to send the alerts you asked for.
          </li>
          <li>
            <strong>Your location, only if you press &ldquo;Near me&rdquo;.</strong> Your browser
            asks your permission first. Your coordinates are sent to our server, which asks
            OpenStreetMap&rsquo;s Nominatim service which city they are in, then discards them. We
            do not store your coordinates or your city lookup.
          </li>
          <li>
            <strong>Saved jobs.</strong> The list of jobs you save is kept in your own browser
            (local storage), not on an account. When you open the Saved jobs page, your browser
            sends those job IDs to our database provider, Supabase, to fetch the current listings.
            We do not keep that list, though Supabase may log the request like any web request.
          </li>
          <li>
            <strong>Standard server logs.</strong> Our hosting provider records technical details of
            each request (IP address, browser type, pages requested, time) to run and secure the
            service.
          </li>
        </ul>
        <p>
          We do not run advertising or analytics trackers, we do not sell personal information, and
          we do not ask for your name, resume or health information. Job listings are public
          information from employers and contain no personal data about applicants.
        </p>
      </LegalSection>

      <LegalSection title="Who we share it with">
        <p>Only service providers that help us run the site, each under their own privacy terms:</p>
        <ul>
          <li>
            <strong>Supabase</strong> stores the job database and the alert subscriber list, and
            receives your saved job IDs and IP address when you open the Saved jobs page.
          </li>
          <li><strong>Resend</strong> delivers alert and confirmation emails.</li>
          <li><strong>Vercel</strong> hosts the website and holds its request logs.</li>
          <li><strong>OpenStreetMap Nominatim</strong> receives coordinates when you use &ldquo;Near me&rdquo;.</li>
        </ul>
        <p>
          These providers may process data outside Canada, including in the United States. We may
          also disclose information if the law requires it.
        </p>
      </LegalSection>

      <LegalSection title="Email alerts and consent">
        <p>
          Alerts are opt-in. We first send one confirmation email and send nothing further until you
          click the link. Every alert has an unsubscribe link that works immediately. After you
          unsubscribe we keep the address marked as inactive so we do not email you again, and we
          delete it entirely if you ask.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <p>
          Alert subscriptions are kept until you unsubscribe and ask us to delete them. Server logs
          are kept by our host for the period its own policy sets. Job listings are removed after
          they expire.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          You can ask us to show you the personal information we hold about you, correct it, delete
          it, or withdraw your consent, by emailing{' '}
          <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>. We will reply within 30
          days. If you are not satisfied, you may complain to the Office of the Privacy Commissioner
          of Canada, or in Quebec to the Commission d&rsquo;accès à l&rsquo;information.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and children">
        <p>
          See our <Link href="/cookies">cookie notice</Link>: the site sets no tracking cookies. The
          service is not directed at children under 13 and we do not knowingly collect their
          information.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          If we change what we collect we will update this page and its date before the change
          takes effect.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
