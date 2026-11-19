import { AppSetting } from '../models/sql/AppSetting.model.js';
import { datosBancarios, esCbuValido, type DatosBancarios } from './datosBancarios.js';

/**
 * Los datos a los que los clientes pagan por transferencia y por Binance, editables desde el panel (pedido del dueño, 2026-11-19: «agregar datos de Binance y transferencia
 * para pagar»). Antes salían SOLO del .env del servidor (BANK_CBU, BANK_ALIAS, BINANCE_ID…): sin esas variables la pantalla de pago no ofrecía ni la transferencia ni Binance,
 * y quien tiene que cargar la cuenta no necesariamente tiene acceso al servidor (misma razón por la que las tasas viven en `fiscalSettings`).
 *
 * Orden: panel → entorno. Cada campo del panel gana sobre el mismo campo del entorno; un campo vacío vuelve a usar el entorno. Se carga al arrancar y se refresca al guardar
 * (las consultas de pago son síncronas). Los valores de ejemplo («tu.alias», todo ceros) cuentan como «sin configurar»: a un cliente nunca se le muestra una cuenta de ejemplo.
 */
export const COBRO_SETTING_KEY = 'platform:cobro';

export interface DatosDeCobroGuardados {
  cbu: string | null;
  alias: string | null;
  titular: string | null;
  cuit: string | null;
  banco: string | null;
  binanceId: string | null;
  binanceNickname: string | null;
  actualizadoPor?: string | null;
  actualizadoEn?: string | null;
}

const VACIO: DatosDeCobroGuardados = { cbu: null, alias: null, titular: null, cuit: null, banco: null, binanceId: null, binanceNickname: null };
let enMemoria: DatosDeCobroGuardados = { ...VACIO };

const texto = (v: unknown): string | null => {
  const t = typeof v === 'string' ? v.trim() : '';
  return t ? t : null;
};

export async function cargarDatosDeCobro(): Promise<DatosDeCobroGuardados> {
  try {
    const row = await AppSetting.findByPk(COBRO_SETTING_KEY);
    const v = (row?.value || {}) as Partial<DatosDeCobroGuardados>;
    enMemoria = {
      cbu: texto(v.cbu), alias: texto(v.alias), titular: texto(v.titular), cuit: texto(v.cuit), banco: texto(v.banco),
      binanceId: texto(v.binanceId), binanceNickname: texto(v.binanceNickname),
      actualizadoPor: v.actualizadoPor ?? null, actualizadoEn: v.actualizadoEn ?? null,
    };
  } catch {
    enMemoria = { ...VACIO };
  }
  return enMemoria;
}

/** La cuenta para transferir que rige AHORA: lo del panel y, donde falte, lo del entorno. null si no hay CBU ni alias reales. */
export function datosBancariosVigentes(): DatosBancarios | null {
  const entorno = datosBancarios() || {};
  const cbuPanel = enMemoria.cbu?.replace(/\s+/g, '');
  const cbu = cbuPanel && esCbuValido(cbuPanel) ? cbuPanel : entorno.cbu;
  const alias = enMemoria.alias || entorno.alias;
  if (!cbu && !alias) return null;
  const accountHolder = enMemoria.titular || entorno.accountHolder;
  const cuit = enMemoria.cuit || entorno.cuit;
  const bank = enMemoria.banco || entorno.bank;
  return { ...(cbu && { cbu }), ...(alias && { alias }), ...(accountHolder && { accountHolder }), ...(cuit && { cuit }), ...(bank && { bank }) };
}

/** Los datos de Binance que rigen AHORA (panel → entorno). */
export function binanceVigente(env: Record<string, string | undefined> = process.env): { id: string | null; nickname: string | null } {
  const limpio = (v: string | undefined) => {
    const t = (v ?? '').trim();
    return !t || /^your-binance/i.test(t) ? null : t;
  };
  return { id: enMemoria.binanceId || limpio(env.BINANCE_ID), nickname: enMemoria.binanceNickname || limpio(env.BINANCE_NICKNAME) };
}

export class DatoDeCobroInvalido extends Error {}

/** Lo que se guarda y lo que rige hoy (para el panel). */
export function datosDeCobroParaElPanel() {
  return {
    guardado: enMemoria,
    vigente: { banco: datosBancariosVigentes(), binance: binanceVigente() },
  };
}

/**
 * Valida y guarda. Un campo vacío o `null` vuelve a usar el entorno. Un CBU se valida (22 dígitos); el alias, el CUIT y el ID de Binance se miran por forma: se prefiere
 * rechazar un dato mal escrito cuando se carga antes que mostrarle a un cliente una cuenta a la que no puede transferir.
 */
export async function guardarDatosDeCobro(entrada: Partial<Record<keyof DatosDeCobroGuardados, unknown>>, quien: string): Promise<DatosDeCobroGuardados> {
  const cbu = texto(entrada.cbu)?.replace(/\s+/g, '') ?? null;
  if (cbu && !esCbuValido(cbu)) throw new DatoDeCobroInvalido('El CBU o CVU tiene que tener 22 números.');
  const alias = texto(entrada.alias);
  if (alias && !/^[A-Za-z0-9.\-_]{6,30}$/.test(alias)) throw new DatoDeCobroInvalido('El alias tiene entre 6 y 30 caracteres: letras, números, puntos y guiones.');
  const cuit = texto(entrada.cuit);
  if (cuit && !/^\d{2}-?\d{8}-?\d$/.test(cuit)) throw new DatoDeCobroInvalido('El CUIT tiene que tener 11 números (por ejemplo 30-12345678-9).');
  const binanceId = texto(entrada.binanceId);
  if (binanceId && !/^\d{5,15}$/.test(binanceId)) throw new DatoDeCobroInvalido('El ID de Binance son solo números (entre 5 y 15).');
  const largo = (v: string | null, nombre: string) => {
    if (v && v.length > 80) throw new DatoDeCobroInvalido(`${nombre} es demasiado largo.`);
    return v;
  };
  const nuevo: DatosDeCobroGuardados = {
    cbu, alias, cuit,
    titular: largo(texto(entrada.titular), 'El titular'),
    banco: largo(texto(entrada.banco), 'El banco'),
    binanceId,
    binanceNickname: largo(texto(entrada.binanceNickname), 'El nombre de Binance'),
    actualizadoPor: quien,
    actualizadoEn: new Date().toISOString(),
  };
  await AppSetting.upsert({ key: COBRO_SETTING_KEY, value: nuevo } as any);
  enMemoria = nuevo;
  return nuevo;
}
