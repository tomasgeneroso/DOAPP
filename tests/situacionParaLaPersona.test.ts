import { describe, it, expect } from '@jest/globals';
import { situacionParaLaPersona, CLAVES_CON_TEXTO_PARA_LA_PERSONA, CLAVES_DE_ESTADOS_FINALES } from '../shared/jobs/situacionParaLaPersona.js';

/**
 * Regla del dueño (2026-11-12): el cliente y el trabajador ven el MISMO estado que el equipo (calculado una vez en `resumenDePublicacion`), dicho con sus palabras.
 */
describe('situación para la persona (cliente / trabajador)', () => {
  const resumen = (clave: string, pago?: string) => ({ estadoFinal: { clave }, pago: pago ? { clave: pago } : null });

  it('cubre TODOS los estados finales que calcula el equipo (un estado nuevo sin texto hace fallar esta prueba)', () => {
    for (const clave of CLAVES_DE_ESTADOS_FINALES) expect(CLAVES_CON_TEXTO_PARA_LA_PERSONA).toContain(clave);
  });

  it('terminado y sin pagarle al trabajador: cada uno lo ve a su manera, y es el mismo estado', () => {
    const c = situacionParaLaPersona(resumen('terminada_falta_pagar'), 'cliente');
    const t = situacionParaLaPersona(resumen('terminada_falta_pagar'), 'trabajador');
    expect(c.clave).toBe('terminada_falta_pagar');
    expect(t.clave).toBe('terminada_falta_pagar');
    expect(c.etiqueta).toBe('Terminado: DOAPP le paga al trabajador');
    expect(t.etiqueta).toBe('Terminado: falta que te paguen');
  });

  it('terminado y pagado: «pagado» para el cliente, «cobrado» para el trabajador', () => {
    expect(situacionParaLaPersona(resumen('terminada_pagada'), 'cliente').etiqueta).toBe('Terminado y pagado');
    expect(situacionParaLaPersona(resumen('terminada_pagada'), 'trabajador').etiqueta).toBe('Terminado y cobrado');
  });

  it('«esperando pago» dice qué falta del pago y a quién le toca', () => {
    expect(situacionParaLaPersona(resumen('esperando_pago', 'sin_pagar'), 'cliente').etiqueta).toBe('Falta pagar la publicación');
    expect(situacionParaLaPersona(resumen('esperando_pago', 'sin_pagar'), 'trabajador').etiqueta).toBe('Esperando el pago del cliente');
    expect(situacionParaLaPersona(resumen('esperando_pago', 'en_revision'), 'cliente').etiqueta).toBe('Verificando el pago');
    expect(situacionParaLaPersona(resumen('esperando_pago', 'rechazado'), 'cliente').tono).toBe('atencion');
  });

  it('un estado que no conoce no rompe la pantalla', () => {
    expect(situacionParaLaPersona(resumen('algo_nuevo'), 'cliente').etiqueta).toBe('En proceso');
  });

  it('ningún texto lleva ids ni montos', () => {
    for (const clave of CLAVES_CON_TEXTO_PARA_LA_PERSONA) {
      for (const rol of ['cliente', 'trabajador'] as const) {
        const s = situacionParaLaPersona(resumen(clave, 'sin_pagar'), rol);
        expect(`${s.etiqueta} ${s.explicacion}`).not.toMatch(/\$\s?\d|[0-9a-f]{8}-[0-9a-f]{4}/i);
      }
    }
  });
});
