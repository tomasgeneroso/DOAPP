import {
  puedeVerDireccion,
  paraQuienMira,
  estaPorEmpezar,
} from '../server/services/privacidadTrabajo.js';
import { POLITICAS } from '../shared/constants/policies.js';

/**
 * Quien ve la direccion exacta de una casa, y cuando.
 *
 * GET /api/jobs/:id era publico y devolvia calle y numero a cualquiera, mas el
 * telefono y el email del cliente. Estas son las reglas que lo reemplazan.
 */

const H = 3_600_000;
const ahora = new Date('2026-09-20T12:00:00Z');
const en = (horas: number) => new Date(ahora.getTime() + horas * H);

const trabajo = (extra: Record<string, unknown> = {}) => ({
  clientId: 'cliente',
  doerId: null,
  selectedWorkers: ['trabajador'],
  startDate: en(72),
  status: 'open',
  addressStreet: 'Av. Siempreviva',
  addressNumber: '742',
  addressDetails: 'timbre B',
  neighborhood: 'Palermo',
  client: { id: 'cliente', name: 'Ana', phone: '+54911', email: 'ana@x.com' },
  doer: null,
  ...extra,
});

describe('quien ve la direccion exacta', () => {
  it('un visitante sin login, nunca', () => {
    expect(puedeVerDireccion(trabajo(), null, ahora)).toBe(false);
    expect(puedeVerDireccion(trabajo(), undefined, ahora)).toBe(false);
  });

  it('un usuario cualquiera que mira el trabajo, nunca', () => {
    expect(puedeVerDireccion(trabajo(), { id: 'otro' }, ahora)).toBe(false);
  });

  it('el dueño, siempre', () => {
    expect(puedeVerDireccion(trabajo({ startDate: en(24 * 30) }), { id: 'cliente' }, ahora)).toBe(true);
  });

  it('un admin, siempre', () => {
    expect(puedeVerDireccion(trabajo(), { id: 'x', adminRole: 'support' }, ahora)).toBe(true);
  });

  it('el trabajador contratado, recien desde la ventana antes del inicio', () => {
    const v = POLITICAS.DIRECCION_VISIBLE_HORAS_ANTES;
    // Faltan 72 h: todavia no.
    expect(puedeVerDireccion(trabajo({ startDate: en(72) }), { id: 'trabajador' }, ahora)).toBe(false);
    // Justo en el borde: si.
    expect(puedeVerDireccion(trabajo({ startDate: en(v) }), { id: 'trabajador' }, ahora)).toBe(true);
    // Faltan 3 h: si.
    expect(puedeVerDireccion(trabajo({ startDate: en(3) }), { id: 'trabajador' }, ahora)).toBe(true);
  });

  it('el trabajador contratado, siempre si el trabajo ya empezo', () => {
    expect(puedeVerDireccion(trabajo({ status: 'in_progress', startDate: en(24 * 10) }), { id: 'trabajador' }, ahora)).toBe(true);
    expect(estaPorEmpezar({ status: 'in_progress' }, ahora)).toBe(true);
  });

  it('un trabajador que se postulo pero no fue elegido, nunca', () => {
    expect(puedeVerDireccion(trabajo({ startDate: en(1) }), { id: 'postulante' }, ahora)).toBe(false);
  });
});

describe('lo que se devuelve', () => {
  it('a un visitante: sin direccion y sin contacto, pero con barrio', () => {
    const r = paraQuienMira(trabajo(), null, ahora) as any;
    expect(r.addressStreet).toBeUndefined();
    expect(r.addressNumber).toBeUndefined();
    expect(r.addressDetails).toBeUndefined();
    expect(r.client.phone).toBeUndefined();
    expect(r.client.email).toBeUndefined();
    expect(r.neighborhood).toBe('Palermo');
    expect(r.client.name).toBe('Ana');
  });

  it('al dueño: con direccion, pero igual sin contacto del otro lado', () => {
    // El contacto no se muestra nunca entre usuarios. El dueño ya sabe su
    // propio telefono; lo que no puede ver es el del trabajador.
    const r = paraQuienMira(trabajo({ doer: { id: 'trabajador', phone: '+5411' } }), { id: 'cliente' }, ahora) as any;
    expect(r.addressStreet).toBe('Av. Siempreviva');
    expect(r.doer.phone).toBeUndefined();
  });

  it('al trabajador contratado a 3 h del inicio: con direccion', () => {
    const r = paraQuienMira(trabajo({ startDate: en(3) }), { id: 'trabajador' }, ahora) as any;
    expect(r.addressStreet).toBe('Av. Siempreviva');
    expect(r.addressNumber).toBe('742');
  });

  it('la ventana esta en policies y es de un par de dias, no de semanas', () => {
    // Lo suficiente para planificar el viaje; no tanto que la direccion
    // circule antes de que haga falta.
    expect(POLITICAS.DIRECCION_VISIBLE_HORAS_ANTES).toBeGreaterThanOrEqual(24);
    expect(POLITICAS.DIRECCION_VISIBLE_HORAS_ANTES).toBeLessThanOrEqual(72);
  });
});
