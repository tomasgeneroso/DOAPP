/**
 * Estadísticas de trabajos para el dueño (pedido del dueño, 2026-11-13): cuántos trabajos hay en cada situación — realizados, sin terminar, sin pagar, sin
 * publicar, publicados y sin comenzar, pausados y sin reanudar…— y cómo van los contratos.
 *
 * El servidor cuenta (`server/services/estadisticasDeTrabajos.ts`) y esta función solo arma las filas con su nombre y su explicación, así que la pantalla y la
 * prueba comparten un único texto por situación. Una situación nueva se agrega acá y a `ConteosDeTrabajos`.
 */
export interface ConteosDeTrabajos {
  /** Publicaciones por estado (`jobs.status`). */
  borrador: number;
  sinPagar: number;
  esperandoAprobacion: number;
  abiertos: number;
  /** Abiertos cuya fecha de inicio ya pasó sin que empezara ningún contrato. */
  abiertosConFechaVencida: number;
  pausados: number;
  pausadosPorInactividad: number;
  pausadosPorAdministracion: number;
  suspendidosSinFechaDeFin: number;
  enCurso: number;
  terminados: number;
  cancelados: number;
  /** Contratos. */
  contratosPorEmpezar: number;
  contratosEnProceso: number;
  contratosEsperandoConfirmacion: number;
  contratosEnDisputa: number;
  contratosTerminadosFaltaPagar: number;
  contratosTerminadosPagados: number;
}

export type TonoDeFila = 'atender' | 'espera' | 'marcha' | 'fin' | 'cancelada';

export interface FilaDeEstadistica {
  clave: string;
  rotulo: string;
  cantidad: number;
  /** Qué cuenta, en palabras simples. */
  explicacion: string;
  tono: TonoDeFila;
  /** Una fila que es parte de la anterior (se muestra con sangría). */
  detalleDe?: string;
}

export interface GrupoDeEstadisticas {
  titulo: string;
  filas: FilaDeEstadistica[];
}

export const CONTEOS_VACIOS: ConteosDeTrabajos = {
  borrador: 0, sinPagar: 0, esperandoAprobacion: 0, abiertos: 0, abiertosConFechaVencida: 0, pausados: 0, pausadosPorInactividad: 0,
  pausadosPorAdministracion: 0, suspendidosSinFechaDeFin: 0, enCurso: 0, terminados: 0, cancelados: 0, contratosPorEmpezar: 0, contratosEnProceso: 0,
  contratosEsperandoConfirmacion: 0, contratosEnDisputa: 0, contratosTerminadosFaltaPagar: 0, contratosTerminadosPagados: 0,
};

/** Cada cantidad es un número entero no negativo: un dato roto no rompe la pantalla (se ve 0). */
function entero(n: unknown): number {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

export function armarEstadisticasDeTrabajos(crudo: Partial<ConteosDeTrabajos>): { total: number; grupos: GrupoDeEstadisticas[] } {
  const c: ConteosDeTrabajos = { ...CONTEOS_VACIOS };
  for (const k of Object.keys(CONTEOS_VACIOS) as Array<keyof ConteosDeTrabajos>) c[k] = entero(crudo[k]);

  const pausadosPorElCliente = Math.max(0, c.pausados - c.pausadosPorInactividad - c.pausadosPorAdministracion);
  const total = c.borrador + c.sinPagar + c.esperandoAprobacion + c.abiertos + c.pausados + c.suspendidosSinFechaDeFin + c.enCurso + c.terminados + c.cancelados;

  const grupos: GrupoDeEstadisticas[] = [
    {
      titulo: 'Publicaciones: en qué situación está cada una',
      filas: [
        { clave: 'sin_publicar', rotulo: 'Sin publicar', cantidad: c.borrador, tono: 'espera', explicacion: 'Borradores: la persona empezó a armar el trabajo y no lo mandó.' },
        { clave: 'sin_pagar', rotulo: 'Sin pagar la publicación', cantidad: c.sinPagar, tono: 'espera', explicacion: 'Armadas y enviadas, pero todavía sin el pago de la publicación.' },
        { clave: 'esperando_aprobacion', rotulo: 'Esperando aprobación', cantidad: c.esperandoAprobacion, tono: 'atender', explicacion: 'Pagadas y a la espera de que alguien del equipo las apruebe.' },
        { clave: 'publicados_sin_comenzar', rotulo: 'Publicados y sin comenzar', cantidad: c.abiertos, tono: 'marcha', explicacion: 'Visibles para todos y sin contrato en marcha: esperan trabajador o la fecha de inicio.' },
        { clave: 'publicados_fecha_vencida', rotulo: 'Publicados, sin comenzar y con la fecha de inicio vencida', cantidad: c.abiertosConFechaVencida, tono: 'atender', explicacion: 'Siguen abiertos aunque ya pasó el día de inicio: nadie los tomó.', detalleDe: 'publicados_sin_comenzar' },
        { clave: 'pausados_sin_reanudar', rotulo: 'Publicados, pausados y sin reanudar', cantidad: c.pausados, tono: 'espera', explicacion: 'Estaban publicados y quedaron en pausa: siguen así hasta que alguien los reanude.' },
        { clave: 'pausados_inactividad', rotulo: 'Pausados por falta de cotización', cantidad: c.pausadosPorInactividad, tono: 'espera', explicacion: 'El sistema los pausó porque nadie cotizó a tiempo.', detalleDe: 'pausados_sin_reanudar' },
        { clave: 'pausados_administracion', rotulo: 'Pausados por el equipo', cantidad: c.pausadosPorAdministracion, tono: 'atender', explicacion: 'Los pausó una persona de administración.', detalleDe: 'pausados_sin_reanudar' },
        { clave: 'pausados_cliente', rotulo: 'Pausados por quien publicó', cantidad: pausadosPorElCliente, tono: 'espera', explicacion: 'Los pausó la persona que los publicó.', detalleDe: 'pausados_sin_reanudar' },
        { clave: 'suspendidos_sin_fecha', rotulo: 'Suspendidos: falta la fecha de fin', cantidad: c.suspendidosSinFechaDeFin, tono: 'espera', explicacion: 'Eran de fin flexible y pasaron los días sin que se pusiera la fecha.' },
        { clave: 'empezados_sin_terminar', rotulo: 'Empezados y sin terminar', cantidad: c.enCurso, tono: 'marcha', explicacion: 'Tienen un contrato en marcha: el trabajo se está haciendo o espera la confirmación.' },
        { clave: 'realizados', rotulo: 'Realizados', cantidad: c.terminados, tono: 'fin', explicacion: 'Trabajos terminados por las dos partes.' },
        { clave: 'cancelados', rotulo: 'Cancelados', cantidad: c.cancelados, tono: 'cancelada', explicacion: 'Se cancelaron antes de terminar.' },
      ],
    },
    {
      titulo: 'Contratos y pagos a trabajadores',
      filas: [
        { clave: 'contratos_por_empezar', rotulo: 'Contratos por empezar', cantidad: c.contratosPorEmpezar, tono: 'marcha', explicacion: 'Armados y esperando la hora de inicio.' },
        { clave: 'contratos_en_proceso', rotulo: 'Contratos en proceso', cantidad: c.contratosEnProceso, tono: 'marcha', explicacion: 'El trabajo se está haciendo.' },
        { clave: 'contratos_esperando_confirmacion', rotulo: 'Esperando confirmación', cantidad: c.contratosEsperandoConfirmacion, tono: 'marcha', explicacion: 'Una parte avisó que terminó y falta la otra (a las 24 h se da por terminado solo).' },
        { clave: 'contratos_en_disputa', rotulo: 'En disputa', cantidad: c.contratosEnDisputa, tono: 'atender', explicacion: 'Alguien reclamó y lo resuelve el equipo.' },
        { clave: 'contratos_terminados_falta_pagar', rotulo: 'Terminados: falta pagar al trabajador', cantidad: c.contratosTerminadosFaltaPagar, tono: 'atender', explicacion: 'El trabajo está hecho y el cobro del trabajador todavía no se transfirió.' },
        { clave: 'contratos_terminados_pagados', rotulo: 'Terminados y pagados', cantidad: c.contratosTerminadosPagados, tono: 'fin', explicacion: 'Hechos y con el trabajador ya cobrado.' },
      ],
    },
  ];
  return { total, grupos };
}
