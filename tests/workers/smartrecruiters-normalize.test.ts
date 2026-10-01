import { describe, it, expect } from 'vitest';
import uhnList from '@/fixtures/smartrecruiters/uhn-list.json';
import { parseSmartRecruitersList } from '@/workers/connectors/smartrecruiters';

describe('parseSmartRecruitersList', () => {
  it('extracts stubs with source job ids, titles, and posted dates', () => {
    const stubs = parseSmartRecruitersList(uhnList);
    expect(stubs).toHaveLength(2);
    expect(stubs[0].sourceJobId).toBe('743999752619427');
    expect(stubs[0].title).toBe('Registered Nurse - Medicine');
    expect(stubs[0].externalPath).toBe('/postings/743999752619427');
    expect(stubs[0].postedAt).toEqual(new Date('2026-09-15T13:22:00.000Z'));
  });

  it('builds locationsText from city and region', () => {
    const stubs = parseSmartRecruitersList(uhnList);
    expect(stubs[0].locationsText).toBe('Toronto, Ontario');
  });
});
