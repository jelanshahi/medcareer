/** Hidden <input>s that replicate filter state a given GET form does not
 * itself render, so submitting one form (e.g. the keyword/sort bar) does not
 * discard selections made in the other (the facet checkboxes), and vice
 * versa. Plain HTML — no JS required for /jobs to stay fully linkable. */
export function HiddenFilterFields({
  q,
  city,
  category,
  employment_type,
  employer,
  sort,
}: {
  q?: string;
  city?: string[];
  category?: string[];
  employment_type?: string[];
  employer?: string[];
  sort?: string;
}) {
  return (
    <>
      {q && <input type="hidden" name="q" value={q} />}
      {sort && sort !== 'newest' && <input type="hidden" name="sort" value={sort} />}
      {city?.map((v) => <input key={`city-${v}`} type="hidden" name="city" value={v} />)}
      {category?.map((v) => <input key={`category-${v}`} type="hidden" name="category" value={v} />)}
      {employment_type?.map((v) => (
        <input key={`employment_type-${v}`} type="hidden" name="employment_type" value={v} />
      ))}
      {employer?.map((v) => <input key={`employer-${v}`} type="hidden" name="employer" value={v} />)}
    </>
  );
}
