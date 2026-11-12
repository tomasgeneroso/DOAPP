import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

/**
 * Borrar una cuenta sin dejar rastro (pedido del dueño, 2026-11-12). Se prueba contra la base de pruebas con una cuenta que tiene: un trabajo (referencia), una
 * notificación (referencia), una notificación de otra persona que nombra su correo (texto), y otra cuenta que fue referida por ella (la otra NO se borra).
 * Y el caso contrario: lo de otras personas que no tiene nada que ver sigue en pie.
 */
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { sequelize } from '../../server/config/database.js';
import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { buscarRastros, borrarSinRastro, riesgos } from '../../server/services/borrarUsuarioSinRastro.js';
import { crearUsuario, crearTrabajo } from '../helpers/fixtures.js';

describe('borrar una cuenta sin rastro', () => {
  let objetivo: any;
  let referida: any;
  let ajena: any;
  let trabajoAjeno: any;
  const correoRaro = `rastro${Date.now().toString(36)}@borrar.test`;

  beforeAll(async () => {
    objetivo = await crearUsuario({ email: correoRaro });
    ajena = await crearUsuario();
    referida = await crearUsuario({ referredBy: objetivo.id });
    await crearTrabajo(objetivo.id);
    trabajoAjeno = await crearTrabajo(ajena.id);
    await Notification.create({ recipientId: objetivo.id, type: 'system', category: 'system', title: 'hola', message: 'una notificación' } as never);
    // Una notificación de OTRA persona que nombra el correo de la cuenta (rastro de texto): se borra, aunque no sea suya.
    await Notification.create({ recipientId: ajena.id, type: 'system', category: 'system', title: 'Aviso', message: `Se registró ${correoRaro}` } as never);
    // Una notificación de otra persona cuyo TÍTULO es exactamente el nombre de usuario de la cuenta (antes «el usuario» quedaba en la base).
    await Notification.create({ recipientId: ajena.id, type: 'system', category: 'system', title: objetivo.username, message: 'nombra a la cuenta por su usuario' } as never);
    // La lista de identidades baneadas guarda el correo de quien fue baneado (era lo que quedaba «a revisar a mano»).
    await sequelize.query(`INSERT INTO banned_identities (email, reason) VALUES (:e, 'prueba')`, { replacements: { e: correoRaro } });
  });

  afterAll(async () => {
    try {
      await sequelize.query(`DELETE FROM banned_identities WHERE email = :e`, { replacements: { e: correoRaro } });
      await Job.destroy({ where: { id: trabajoAjeno.id }, force: true } as never);
      await Notification.destroy({ where: { recipientId: [ajena.id, referida.id] } });
      await User.destroy({ where: { id: [ajena.id, referida.id] }, force: true });
      await User.destroy({ where: { id: objetivo.id }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('la vista previa encuentra lo que la nombra: su trabajo, su notificación, la notificación ajena con su correo y la cuenta que refirió; no toca nada', async () => {
    const h = await buscarRastros(String(objetivo.id), objetivo.email);
    const hay = (tabla: string) => h.some((x) => x.tabla === tabla);
    expect(hay('jobs')).toBe(true);
    expect(hay('notifications')).toBe(true);
    expect(h.some((x) => x.tabla === 'notifications' && x.tipo === 'texto')).toBe(true);
    expect(h.some((x) => x.tabla === 'users' && x.columna === 'referred_by')).toBe(true);
    expect(await User.findByPk(objetivo.id)).not.toBeNull();
    expect(await Job.count({ where: { clientId: objetivo.id } })).toBe(1);
  });

  it('los riesgos no marcan nada para una cuenta sin dinero ni contratos con otras personas', async () => {
    expect(await riesgos(String(objetivo.id))).toEqual([]);
  });

  it('si la cuenta figura en la lista de baneados, los riesgos lo avisan (borrarla deja a esa persona registrarse de nuevo)', async () => {
    const motivos = await riesgos(String(objetivo.id), objetivo.email);
    expect(motivos.some((m) => /baneadas/.test(m))).toBe(true);
  });

  it('la vista previa también encuentra lo que nombra su usuario y su correo en la lista de baneados', async () => {
    const h = await buscarRastros(String(objetivo.id), objetivo.email, { username: objetivo.username, dni: objetivo.dni });
    expect(h.some((x) => x.tabla === 'banned_identities' && x.columna === 'email')).toBe(true);
    expect(h.some((x) => x.tabla === 'notifications' && x.columna === 'title')).toBe(true);
  });

  it('al borrar: desaparecen la cuenta, su trabajo, su notificación y la notificación ajena con su correo; la cuenta que refirió QUEDA (sin vínculo) y lo ajeno no se toca', async () => {
    const datos = { username: objetivo.username, dni: objetivo.dni, phone: objetivo.phone };
    const r = await borrarSinRastro(String(objetivo.id), objetivo.email, datos);
    expect(r.aRevisarAMano.some((h) => h.tabla === 'banned_identities')).toBe(false);
    expect(r.borradas.some((b) => b.tabla === 'jobs')).toBe(true);
    expect(r.desvinculadas.some((d) => d.tabla === 'users' && d.columna === 'referred_by')).toBe(true);

    expect(await User.findByPk(objetivo.id)).toBeNull();
    expect(await Job.count({ where: { clientId: objetivo.id } })).toBe(0);
    expect(await Notification.count({ where: { recipientId: objetivo.id } })).toBe(0);
    const [rastro] = (await sequelize.query(`SELECT COUNT(*)::int AS n FROM notifications WHERE message ILIKE :c`, { replacements: { c: `%${correoRaro}%` }, type: 'SELECT' as any })) as any[];
    expect(rastro.n).toBe(0);

    const viva: any = await User.findByPk(referida.id);
    expect(viva).not.toBeNull();
    expect(viva.referredBy).toBeNull();
    expect(await User.findByPk(ajena.id)).not.toBeNull();
    expect(await Job.findByPk(trabajoAjeno.id)).not.toBeNull();

    // Y después de borrar, ya no queda nada que la nombre.
    expect(await buscarRastros(String(objetivo.id), objetivo.email, datos)).toEqual([]);
  });
});
