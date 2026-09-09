import { describe, it, expect } from 'vitest';
import { sanitizeDescription } from '@/lib/normalize/sanitize';

describe('sanitizeDescription', () => {
  it('removes script tags and their contents', () => {
    const out = sanitizeDescription('<p>Hi</p><script>alert(1)</script>');
    expect(out).toContain('<p>Hi</p>');
    expect(out).not.toContain('alert');
    expect(out).not.toContain('script');
  });

  it('strips event handler attributes', () => {
    const out = sanitizeDescription('<p onerror="steal()">Text</p>');
    expect(out).not.toContain('onerror');
    expect(out).toContain('Text');
  });

  it('discards anchors entirely, including javascript: hrefs', () => {
    const out = sanitizeDescription('<a href="javascript:alert(1)">Click</a>');
    expect(out).not.toContain('href');
    expect(out).not.toContain('javascript');
  });

  it('discards iframes and style tags', () => {
    const out = sanitizeDescription('<iframe src="https://evil.test"></iframe><style>body{}</style>');
    expect(out).not.toContain('iframe');
    expect(out).not.toContain('evil.test');
  });

  it('keeps the allowed formatting tags', () => {
    const out = sanitizeDescription('<h3>Role</h3><ul><li><strong>Shift</strong></li></ul>');
    expect(out).toBe('<h3>Role</h3><ul><li><strong>Shift</strong></li></ul>');
  });

  it('converts double-encoded newlines into line breaks', () => {
    const out = sanitizeDescription('Union: OPSEU&amp;#xa;Hours: Days');
    expect(out).toContain('<br />');
    expect(out).not.toContain('#xa;');
  });
});
