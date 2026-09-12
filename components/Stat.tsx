/** One figure inside the home page's dark rounded stats panel. */
export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-[clamp(34px,4.6vw,46px)] font-semibold leading-none tracking-[-0.025em] tabular-nums">
        {value}
      </div>
      <div className="mt-1.5 text-[15px] text-[var(--color-dark-muted)]">{label}</div>
    </div>
  );
}
