import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../server/config/database.js';
import { User } from '../../server/models/sql/User.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { comoUsuario, conSistema } from '../../server/db/contextoRls.js';
import { duenoDelEsquema } from '../helpers/ddl.js';
import { crearEscenario, crearTrabajo, crearUsuario } from '../helpers/fixtures.js';
import { filas, insertar, lit } from '../helpers/filasRls.js';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TABLAS, tablasDe } = require('../../server/db/rls.cjs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migracion = require('../../migrations/20261026100000-rls-tanda-3.cjs');

/**
 * Row Level Security de la tanda 3: contratos, solicitudes de cancelación y de cambio, cotizaciones, propuestas y notificaciones. Contra PostgreSQL de
 * verdad y con el rol real de la app (`doapp_app`). La escena: A contrata a B (contrato, trabajo y partes reales); C y D son terceros.
 */
describe('RLS tanda 3: cada parte ve solo lo suyo', () => {
  let A: any, B: any, C: any, D: any, admin: any, soporte: any, contrato: any, job: any;
  const creados: Array<{ tabla: string; id: string }> = [];
  const como = (u: () => any, rol = 'user') => <T>(fn: () => Promise<T>) => comoUsuario(u().id, rol, fn);
  const comoA = como(() => A);
  const comoB = como(() => B);
  const comoC = como(() => C);
  const comoAdmin = como(() => admin, 'admin');
  const comoSoporte = como(() => soporte, 'support');
  type Como = <T>(fn: () => Promise<T>) => Promise<T>;

  beforeAll(async () => {
    const e = await crearEscenario();
    A = e.cliente;
    B = e.trabajador;
    contrato = e.contrato;
    job = e.job;
    C = await crearUsuario({});
    D = await crearUsuario({});
    admin = await crearUsuario({ adminRole: 'admin', role: 'admin' });
    soporte = await crearUsuario({ adminRole: 'support', role: 'support' });
  });

  afterAll(async () => {
    try {
      await conSistema(async () => {
        for (const c of [...creados].reverse()) await sequelize.query(`DELETE FROM "${c.tabla}" WHERE id = '${c.id}'`).catch(() => undefined);
        await sequelize.query(`DELETE FROM notifications WHERE recipient_id IN ('${A.id}', '${B.id}', '${C.id}')`).catch(() => undefined);
        await User.destroy({ where: { id: [C.id, D.id, admin.id, soporte.id] } as any, force: true });
      });
    } catch {
      /* el próximo DROP SCHEMA lo limpia */
    }
  });

  const nueva = async (tabla: string, over: Record<string, string>, quien?: Como) => {
    const fila = quien ? await quien(() => insertar(tabla, over, true)) : await insertar(tabla, over);
    creados.push({ tabla, id: fila.id });
    return fila;
  };

  it('las seis tablas de la tanda 3 tienen RLS y sus cuatro políticas (SELECT, INSERT, UPDATE, DELETE)', async () => {
    const t3: string[] = tablasDe([3]);
    expect([...t3].sort()).toEqual(['contract_cancellation_requests', 'contract_change_requests', 'contracts', 'notifications', 'proposals', 'quotes']);
    const rls = await conSistema(() => filas<{ relname: string; relrowsecurity: boolean }>(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN (:t)`, { t: t3 }));
    expect(rls.every((r) => r.relrowsecurity)).toBe(true);
    expect(rls).toHaveLength(6);
    const politicas = await conSistema(() => filas<{ tablename: string; cmd: string }>(`SELECT tablename, cmd FROM pg_policies WHERE tablename IN (:t)`, { t: t3 }));
    for (const t of t3) expect(politicas.filter((p) => p.tablename === t).map((p) => p.cmd).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
  });

  // — Tablas de dos partes: una fila entre `a` y `b` —
  // Cada fila nueva lleva lo suyo propio donde la base exige que no se repita (una sola solicitud pendiente por contrato, una propuesta por trabajo y persona).
  const ENTRE_DOS: Array<{ tabla: string; entre: (a: string, b: string) => Promise<Record<string, string>> | Record<string, string> }> = [
    { tabla: 'contracts', entre: (a, b) => ({ client_id: lit(a), doer_id: lit(b), job_id: lit(job.id) }) },
    { tabla: 'contract_cancellation_requests', entre: (a, b) => ({ contract_id: lit(contrato.id), job_id: lit(job.id), requested_by: lit(a), other_party_id: lit(b) }) },
    // La visibilidad de una solicitud de cambio es la del contrato al que pertenece (el de A con B).
    { tabla: 'contract_change_requests', entre: async (a, b) => ({ contract_id: lit((await nueva('contracts', { client_id: lit(A.id), doer_id: lit(B.id), job_id: lit(job.id) })).id), requested_by: lit(a) }) },
    { tabla: 'quotes', entre: (a, b) => ({ sender_id: lit(a), recipient_id: lit(b) }) },
    { tabla: 'proposals', entre: async (a, b) => ({ job_id: lit((await crearTrabajo(a)).id), client_id: lit(a), freelancer_id: lit(b) }) },
  ];

  describe.each(ENTRE_DOS)('$tabla', ({ tabla, entre }) => {
    const equipo = TABLAS[tabla].equipo === 'equipo';
    const borra = TABLAS[tabla].borra === 'mia';
    let fila: any;
    const ver = (quien: Como) => quien(() => filas(`SELECT id FROM "${tabla}" WHERE id = '${fila.id}'`));

    beforeAll(async () => {
      fila = await nueva(tabla, await entre(A.id, B.id));
    });

    it('las dos partes la ven, un tercero no, y administración sí', async () => {
      expect(await ver(comoA)).toHaveLength(1);
      expect(await ver(comoB)).toHaveLength(1);
      expect(await ver(comoC)).toHaveLength(0);
      expect(await ver(comoAdmin)).toHaveLength(1);
      expect(await conSistema(() => filas(`SELECT id FROM "${tabla}" WHERE id = '${fila.id}'`))).toHaveLength(1);
    });

    it(equipo ? 'soporte también la ve y la trabaja' : 'soporte NO la ve (solo administración y el sistema)', async () => {
      expect(await ver(comoSoporte)).toHaveLength(equipo ? 1 : 0);
    });

    it('una inyección SQL («OR 1=1») de un tercero no la devuelve', async () => {
      const r = await comoC(() => filas<{ id: string }>(`SELECT id FROM "${tabla}" WHERE id = '${fila.id}' OR '1'='1'`));
      expect(r.map((x) => x.id)).not.toContain(fila.id);
    });

    it('un tercero no escribe una fila entre otros dos, y no modifica ni borra la de ellos', async () => {
      const entreAB = await entre(A.id, B.id);
      await expect(comoC(() => insertar(tabla, entreAB, true))).rejects.toThrow(/row-level security|política de seguridad/i);
      expect(await comoC(() => filas(`UPDATE "${tabla}" SET id = id WHERE id = '${fila.id}' RETURNING 1`))).toEqual([]);
      expect(await comoC(() => filas(`DELETE FROM "${tabla}" WHERE id = '${fila.id}' RETURNING 1`))).toEqual([]);
      expect(await conSistema(() => filas(`SELECT id FROM "${tabla}" WHERE id = '${fila.id}'`))).toHaveLength(1);
    });

    it('una parte sí escribe donde participa, y la otra parte puede modificarla', async () => {
      const propia = await nueva(tabla, await entre(A.id, B.id), comoA);
      expect(propia.id).toBeTruthy();
      // La otra parte responde (una solicitud de cambio la pide una y la responde la otra; la cotización la acepta quien la recibe).
      expect(await comoB(() => filas(`UPDATE "${tabla}" SET id = id WHERE id = '${propia.id}' RETURNING 1`))).toHaveLength(1);
    });

    it(borra ? 'quien participa la borra; un tercero no' : 'borrar es solo del sistema: ni una parte ni un administrador la borran desde la app', async () => {
      const f = await nueva(tabla, await entre(A.id, B.id));
      expect(await comoC(() => filas(`DELETE FROM "${tabla}" WHERE id = '${f.id}' RETURNING 1`))).toEqual([]);
      expect(await comoAdmin(() => filas(`DELETE FROM "${tabla}" WHERE id = '${f.id}' RETURNING 1`))).toEqual([]);
      const hechas = await comoA(() => filas(`DELETE FROM "${tabla}" WHERE id = '${f.id}' RETURNING 1`));
      expect(hechas).toHaveLength(borra ? 1 : 0);
    });
  });

  it('un contrato lo ven y lo trabajan las dos partes y el equipo; el equipo también lo modifica', async () => {
    const c = await nueva('contracts', { client_id: lit(A.id), doer_id: lit(B.id), job_id: lit(job.id) });
    expect(await comoSoporte(() => filas(`UPDATE contracts SET updated_at = now() WHERE id = '${c.id}' RETURNING 1`))).toHaveLength(1);
  });

  it('un contrato entre dos terceros no le aparece a quien no participa, ni siquiera por id', async () => {
    const ajeno = await nueva('contracts', { client_id: lit(C.id), doer_id: lit(D.id), job_id: lit(job.id) });
    expect(await comoA(() => filas(`SELECT id FROM contracts WHERE id = '${ajeno.id}'`))).toEqual([]);
    expect(await comoB(() => filas(`SELECT count(*)::int AS n FROM contracts WHERE doer_id = '${D.id}'`))).toEqual([{ n: 0 }]);
    expect(await comoUsuario(D.id, 'user', () => filas(`SELECT id FROM contracts WHERE id = '${ajeno.id}'`))).toHaveLength(1);
  });

  it('una propuesta no la ven los otros postulantes del mismo trabajo', async () => {
    const j2 = await crearTrabajo(A.id);
    const mia = await nueva('proposals', { job_id: lit(j2.id), client_id: lit(A.id), freelancer_id: lit(B.id) });
    const deD = await nueva('proposals', { job_id: lit(j2.id), client_id: lit(A.id), freelancer_id: lit(D.id) });
    const ids = (r: Array<{ id: string }>) => r.map((x) => x.id);
    const comoDD = como(() => D);
    expect(ids(await comoDD(() => filas<{ id: string }>(`SELECT id FROM proposals WHERE job_id = '${j2.id}'`)))).toEqual([deD.id]);
    expect(ids(await comoB(() => filas<{ id: string }>(`SELECT id FROM proposals WHERE job_id = '${j2.id}'`)))).toContain(mia.id);
    expect(ids(await comoB(() => filas<{ id: string }>(`SELECT id FROM proposals WHERE job_id = '${j2.id}'`)))).not.toContain(deD.id);
    // El dueño del trabajo ve las dos.
    expect(ids(await comoA(() => filas<{ id: string }>(`SELECT id FROM proposals WHERE job_id = '${j2.id}'`)))).toEqual(expect.arrayContaining([mia.id, deD.id]));
  });

  describe('notificaciones', () => {
    it('crear una para otra persona anda (el cliente le avisa al trabajador), pero el cliente no la puede leer después', async () => {
      const n: any = await comoA(() => Notification.create({ recipientId: B.id, category: 'contract', type: 'info', title: 'Te eligieron', message: 'Te eligieron para un trabajo' } as any));
      expect(n.id).toBeTruthy();
      expect(await comoB(() => filas(`SELECT id FROM notifications WHERE id = '${n.id}'`))).toHaveLength(1);
      expect(await comoA(() => filas(`SELECT id FROM notifications WHERE id = '${n.id}'`))).toEqual([]);
      expect(await comoC(() => filas(`SELECT id FROM notifications WHERE id = '${n.id}'`))).toEqual([]);
      expect(await comoAdmin(() => filas(`SELECT id FROM notifications WHERE id = '${n.id}'`))).toHaveLength(1);
    });

    it('«crear» por SQL directo (una inyección) para otra persona NO anda: solo Notification.create lo hace como sistema', async () => {
      await expect(comoC(() => insertar('notifications', { recipient_id: lit(B.id) }, true))).rejects.toThrow(/row-level security|política de seguridad/i);
      const propia = await comoC(() => insertar('notifications', { recipient_id: lit(C.id) }, true));
      creados.push({ tabla: 'notifications', id: propia.id });
    });

    it('la persona destinataria la marca como leída y la borra; las demás no', async () => {
      const n: any = await comoA(() => Notification.create({ recipientId: B.id, category: 'contract', type: 'info', title: 'Hola', message: 'Hola' } as any));
      expect(await comoC(() => filas(`UPDATE notifications SET read = true WHERE id = '${n.id}' RETURNING 1`))).toEqual([]);
      expect(await comoA(() => filas(`UPDATE notifications SET read = true WHERE id = '${n.id}' RETURNING 1`))).toEqual([]);
      expect(await comoB(() => filas(`UPDATE notifications SET read = true WHERE id = '${n.id}' RETURNING 1`))).toHaveLength(1);
      expect(await comoC(() => filas(`DELETE FROM notifications WHERE id = '${n.id}' RETURNING 1`))).toEqual([]);
      expect(await comoB(() => filas(`DELETE FROM notifications WHERE id = '${n.id}' RETURNING 1`))).toHaveLength(1);
    });

    it('crear varias a la vez (bulkCreate) también corre como sistema', async () => {
      const r: any[] = await comoA(() => Notification.bulkCreate([
        { recipientId: B.id, category: 'system', type: 'info', title: 'uno', message: 'uno' },
        { recipientId: C.id, category: 'system', type: 'info', title: 'dos', message: 'dos' },
      ] as any));
      expect(r).toHaveLength(2);
      expect(await comoC(() => filas(`SELECT id FROM notifications WHERE id = '${r[0].id}'`))).toEqual([]);
      expect(await comoC(() => filas(`SELECT id FROM notifications WHERE id = '${r[1].id}'`))).toHaveLength(1);
    });
  });
});

/** La migración real (la del deploy): idempotente, se deshace y deshecha la app vuelve a ver todo. Se corre con el dueño de la base. */
describe('migración de RLS tanda 3: up idempotente, down y vuelta a aplicar', () => {
  const qi = () => duenoDelEsquema().getQueryInterface();
  const politicas = async () =>
    (await duenoDelEsquema().query(`SELECT count(*)::int AS n FROM pg_policies WHERE tablename IN (:t)`, { type: QueryTypes.SELECT, replacements: { t: tablasDe([3]) } })) as any[];

  afterAll(async () => {
    await migracion.up(qi()); // los tests que siguen asumen RLS aplicada
  });

  it('aplicada dos veces queda igual: 24 políticas (4 por tabla, 6 tablas)', async () => {
    await migracion.up(qi());
    await migracion.up(qi());
    expect((await politicas())[0].n).toBe(24);
  });

  it('deshecha (down) desaparecen las políticas de la tanda 3 y no se tocan las anteriores', async () => {
    await migracion.down(qi());
    expect((await politicas())[0].n).toBe(0);
    const otras = (await duenoDelEsquema().query(`SELECT count(*)::int AS n FROM pg_policies WHERE tablename IN (:t)`, { type: QueryTypes.SELECT, replacements: { t: tablasDe(['dinero', 1, 2]) } })) as any[];
    expect(otras[0].n).toBe(60);
  });

  it('y se puede volver a aplicar; si el usuario de la base no puede, NO falla (no frena un deploy)', async () => {
    await migracion.up(qi());
    expect((await politicas())[0].n).toBe(24);
    const roto: any = { sequelize: { query: async () => { throw new Error('permission denied to create role'); } } };
    await expect(migracion.up(roto)).resolves.toBeUndefined();
  });
});
