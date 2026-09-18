'use client';

import { useActionState, useState } from 'react';
import { createJobAlert } from '@/app/actions/job-alerts';
import { describeAlertCriteria } from '@/lib/alerts/describe';
import { JOB_ALERT_INITIAL, MAX_EMAIL_LENGTH } from '@/lib/schemas/job-alert';
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/taxonomy/categories';
import { FIELD, PILL_PRIMARY } from '@/lib/ui/styles';

/** The homepage alert signup. A real <form action={...}> rather than an
 *  onSubmit handler, so it still posts if hydration has not finished (or never
 *  runs); useActionState only adds the pending state and the reply.
 *
 *  type="email" + required give the browser's own validation for free, and the
 *  action re-checks server-side regardless — it is reachable by direct POST. */
export function JobAlertForm({ region, cities }: { region: string; cities: string[] }) {
  const [state, formAction, pending] = useActionState(createJobAlert, JOB_ALERT_INITIAL);

  // Drives the "Alerting on:" preview only — city/category still travel to
  // the server as plain <select> values in the form post, validated there
  // regardless of what this state says. Reset to "no preference" after a
  // successful submission so the preview doesn't keep describing a criteria
  // set the visible form (browser-reset on submit) no longer reflects.
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');

  return (
    <form
      action={formAction}
      onSubmit={() => {
        setCity('');
        setCategory('');
      }}
      className="w-full"
    >
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

      <div className="mt-3 flex flex-wrap gap-2.5">
        <label htmlFor="alert-category" className="sr-only">Discipline</label>
        <select
          id="alert-category"
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={`${FIELD} min-h-[46px] flex-1 basis-[160px] py-[9px]`}
        >
          <option value="">All disciplines</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>

        <label htmlFor="alert-city" className="sr-only">City</label>
        <select
          id="alert-city"
          name="city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className={`${FIELD} min-h-[46px] flex-1 basis-[160px] py-[9px]`}
        >
          <option value="">All of {region}</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Honeypot: off-screen and skipped by tab order, so only a bot filling
          every field will touch it. Not `hidden`, which bots learn to skip. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <input type="text" name="company" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="mt-4 text-[17px] text-[var(--color-slate)]">
        Alerting on:{' '}
        <span className="font-semibold text-[var(--color-ink)]">
          {describeAlertCriteria(city || null, category || null)}
        </span>
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
