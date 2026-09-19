import { ventanaDeRating, entraEnVentana } from '../shared/rating/ventana.js';
import { periodoDelRating } from '../shared/rating/display.js';
import { POLITICAS } from '../shared/constants/policies.js';
import { termsEs } from '../shared/legal/terms.es.js';

/**
 * La puntuacion que se muestra sale de una ventana, no de todo el historial:
 * la gente cambia. Lo que se prueba es cuando se usa cada escalon.
 */
describe('ventana de la puntuacion', () => {
  const hoy = new Date('2026-09-19T12:00:00Z');
  const haceDias = (d: number) => new Date(hoy.getTime() - d * 86_400_000);

  it('con actividad suficiente en 90 dias, usa 90 dias', () => {
    const fechas = Array.from({ length: POLITICAS.RATING_CONTRATOS_MINIMOS }, (_, i) => haceDias(i * 10));
    const v = ventanaDeRating(fechas, hoy);
    expect(v.id).toBe('reciente');
    expect(v.dias).toBe(POLITICAS.RATING_VENTANA_DIAS);
    expect(v.etiqueta).toContain(String(POLITICAS.RATING_VENTANA_DIAS));
  });

  it('con pocas reseñas recientes, se abre al ultimo año', () => {
    // Dos reseñas nuevas no pueden decidir toda la reputacion de alguien.
    const v = ventanaDeRating([haceDias(5), haceDias(40), haceDias(200)], hoy);
    expect(v.id).toBe('anual');
    expect(v.cantidad).toBe(3);
  });

  it('sin nada en el año, no le borra la reputacion: toma todo el historial', () => {
    const v = ventanaDeRating([haceDias(500), haceDias(900)], hoy);
    expect(v.id).toBe('historico');
    expect(v.desde).toBeNull();
    expect(entraEnVentana(haceDias(900), v)).toBe(true);
  });

  it('sin reseñas, no explota', () => {
    const v = ventanaDeRating([], hoy);
    expect(v.id).toBe('historico');
    expect(v.cantidad).toBe(0);
  });

  it('entraEnVentana deja afuera lo viejo cuando la ventana es corta', () => {
    const fechas = Array.from({ length: 6 }, (_, i) => haceDias(i * 10));
    const v = ventanaDeRating(fechas, hoy);
    expect(entraEnVentana(haceDias(10), v)).toBe(true);
    expect(entraEnVentana(haceDias(200), v)).toBe(false);
  });

  it('el perfil dice de que periodo es, y avisa si hay mas reseñas afuera', () => {
    expect(periodoDelRating({ ventana: { etiqueta: 'últimos 90 días' }, historicas: 20 }, 6)).toBe('últimos 90 días · 20 en total');
    expect(periodoDelRating({ ventana: { etiqueta: 'último año' }, historicas: 3 }, 3)).toBe('último año');
    expect(periodoDelRating(null, 3)).toBeNull();
  });

  it('los T&C explican la ventana con los numeros del codigo', () => {
    expect(termsEs.s6p7).toContain(String(POLITICAS.RATING_VENTANA_DIAS));
    expect(termsEs.s6p7).toContain(String(POLITICAS.RATING_CONTRATOS_MINIMOS));
    expect(termsEs.s6p7).toMatch(/período utilizado se indica/i);
  });
});
