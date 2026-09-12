export type FacetRow = {
  category: string | null;
  city: string;
  employment_type: string | null;
  employer_name: string;
};

/** Counts non-null occurrences of one field across a row set. */
export function tally(rows: FacetRow[], key: keyof FacetRow): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const value = row[key];
    if (!value) continue;
    out[value] = (out[value] ?? 0) + 1;
  }
  return out;
}
