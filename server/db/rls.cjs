/**
 * Row Level Security (RLS) de PostgreSQL para las tablas de dinero.
 *
 * Un solo lugar con el SQL: lo usan la migración (`migrations/20261017100000-rls-tablas-de-dinero.cjs`) y los tests de integración, así que
 * lo que se prueba es exactamente lo que se aplica en producción.
 *
 * CÓMO FUNCIONA
 *  - La app corre con su usuario de siempre y, ya levantada, pasa a actuar como el rol `doapp_app` (SET ROLE, ver `server/db/contextoRls.ts`).
 *    `doapp_app` NO es superusuario ni dueño de las tablas ni tiene BYPASSRLS: por eso las políticas SÍ le aplican. (Un superusuario o el dueño
 *    de la tabla se salta el RLS sin avisar: sin este cambio de rol, habilitar RLS no protegería nada.)
 *  - Cada pedido autenticado le dice a la base quién es (`app.user_id`, `app.role`). Cada conexión, al salir del pool, recibe el contexto del
 *    pedido que la usa. Sin pedido (cron, webhooks, arranque, scripts) el contexto es «sistema».
 *  - FALLA CERRADO: si una conexión llega sin contexto, no ve ninguna fila.
 *
 * QUÉ PROTEGE: si una ruta tiene un error (un `findByPk(id)` sin filtrar por dueño), o si alguien logra inyectar SQL, la base igual solo
 * devuelve las filas del usuario autenticado. Los filtros de la aplicación siguen siendo la primera línea; esto es la segunda.
 *
 * QUÉ NO PROTEGE: a quien tenga la clave del superusuario de la base, ni a los pedidos sin sesión (webhooks, cron) que corren como «sistema».
 *
 * Políticas separadas por operación (SELECT / INSERT / UPDATE / DELETE), una por tabla.
 */

const ROL_DE_LA_APP = 'doapp_app';

/** tabla → cómo se decide que una fila es «mía». */
const TABLAS = {
  balance_transactions: { mia: 'user_id = app_usuario()' },
  withdrawal_requests: { mia: 'user_id = app_usuario()' },
  // En un pago participan dos: quien paga y quien cobra.
  payments: { mia: '(payer_id = app_usuario() OR recipient_id = app_usuario())' },
};

const FUNCIONES = `
CREATE OR REPLACE FUNCTION app_sistema() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT COALESCE(current_setting('app.system', true), 'off') = 'on' $$;

CREATE OR REPLACE FUNCTION app_usuario() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_es_admin() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT COALESCE(current_setting('app.role', true), '') IN ('owner', 'super_admin', 'admin') $$;

CREATE OR REPLACE FUNCTION app_es_soporte() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT COALESCE(current_setting('app.role', true), '') IN ('owner', 'super_admin', 'admin', 'support') $$;
`;

/** Las sentencias que crean el rol, los permisos y las funciones. Idempotentes. */
function sqlDelRol() {
  return [
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROL_DE_LA_APP}') THEN
         CREATE ROLE ${ROL_DE_LA_APP} NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
       END IF;
     END $$;`,
    // El usuario con que conecta la app tiene que poder pasar a este rol (SET ROLE).
    `DO $$ BEGIN
       EXECUTE format('GRANT ${ROL_DE_LA_APP} TO %I', current_user);
     EXCEPTION WHEN OTHERS THEN
       RAISE NOTICE 'no se pudo hacer GRANT del rol a %: %', current_user, SQLERRM;
     END $$;`,
    `GRANT USAGE ON SCHEMA public TO ${ROL_DE_LA_APP}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL_DE_LA_APP}`,
    `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${ROL_DE_LA_APP}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${ROL_DE_LA_APP}`,
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${ROL_DE_LA_APP}`,
    FUNCIONES,
  ];
}

/** Las sentencias que habilitan RLS y crean las políticas de una tabla (si la tabla existe). */
function sqlDeLaTabla(tabla) {
  const { mia } = TABLAS[tabla];
  const duenoOSistema = `app_sistema() OR app_es_admin() OR ${mia}`;
  const lectura = tabla === 'payments' ? `app_sistema() OR app_es_soporte() OR ${mia}` : duenoOSistema;
  return [
    `ALTER TABLE ${tabla} ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS ${tabla}_select ON ${tabla}`,
    `DROP POLICY IF EXISTS ${tabla}_insert ON ${tabla}`,
    `DROP POLICY IF EXISTS ${tabla}_update ON ${tabla}`,
    `DROP POLICY IF EXISTS ${tabla}_delete ON ${tabla}`,
    `CREATE POLICY ${tabla}_select ON ${tabla} FOR SELECT USING (${lectura})`,
    `CREATE POLICY ${tabla}_insert ON ${tabla} FOR INSERT WITH CHECK (${duenoOSistema})`,
    `CREATE POLICY ${tabla}_update ON ${tabla} FOR UPDATE USING (${duenoOSistema}) WITH CHECK (${duenoOSistema})`,
    // Borrar es solo del sistema: ni un usuario ni un admin borran asientos de dinero desde la app.
    `CREATE POLICY ${tabla}_delete ON ${tabla} FOR DELETE USING (app_sistema())`,
  ];
}

/**
 * Aplica todo. `ejecutar(sql)` es la función que corre una sentencia (queryInterface.sequelize.query, o sequelize.query).
 * Devuelve qué tablas quedaron protegidas y cuáles se saltearon por no existir.
 */
async function aplicarRls(ejecutar) {
  const protegidas = [];
  const saltadas = [];
  for (const sql of sqlDelRol()) await ejecutar(sql);
  for (const tabla of Object.keys(TABLAS)) {
    const existe = await ejecutar(`SELECT to_regclass('public.${tabla}') AS t`, true);
    if (!existe) {
      saltadas.push(tabla);
      continue;
    }
    // Si el usuario con que conecta la app NO es superusuario ni dueño de la tabla, el RLS le aplicaría YA (sin esperar al interruptor) y la
    // app dejaría de ver filas. En ese caso no se toca la tabla: se avisa y se resuelve a mano.
    const inmune = await ejecutar(
      `SELECT ((SELECT rolsuper FROM pg_roles WHERE rolname = current_user) OR pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid = 'public.${tabla}'::regclass)) = current_user) AS t`,
      true,
    );
    if (!inmune) {
      saltadas.push(`${tabla} (el usuario de la base no es su dueño ni superusuario)`);
      continue;
    }
    for (const sql of sqlDeLaTabla(tabla)) await ejecutar(sql);
    protegidas.push(tabla);
  }
  return { protegidas, saltadas };
}

/** Deshace las políticas y el RLS de las tablas (el rol y las funciones quedan: no estorban). */
async function quitarRls(ejecutar) {
  for (const tabla of Object.keys(TABLAS)) {
    const existe = await ejecutar(`SELECT to_regclass('public.${tabla}') AS t`, true);
    if (!existe) continue;
    for (const op of ['select', 'insert', 'update', 'delete']) await ejecutar(`DROP POLICY IF EXISTS ${tabla}_${op} ON ${tabla}`);
    await ejecutar(`ALTER TABLE ${tabla} DISABLE ROW LEVEL SECURITY`);
  }
}

module.exports = { ROL_DE_LA_APP, TABLAS, aplicarRls, quitarRls, sqlDelRol, sqlDeLaTabla };
