'use client';

import { useActionState } from 'react';
import { createJobAlert } from '@/app/actions/job-alerts';
import { JOB_ALERT_INITIAL, MAX_EMAIL_LENGTH } from '@/lib/schemas/job-alert';
import { FIELD, PILL_PRIMARY } from '@/lib/ui/styles';

/** The homepage alert signup. A real <form action={...}> rather than an
 *  onSubmit handler, so it still posts if hydration has not finished (or never
 *  runs); useActionState only adds the pending state and the reply.
 *
 *  type="email" + required give the browser's own validation for free, and the
 *  action re-checks server-side regardless — it is reachable by direct POST. */
export function JobAlertForm({ region }: { region: string }) {
  const [state, formAction, pending] = useActionState(createJobAlert, JOB_ALERT_INITIAL);

  return (
    <form action={formAction} className="w-full">
      <label htmlFor="alert-email" className="mb-2 block text-[17px] text-[var(--color-slate)]">
        Email address
      </label>

      <div
        className={`${FIELD} flex min-h-[62px] w-full items-center border-[2px] border-[var(--color-rule)] bg-[var(--color-canvas)] px-[18px] focus-within:border-[var(--color-signal)]`}
      >
        <input
          id="alert-email"
          name="email"
          type="email"
          required
          maxLength={MAX_EMAIL_LENGTH}
          autoComplete="email"
          placeholder="you@example.com"
          aria-describedby={state.status === 'idle' ? undefined : 'alert-status'}
          aria-invalid={state.status === 'error'}
          className="w-full border-0 bg-transparent text-[clamp(18px,2vw,26px)] leading-none tracking-[-0.02em] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-meta)]"
        />
      </div>

      {/* Honeypot: off-screen and skipped by tab order, so only a bot filling
          every field will touch it. Not `hidden`, which bots learn to skip. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <input type="text" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="mt-4 text-[17px] text-[var(--color-slate)]">
        Alerting on:{' '}
        <span className="font-semibold text-[var(--color-ink)]">All healthcare roles · {region}</span>
      </div>

      <button
        type="submit"
        disabled={pending}
        className={`${PILL_PRIMARY} mt-6 w-full rounded-full text-[clamp(20px,2vw,26px)] font-semibold disabled:opacity-60`}
      >
        {pending ? 'Creating alert…' : 'Create alert'}
      </button>

      {/* aria-live so the reply is announced: it replaces no visible content
          and the button keeps its own label, so a screen reader would
          otherwise never learn the submission landed. */}
      <p
        id="alert-status"
        role="status"
        aria-live="polite"
        className={`mt-3 min-h-[24px] text-[15px] ${
          state.status === 'error' ? 'text-[#b3261e]' : 'text-[var(--color-slate)]'
        }`}
      >
        {state.status === 'idle' ? '' : state.message}
      </p>
    </form>
  );
}
