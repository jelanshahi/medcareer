import { createHash } from 'node:crypto';
import { normalizeTitle } from './title';

export type FingerprintInput = {
  title: string;
  employerKey: string;
  city: string;
  province: string;
};

export function fingerprint(input: FingerprintInput): string {
  const parts = [
    normalizeTitle(input.title),
    input.employerKey.trim().toLowerCase(),
    input.city.trim().toLowerCase(),
    input.province.trim().toUpperCase(),
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}
