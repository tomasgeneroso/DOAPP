import { describe, it, expect } from '@jest/globals';
import { armarEstadisticasDeTrabajos, CONTEOS_VACIOS } from '../shared/admin/estadisticasDeTrabajos';

/** Estadísticas de trabajos del dueño (2026-11-13): cada situación que pidió tiene su fila, con su cantidad y sin números rotos. */
describe('armarEstadisticasDeTrabajos', () => {
  const fila = (r: ReturnType<typeof armarEstadisticasDeTrabajos>, clave: string) => r.grupos.flatMap((g) => g.filas).find((f) => f.clave === clave)!;

  it('trae una fila por cada situación que pidió el dueño', () => {
    const r = armarEstadisticasDeTrabajos(CONTEOS_VACIOS);
    for (const clave of ['realizados', 'empezados_sin_terminar', 'sin_pagar', 'sin_publicar', 'publicados_sin_comenzar', 'pausados_sin_reanudar', 'cancelados', 'contratos_terminados_falta_pagar']) {
      expect(fila(r, clave)).toBeDefined();
    }
  });

  it('cada cantidad sale de su conteo y el total suma las publicaciones', () => {
    const r = armarEstadisticasDeTrabajos({
      borrador: 3, sinPagar: 2, esperandoAprobacion: 1, abiertos: 10, abiertosConFechaVencida: 4, pausados: 5, pausadosPorInactividad: 2, pausadosPorAdministracion: 1,
      suspendidosSinFechaDeFin: 1, enCurso: 6, terminados: 20, cancelados: 7, contratosTerminadosFaltaPagar: 3,
    });
    expect(fila(r, 'sin_publicar').cantidad).toBe(3);
    expect(fila(r, 'sin_pagar').cantidad).toBe(2);
    expect(fila(r, 'publicados_sin_comenzar').cantidad).toBe(10);
    expect(fila(r, 'publicados_fecha_vencida').cantidad).toBe(4);
    expect(fila(r, 'pausados_sin_reanudar').cantidad).toBe(5);
    // Los pausados por quien publicó son los que no pausó ni el sistema ni el equipo.
    expect(fila(r, 'pausados_cliente').cantidad).toBe(2);
    expect(fila(r, 'realizados').cantidad).toBe(20);
    expect(fila(r, 'contratos_terminados_falta_pagar').cantidad).toBe(3);
    expect(r.total).toBe(3 + 2 + 1 + 10 + 5 + 1 + 6 + 20 + 7);
  });

  it('un dato roto se ve como 0 y nunca rompe ni da negativo', () => {
    const r = armarEstadisticasDeTrabajos({ borrador: NaN, sinPagar: -4, abiertos: '7' as unknown as number, pausados: 1, pausadosPorInactividad: 5 });
    expect(fila(r, 'sin_publicar').cantidad).toBe(0);
    expect(fila(r, 'sin_pagar').cantidad).toBe(0);
    expect(fila(r, 'publicados_sin_comenzar').cantidad).toBe(7);
    expect(fila(r, 'pausados_cliente').cantidad).toBe(0);
  });

  it('las filas de detalle apuntan a una fila que existe', () => {
    const filas = armarEstadisticasDeTrabajos(CONTEOS_VACIOS).grupos.flatMap((g) => g.filas);
    for (const f of filas.filter((x) => x.detalleDe)) expect(filas.some((p) => p.clave === f.detalleDe)).toBe(true);
  });
});
