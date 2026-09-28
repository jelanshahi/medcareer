import { ImageResponse } from 'next/og';
import { SITE } from '@/lib/site';

// Default social card for every route that does not ship its own. Deliberately
// static (no DB read) so a slow query can never make a link preview fail.
export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#0F5C4A',
          color: '#ffffff',
          fontFamily: 'Helvetica, Arial, sans-serif',
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: '-0.02em' }}>{SITE.name}</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.03em' }}>
            Healthcare jobs across Canada
          </div>
          <div style={{ marginTop: 24, fontSize: 32, opacity: 0.85 }}>
            Nursing, PSW, allied health and more — straight from hospital career sites.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
