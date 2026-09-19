'use client';

import { useState } from 'react';
import { PROVINCE_NAMES } from '@/lib/provinces';
import type { ProvinceCode } from '@/lib/types';

type Props = {
  /** Province -> its cities, from lib/provinces.ts groupCitiesByProvince.
   *  Only provinces with an active job appear as keys. */
  citiesByProvince: Partial<Record<ProvinceCode, string[]>>;
  /** `name` submitted with the city <select> in the surrounding form. The
   *  province <select> carries no `name` at all — it exists only to narrow
   *  the city list below it and is never itself part of the query string or
   *  form payload, matching how "city" already worked before this
   *  component existed. */
  cityName: string;
  /** Prefix for this instance's own `id`s, kept separate from `cityName`:
   *  every caller submits the same "city" name to its own form, but the
   *  homepage renders two instances on one page at once (the hero search and
   *  the alert signup form below it) — deriving ids from `cityName` alone
   *  gave both of them `id="city"` and `id="city-province"`, which is
   *  invalid HTML and broke their own <label for> association along with
   *  anything that queries by id. Defaults to `cityName` for a page that
   *  only ever renders one instance. */
  idPrefix?: string;
  /** Shown as the city select's own top option when no province is chosen —
   *  "All of Ontario", "All of Canada". Once a province IS chosen, that
   *  option becomes "All of <that province>" instead, computed here. */
  allCityLabel: string;
  /** Preselects both selects — e.g. /jobs?city=Toronto reopening with
   *  Ontario already picked, not "All provinces" hiding its own filter. */
  defaultCity?: string;
  /** Told the city value on every change, including the reset that happens
   *  when switching provinces. Selects here are uncontrolled from the
   *  caller's point of view (this component owns its own state); this is
   *  the escape hatch for a caller that needs the value for something else
   *  entirely, such as JobAlertForm's live "Alerting on:" preview. */
  onCityChange?: (city: string) => void;
  selectClassName?: string;
};

/** Two cascading <select>s: province narrows which cities the second one
 *  offers. A one-line change is not enough to add a third <select> to an
 *  existing 2- or 3-control search bar without it feeling bolted on, so this
 *  is its own component, shared by the homepage hero search, the /jobs page
 *  filters, and the alert signup form — all three had the same flat,
 *  every-province-at-once city list before this existed.
 *
 * Progressive enhancement: this is a client component (state has to update
 * instantly, not via a page reload), but the initial server-rendered HTML
 * already reflects `defaultCity` correctly before any hydration — a browser
 * with JavaScript disabled simply cannot narrow the list afterward and sees
 * every city under "All provinces", which is exactly the flat list this
 * replaces. It never regresses below that; there is nothing new to break. */
export function ProvinceCitySelect({
  citiesByProvince,
  cityName,
  idPrefix = cityName,
  allCityLabel,
  defaultCity = '',
  onCityChange,
  selectClassName,
}: Props) {
  const provinces = (Object.keys(citiesByProvince) as ProvinceCode[]).sort((a, b) =>
    PROVINCE_NAMES[a].localeCompare(PROVINCE_NAMES[b]),
  );

  // A preselected city (the /jobs page reopening an existing filter) should
  // open with its own province already chosen, not "All provinces" — that
  // would still list the city, but hide the fact that it belongs anywhere.
  const initialProvince =
    (defaultCity && provinces.find((p) => citiesByProvince[p]?.includes(defaultCity))) || '';

  const [province, setProvince] = useState<ProvinceCode | ''>(initialProvince);
  const [city, setCity] = useState(defaultCity);

  const citiesForProvince = province
    ? citiesByProvince[province] ?? []
    : [...new Set(Object.values(citiesByProvince).flat())].sort();

  const cityLabel = province ? `All of ${PROVINCE_NAMES[province]}` : allCityLabel;

  return (
    <>
      <label className="sr-only" htmlFor={`${idPrefix}-province`}>Province</label>
      <select
        id={`${idPrefix}-province`}
        value={province}
        onChange={(e) => {
          const next = e.target.value as ProvinceCode | '';
          setProvince(next);
          setCity('');
          onCityChange?.('');
        }}
        className={selectClassName}
      >
        <option value="">All provinces</option>
        {provinces.map((p) => (
          <option key={p} value={p}>{PROVINCE_NAMES[p]}</option>
        ))}
      </select>

      <label className="sr-only" htmlFor={idPrefix}>City</label>
      <select
        id={idPrefix}
        name={cityName}
        value={city}
        onChange={(e) => {
          setCity(e.target.value);
          onCityChange?.(e.target.value);
        }}
        className={selectClassName}
      >
        <option value="">{cityLabel}</option>
        {citiesForProvince.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </>
  );
}
