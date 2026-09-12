export type FacetItem = { value: string; label: string; count: number; checked: boolean };

/** One checkbox group in the /jobs filter sidebar, styled to the v2 canvas.
 * Real <input type="checkbox"> controls rather than a JS widget, so the
 * enclosing GET form works with scripting disabled and the back button
 * behaves correctly. */
export function FacetGroup({
  label,
  name,
  items,
}: {
  label: string;
  name: string;
  items: FacetItem[];
}) {
  if (items.length === 0) return null;

  return (
    <fieldset className="w-full border-0 border-t border-[var(--color-rule)] px-0 pb-1 pt-3.5">
      <legend className="w-full px-0 text-[13px] font-semibold uppercase tracking-[.02em] text-[var(--color-slate)]">
        {label}
      </legend>
      <div className="mt-2.5 flex flex-col gap-2">
        {items.map((item) => (
          <label
            key={item.value}
            className="flex min-h-[34px] cursor-pointer items-center gap-2.5 text-base text-[var(--color-ink)]"
          >
            <input
              type="checkbox"
              name={name}
              value={item.value}
              defaultChecked={item.checked}
              className="m-0 h-5 w-5 flex-none cursor-pointer accent-[var(--color-signal)]"
            />
            <span className="flex-1">{item.label}</span>
            <span className="text-sm tabular-nums text-[var(--color-meta)]">{item.count}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
