import type { Faq } from '@/lib/taxonomy/role-content';
import { CARD, H2, H3 } from '@/lib/ui/styles';

/** Visible questions and answers. Pages that render this also emit the same pairs as
 * FAQPage JSON-LD (lib/seo.ts faqLd), which Google only accepts when the text is on the page. */
export function FaqSection({ title, faqs }: { title: string; faqs: Faq[] }) {
  if (faqs.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className={`m-0 ${H2}`}>{title}</h2>
      <div className={`${CARD} mt-4 divide-y divide-[var(--color-divider)] px-5`}>
        {faqs.map((f) => (
          <div key={f.question} className="py-4">
            <h3 className={`m-0 ${H3}`}>{f.question}</h3>
            <p className="mt-1.5 text-base leading-[1.55] text-[var(--color-slate)]">{f.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
