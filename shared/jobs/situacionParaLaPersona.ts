/**
 * En qué está un trabajo o un contrato, dicho para QUIEN LO MIRA (la persona que contrató o la que trabaja), no para el equipo.
 *
 * Regla del dueño (2026-11-12): «todo debe estar con los mismos estados». La situación de punta a punta se calcula UNA vez (`shared/admin/resumenDePublicacion.ts`:
 * trabajo + contrato + pagos) y cada pantalla la dice con sus palabras: el equipo ve «Terminada: falta pagar al trabajador»; el cliente ve que DOAPP le está pagando
 * al trabajador; el trabajador ve que falta que le paguen. Acá solo está la traducción por rol: pura, sin base de datos ni React, para probarla.
 *
 * Nunca lleva ids ni montos de la otra parte: solo un rótulo, una explicación y un tono.
 */
import { ESTADOS_FINALES } from '../admin/resumenDePublicacion.js';

export type RolDeQuienMira = 'cliente' | 'trabajador';
export type TonoParaLaPersona = 'atencion' | 'espera' | 'bien' | 'info' | 'cierre';

export interface SituacionParaLaPersona {
  /** La clave del estado final (la misma que ve el equipo): sirve para filtrar y para probar. */
  clave: string;
  etiqueta: string;
  explicacion: string;
  tono: TonoParaLaPersona;
}

interface ResumenMinimo {
  estadoFinal: { clave: string };
  pago?: { clave: string } | null;
}

type Texto = { etiqueta: string; explicacion: string; tono: TonoParaLaPersona };
type PorRol = Texto | { cliente: Texto; trabajador: Texto };

const TEXTOS: Record<string, PorRol> = {
  en_disputa: { etiqueta: 'En disputa', explicacion: 'Hay un reclamo abierto: el equipo de DOAPP lo está revisando y te avisa lo que se decida.', tono: 'atencion' },
  cancelacion_pedida: { etiqueta: 'Se pidió cancelar', explicacion: 'Se pidió cancelar este trabajo y el equipo de DOAPP lo está revisando. Te avisamos cuando se resuelva.', tono: 'atencion' },
  cancelada: { etiqueta: 'Cancelado', explicacion: 'Se canceló y ya no sigue adelante.', tono: 'cierre' },
  terminada_falta_pagar: {
    cliente: { etiqueta: 'Terminado: DOAPP le paga al trabajador', explicacion: 'El trabajo terminó y tu pago está en garantía. DOAPP se lo transfiere al trabajador: no tenés que hacer nada.', tono: 'espera' },
    trabajador: { etiqueta: 'Terminado: falta que te paguen', explicacion: 'El trabajo terminó y falta que DOAPP te pague. Te avisamos apenas se acredite.', tono: 'espera' },
  },
  terminada_pagada: {
    cliente: { etiqueta: 'Terminado y pagado', explicacion: 'El trabajo terminó y el trabajador ya cobró.', tono: 'cierre' },
    trabajador: { etiqueta: 'Terminado y cobrado', explicacion: 'El trabajo terminó y ya te pagamos.', tono: 'bien' },
  },
  esperando_confirmacion: { etiqueta: 'Esperando confirmación', explicacion: 'Las dos partes tienen que confirmar que el trabajo terminó. Si nadie confirma, se da por terminado solo pasado el plazo.', tono: 'atencion' },
  contrato_en_proceso: { etiqueta: 'En curso', explicacion: 'El trabajo está en marcha.', tono: 'info' },
  contrato_por_empezar: { etiqueta: 'Por empezar', explicacion: 'El contrato está listo y arranca en la fecha de inicio.', tono: 'info' },
  esperando_aprobacion: { etiqueta: 'En revisión', explicacion: 'Un administrador revisa la publicación. Cuando la aprueba, aparece en el muro.', tono: 'espera' },
  abierta: {
    cliente: { etiqueta: 'Publicado: esperando trabajador', explicacion: 'Está en el muro. Cuando alguien se postule, lo ves y elegís.', tono: 'bien' },
    trabajador: { etiqueta: 'Abierto', explicacion: 'Está en el muro y se puede postular.', tono: 'bien' },
  },
  pausada: { etiqueta: 'Pausado', explicacion: 'No se muestra en el muro hasta que se reanude.', tono: 'atencion' },
  en_curso_sin_contrato: { etiqueta: 'En curso', explicacion: 'El trabajo está en marcha.', tono: 'info' },
  terminada_sin_contrato: { etiqueta: 'Terminado', explicacion: 'El trabajo terminó.', tono: 'cierre' },
  // «Esperando pago» cambia según qué falta del pago de la publicación (se resuelve en `esperandoPago`).
  esperando_pago: { etiqueta: 'Esperando pago', explicacion: 'Todavía no se acreditó el pago de la publicación.', tono: 'espera' },
};

const elegir = (t: PorRol, rol: RolDeQuienMira): Texto => ('etiqueta' in t ? t : t[rol]);

function esperandoPago(pagoClave: string | undefined, rol: RolDeQuienMira): Texto {
  if (pagoClave === 'en_revision') {
    return { etiqueta: 'Verificando el pago', explicacion: 'Recibimos el pago y el equipo lo está verificando. Apenas se confirme sigue adelante.', tono: 'espera' };
  }
  if (pagoClave === 'rechazado') {
    return rol === 'cliente'
      ? { etiqueta: 'Pago rechazado', explicacion: 'No pudimos confirmar el pago de la publicación. Volvé a intentarlo o escribinos a soporte.', tono: 'atencion' }
      : { etiqueta: 'Esperando el pago del cliente', explicacion: 'El pago de la publicación todavía no se confirmó.', tono: 'espera' };
  }
  if (pagoClave === 'devuelto') {
    return { etiqueta: 'Pago devuelto', explicacion: 'El pago de la publicación se devolvió.', tono: 'cierre' };
  }
  return rol === 'cliente'
    ? { etiqueta: 'Falta pagar la publicación', explicacion: 'Para que se publique falta pagarla.', tono: 'atencion' }
    : { etiqueta: 'Esperando el pago del cliente', explicacion: 'El cliente todavía no pagó la publicación.', tono: 'espera' };
}

export function situacionParaLaPersona(resumen: ResumenMinimo, rol: RolDeQuienMira): SituacionParaLaPersona {
  const clave = resumen.estadoFinal.clave;
  if (clave === 'esperando_pago') return { clave, ...esperandoPago(resumen.pago?.clave, rol) };
  const t = TEXTOS[clave];
  if (!t) return { clave, etiqueta: 'En proceso', explicacion: '', tono: 'info' };
  return { clave, ...elegir(t, rol) };
}

/** Las claves que sabe decir: la prueba exige que cubra TODOS los estados finales que calcula el equipo. */
export const CLAVES_CON_TEXTO_PARA_LA_PERSONA: ReadonlyArray<string> = Object.keys(TEXTOS);
export const CLAVES_DE_ESTADOS_FINALES: ReadonlyArray<string> = ESTADOS_FINALES.map((e) => e.clave);
