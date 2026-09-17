/**
 * Document structure for the Terms & Conditions.
 *
 * The web page renders bespoke JSX (tables, styled callouts) and does not need
 * this. Mobile does: it has no i18n runtime and no hand-written copy any more,
 * so it walks this list and renders each entry by kind. Keeping the order here
 * — rather than relying on object key insertion order — means adding a clause
 * is one edit in terms.es.ts plus one line here, and mobile picks it up.
 *
 * Keys not listed are page chrome (title, back, meta…) and are not body copy.
 */

import { COMMISSION_RATES } from '../constants/membershipPricing.js';

export type TermsBlockKind = 'title' | 'paragraph' | 'listItem' | 'note';

export interface TermsBlock {
  key: string;
  kind: TermsBlockKind;
}

/** Classify by the naming convention: sNTitle / sNpM / sNliM / sNnote. */
export function classifyTermsKey(key: string): TermsBlockKind {
  if (/Title$/.test(key)) return 'title';
  if (/note$/.test(key)) return 'note';
  if (/li\d+$/.test(key)) return 'listItem';
  return 'paragraph';
}

/** Body of the document, in reading order. */
export const TERMS_BODY_KEYS: string[] = [
  'intro1', 'intro2',
  's1Title', 's1p',
  's2Title', 's2p', 's2li1', 's2li2', 's2note',
  's3Title', 's3p1', 's3p2', 's3p3',
  's4Title', 's4p1', 's4p2', 's4p3', 's4p4', 's4p5',
  's5Title', 's5p', 's5li1', 's5li2', 's5li3', 's5li4', 's5li5', 's5li6', 's5note',
  's6Title', 's6p1', 's6p2', 's6p3', 's6p4', 's6p5', 's6p6',
  's7Title', 's7p1', 's7p2', 's7p3', 's7p4', 's7p5', 's7p6', 's7p7', 's7p8', 's7p9', 's7p10',
  's8Title', 's8p1', 's8p2', 's8p3',
  's9Title', 's9p1', 's9p2', 's9p3', 's9p4',
  's10Title', 's10p1', 's10p2', 's10p3', 's10p4', 's10p5', 's10p6', 's10p7', 's10p8', 's10p9', 's10p10',
  's11Title', 's11p1', 's11li1', 's11li2', 's11p2', 's11p3',
  's12Title', 's12p1', 's12p2',
  's13Title', 's13p1', 's13p2', 's13p3',
  's14Title', 's14p',
  's15Title', 's15p',
  's16Title', 's16p',
  's17Title', 's17p',
  's18Title', 's18p', 'importantNote',
];

export const TERMS_BODY: TermsBlock[] = TERMS_BODY_KEYS.map((key) => ({
  key,
  kind: classifyTermsKey(key),
}));

/**
 * Commission table of clause 7.3.
 *
 * Derived from COMMISSION_RATES, not written here: the table used to say
 * 8% / 3% / 1% while the code charged 10% to everyone, and a SUPER PRO plan
 * that no longer exists. Whatever the pricing module says, the legal text says.
 *
 * `planKey` resolves through the copy module; `plan` is a literal (FREE is not
 * translated). Rendered right after 's7p3', which introduces the table.
 */
export const TERMS_COMMISSION_AFTER = 's7p3';

export const TERMS_COMMISSION_HEADERS = ['thPlan', 'thCommission'] as const;

export const TERMS_COMMISSION_ROWS: Array<{ plan?: string; planKey?: string; commission: string }> = [
  { plan: 'FREE', commission: `${COMMISSION_RATES.free}%` },
  { planKey: 'planProMonth', commission: `${COMMISSION_RATES.pro}%` },
];
