/** Pulse-line-into-checkmark mark: a small EKG-style zigzag that resolves
 * into a checkmark, tipped in the brand green. Health + verified, in one
 * glyph. Pure inline SVG — this project carries no icon library. */
export function Logo({ className = 'h-[20px] w-[28px]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 42 26" fill="none" className={className} aria-hidden="true">
      <path
        d="M2 18 L8 10 L12 20 L16 6 L20 16 L26 16"
        stroke="var(--color-ink)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26 16 L30 22 L40 4"
        stroke="var(--color-signal)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
