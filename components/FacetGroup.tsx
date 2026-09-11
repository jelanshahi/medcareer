export type FacetItem = { value: string; label: string; count: number; checked: boolean };

/** One checkbox group in the /jobs filter sidebar. Real <input type="checkbox">
 * controls (not a JS widget) so the enclosing GET form works with no client-side
 * script and the back button behaves correctly. */
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
    <fieldset className="w-full border-0 border-b border-[var(--color-rule)] py-4">
      <legend className="w-full px-0 font-display text-[17px] font-semibold uppercase tracking-wider text-[var(--color-slate)]">
        {label}
      </legend>
      <div className="mt-2 flex flex-col gap-2">
        {items.map((item) => (
          <label
            key={item.value}
            className="flex cursor-pointer items-center gap-2 text-base text-[var(--color-ink)]"
          >
            <input
              type="checkbox"
              name={name}
              value={item.value}
              defaultChecked={item.checked}
              className="h-4 w-4 shrink-0 accent-[var(--color-signal)]"
            />
            <span className="flex-1">{item.label}</span>
            <span className="text-sm tabular-nums text-[var(--color-meta)]">{item.count}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
