import type { JobStub, NormalizedPosting } from '@/lib/types';

export interface Connector {
  readonly id: string;
  readonly kind: 'feed' | 'api' | 'ats';
  /**
   * Whether a stub already in raw_postings is hydrated again on every run. When false, known
   * stubs are only marked as seen: right for sources whose postings don't change after
   * publishing and whose detail fetches are too many to repeat every six hours.
   */
  readonly refreshKnown: boolean;
  fetchPage(cursor?: string): Promise<{ items: JobStub[]; nextCursor?: string }>;
  /** Fetch the full record for a stub. Identity for sources returning complete rows. */
  hydrate(stub: JobStub): Promise<unknown>;
  /** Pure. No I/O. Throws on invalid input. */
  normalize(raw: unknown): NormalizedPosting;
}
