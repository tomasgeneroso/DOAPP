import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

/**
 * Una publicación aparece o desaparece al instante.
 *
 * El servidor ya vaciaba la caché del muro en cada cambio de un trabajo, pero el aviso en vivo a las pantallas abiertas salía solo de algunas rutas: el
 * resto (aprobar, pagar, completar, cancelar por el sistema…) cambiaba el muro y quien lo tenía abierto veía la lista vieja hasta recargar. Ahora lo avisa
 * el propio modelo del trabajo, así no depende de que cada ruta se acuerde.
 */
import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { registrarAvisoDelMuro } from '../../server/services/avisoDelMuro.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('el muro avisa en vivo cuando cambia', () => {
  let cliente: any;
  let avisos = 0;
  const jobs: string[] = [];
  const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

  beforeAll(async () => {
    cliente = await crearUsuario({ role: 'client' });
    registrarAvisoDelMuro(() => {
      avisos++;
    });
  });

  afterAll(async () => {
    registrarAvisoDelMuro(() => {});
    try {
      await Job.destroy({ where: { id: jobs }, force: true });
      await User.destroy({ where: { id: cliente.id }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('crear una publicación avisa', async () => {
    avisos = 0;
    const t = await crearTrabajo(cliente.id, { status: 'pending_approval' });
    jobs.push(t.id);
    await esperar(500);
    expect(avisos).toBeGreaterThanOrEqual(1);
  });

  it('aprobarla (guardar el trabajo) y cancelarla (actualización en masa) avisan', async () => {
    const t = await crearTrabajo(cliente.id, { status: 'pending_approval' });
    jobs.push(t.id);
    await esperar(500);

    avisos = 0;
    t.status = 'open';
    await t.save();
    await esperar(500);
    expect(avisos).toBeGreaterThanOrEqual(1);

    avisos = 0;
    await Job.update({ status: 'cancelled' } as any, { where: { id: t.id } });
    await esperar(500);
    expect(avisos).toBeGreaterThanOrEqual(1);
  });

  it('varios cambios seguidos salen como UN solo aviso (no se inunda a las pantallas)', async () => {
    const t = await crearTrabajo(cliente.id, { status: 'open' });
    jobs.push(t.id);
    await esperar(500);

    avisos = 0;
    for (const estado of ['paused', 'open', 'paused', 'open']) {
      await Job.update({ status: estado } as any, { where: { id: t.id } });
    }
    await esperar(600);
    expect(avisos).toBe(1);
  });

  it('sin nadie registrado (pruebas, scripts) no pasa nada', async () => {
    registrarAvisoDelMuro(null as any);
    const t = await crearTrabajo(cliente.id, { status: 'open' });
    jobs.push(t.id);
    await esperar(300);
    registrarAvisoDelMuro(() => {
      avisos++;
    });
  });
});
