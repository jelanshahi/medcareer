import sanitizeHtml from 'sanitize-html';

/** Exactly the allow-list from the spec. Do not widen without a spec change. */
const ALLOWED_TAGS = ['p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'h3', 'h4'];

export function sanitizeDescription(dirty: string): string {
  const withBreaks = dirty
    .replace(/&amp;#xa;/gi, '<br />')
    .replace(/&#xa;/gi, '<br />');

  return sanitizeHtml(withBreaks, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });
}
