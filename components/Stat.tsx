export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="py-6 pr-6">
      <div className="font-display text-4xl font-bold leading-none tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-[var(--color-footer-text)]">{label}</div>
    </div>
  );
}
