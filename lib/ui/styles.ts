/** Shared Tailwind class strings for the v2 design system.
 *
 * These exist so the repeated geometry of the canvas — the 1024px container,
 * the 18px card, the 980px pill — is written once. Colour always goes through
 * a [var(--color-*)] token; no component carries a raw hex value. */

/** 1024px measure with the canvas's 22px gutter. */
export const CONTAINER = 'mx-auto w-full max-w-[1024px] px-[22px]';

/** A home-page band: container plus the canvas's fluid top padding. */
export const SECTION = `${CONTAINER} pt-[clamp(40px,6vw,64px)]`;

/** White 18px-radius surface — cards, result lists, panels. */
export const CARD = 'rounded-[18px] bg-[var(--color-surface)]';

/** White 14px-radius surface — the smaller discipline/city tiles. */
export const TILE =
  'flex min-h-[56px] items-center justify-between gap-3 rounded-[14px] bg-[var(--color-surface)] px-[18px] py-4 text-[var(--color-ink)] no-underline hover:bg-[var(--color-surface-hover)] hover:no-underline';

/** Text input / select shell. */
export const FIELD =
  'min-h-[46px] rounded-xl border border-[var(--color-rule)] bg-[var(--color-surface)] px-[15px] py-[11px] text-[var(--color-ink)]';

/** Primary action. Brand green, 980px pill. */
export const PILL_PRIMARY =
  'inline-flex min-h-[46px] cursor-pointer items-center justify-center rounded-full border-0 bg-[var(--color-signal)] px-[23px] py-3 text-[17px] text-white no-underline hover:bg-[var(--color-signal-hover)] hover:text-white hover:no-underline';

/** Secondary action — white pill with a hairline. */
export const PILL_OUTLINE =
  'inline-flex min-h-[36px] cursor-pointer items-center justify-center rounded-full border border-[var(--color-rule)] bg-[var(--color-surface)] px-[14px] py-2 text-sm text-[var(--color-ink)] no-underline hover:border-[var(--color-meta)] hover:text-[var(--color-ink)] hover:no-underline';

/** Removable active-filter chip. */
export const CHIP =
  'inline-flex min-h-[36px] items-center gap-[7px] rounded-full bg-[var(--color-chip)] py-2 pl-[14px] pr-3 text-sm text-[var(--color-ink)] no-underline hover:bg-[var(--color-chip-hover)] hover:text-[var(--color-ink)] hover:no-underline';

/** Hero kicker above an h1. */
export const EYEBROW = 'text-[19px] text-[var(--color-slate)]';

export const H1 =
  'text-balance font-semibold leading-[1.06] tracking-[-0.025em] text-[clamp(34px,5.6vw,56px)]';
export const H2 = 'font-semibold tracking-[-0.02em] text-[clamp(26px,3.6vw,36px)]';
export const H3 = 'font-semibold tracking-[-0.015em] text-[17px]';

/** White result list and its divided rows. */
export const LIST = `${CARD} m-0 list-none overflow-hidden p-0`;
export const LIST_ROW = 'border-t border-[var(--color-divider)] first:border-t-0';
