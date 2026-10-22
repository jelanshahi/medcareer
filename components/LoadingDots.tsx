/** Three-dot wave for in-progress buttons. Decorative: the button's own label
 * carries the status text, so this is hidden from assistive tech. */
export function LoadingDots() {
  return (
    <span aria-hidden="true" className="dot-wave ml-1.5 inline-flex items-center gap-[3px]">
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
    </span>
  );
}
