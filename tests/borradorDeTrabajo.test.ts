import { describe, it, expect } from '@jest/globals';
import {
  borrarBorrador,
  claveDelBorrador,
  guardarBorrador,
  haceCuanto,
  leerBorrador,
  tieneContenido,
  DIAS_DE_VIDA_DEL_BORRADOR,
  type Almacen,
} from '../client/utils/borradorDeTrabajo.js';

/** Un trabajo a medio crear no se pierde: se guarda en el navegador, por cuenta, y vuelve a cargarse. */
const vacio = {
  title: '', summary: '', description: '', category: '', tags: [] as string[], location: '', neighborhood: '', postalCode: '', addressStreet: '',
  addressNumber: '', addressDetails: '', budget: '', isQuotable: false, allowCounterOffers: true, singleDelivery: true, maxWorkers: 1,
  requirements: ['', '', ''], tareas: [{ title: '', dueDate: null }], vacancyTaskAssignments: [], endDateFlexible: false, startDate: null, endDate: null,
  latitude: null, longitude: null, sinProteccion: false,
};

const almacenFalso = (): Almacen & { datos: Map<string, string> } => {
  const datos = new Map<string, string>();
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v), removeItem: (k) => void datos.delete(k) };
};

describe('borrador de un trabajo', () => {
  it('un formulario vacío (solo con los valores por defecto) no es un borrador y no se guarda', () => {
    const a = almacenFalso();
    expect(tieneContenido(vacio)).toBe(false);
    expect(guardarBorrador('u1', vacio, new Date(), a)).toBe(false);
    expect(a.datos.size).toBe(0);
  });

  it('con algo escrito se guarda y vuelve igual, solo para esa cuenta', () => {
    const a = almacenFalso();
    const ahora = new Date('2026-10-20T12:00:00Z');
    const b = { ...vacio, title: 'Reparar cocina', budget: '5000', tags: ['gas'], requirements: ['', 'Matrícula', ''] };
    expect(guardarBorrador('u1', b, ahora, a)).toBe(true);
    const leido = leerBorrador('u1', a, new Date('2026-10-20T12:05:00Z'));
    expect(leido).toMatchObject({ title: 'Reparar cocina', budget: '5000', tags: ['gas'], guardadoEl: ahora.toISOString() });
    expect(leerBorrador('u2', a)).toBeNull(); // otra cuenta del mismo navegador no lo ve
  });

  it('cada pestaña cuenta como contenido: las tareas, los requisitos y las etiquetas también', () => {
    expect(tieneContenido({ ...vacio, tareas: [{ title: 'Lijar', dueDate: null }] })).toBe(true);
    expect(tieneContenido({ ...vacio, requirements: ['Matrícula'] })).toBe(true);
    expect(tieneContenido({ ...vacio, tags: ['pintura'] })).toBe(true);
    expect(tieneContenido({ ...vacio, title: '   ' })).toBe(false);
  });

  it('si la persona borra todo, el borrador guardado se elimina', () => {
    const a = almacenFalso();
    guardarBorrador('u1', { ...vacio, title: 'algo' }, new Date(), a);
    expect(a.datos.has(claveDelBorrador('u1'))).toBe(true);
    guardarBorrador('u1', vacio, new Date(), a);
    expect(a.datos.has(claveDelBorrador('u1'))).toBe(false);
  });

  it('vence a los 30 días, y uno dañado o de otra versión se descarta sin romper', () => {
    const a = almacenFalso();
    guardarBorrador('u1', { ...vacio, title: 'viejo' }, new Date('2026-09-01T00:00:00Z'), a);
    expect(leerBorrador('u1', a, new Date(new Date('2026-09-01T00:00:00Z').getTime() + (DIAS_DE_VIDA_DEL_BORRADOR - 1) * 86_400_000))).not.toBeNull();
    expect(leerBorrador('u1', a, new Date(new Date('2026-09-01T00:00:00Z').getTime() + (DIAS_DE_VIDA_DEL_BORRADOR + 1) * 86_400_000))).toBeNull();
    expect(a.datos.size).toBe(0);

    a.datos.set(claveDelBorrador('u1'), '{esto no es json');
    expect(leerBorrador('u1', a)).toBeNull();
    expect(a.datos.size).toBe(0);

    a.datos.set(claveDelBorrador('u1'), JSON.stringify({ version: 99, guardadoEl: new Date().toISOString(), title: 'x' }));
    expect(leerBorrador('u1', a)).toBeNull();
  });

  it('sin almacenamiento (modo privado) nada revienta', () => {
    const roto: Almacen = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('lleno'); }, removeItem: () => { throw new Error('bloqueado'); } };
    expect(guardarBorrador('u1', { ...vacio, title: 'x' }, new Date(), roto)).toBe(false);
    expect(leerBorrador('u1', roto)).toBeNull();
    expect(() => borrarBorrador('u1', roto)).not.toThrow();
    expect(guardarBorrador('u1', { ...vacio, title: 'x' }, new Date(), null)).toBe(false);
  });

  it('borrar lo elimina', () => {
    const a = almacenFalso();
    guardarBorrador('u1', { ...vacio, title: 'x' }, new Date(), a);
    borrarBorrador('u1', a);
    expect(leerBorrador('u1', a)).toBeNull();
  });

  it('«hace cuánto» se lee como una persona', () => {
    const ahora = new Date('2026-10-20T12:00:00Z');
    const antes = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString();
    expect(haceCuanto(antes(0), ahora)).toBe('hace un momento');
    expect(haceCuanto(antes(1), ahora)).toBe('hace 1 minuto');
    expect(haceCuanto(antes(45), ahora)).toBe('hace 45 minutos');
    expect(haceCuanto(antes(120), ahora)).toBe('hace 2 horas');
    expect(haceCuanto(antes(24 * 60), ahora)).toBe('ayer');
    expect(haceCuanto(antes(3 * 24 * 60), ahora)).toBe('hace 3 días');
  });
});
