import { EYEBROW, H1 } from '@/lib/ui/styles';

/** The centred hero every landing page opens with: kicker, h1, one-paragraph intro.
 * Same geometry as the /browse city and discipline pages, shared so the province, role,
 * employer and salary pages cannot drift from them. */
export function LandingHero({ eyebrow, title, intro }: { eyebrow: string; title: string; intro: string }) {
  return (
    <section className="bg-[var(--color-surface)] text-center">
      <div className="mx-auto max-w-[800px] px-[22px] pb-[clamp(32px,5vw,52px)] pt-[clamp(44px,7vw,76px)]">
        <div className={EYEBROW}>{eyebrow}</div>
        <h1 className={`mt-1.5 ${H1}`}>{title}</h1>
        <p className="mx-auto mt-3.5 max-w-[34em] text-[clamp(18px,2.2vw,21px)] leading-[1.4] text-[var(--color-slate)]">
          {intro}
        </p>
      </div>
    </section>
  );
}
