'use client';

import { useState } from 'react';
import Link from 'next/link';
import { resolveNearestCity } from '@/app/actions/near-me';
import { buildJobsQuery } from '@/lib/jobs/query-string';
import { PILL_OUTLINE } from '@/lib/ui/styles';

type Status = 'idle' | 'locating' | 'error';

/**
 * "Near me": resolves the visitor's browser location to the nearest active
 * job city and navigates to it. Every failure path — unsupported browser,
 * denied permission, a geocoding failure, or no matching city — converges
 * on the same inline fallback message; none of those distinctions are
 * actionable for the visitor, so there's no branching copy for them.
 */
export function NearMeButton({ className = PILL_OUTLINE }: { className?: string }) {
  const [status, setStatus] = useState<Status>('idle');

  function handleClick() {
    if (!('geolocation' in navigator)) {
      setStatus('error');
      return;
    }

    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const city = await resolveNearestCity(position.coords.latitude, position.coords.longitude);
        if (city) {
          window.location.href = buildJobsQuery({ city: [city] });
        } else {
          setStatus('error');
        }
      },
      () => setStatus('error'),
      { timeout: 8000 },
    );
  }

  return (
    <div className="flex flex-shrink-0 flex-col items-start gap-1.5">
      <button type="button" onClick={handleClick} disabled={status === 'locating'} className={className}>
        {status === 'locating' ? 'Locating…' : 'Near me'}
      </button>
      {status === 'error' && (
        <p className="text-[13px] text-[var(--color-slate)]">
          Couldn&apos;t find jobs near you — <Link href="/jobs" className="underline">browse all listings</Link>.
        </p>
      )}
    </div>
  );
}
