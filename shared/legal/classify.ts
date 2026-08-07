/**
 * Shared key classifier for the legal documents.
 *
 * The web pages render bespoke JSX and do not need this. Mobile does: it has no
 * i18n runtime and, since the copy moved to shared/legal, no hand-written text
 * either — it walks each document's key list and renders by kind.
 *
 * The convention across all four documents is consistent enough to classify by
 * name: `*Title` heads a section, `*liN` / list-ish suffixes are bullets, a few
 * named keys are callouts, everything else is a paragraph.
 */

export type LegalBlockKind = 'title' | 'paragraph' | 'listItem' | 'note' | 'chrome';

/** Page furniture — never part of the document body. */
const CHROME = new Set([
  'metaTitle', 'metaDescription', 'back', 'home', 'title', 'lastUpdated',
  'linkTerms', 'linkPrivacy', 'linkCookies', 'linkDisputes',
]);

/** Callouts: rendered as a highlighted box rather than plain prose. */
const NOTE_SUFFIXES = ['note', 'warning', 'tip', 'commitment', 'remember'];

export function classifyLegalKey(key: string): LegalBlockKind {
  if (CHROME.has(key)) return 'chrome';
  if (/Title$/.test(key)) return 'title';

  const lower = key.toLowerCase();
  if (NOTE_SUFFIXES.some((s) => lower.endsWith(s))) return 'note';

  // Bullets: sNliM, sN_MliK, stepNliM, plus the per-document short prefixes
  // (s2c1/s2w1 = clientes/trabajadores, accN/invN = válido/no válido, s8cN/s8wN).
  if (/li\d+$/.test(key)) return 'listItem';
  if (/^s\d+[cw]\d+$/.test(key)) return 'listItem';
  if (/^(acc|inv)\d+$/.test(key)) return 'listItem';

  return 'paragraph';
}

export interface LegalBlock {
  key: string;
  kind: Exclude<LegalBlockKind, 'chrome'>;
}

/** Drop the chrome and tag the rest, preserving document order. */
export function buildLegalBody(keys: string[]): LegalBlock[] {
  return keys
    .map((key) => ({ key, kind: classifyLegalKey(key) }))
    .filter((b): b is LegalBlock => b.kind !== 'chrome');
}
