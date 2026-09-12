import { CARD, H3 } from '@/lib/ui/styles';
import type { GlanceRow } from '@/lib/jobs/glance';

/** Renders buildGlance output. Rows are already filtered by the builder — a
 * missing datum produces no row, never a placeholder. */
export function GlancePanel({ rows }: { rows: GlanceRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className={`${CARD} mt-8 p-5`}>
      <div className={H3}>At a glance</div>
      <dl className="m-0 mt-3 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-x-5 gap-y-3.5">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[13px] text-[var(--color-slate)]">{row.label}</dt>
            <dd className="m-0 mt-0.5 text-[17px] font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
