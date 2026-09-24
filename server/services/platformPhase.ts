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

/**
 * Fecha de cierre de la beta por defecto: fin del 31/12/2026 (Argentina).
 *
 * Es el valor de fábrica. Se puede mover desde el panel (queda auditado y
 * pide la contraseña de acción), porque una fecha que para correrla hay que
 * recompilar es una fecha que se termina incumpliendo. Lo que NO se puede es
 * dejarla sin definir: la beta siempre tiene un día de cierre publicado.
 */
export const BETA_ENDS_AT_DEFECTO = new Date('2026-12-31T23:59:59-03:00');

/** Compatibilidad: lo que la fecha vale hoy, ya con lo configurado aplicado. */
export let BETA_ENDS_AT = BETA_ENDS_AT_DEFECTO;

/**
 * Cuándo arranca la fase estable. Por defecto, el instante en que termina la
 * beta. Se puede separar para dejar un período de gracia entre "la beta
 * terminó" y "empieza a cobrarse comisión", que es útil para avisar sin que
 * el cambio de precio caiga el mismo día del anuncio. Durante ese hueco la
 * comisión sigue en 0.
 */
let liveStartsAt: Date = BETA_ENDS_AT_DEFECTO;

/** In-process cache: this is read on every commission calculation. */
let cached: { phase: PlatformPhase; at: number } | null = null;
const CACHE_MS = 30_000;

/** Aplica las fechas configuradas. Lo llama el arranque y el panel al guardar. */
export function configurarFechasDeFase(v: { betaEndsAt?: string | Date | null; liveStartsAt?: string | Date | null }): void {
  const fin = fechaValida(v.betaEndsAt) ?? BETA_ENDS_AT_DEFECTO;
  BETA_ENDS_AT = fin;
  // El inicio de la fase estable nunca puede ser anterior al fin de la beta:
  // seria cobrar comision mientras se sigue anunciando que no se cobra.
  const inicio = fechaValida(v.liveStartsAt);
  liveStartsAt = inicio && inicio.getTime() > fin.getTime() ? inicio : fin;
  cached = null;
}

function fechaValida(v: unknown): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

export function fechasDeFase() {
  return { betaEndsAt: BETA_ENDS_AT, liveStartsAt };
}

/**
 * Current phase.
 *
 * The stored value can only ever *hold back* the switch to live: once the live
 * start date passes, the phase is live regardless of what the row says. That
 * way a forgotten setting cannot keep the platform giving away commission
 * forever, and the deadline we publish to users is the one the code honours.
 */
export async function getPlatformPhase(): Promise<PlatformPhase> {
  if (Date.now() > liveStartsAt.getTime()) return 'live';

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

/** Carga las fechas guardadas y las aplica. Se llama al arrancar. */
export async function cargarFechasDeFase(): Promise<void> {
  try {
    const row = await AppSetting.findByPk(PHASE_SETTING_KEY);
    configurarFechasDeFase({
      betaEndsAt: row?.value?.betaEndsAt ?? null,
      liveStartsAt: row?.value?.liveStartsAt ?? null,
    });
  } catch {
    configurarFechasDeFase({});
  }
}

/**
 * Guarda las fechas. El llamador autoriza y audita.
 *
 * Mover el cierre hacia atrás (adelantarlo) es tan delicado como moverlo hacia
 * adelante: adelantarlo hace que empiece a cobrarse comisión antes de lo que
 * se le dijo a la gente. Por eso las dos direcciones pasan por el mismo
 * control que el cambio de fase.
 */
export async function setFechasDeFase(
  v: { betaEndsAt?: string | null; liveStartsAt?: string | null },
  updatedBy?: string,
): Promise<{ betaEndsAt: Date; liveStartsAt: Date }> {
  const fin = fechaValida(v.betaEndsAt);
  if (v.betaEndsAt && !fin) throw new Error('La fecha de fin de la beta no es válida');
  const inicio = fechaValida(v.liveStartsAt);
  if (v.liveStartsAt && !inicio) throw new Error('La fecha de inicio de la fase estable no es válida');
  if (fin && inicio && inicio.getTime() < fin.getTime()) {
    throw new Error('La fase estable no puede empezar antes de que termine la beta');
  }

  const row = await AppSetting.findByPk(PHASE_SETTING_KEY);
  const actual = row?.value || {};
  await AppSetting.upsert({
    key: PHASE_SETTING_KEY,
    value: {
      ...actual,
      betaEndsAt: fin ? fin.toISOString() : null,
      liveStartsAt: inicio ? inicio.toISOString() : null,
      fechasCambiadasEn: new Date().toISOString(),
    },
    updatedBy,
  } as any);

  configurarFechasDeFase({ betaEndsAt: fin, liveStartsAt: inicio });
  return fechasDeFase();
}

/**
 * Si se pueden contratar membresias.
 *
 * Durante la beta no. Nadie compraria un plan cuyo unico beneficio es bajar una
 * comision que hoy es 0%, y ofrecerlo igual seria vender algo que no sirve. Se
 * activan solas al pasar a la fase estable, que es cuando la comision empieza a
 * existir y el descuento pasa a valer algo.
 *
 * Es una funcion y no una constante justamente para que nadie tenga que
 * acordarse de encenderlas el dia del cambio de fase.
 */
export async function areMembershipsAvailable(): Promise<boolean> {
  return !(await isBetaPhase());
}

export async function isBetaPhase(): Promise<boolean> {
  return (await getPlatformPhase()) === 'beta';
}

/** Change the phase. Callers are responsible for authorising and auditing. */
export async function setPlatformPhase(phase: PlatformPhase, updatedBy?: string): Promise<void> {
  // Se conserva lo que ya haya en la fila (las fechas): un upsert que pisa el
  // value entero borraba las fechas configuradas cada vez que se cambiaba de
  // fase, y la beta volvía a la fecha de fábrica sin que nadie lo pidiera.
  let actual: any = {};
  try {
    const row = await AppSetting.findByPk(PHASE_SETTING_KEY);
    actual = row?.value || {};
  } catch { /* fila nueva */ }

  await AppSetting.upsert({
    key: PHASE_SETTING_KEY,
    value: { ...actual, phase, changedAt: new Date().toISOString() },
    updatedBy,
  } as any);
  cached = { phase, at: Date.now() };
}

/** Everything the clients need to render the phase, in one shape. */
export async function getPhaseInfo() {
  const phase = await getPlatformPhase();
  const endsAt = BETA_ENDS_AT.toISOString();
  const liveAt = liveStartsAt.toISOString();

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
    liveStartsAt: liveAt,
    /** Si las fechas se movieron desde el panel o son las de fábrica. */
    fechasPorDefecto: BETA_ENDS_AT.getTime() === BETA_ENDS_AT_DEFECTO.getTime() && liveAt === endsAt,
    betaDaysLeft: phase === 'beta' ? daysLeft : 0,
    phaseChangedAt: changedAt,
  };
}

/** Test seam. */
export function __resetPhaseCache() {
  cached = null;
}

/**
 * The membership tier a user effectively has right now.
 *
 * During the beta everyone gets SUPER PRO, so feature gates should ask this
 * rather than reading `user.membershipTier` directly.
 *
 * Deliberately NOT applied everywhere: billing (membershipService, the monthly
 * counter reset, subscription checkout) and the admin views must keep seeing
 * the stored tier. If billing believed everyone were SUPER PRO, subscriptions
 * would silently stop being charged the day the beta ends — the tier a person
 * pays for and the tier they currently enjoy are two different facts.
 */
export async function getEffectiveTier(
  storedTier: string | null | undefined,
  adminRole?: string | null,
): Promise<'free' | 'pro' | 'super_pro'> {
  // The owner always has the full product. Not a perk: they need every screen
  // reachable to support and debug it, and a support call that ends in "I
  // cannot see that panel either" is not support.
  if (adminRole === 'owner') return 'super_pro';
  if (await isBetaPhase()) return 'super_pro';
  const t = storedTier || 'free';
  return t === 'pro' || t === 'super_pro' ? t : 'free';
}
