import { edadDeDisputa } from '../shared/disputes/sla.js';
import { POLITICAS } from '../shared/constants/policies.js';

/**
 * El reloj de las disputas que ve el equipo. Objetivo 4 dias, maximo 5: es
 * plata congelada de dos personas, y la vara tiene que estar a la vista.
 */
describe('edad de una disputa contra el objetivo del equipo', () => {
  const abierta = new Date('2026-09-10T10:00:00Z');
  const enDias = (d: number) => new Date(abierta.getTime() + d * 24 * 60 * 60 * 1000);

  it('el objetivo es menor que el maximo y los dos son positivos', () => {
    expect(POLITICAS.DISPUTA_OBJETIVO_RESOLUCION_DIAS).toBeGreaterThan(0);
    expect(POLITICAS.DISPUTA_MAXIMO_RESOLUCION_DIAS).toBeGreaterThan(POLITICAS.DISPUTA_OBJETIVO_RESOLUCION_DIAS);
  });

  it('en plazo hasta el objetivo, al limite hasta el maximo, vencida despues', () => {
    expect(edadDeDisputa(abierta, { ahora: enDias(1) }).nivel).toBe('en_plazo');
    expect(edadDeDisputa(abierta, { ahora: enDias(POLITICAS.DISPUTA_OBJETIVO_RESOLUCION_DIAS) }).nivel).toBe('en_plazo');
    expect(edadDeDisputa(abierta, { ahora: enDias(POLITICAS.DISPUTA_OBJETIVO_RESOLUCION_DIAS + 0.5) }).nivel).toBe('al_limite');
    expect(edadDeDisputa(abierta, { ahora: enDias(POLITICAS.DISPUTA_MAXIMO_RESOLUCION_DIAS + 0.1) }).nivel).toBe('vencida');
  });

  it('si se espera a una parte, la demora no es del equipo... hasta el maximo', () => {
    expect(edadDeDisputa(abierta, { ahora: enDias(4.5), esperandoAParte: true }).nivel).toBe('esperando');
    // Pasado el maximo igual hay que mirarla, aunque la parte no haya respondido.
    expect(edadDeDisputa(abierta, { ahora: enDias(6), esperandoAParte: true }).nivel).toBe('vencida');
  });

  it('resuelta: mide cuanto tardo, no cuanto lleva', () => {
    const e = edadDeDisputa(abierta, { resueltaEl: enDias(2), ahora: enDias(30) });
    expect(e.cerrada).toBe(true);
    expect(e.dias).toBeCloseTo(2, 5);
    expect(e.nivel).toBe('en_plazo');
  });

  it('el texto se lee: horas si es menos de un dia, dias y horas despues', () => {
    expect(edadDeDisputa(abierta, { ahora: new Date(abierta.getTime() + 3 * 3600 * 1000) }).texto).toBe('3 h');
    expect(edadDeDisputa(abierta, { ahora: enDias(2) }).texto).toBe('2 d');
    expect(edadDeDisputa(abierta, { ahora: new Date(enDias(2).getTime() + 5 * 3600 * 1000) }).texto).toBe('2 d 5 h');
  });

  it('una fecha futura por reloj desfasado no da negativo', () => {
    const e = edadDeDisputa(enDias(1), { ahora: abierta });
    expect(e.dias).toBe(0);
    expect(e.nivel).toBe('en_plazo');
  });
});
