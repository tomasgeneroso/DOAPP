import { diasHabilesDesde, DIAS_HABILES_ANTES_DE_PAUSAR } from '../server/services/quotePayment.js';

/**
 * settleQuote toca la base (comision por usuario), asi que su prueba vive en el
 * proyecto de modelos. Acá va lo que se puede probar sin base: el calendario,
 * que es de donde salen las pausas automaticas.
 */

describe('dias habiles', () => {
  // Referencia: lunes 2 de marzo de 2026.
  const lunes = new Date(2026, 2, 2);

  it('no cuenta el sabado ni el domingo', () => {
    // Lunes a lunes: 7 dias corridos, 5 habiles.
    expect(diasHabilesDesde(lunes, new Date(2026, 2, 9))).toBe(5);
  });

  it('dos semanas corridas son diez dias habiles', () => {
    // Es exactamente el umbral de la pausa: 10 habiles = 14 corridos.
    expect(diasHabilesDesde(lunes, new Date(2026, 2, 16))).toBe(DIAS_HABILES_ANTES_DE_PAUSAR);
  });

  it('un fin de semana solo no suma nada', () => {
    const viernes = new Date(2026, 2, 6);
    expect(diasHabilesDesde(viernes, new Date(2026, 2, 8))).toBe(0);
  });

  it('el mismo dia es cero', () => {
    expect(diasHabilesDesde(lunes, lunes)).toBe(0);
  });

  it('una fecha futura no da negativo', () => {
    // Un reloj mal puesto o una fecha cargada a mano no puede hacer que el cron
    // lea "menos dias" y se comporte de forma rara.
    expect(diasHabilesDesde(new Date(2026, 2, 16), lunes)).toBe(0);
  });

  it('ignora la hora del dia', () => {
    // Publicar 23:59 del lunes y mirar 00:01 del martes es un dia, no dos.
    const lunesTarde = new Date(2026, 2, 2, 23, 59);
    const martesTemprano = new Date(2026, 2, 3, 0, 1);
    expect(diasHabilesDesde(lunesTarde, martesTemprano)).toBe(1);
  });
});
