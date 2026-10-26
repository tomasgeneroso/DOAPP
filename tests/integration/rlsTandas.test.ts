import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../server/config/database.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { comoUsuario, conSistema, estadoDeLaBase } from '../../server/db/contextoRls.js';
import { duenoDelEsquema } from '../helpers/ddl.js';
import { crearEscenario, crearUsuario } from '../helpers/fixtures.js';
import { siguienteNumeroDeTicket } from '../../server/services/numeroDeTicket.js';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TABLAS, SOLO_AGREGAR, tablasDe } = require('../../server/db/rls.cjs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const migracion = require('../../migrations/20261025110000-rls-tandas-1-y-2.cjs');

/**
 * Row Level Security de las tandas 1 (datos personales: sesiones, comprobantes, facturas, dispositivos, consentimientos, membresías) y 2
 * (privacidad entre dos partes: chats, tickets, disputas), y el rastro de solo agregar (audit_logs, data_access_logs). Contra PostgreSQL de
 * verdad y con el rol real de la app (`doapp_app`). Sin mocks: lo que se prueba es lo que la base decide.
 *
 * Las filas se crean por SQL con valores de relleno para todo lo obligatorio (una sola función sirve a las doce tablas), así que el test no
 * depende de cómo cada modelo arma su fila: depende solo de lo que dicen las políticas.
 */
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const filas = <T extends object = any>(sql: string, replacements?: Record<string, unknown>) => sequelize.query<T>(sql, { type: QueryTypes.SELECT, replacements });

interface Col { column_name: string; udt_name: string; data_type: string; character_maximum_length: number | null }

async function relleno(c: Col): Promise<string> {
  const u = c.udt_name;
  const largo = Math.min(c.character_maximum_length ?? 30, 30);
  if (u === 'uuid') return `md5(random()::text || clock_timestamp()::text)::uuid`;
  if (['text', 'varchar', 'bpchar'].includes(u)) return `substr(md5(random()::text || clock_timestamp()::text), 1, ${largo})`;
  if (['int2', 'int4', 'int8', 'numeric', 'float4', 'float8'].includes(u)) return '0';
  if (u === 'bool') return 'false';
  if (u === 'timestamptz' || u === 'timestamp') return 'now()';
  if (u === 'date') return 'current_date';
  if (u === 'jsonb' || u === 'json') return `'{}'::${u}`;
  if (u === 'bytea') return `'\\x00'::bytea`;
  if (u === 'inet') return `'127.0.0.1'::inet`;
  if (u.startsWith('_')) return `'{}'`;
  if (c.data_type === 'USER-DEFINED') {
    const [e] = await filas<{ enumlabel: string }>(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = :u ORDER BY e.enumsortorder LIMIT 1`, { u });
    return `${lit(e.enumlabel)}::"${u}"`;
  }
  throw new Error(`sin valor de relleno para ${c.column_name} (${u})`);
}

/** Inserta una fila con todo lo obligatorio relleno; `over` pisa columnas con expresiones SQL. Devuelve la fila insertada. */
async function insertar(tabla: string, over: Record<string, string>, comoApp = false): Promise<any> {
  const hacer = async () => {
    const cols = await filas<Col>(
      `SELECT column_name, udt_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_schema = 'public' AND table_name = :t AND is_nullable = 'NO' AND column_default IS NULL`,
      { t: tabla },
    );
    const valores: Record<string, string> = {};
    for (const c of cols) valores[c.column_name] = await relleno(c);
    Object.assign(valores, over);
    const nombres = Object.keys(valores).map((c) => `"${c}"`).join(', ');
    try {
      const [fila] = await filas(`INSERT INTO "${tabla}" (${nombres}) VALUES (${Object.values(valores).join(', ')}) RETURNING *`);
      return fila;
    } catch (e: any) {
      const p = e?.parent ?? e?.original;
      throw new Error(`${tabla}: ${p?.message ?? e?.message}${p?.code ? ` [${p.code}]` : ''}`);
    }
  };
  return comoApp ? hacer() : conSistema(hacer);
}

describe('RLS tandas 1 y 2: cada usuario ve solo lo suyo', () => {
  let A: any, B: any, C: any, D: any, admin: any, soporte: any, contrato: any, pagoAB: any, pagoAD: any, pagoBD: any;
  const creados: Array<{ tabla: string; col: string; valor: string }> = [];
  const comoA = <T>(fn: () => Promise<T>) => comoUsuario(A.id, 'user', fn);
  const comoB = <T>(fn: () => Promise<T>) => comoUsuario(B.id, 'user', fn);
  const comoC = <T>(fn: () => Promise<T>) => comoUsuario(C.id, 'user', fn);
  const comoAdmin = <T>(fn: () => Promise<T>) => comoUsuario(admin.id, 'admin', fn);
  const comoSoporte = <T>(fn: () => Promise<T>) => comoUsuario(soporte.id, 'support', fn);

  beforeAll(async () => {
    const e = await crearEscenario();
    A = e.cliente;
    B = e.trabajador;
    contrato = e.contrato;
    C = await crearUsuario({});
    D = await crearUsuario({});
    admin = await crearUsuario({ adminRole: 'admin', role: 'admin' });
    soporte = await crearUsuario({ adminRole: 'support', role: 'support' });
    const base = { currency: 'ARS', status: 'held_escrow', paymentType: 'contract_payment', paymentMethod: 'mercadopago', platformFee: 0, amount: 100 };
    pagoAB = await Payment.create({ ...base, payerId: A.id, recipientId: B.id } as any);
    pagoAD = await Payment.create({ ...base, payerId: A.id, recipientId: D.id } as any);
    pagoBD = await Payment.create({ ...base, payerId: B.id, recipientId: D.id } as any);
  });

  afterAll(async () => {
    try {
      await conSistema(async () => {
        for (const c of creados.reverse()) await sequelize.query(`DELETE FROM "${c.tabla}" WHERE "${c.col}" = ${c.valor}`).catch(() => undefined);
        await sequelize.query(`DELETE FROM payment_proofs WHERE payment_id IN ('${pagoAB.id}', '${pagoAD.id}', '${pagoBD.id}')`).catch(() => undefined);
        await Payment.destroy({ where: { id: [pagoAB.id, pagoAD.id, pagoBD.id] } as any });
        await User.destroy({ where: { id: [C.id, D.id, admin.id, soporte.id] } as any, force: true });
      });
    } catch {
      /* el próximo DROP SCHEMA lo limpia */
    }
  });

  const recordar = (tabla: string, col: string, valor: string) => creados.push({ tabla, col, valor });

  it('todas las tablas de las tandas 1 y 2 tienen RLS y sus cuatro políticas (SELECT, INSERT, UPDATE, DELETE)', async () => {
    const nuevas: string[] = tablasDe([1, 2]);
    expect(nuevas).toHaveLength(12);
    const rls = await conSistema(() => filas<{ relname: string; relrowsecurity: boolean }>(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN (:t)`, { t: nuevas }));
    expect(rls.map((r) => r.relname).sort()).toEqual([...nuevas].sort());
    expect(rls.every((r) => r.relrowsecurity)).toBe(true);
    const politicas = await conSistema(() => filas<{ tablename: string; cmd: string }>(`SELECT tablename, cmd FROM pg_policies WHERE tablename IN (:t)`, { t: nuevas }));
    for (const t of nuevas) expect(politicas.filter((p) => p.tablename === t).map((p) => p.cmd).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
  });

  // — Las tablas con una columna que dice de quién es la fila —
  const DE_UN_DUENO: Array<{ tabla: string; col: string; equipo?: boolean; extra?: (id: string) => Record<string, string> }> = [
    { tabla: 'refresh_tokens', col: 'user_id' },
    { tabla: 'password_reset_tokens', col: 'user_id' },
    { tabla: 'invoices', col: 'user_id' },
    { tabla: 'login_devices', col: 'userId' },
    { tabla: 'consent_logs', col: 'userId' },
    { tabla: 'memberships', col: 'user_id' },
    { tabla: 'action_passwords', col: 'created_by' },
    { tabla: 'payment_proofs', col: 'user_id', equipo: true, extra: (id) => ({ payment_id: lit(id === A.id ? pagoAD.id : pagoBD.id) }) },
    { tabla: 'tickets', col: 'created_by', equipo: true },
    { tabla: 'disputes', col: 'initiated_by', equipo: true, extra: () => ({ contract_id: lit(contrato.id) }) },
  ];

  describe.each(DE_UN_DUENO)('$tabla', ({ tabla, col, equipo, extra }) => {
    const sobre = (id: string) => `"${col}" = ${lit(id)}`;
    const dueños = () => `"${col}" IN (${lit(A.id)}, ${lit(B.id)})`;
    // Una disputa necesita una contraparte; el resto no.
    const fila = (id: string) => ({ [col]: lit(id), ...(tabla === 'disputes' ? { against: lit(D.id) } : {}), ...(extra?.(id) ?? {}) });
    const verLosDos = (quien: <T>(fn: () => Promise<T>) => Promise<T>) => quien(() => filas<any>(`SELECT "${col}" AS dueno FROM "${tabla}" WHERE ${dueños()}`));

    beforeAll(async () => {
      await insertar(tabla, fila(A.id));
      await insertar(tabla, fila(B.id));
      recordar(tabla, col, lit(A.id));
      recordar(tabla, col, lit(B.id));
    });

    it('cada uno ve solo sus filas; el sistema y los administradores ven todas', async () => {
      expect((await verLosDos(comoA)).map((r) => r.dueno)).toEqual([A.id]);
      expect((await verLosDos(comoB)).map((r) => r.dueno)).toEqual([B.id]);
      expect(await verLosDos(comoC)).toEqual([]);
      expect(await verLosDos(comoAdmin)).toHaveLength(2);
      expect(await conSistema(() => filas(`SELECT 1 FROM "${tabla}" WHERE ${dueños()}`))).toHaveLength(2);
    });

    it(equipo ? 'soporte también las ve' : 'soporte NO las ve (solo administración y el sistema)', async () => {
      expect(await verLosDos(comoSoporte)).toHaveLength(equipo ? 2 : 0);
    });

    it('una inyección SQL («OR 1=1») devuelve igual solo las filas propias', async () => {
      const r = await comoA(() => filas<any>(`SELECT "${col}" AS dueno FROM "${tabla}" WHERE ${sobre(A.id)} OR '1'='1'`));
      expect(new Set(r.map((x) => x.dueno))).toEqual(new Set([A.id]));
    });

    it('A no puede escribir una fila a nombre de B, y no modifica ni borra las de B', async () => {
      await expect(comoA(() => insertar(tabla, fila(B.id), true))).rejects.toThrow(/row-level security|política de seguridad/i);
      expect(await comoA(() => filas(`UPDATE "${tabla}" SET "${col}" = "${col}" WHERE ${sobre(B.id)} RETURNING 1`))).toEqual([]);
      expect(await comoA(() => filas(`DELETE FROM "${tabla}" WHERE ${sobre(B.id)} RETURNING 1`))).toEqual([]);
      expect(await conSistema(() => filas(`SELECT 1 FROM "${tabla}" WHERE ${sobre(B.id)}`))).toHaveLength(1);
    });

    it('A sí escribe a su nombre', async () => {
      await conSistema(() => sequelize.query(`DELETE FROM "${tabla}" WHERE ${sobre(A.id)}`)); // hay tablas con una sola fila por usuario
      await comoA(() => insertar(tabla, fila(A.id), true));
      expect(await conSistema(() => filas(`SELECT 1 FROM "${tabla}" WHERE ${sobre(A.id)}`))).toHaveLength(1);
    });

    it(TABLAS[tabla].borra === 'mia' ? 'el dueño borra las suyas' : 'borrar es solo del sistema: ni el dueño ni un administrador borran desde la app', async () => {
      const borra = TABLAS[tabla].borra === 'mia';
      const propias = async () => (await conSistema(() => filas(`SELECT 1 FROM "${tabla}" WHERE ${sobre(A.id)}`))).length;
      const antes = await propias();
      expect(antes).toBeGreaterThan(0);
      // Un administrador no borra filas ajenas desde la app, en ninguna de estas tablas.
      expect(await comoAdmin(() => filas(`DELETE FROM "${tabla}" WHERE ${sobre(A.id)} RETURNING 1`))).toEqual([]);
      const hechas = await comoA(() => filas(`DELETE FROM "${tabla}" WHERE ${sobre(A.id)} RETURNING 1`));
      if (borra) {
        expect(hechas).toHaveLength(antes);
        expect(await propias()).toBe(0);
      } else {
        expect(hechas).toEqual([]);
        expect(await propias()).toBe(antes);
      }
    });
  });

  // — Casos con dos partes —
  it('un comprobante lo ven quien lo subió y los que participan del pago, y nadie más', async () => {
    const p = await insertar('payment_proofs', { user_id: lit(A.id), payment_id: lit(pagoAB.id) });
    const ver = (q: <T>(fn: () => Promise<T>) => Promise<T>) => q(() => filas(`SELECT 1 FROM payment_proofs WHERE id = '${p.id}'`));
    expect(await ver(comoA)).toHaveLength(1); // quien lo subió
    expect(await ver(comoB)).toHaveLength(1); // quien cobra el pago
    expect(await ver(comoC)).toHaveLength(0);
  });

  it('un ticket NO lo ve la persona reportada; sí lo ve y lo trabaja el equipo de soporte', async () => {
    const t = await insertar('tickets', { created_by: lit(A.id), related_user: lit(B.id) });
    const ver = (q: <T>(fn: () => Promise<T>) => Promise<T>) => q(() => filas(`SELECT 1 FROM tickets WHERE id = '${t.id}'`));
    expect(await ver(comoA)).toHaveLength(1);
    expect(await ver(comoB)).toHaveLength(0);
    expect(await ver(comoSoporte)).toHaveLength(1);
    const asignado = await comoSoporte(() => filas(`UPDATE tickets SET assigned_to = '${soporte.id}' WHERE id = '${t.id}' RETURNING 1`));
    expect(asignado).toHaveLength(1);
    recordar('tickets', 'id', lit(t.id));
  });

  it('el número de ticket no depende de qué tickets ve quien escribe: con RLS cada uno ve solo los suyos y el conteo viejo repetía números', async () => {
    const numeros = await Promise.all([comoA, comoB, comoC, comoA, comoB].map((como) => como(() => siguienteNumeroDeTicket(sequelize))));
    expect(new Set(numeros).size).toBe(5);
    for (const n of numeros) expect(n).toMatch(/^TK-\d{6,}$/);
  });

  it('una disputa la ven los dos que la protagonizan y el equipo; un tercero no', async () => {
    const d = await insertar('disputes', { initiated_by: lit(A.id), against: lit(B.id), contract_id: lit(contrato.id) });
    const ver = (q: <T>(fn: () => Promise<T>) => Promise<T>) => q(() => filas(`SELECT 1 FROM disputes WHERE id = '${d.id}'`));
    expect(await ver(comoA)).toHaveLength(1);
    expect(await ver(comoB)).toHaveLength(1);
    expect(await ver(comoC)).toHaveLength(0);
    expect(await ver(comoSoporte)).toHaveLength(1);
    expect(await comoSoporte(() => filas(`UPDATE disputes SET priority = priority WHERE id = '${d.id}' RETURNING 1`))).toHaveLength(1);
    recordar('disputes', 'id', lit(d.id));
  });

  it('un chat es solo de sus participantes: los mensajes los ven y los escriben ellos, y un tercero no puede escribir en el chat ajeno', async () => {
    const conv = await insertar('conversations', { participants: `ARRAY['${A.id}','${B.id}']::uuid[]` });
    const msg = await insertar('chat_messages', { conversation_id: lit(conv.id), sender_id: lit(A.id) });
    const verConv = (q: <T>(fn: () => Promise<T>) => Promise<T>) => q(() => filas(`SELECT 1 FROM conversations WHERE id = '${conv.id}'`));
    const verMsg = (q: <T>(fn: () => Promise<T>) => Promise<T>) => q(() => filas(`SELECT 1 FROM chat_messages WHERE id = '${msg.id}'`));
    expect(await verConv(comoA)).toHaveLength(1);
    expect(await verConv(comoB)).toHaveLength(1);
    expect(await verConv(comoC)).toHaveLength(0);
    expect(await verMsg(comoB)).toHaveLength(1); // B lee lo que escribió A
    expect(await verMsg(comoC)).toHaveLength(0);
    // B contesta en el chat; C no puede meterse (ni poniéndose como remitente).
    await expect(comoB(() => insertar('chat_messages', { conversation_id: lit(conv.id), sender_id: lit(B.id) }, true))).resolves.toBeTruthy();
    await expect(comoC(() => insertar('chat_messages', { conversation_id: lit(conv.id), sender_id: lit(C.id) }, true))).rejects.toThrow(/row-level security|política de seguridad/i);
    // Nadie crea una conversación entre otros dos.
    await expect(comoC(() => insertar('conversations', { participants: `ARRAY['${A.id}','${B.id}']::uuid[]` }, true))).rejects.toThrow(/row-level security|política de seguridad/i);
    // Un participante la borra (con sus mensajes); un tercero no.
    expect(await comoC(() => filas(`DELETE FROM chat_messages WHERE conversation_id = '${conv.id}' RETURNING 1`))).toEqual([]);
    expect((await comoA(() => filas(`DELETE FROM chat_messages WHERE conversation_id = '${conv.id}' RETURNING 1`))).length).toBeGreaterThan(0);
    expect(await comoC(() => filas(`DELETE FROM conversations WHERE id = '${conv.id}' RETURNING 1`))).toEqual([]);
    expect(await comoA(() => filas(`DELETE FROM conversations WHERE id = '${conv.id}' RETURNING 1`))).toHaveLength(1);
  });

  it('sin pedido de usuario (cron, webhooks, arranque) la app corre como sistema y ve todo, como antes', async () => {
    expect((await filas(`SELECT 1 FROM tickets LIMIT 1`)).length).toBeGreaterThanOrEqual(0);
    await insertar('refresh_tokens', { user_id: lit(C.id) });
    recordar('refresh_tokens', 'user_id', lit(C.id));
    expect(await filas(`SELECT 1 FROM refresh_tokens WHERE user_id = '${C.id}'`)).toHaveLength(1);
  });

  // — El rastro de solo agregar —
  describe('audit_logs y data_access_logs: la app solo lee y agrega', () => {
    const error = (fn: () => Promise<unknown>) => fn().then(() => null, (e: any) => `${e?.parent?.code ?? e?.original?.code ?? ''} ${e?.parent?.message ?? e?.message}`.trim());

    it('la app puede agregar y leer, pero NO modificar ni borrar el rastro (permission denied)', async () => {
      for (const t of SOLO_AGREGAR as string[]) {
        const f = await comoA(() => insertar(t, t === 'data_access_logs' ? { userId: lit(A.id), accessedBy: lit(A.id) } : {}, true));
        expect(f).toBeTruthy();
        expect(await comoA(() => filas(`SELECT 1 FROM "${t}" LIMIT 1`))).toHaveLength(1);
        expect(await comoA(() => error(() => sequelize.query(`UPDATE "${t}" SET id = id`)))).toMatch(/^42501/);
        expect(await comoA(() => error(() => sequelize.query(`DELETE FROM "${t}"`)))).toMatch(/^42501/);
        expect(await comoA(() => error(() => sequelize.query(`TRUNCATE "${t}"`)))).toMatch(/^42501/);
        // Ni siquiera «como sistema»: el sistema de la app es el mismo rol de la base.
        expect(await conSistema(() => error(() => sequelize.query(`DELETE FROM "${t}"`)))).toMatch(/^42501/);
      }
    });

    it('el arranque no toma el «solo agregar» por un permiso que falta', async () => {
      expect(await estadoDeLaBase(duenoDelEsquema())).toMatchObject({ permisos: true, sinPermiso: [] });
    });

    it('la depuración pasa por una función que solo borra lo viejo y no crítico, y no acepta menos de 30 días', async () => {
      const [{ enumlabel: leve }] = await filas<{ enumlabel: string }>(`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'enum_audit_logs_severity' AND e.enumlabel NOT IN ('critical', 'high') ORDER BY e.enumsortorder LIMIT 1`);
      const viejaLeve = await insertar('audit_logs', { createdAt: `now() - interval '200 days'`, severity: `${lit(leve)}::enum_audit_logs_severity` });
      const viejaCritica = await insertar('audit_logs', { createdAt: `now() - interval '200 days'`, severity: `'critical'::enum_audit_logs_severity` });
      const reciente = await insertar('audit_logs', { createdAt: 'now()', severity: `${lit(leve)}::enum_audit_logs_severity` });
      expect(await comoA(() => error(() => sequelize.query(`SELECT app_depurar_auditoria(5)`)))).toMatch(/30 días/);
      await comoA(() => sequelize.query(`SELECT app_depurar_auditoria(90)`));
      const quedan = await conSistema(() => filas<{ id: string }>(`SELECT id FROM audit_logs WHERE id IN ('${viejaLeve.id}', '${viejaCritica.id}', '${reciente.id}')`));
      expect(quedan.map((r) => r.id).sort()).toEqual([viejaCritica.id, reciente.id].sort());
      // El método del modelo usa la misma función.
      const { AuditLog } = await import('../../server/models/sql/AuditLog.model.js');
      await expect(comoA(() => AuditLog.cleanupOldLogs(90))).resolves.toEqual(expect.any(Number));
    });

    it('los accesos a datos se depuran a los 7 años y no antes', async () => {
      const vieja = await insertar('data_access_logs', { userId: lit(A.id), accessedBy: lit(A.id), timestamp: `now() - interval '8 years'` });
      const joven = await insertar('data_access_logs', { userId: lit(A.id), accessedBy: lit(A.id), timestamp: `now() - interval '6 years'` });
      await comoA(() => sequelize.query(`SELECT app_depurar_accesos()`));
      const quedan = await conSistema(() => filas<{ id: string }>(`SELECT id FROM data_access_logs WHERE id IN ('${vieja.id}', '${joven.id}')`));
      expect(quedan.map((r) => r.id)).toEqual([joven.id]);
    });
  });
});

/** La migración real (la del deploy): idempotente, se deshace y deshecha la app vuelve a ver todo. Se corre con el dueño de la base. */
describe('migración de RLS tandas 1 y 2: up idempotente, down y vuelta a aplicar', () => {
  const qi = () => duenoDelEsquema().getQueryInterface();
  const politicas = async () =>
    (await duenoDelEsquema().query(`SELECT count(*)::int AS n FROM pg_policies WHERE tablename IN (:t)`, { type: QueryTypes.SELECT, replacements: { t: tablasDe([1, 2]) } })) as any[];
  const privilegios = async () =>
    (await duenoDelEsquema().query(
      `SELECT t AS tabla, has_table_privilege('doapp_app', t, 'UPDATE') AS u, has_table_privilege('doapp_app', t, 'DELETE') AS d FROM unnest(ARRAY['audit_logs','data_access_logs']) AS t`,
      { type: QueryTypes.SELECT },
    )) as any[];

  afterAll(async () => {
    await migracion.up(qi()); // los tests que siguen asumen RLS aplicada
  });

  it('aplicada dos veces queda igual: 48 políticas (4 por tabla, 12 tablas) y el rastro sin UPDATE ni DELETE', async () => {
    await migracion.up(qi());
    await migracion.up(qi());
    expect((await politicas())[0].n).toBe(48);
    for (const p of await privilegios()) expect([p.tabla, p.u, p.d]).toEqual([p.tabla, false, false]);
  });

  it('deshecha (down): desaparecen las políticas de las tandas 1 y 2 y el rastro vuelve a poder modificarse; las de dinero no se tocan', async () => {
    await migracion.down(qi());
    expect((await politicas())[0].n).toBe(0);
    for (const p of await privilegios()) expect([p.tabla, p.u, p.d]).toEqual([p.tabla, true, true]);
    const dinero = (await duenoDelEsquema().query(`SELECT count(*)::int AS n FROM pg_policies WHERE tablename IN (:t)`, { type: QueryTypes.SELECT, replacements: { t: tablasDe(['dinero']) } })) as any[];
    expect(dinero[0].n).toBe(12);
  });

  it('y se puede volver a aplicar', async () => {
    await migracion.up(qi());
    expect((await politicas())[0].n).toBe(48);
  });

  it('si el usuario de la base no puede crear roles o las tablas no son suyas, la migración NO falla (no puede frenar un deploy)', async () => {
    const roto: any = { sequelize: { query: async () => { throw new Error('permission denied to create role'); } } };
    await expect(migracion.up(roto)).resolves.toBeUndefined();
  });
});
