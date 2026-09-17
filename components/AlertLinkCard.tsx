'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { confirmAlert, unsubscribeAlert } from '@/app/actions/alert-links';
import type { AlertLinkState } from '@/lib/schemas/job-alert';
import { CARD, H2, PILL_PRIMARY } from '@/lib/ui/styles';

type Kind = 'confirm' | 'unsubscribe';

const COPY: Record<Kind, { heading: string; lead: string; button: string; done: string }> = {
  confirm: {
    heading: 'Confirm your job alert',
    lead: "One tap and we'll start emailing you when new healthcare jobs matching your alert are posted.",
    button: 'Confirm my alert',
    done: "You're all set. We'll email you when new matching jobs are posted.",
  },
  unsubscribe: {
    heading: 'Unsubscribe from job alerts',
    lead: 'Stop receiving the email alert for this address.',
    button: 'Unsubscribe',
    done: "You're unsubscribed. No further alerts will be sent to this address.",
  },
};

/** Deliberately a button rather than acting on page load.
 *
 *  These links arrive by email, and mail providers and security scanners fetch
 *  every URL in a message before a person ever sees it. A confirm-on-GET would
 *  let a scanner complete someone else's double opt-in, and an
 *  unsubscribe-on-GET would cancel a subscription nobody asked to cancel. The
 *  GET renders; only the POST behind this button changes anything. */
export function AlertLinkCard({ kind, token }: { kind: Kind; token: string }) {
  const action = kind === 'confirm' ? confirmAlert : unsubscribeAlert;
  const [state, formAction, pending] = useActionState<AlertLinkState, FormData>(action, 'idle');
  const copy = COPY[kind];

  return (
    <div className={`${CARD} mx-auto max-w-[560px] px-[clamp(20px,4vw,40px)] py-[clamp(24px,4vw,40px)]`}>
      <h1 className={`m-0 ${H2}`}>{copy.heading}</h1>

      {state === 'ok' ? (
        <>
          <p className="mt-4 text-[17px] text-[var(--color-slate)]">{copy.done}</p>
          <Link href="/jobs" className={`${PILL_PRIMARY} mt-6 w-full`}>Browse open jobs</Link>
        </>
      ) : (
        <>
          <p className="mt-4 text-[17px] text-[var(--color-slate)]">
            {state === 'invalid'
              ? 'This link is no longer valid. It may have already been used, or the alert may have been cancelled.'
              : state === 'failed'
                ? 'Something went wrong on our end. Please try again in a moment.'
                : copy.lead}
          </p>

          {state !== 'invalid' && (
            <form action={formAction}>
              <input type="hidden" name="token" value={token} />
              <button
                type="submit"
                disabled={pending}
                className={`${PILL_PRIMARY} mt-6 w-full disabled:opacity-60`}
              >
                {pending ? 'Working…' : copy.button}
              </button>
            </form>
          )}

          <p className="mt-4 text-center">
            <Link href="/jobs" className="text-[15px]">Browse open jobs instead</Link>
          </p>
        </>
      )}
    </div>
  );
}
