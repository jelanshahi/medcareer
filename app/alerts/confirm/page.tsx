import { AlertLinkCard } from '@/components/AlertLinkCard';
import { SECTION } from '@/lib/ui/styles';

// Nonce-based CSP requires dynamic rendering (see proxy.ts and app/about):
// a prerendered page bakes its bootstrap <script> tags before any per-request
// nonce exists, and the page then never hydrates — which here would leave the
// button inert and the link unusable.
export const dynamic = 'force-dynamic';

// A one-off page reached only from a link in an email, carrying a token in the
// URL. Nothing about it belongs in an index or a sitemap.
export const metadata = {
  title: 'Job alerts',
  robots: { index: false, follow: false },
};

export default async function Page(props: PageProps<'/alerts/confirm'>) {
  const { token } = await props.searchParams;

  return (
    <section className={`${SECTION} pb-[clamp(48px,7vw,80px)]`}>
      <AlertLinkCard kind="confirm" token={typeof token === 'string' ? token : ''} />
    </section>
  );
}
