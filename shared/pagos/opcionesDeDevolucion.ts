import { IVA, getProcessingFeeRate } from '../pricing/processingCost';

/**
 * Las opciones de «Devolver dinero» de un pago (pedido del dueño, 2026-11-20): además del monto a mano, las devoluciones que se repiten en una cancelación, ya calculadas
 * desde las partes del pago, para que quien devuelve no tenga que restar de memoria.
 *
 *   cancelación a tiempo                  = total − procesamiento − IVA del procesamiento   (vuelven el precio y, si existe, la comisión con su IVA)
 *   cancelación con trabajador / tardía   = total − procesamiento − IVA del procesamiento − comisión − IVA de la comisión (vuelve el precio)
 *   total                                 = todo lo que queda por devolver
 *   personalizado                         = el monto que se escriba
 *
 * El procesamiento y su IVA no vuelven en una cancelación: la pasarela ya los cobró. En la beta no hay comisión y las dos primeras dan lo mismo.
 */
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface DesgloseDelPago {
  total: number;
  precio: number;
  comision: number;
  ivaComision: number;
  procesamiento: number;
  ivaProcesamiento: number;
  /** El pago no guardó el costo de procesamiento (es anterior): se calculó con la tasa vigente. */
  estimado: boolean;
}

export function desgloseDelPago(pago: { amount?: unknown; platformFee?: unknown; processingCharge?: unknown }): DesgloseDelPago {
  const total = r2(Math.max(0, Number(pago.amount) || 0));
  const comision = r2(Math.max(0, Number(pago.platformFee) || 0));
  const ivaComision = r2(comision * IVA);
  let procesamiento: number;
  let estimado = false;
  if (pago.processingCharge !== null && pago.processingCharge !== undefined && Number.isFinite(Number(pago.processingCharge))) {
    procesamiento = r2(Math.max(0, Number(pago.processingCharge)));
  } else {
    // total = base / (1 − tasa × (1 + IVA)): del total se despeja lo que se cobró de procesamiento (sin IVA).
    const tasa = getProcessingFeeRate();
    const base = total * (1 - tasa * (1 + IVA));
    procesamiento = tasa > 0 ? r2(Math.max(0, (total - base) / (1 + IVA))) : 0;
    estimado = true;
  }
  const ivaProcesamiento = r2(procesamiento * IVA);
  const precio = r2(Math.max(0, total - comision - ivaComision - procesamiento - ivaProcesamiento));
  return { total, precio, comision, ivaComision, procesamiento, ivaProcesamiento, estimado };
}

export type ClaveDeDevolucion = 'cancelacion_a_tiempo' | 'cancelacion_con_trabajador' | 'total' | 'personalizado';

export interface OpcionDeDevolucion {
  clave: ClaveDeDevolucion;
  titulo: string;
  detalle: string;
  /** Lo que se devuelve; null en «personalizado» (se escribe). */
  monto: number | null;
  /** Si se puede elegir ahora (hay algo por devolver y el monto entra en lo que queda). */
  disponible: boolean;
  /** Por qué no se puede, si no se puede. */
  motivoNoDisponible?: string;
  /** Cierra el pago con esta devolución: lo que queda se retiene a propósito (la pasarela y, si corresponde, la comisión). */
  cierraElPago: boolean;
}

export function opcionesDeDevolucion(d: DesgloseDelPago, quedaPorDevolver: number): OpcionDeDevolucion[] {
  const resto = r2(Math.max(0, quedaPorDevolver));
  const aTiempo = r2(Math.max(0, d.total - d.procesamiento - d.ivaProcesamiento));
  const conTrabajador = r2(Math.max(0, d.total - d.procesamiento - d.ivaProcesamiento - d.comision - d.ivaComision));
  const hayComision = d.comision > 0;

  const evaluar = (monto: number): { disponible: boolean; motivoNoDisponible?: string } => {
    if (!(monto > 0)) return { disponible: false, motivoNoDisponible: 'No queda nada para devolver con esta regla.' };
    if (monto > resto + 0.009) return { disponible: false, motivoNoDisponible: `Devolvería $${monto.toLocaleString('es-AR')} y solo quedan $${resto.toLocaleString('es-AR')} por devolver.` };
    return { disponible: true };
  };

  return [
    {
      clave: 'cancelacion_a_tiempo',
      titulo: 'Cancelación a tiempo',
      detalle: `Monto − procesamiento − IVA del procesamiento. Vuelve el precio${hayComision ? ' y la comisión con su IVA' : ' (no hay comisión: la beta no la cobra)'}; el procesamiento no vuelve, la pasarela ya lo cobró.`,
      monto: aTiempo,
      cierraElPago: true,
      ...evaluar(aTiempo),
    },
    {
      clave: 'cancelacion_con_trabajador',
      titulo: 'Cancelación con trabajador asignado o fuera de plazo',
      detalle: `Monto − procesamiento − IVA del procesamiento${hayComision ? ' − comisión − IVA de la comisión. Vuelve solo el precio del trabajo' : ' (no hay comisión que descontar: da lo mismo que la cancelación a tiempo)'}.`,
      monto: conTrabajador,
      cierraElPago: true,
      ...evaluar(conTrabajador),
    },
    {
      clave: 'total',
      titulo: 'Devolución total',
      detalle: 'Todo lo que queda por devolver, procesamiento incluido.',
      monto: resto,
      cierraElPago: false,
      ...evaluar(resto),
    },
    {
      clave: 'personalizado',
      titulo: 'Monto personalizado',
      detalle: 'Escribís cuánto devolver. Podés cerrar el pago con esa devolución o dejarlo abierto para devolver el resto después.',
      monto: null,
      cierraElPago: false,
      disponible: resto > 0,
      ...(resto > 0 ? {} : { motivoNoDisponible: 'No queda nada por devolver.' }),
    },
  ];
}
