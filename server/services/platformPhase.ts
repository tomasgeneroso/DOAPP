import { AppSetting } from '../models/sql/AppSetting.model.js';

/**
 * Beta vs live phase.
 *
 * During the beta the platform charges no commission at all: a $36.000 contract
 * costs the client $36.000 and the worker receives $36.000. Publishing a job is
 * still paid normally — the launch offer is about commission, not about the
 * whole product being free. Everyone also gets SUPER PRO features, because a
 * paid tier whose selling point is a lower commission is worthless while the
 * commission is zero.
 *
 * The beta has a hard end date. Without one, "temporary" pricing becomes the
 * price people believe they signed up for, and every later change reads as a
 * broken promise. Announcing the date up front makes the eventual switch a
 * scheduled event rather than a surprise.
 */

export type PlatformPhase = 'beta' | 'live';

export const PHASE_SETTING_KEY = 'platform:phase';

/** Beta ends at the close of 31 December 2026 (Argentina, UTC-3). */
export const BETA_ENDS_AT = new Date('2026-12-31T23:59:59-03:00');

/** In-process cache: this is read on every commission calculation. */
let cached: { phase: PlatformPhase; at: number } | null = null;
const CACHE_MS = 30_000;

/**
 * Current phase.
 *
 * The stored value can only ever *hold back* the switch to live: once the beta
 * end date passes, the phase is live regardless of what the row says. That way
 * a forgotten setting cannot keep the platform giving away commission forever,
 * and the deadline we publish to users is the one the code actually honours.
 */
export async function getPlatformPhase(): Promise<PlatformPhase> {
  if (Date.now() > BETA_ENDS_AT.getTime()) return 'live';

  if (cached && Date.now() - cached.at < CACHE_MS) return cached.phase;

  try {
    const row = await AppSetting.findByPk(PHASE_SETTING_KEY);
    const phase: PlatformPhase = row?.value?.phase === 'live' ? 'live' : 'beta';
    cached = { phase, at: Date.now() };
    return phase;
  } catch {
    // No row yet, or the table is missing on a fresh deploy: default to beta.
    // Erring toward charging nothing is the recoverable mistake; erring toward
    // charging a commission nobody agreed to is not.
    return 'beta';
  }
}

export async function isBetaPhase(): Promise<boolean> {
  return (await getPlatformPhase()) === 'beta';
}

/** Change the phase. Callers are responsible for authorising and auditing. */
export async function setPlatformPhase(phase: PlatformPhase, updatedBy?: string): Promise<void> {
  await AppSetting.upsert({
    key: PHASE_SETTING_KEY,
    value: { phase, changedAt: new Date().toISOString() },
    updatedBy,
  } as any);
  cached = { phase, at: Date.now() };
}

/** Everything the clients need to render the phase, in one shape. */
export async function getPhaseInfo() {
  const phase = await getPlatformPhase();
  const endsAt = BETA_ENDS_AT.toISOString();

  // When the switch was actually thrown. The owner can go live before the
  // deadline, so "the beta ended" and "BETA_ENDS_AT" are not the same date, and
  // the launch announcement has to key off the real one.
  let changedAt: string | null = null;
  try {
    const row = await AppSetting.findByPk(PHASE_SETTING_KEY);
    changedAt = row?.value?.changedAt ?? null;
  } catch { /* table not there yet */ }
  const daysLeft = Math.max(0, Math.ceil((BETA_ENDS_AT.getTime() - Date.now()) / 86_400_000));
  return {
    phase,
    isBeta: phase === 'beta',
    betaEndsAt: endsAt,
    betaDaysLeft: phase === 'beta' ? daysLeft : 0,
    phaseChangedAt: changedAt,
  };
}

/** Test seam. */
export function __resetPhaseCache() {
  cached = null;
}
