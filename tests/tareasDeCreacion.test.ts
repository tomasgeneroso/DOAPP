import { describe, it, expect } from '@jest/globals';
import { leerTareasDeCreacion, MAXIMO_DE_TAREAS } from '../shared/jobs/tareasDeCreacion.js';

const ventana = { inicio: '2026-06-14T09:00:00', fin: '2026-06-17T18:00:00' };

describe('leerTareasDeCreacion', () => {
  it('lee la lista (o el texto JSON que manda el formulario) con títulos limpios y días válidos', () => {
    const crudo = [{ title: '  Cortar   el pasto ', dueDate: '2026-06-15' }, { title: 'Regar las plantas', dueDate: '2026-06-16' }, { title: 'Limpiar el patio' }];
    for (const entrada of [crudo, JSON.stringify(crudo)]) {
      expect(leerTareasDeCreacion(entrada, ventana)).toEqual({
        ok: true,
        tareas: [
          { title: 'Cortar el pasto', dueDate: '2026-06-15' },
          { title: 'Regar las plantas', dueDate: '2026-06-16' },
          { title: 'Limpiar el patio', dueDate: null },
        ],
      });
    }
  });

  it('las filas sin título (vacías del formulario) se descartan', () => {
    expect(leerTareasDeCreacion([{ title: '', dueDate: '2026-06-15' }, { title: '   ' }, { title: 'Pintar' }], ventana)).toEqual({ ok: true, tareas: [{ title: 'Pintar', dueDate: null }] });
  });

  it('sin tareas (o sin dato) es una lista vacía', () => {
    for (const nada of [undefined, null, '', [], '[]']) expect(leerTareasDeCreacion(nada, ventana)).toEqual({ ok: true, tareas: [] });
  });

  it('un día fuera del trabajo se rechaza, con el borde adentro (primer y último día valen)', () => {
    expect(leerTareasDeCreacion([{ title: 'Pintar', dueDate: '2026-06-14' }], ventana).ok).toBe(true);
    expect(leerTareasDeCreacion([{ title: 'Pintar', dueDate: '2026-06-17' }], ventana).ok).toBe(true);
    const antes = leerTareasDeCreacion([{ title: 'Pintar', dueDate: '2026-06-13' }], ventana);
    const despues = leerTareasDeCreacion([{ title: 'Pintar', dueDate: '2026-06-18' }], ventana);
    for (const r of [antes, despues]) {
      expect(r.ok).toBe(false);
      expect((r as any).mensaje).toMatch(/entre el inicio y el fin/);
    }
  });

  it('con el fin sin definir solo se mira que no sea antes del inicio', () => {
    expect(leerTareasDeCreacion([{ title: 'Pintar', dueDate: '2030-01-01' }], { inicio: ventana.inicio, fin: null }).ok).toBe(true);
    expect(leerTareasDeCreacion([{ title: 'Pintar', dueDate: '2026-06-01' }], { inicio: ventana.inicio, fin: null }).ok).toBe(false);
  });

  it('fechas imposibles o con otro formato se rechazan', () => {
    for (const mala of ['2026-02-30', '15/06/2026', 'mañana', '2026-13-01']) {
      const r = leerTareasDeCreacion([{ title: 'Pintar', dueDate: mala }], ventana);
      expect(r.ok).toBe(false);
    }
  });

  it('formatos que no son una lista, tareas que no son objetos y títulos enormes se rechazan', () => {
    for (const malo of ['{"a":1}', 'no es json', 5, { title: 'x' }]) expect(leerTareasDeCreacion(malo, ventana).ok).toBe(false);
    expect(leerTareasDeCreacion([null], ventana).ok).toBe(false);
    expect(leerTareasDeCreacion([{ title: 'x'.repeat(201) }], ventana).ok).toBe(false);
  });

  it('hay un tope de tareas', () => {
    const muchas = Array.from({ length: MAXIMO_DE_TAREAS + 1 }, (_, i) => ({ title: `Tarea ${i}` }));
    expect(leerTareasDeCreacion(muchas, ventana).ok).toBe(false);
    expect(leerTareasDeCreacion(muchas.slice(0, MAXIMO_DE_TAREAS), ventana).ok).toBe(true);
  });
});
