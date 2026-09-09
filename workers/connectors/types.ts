import type { JobStub, NormalizedPosting } from '@/lib/types';

export interface Connector {
  readonly id: string;
  readonly kind: 'feed' | 'api' | 'ats';
  fetchPage(cursor?: string): Promise<{ items: JobStub[]; nextCursor?: string }>;
  /** Fetch the full record for a stub. Identity for sources returning complete rows. */
  hydrate(stub: JobStub): Promise<unknown>;
  /** Pure. No I/O. Throws on invalid input. */
  normalize(raw: unknown): NormalizedPosting;
}
