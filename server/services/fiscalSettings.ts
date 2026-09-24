import { AppSetting } from '../models/sql/AppSetting.model.js';
import { configurarTasaDeProcesamiento, getProcessingFeeRate } from '../../shared/pricing/processingCost.js';
import {
  configurarAlicuotasIIBB,
  alicuotaRetencionIIBB,
  alicuotaIIBBPropia,
} from '../../shared/pricing/margen.js';

/**
 * Los números fiscales y de pasarela, editables desde el panel.
 *
 * Por qué no viven solo en el .env: los define el contador o los lee alguien
 * del panel de Mercado Pago, y ninguno de los dos tiene (ni debería tener)
 * acceso al servidor. Un número que para cambiarlo hay que pedirle a otra
 * persona que entre por SSH y reinicie es un número que se queda viejo, y
 * estos desactualizados no dan un error: dan una cuenta mal hecha que nadie
 * ve hasta que no cierra el mes.
 *
 * El orden de precedencia es panel → entorno → peor caso conocido. El panel
 * gana porque es el único de los tres que alguien miró hoy; el peor caso
 * queda de piso para que un valor faltante nunca cobre de menos.
 *
 * Las cuentas de dinero son síncronas (se llaman en medio de un cálculo de
 * precio), así que esto no se consulta a la base en cada operación: se carga
 * al arrancar y se refresca cuando el panel lo cambia.
 */

export const FISCAL_SETTING_KEY = 'platform:fiscal';

export interface AjustesFiscales {
  /** Tasa de procesamiento que se le cobra al cliente, sin IVA. */
  tasaProcesamiento: number | null;
  /** Retención de IIBB que aplica MP sobre cada acreditación. */
  iibbRetencion: number | null;
  /** Alícuota propia de IIBB sobre el ingreso de DOAPP. */
  iibbPropia: number | null;
  /** Quién y cuándo, para el expediente. */
  actualizadoPor?: string | null;
  actualizadoEn?: string | null;
}

/** Lo que está rigiendo AHORA, venga de donde venga. Es lo que hay que mostrar. */
export interface AjustesVigentes extends AjustesFiscales {
  vigente: {
    tasaProcesamiento: number;
    iibbRetencion: number;
    iibbPropia: number;
  };
  /** De dónde sale cada uno: para que el panel pueda decir "esto viene del .env". */
  origen: {
    tasaProcesamiento: 'panel' | 'entorno' | 'defecto';
    iibbRetencion: 'panel' | 'entorno' | 'defecto';
    iibbPropia: 'panel' | 'entorno' | 'defecto';
  };
}

const VACIO: AjustesFiscales = {
  tasaProcesamiento: null,
  iibbRetencion: null,
  iibbPropia: null,
};

let enMemoria: AjustesFiscales = { ...VACIO };

function aplicar(a: AjustesFiscales): void {
  configurarTasaDeProcesamiento(a.tasaProcesamiento);
  configurarAlicuotasIIBB({ retencion: a.iibbRetencion, propia: a.iibbPropia });
  enMemoria = { ...a };
}

function origenDe(
  delPanel: number | null,
  varEntorno: string,
): 'panel' | 'entorno' | 'defecto' {
  if (delPanel !== null && delPanel !== undefined) return 'panel';
  const raw = process.env?.[varEntorno];
  return raw !== undefined && raw !== '' ? 'entorno' : 'defecto';
}

/**
 * Carga los ajustes guardados y los aplica. Se llama una vez al arrancar.
 *
 * Si la tabla no existe todavía (deploy nuevo, antes de las migraciones) no
 * rompe el arranque: se queda con el entorno, que es exactamente lo que había
 * antes de que esto existiera.
 */
export async function cargarAjustesFiscales(): Promise<AjustesFiscales> {
  try {
    const row = await AppSetting.findByPk(FISCAL_SETTING_KEY);
    const v = (row?.value || {}) as Partial<AjustesFiscales>;
    const a: AjustesFiscales = {
      tasaProcesamiento: numeroOpcional(v.tasaProcesamiento),
      iibbRetencion: numeroOpcional(v.iibbRetencion),
      iibbPropia: numeroOpcional(v.iibbPropia),
      actualizadoPor: v.actualizadoPor ?? null,
      actualizadoEn: v.actualizadoEn ?? null,
    };
    aplicar(a);
    return a;
  } catch {
    aplicar({ ...VACIO });
    return { ...VACIO };
  }
}

function numeroOpcional(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Lo guardado más lo que efectivamente rige, para el panel. */
export function ajustesVigentes(): AjustesVigentes {
  return {
    ...enMemoria,
    vigente: {
      tasaProcesamiento: getProcessingFeeRate(),
      iibbRetencion: alicuotaRetencionIIBB(),
      iibbPropia: alicuotaIIBBPropia(),
    },
    origen: {
      tasaProcesamiento: origenDe(enMemoria.tasaProcesamiento, 'PAYMENT_PROCESSING_FEE_RATE'),
      iibbRetencion: origenDe(enMemoria.iibbRetencion, 'IIBB_RETENCION_ALICUOTA'),
      iibbPropia: origenDe(enMemoria.iibbPropia, 'IIBB_ALICUOTA_PROPIA'),
    },
  };
}

export class AjusteInvalido extends Error {}

/**
 * Valida y guarda. `null` en un campo significa "volver a usar el entorno",
 * que es la forma de deshacer sin tener que saber cuál era el valor anterior.
 *
 * Los rangos son los mismos que validan las funciones de cálculo, repetidos
 * acá a propósito: es mejor rechazar el número cuando alguien lo escribe, con
 * un mensaje que explique qué esperaba, que dejarlo entrar y que falle una
 * operación de un usuario tres horas después.
 */
export async function guardarAjustesFiscales(
  entrada: Partial<Pick<AjustesFiscales, 'tasaProcesamiento' | 'iibbRetencion' | 'iibbPropia'>>,
  actualizadoPor: string,
): Promise<AjustesVigentes> {
  const validar = (v: unknown, nombre: string, max: number): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n >= max) {
      throw new AjusteInvalido(
        `${nombre} tiene que ser una fracción entre 0 y ${max} (por ejemplo 0.0419 para 4,19%). Llegó: ${v}`,
      );
    }
    return n;
  };

  const a: AjustesFiscales = {
    tasaProcesamiento: validar(entrada.tasaProcesamiento, 'La tasa de procesamiento', 0.5),
    iibbRetencion: validar(entrada.iibbRetencion, 'La retención de IIBB', 0.2),
    iibbPropia: validar(entrada.iibbPropia, 'La alícuota propia de IIBB', 0.2),
    actualizadoPor,
    actualizadoEn: new Date().toISOString(),
  };

  await AppSetting.upsert({
    key: FISCAL_SETTING_KEY,
    value: a,
    updatedBy: actualizadoPor,
  } as any);

  aplicar(a);
  return ajustesVigentes();
}
