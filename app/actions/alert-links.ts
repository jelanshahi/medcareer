'use server';

import { z } from 'zod';
import { createServerClient } from '@/lib/db/server';
import type { AlertLinkState } from '@/lib/schemas/job-alert';

const TokenSchema = z.uuid();

/** Both links resolve through a SECURITY DEFINER function (migration 0008)
 *  rather than a table write: anon holds no access to job_alerts, and each
 *  function can only touch the single row carrying the token. */
async function applyToken(
  fn: 'confirm_job_alert' | 'unsubscribe_job_alert',
  rawToken: string,
): Promise<AlertLinkState> {
  const token = TokenSchema.safeParse(rawToken);
  if (!token.success) return 'invalid';

  const { data, error } = await createServerClient().rpc(fn, { token: token.data });

  if (error) {
    console.error(`${fn} failed`, error.code, error.message);
    return 'failed';
  }
  return data === 'ok' ? 'ok' : 'invalid';
}

export async function confirmAlert(_prev: AlertLinkState, formData: FormData) {
  return applyToken('confirm_job_alert', String(formData.get('token') ?? ''));
}

export async function unsubscribeAlert(_prev: AlertLinkState, formData: FormData) {
  return applyToken('unsubscribe_job_alert', String(formData.get('token') ?? ''));
}
