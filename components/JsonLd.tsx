import { headers } from 'next/headers';
import { jsonLdString } from '@/lib/seo';

/** One <script type="application/ld+json"> per object, carrying the per-request CSP nonce
 * (proxy.ts) so the policy never has to allow inline scripts. */
export async function JsonLd({ data }: { data: object[] }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <>
      {data.map((d, i) => (
        <script key={i} nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(d) }} />
      ))}
    </>
  );
}
