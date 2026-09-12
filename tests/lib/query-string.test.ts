import { describe, it, expect } from 'vitest';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { parseSearchParams } from '@/lib/schemas/search-params';

describe('buildJobsQuery', () => {
  it('returns bare /jobs for an empty query', () => {
    expect(buildJobsQuery({})).toBe('/jobs');
  });

  it('repeats the key for each employer', () => {
    expect(buildJobsQuery({ employer: ['CHEO', 'Oak Valley Health'] })).toBe(
      '/jobs?employer=CHEO&employer=Oak+Valley+Health',
    );
  });

  it('omits the default sort and the first page', () => {
    expect(buildJobsQuery({ sort: 'newest', page: 1, city: ['Ottawa'] })).toBe(
      '/jobs?city=Ottawa',
    );
  });

  it('round-trips scalars and the employer facet through parseSearchParams', () => {
    const url = buildJobsQuery({
      q: 'nurse',
      employer: ['CHEO'],
      sort: 'salary',
      page: 3,
    });
    const parsed = parseSearchParams(
      Object.fromEntries(new URL(url, 'http://x').searchParams.entries()),
    );
    expect(parsed.q).toBe('nurse');
    expect(parsed.sort).toBe('salary');
    expect(parsed.page).toBe(3);
    expect(parsed.employer).toEqual(['CHEO']);
  });
});
