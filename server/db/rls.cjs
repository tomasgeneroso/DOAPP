/**
 * Row Level Security (RLS) de PostgreSQL: las tablas de dinero (tanda `dinero`) y las de datos personales y privados (tandas 1 y 2).
 *
 * Un solo lugar con el SQL: lo usan las migraciones (`20261017100000-rls-tablas-de-dinero.cjs`, `20261025110000-rls-tandas-1-y-2.cjs`) y los tests
 * de integración, así que lo que se prueba es exactamente lo que se aplica en producción.
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

/**
 * tabla → cómo se decide que una fila es «mía» y qué más puede hacer cada uno.
 *  - `tanda`: en qué migración entró (`aplicarRls(ejecutar, { tandas })` deja aplicar solo algunas).
 *  - `mia`: la condición de una fila propia. Las columnas con mayúsculas van entre comillas dobles.
 *  - `equipo`: `'soporte'` = soporte también LEE (no escribe); `'equipo'` = todo el equipo de atención lee Y escribe (tickets, disputas).
 *    Sin esto solo administración, el sistema y el dueño de la fila.
 *  - `borra`: `'mia'` = el dueño de la fila también la borra (sus sesiones, sus dispositivos, sus chats). Sin esto, borrar es solo del sistema.
 */
const TABLAS = {
  // — Dinero —
  balance_transactions: { tanda: 'dinero', mia: 'user_id = app_usuario()' },
  withdrawal_requests: { tanda: 'dinero', mia: 'user_id = app_usuario()' },
  // En un pago participan dos: quien paga y quien cobra.
  payments: { tanda: 'dinero', mia: '(payer_id = app_usuario() OR recipient_id = app_usuario())', equipo: 'soporte' },

  // — Tanda 1: un dueño y un dato sensible —
  refresh_tokens: { tanda: 1, mia: 'user_id = app_usuario()', borra: 'mia' },
  password_reset_tokens: { tanda: 1, mia: 'user_id = app_usuario()', borra: 'mia' },
  // Un comprobante lo ven quien lo subió y quienes participan del pago (quien paga y quien cobra).
  payment_proofs: {
    tanda: 1,
    mia: '(user_id = app_usuario() OR payment_id IN (SELECT id FROM payments WHERE payer_id = app_usuario() OR recipient_id = app_usuario()))',
    equipo: 'soporte',
  },
  invoices: { tanda: 1, mia: 'user_id = app_usuario()' },
  login_devices: { tanda: 1, mia: '"userId" = app_usuario()', borra: 'mia' },
  consent_logs: { tanda: 1, mia: '"userId" = app_usuario()' },
  memberships: { tanda: 1, mia: 'user_id = app_usuario()' },
  // Contraseñas de acciones de administración: las ve quien las creó (y el dueño/administradores); nadie más.
  action_passwords: { tanda: 1, mia: 'created_by = app_usuario()' },

  // — Tanda 2: privacidad entre dos partes —
  conversations: { tanda: 2, mia: 'app_usuario() = ANY(participants)', borra: 'mia' },
  // Un mensaje lo ven y lo escriben solo quienes están en la conversación (si bastara con poner `sender_id` propio, cualquiera podría escribir en un chat ajeno).
  chat_messages: {
    tanda: 2,
    mia: 'conversation_id IN (SELECT id FROM conversations WHERE app_usuario() = ANY(participants))',
    borra: 'mia',
  },
  // Al reportado NO se le muestra el ticket que lo reporta: `related_user` no cuenta como «mío».
  tickets: { tanda: 2, mia: 'created_by = app_usuario()', equipo: 'equipo' },
  disputes: { tanda: 2, mia: '(initiated_by = app_usuario() OR against = app_usuario())', equipo: 'equipo' },

  // — Tanda 3: dos partes con mucho cruce —
  // Un contrato lo ven quien contrata y quien trabaja, más el equipo. Casi todo lo que la app hace con un contrato lo pide una de las dos partes; lo que toca el
  // contrato de OTRO (el auto-cierre, el cobro del trabajador cuando confirma el cliente) corre como sistema o con `conSistema`.
  contracts: { tanda: 3, mia: '(client_id = app_usuario() OR doer_id = app_usuario())', equipo: 'equipo' },
  contract_cancellation_requests: { tanda: 3, mia: '(requested_by = app_usuario() OR other_party_id = app_usuario())', equipo: 'equipo' },
  // Una solicitud de cambio la ven las dos partes del contrato: una la pide y la OTRA la responde.
  contract_change_requests: { tanda: 3, mia: 'contract_id IN (SELECT id FROM contracts WHERE client_id = app_usuario() OR doer_id = app_usuario())', equipo: 'equipo' },
  quotes: { tanda: 3, mia: '(sender_id = app_usuario() OR recipient_id = app_usuario())', borra: 'mia' },
  // Una propuesta la ven quien la hace y el cliente del trabajo; los demás postulantes no ven las ajenas.
  proposals: { tanda: 3, mia: '(freelancer_id = app_usuario() OR client_id = app_usuario())', borra: 'mia' },
  // Casi todas las notificaciones las crea OTRA persona para vos. Se leen, se editan y se borran solo las propias; crearlas pasa por `Notification.create`,
  // que corre como sistema (ver Notification.model.ts): un INSERT ... RETURNING también necesita poder LEER la fila, así que un «crear abierto» no alcanza.
  notifications: { tanda: 3, mia: 'recipient_id = app_usuario()', borra: 'mia' },
};

/** Tandas que existen, de la más vieja a la más nueva. */
const TANDAS = ['dinero', 1, 2, 3, 'rastro'];

/**
 * Tablas de rastro: la app solo puede LEER y AGREGAR filas (se les quita UPDATE y DELETE al rol `doapp_app`). Ni una ruta con un error ni una
 * inyección SQL pueden borrar o reescribir el rastro de lo que pasó. No llevan RLS (el rastro lo lee el equipo, no cada usuario): se cuidan así.
 * La única forma de borrar son las funciones `app_depurar_*` de abajo (fijan qué y cuánto, no aceptan una condición).
 */
const SOLO_AGREGAR = ['audit_logs', 'data_access_logs'];

const FUNCIONES = `
CREATE OR REPLACE FUNCTION app_sistema() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT COALESCE(current_setting('app.system', true), 'off') = 'on' $$;

CREATE OR REPLACE FUNCTION app_usuario() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_es_admin() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT COALESCE(current_setting('app.role', true), '') IN ('owner', 'super_admin', 'admin') $$;

CREATE OR REPLACE FUNCTION app_es_soporte() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT COALESCE(current_setting('app.role', true), '') IN ('owner', 'super_admin', 'admin', 'support') $$;

-- Todo el que atiende tickets y disputas (los mismos roles que autorizan las rutas de /admin/tickets y /admin/disputes).
CREATE OR REPLACE FUNCTION app_es_equipo() RETURNS boolean LANGUAGE sql STABLE AS
  $$ SELECT COALESCE(current_setting('app.role', true), '') IN ('owner', 'super_admin', 'admin', 'moderator', 'support') $$;

-- Depuración del rastro: corre con los permisos de quien creó la función (dueño de la tabla), no con los de la app. Nunca toca lo crítico ni lo reciente.
CREATE OR REPLACE FUNCTION app_depurar_auditoria(dias integer DEFAULT 90) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
  $$ DECLARE n integer; BEGIN
       IF dias IS NULL OR dias < 30 THEN RAISE EXCEPTION 'la auditoría se conserva al menos 30 días'; END IF;
       DELETE FROM audit_logs WHERE "createdAt" < now() - make_interval(days => dias) AND severity::text NOT IN ('critical', 'high');
       GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
     END $$;

CREATE OR REPLACE FUNCTION app_depurar_accesos() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
  $$ DECLARE n integer; BEGIN
       DELETE FROM data_access_logs WHERE "timestamp" < now() - interval '7 years';
       GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
     END $$;
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
  const { mia, equipo, borra } = TABLAS[tabla];
  const quien = equipo === 'equipo' ? 'app_es_equipo()' : 'app_es_admin()';
  const duenoOSistema = `app_sistema() OR ${quien} OR ${mia}`;
  const lectura = equipo === 'soporte' ? `app_sistema() OR app_es_soporte() OR ${mia}` : duenoOSistema;
  // Borrar es del sistema; solo en las tablas marcadas con `borra: 'mia'` también el dueño de la fila.
  const borrado = borra === 'mia' ? `app_sistema() OR ${mia}` : 'app_sistema()';
  return [
    `ALTER TABLE ${tabla} ENABLE ROW LEVEL SECURITY`,
    `DROP POLICY IF EXISTS ${tabla}_select ON ${tabla}`,
    `DROP POLICY IF EXISTS ${tabla}_insert ON ${tabla}`,
    `DROP POLICY IF EXISTS ${tabla}_update ON ${tabla}`,
    `DROP POLICY IF EXISTS ${tabla}_delete ON ${tabla}`,
    `CREATE POLICY ${tabla}_select ON ${tabla} FOR SELECT USING (${lectura})`,
    `CREATE POLICY ${tabla}_insert ON ${tabla} FOR INSERT WITH CHECK (${duenoOSistema})`,
    `CREATE POLICY ${tabla}_update ON ${tabla} FOR UPDATE USING (${duenoOSistema}) WITH CHECK (${duenoOSistema})`,
    // Los asientos de dinero no los borra ni un usuario ni un admin desde la app: solo el sistema.
    `CREATE POLICY ${tabla}_delete ON ${tabla} FOR DELETE USING (${borrado})`,
  ];
}

/**
 * Aplica todo (o solo las `tandas` que se pidan). `ejecutar(sql)` es la función que corre una sentencia (queryInterface.sequelize.query, o sequelize.query).
 * Devuelve qué tablas quedaron protegidas y cuáles se saltearon por no existir.
 */
function tablasDe(tandas) {
  return Object.keys(TABLAS).filter((t) => !tandas || tandas.includes(TABLAS[t].tanda));
}

async function aplicarRls(ejecutar, { tandas } = {}) {
  const protegidas = [];
  const saltadas = [];
  for (const sql of sqlDelRol()) await ejecutar(sql);
  for (const tabla of tablasDe(tandas)) {
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
  // Rastro de solo agregar. Va después del `GRANT ... ON ALL TABLES` de sqlDelRol, que se los daría de nuevo.
  if (!tandas || tandas.includes('rastro')) await sinBorrarElRastro(ejecutar);
  return { protegidas, saltadas };
}

/** Les quita UPDATE y DELETE al rol de la app en las tablas de rastro que existan. Idempotente. */
async function sinBorrarElRastro(ejecutar) {
  const hechas = [];
  for (const tabla of SOLO_AGREGAR) {
    if (!(await ejecutar(`SELECT to_regclass('public.${tabla}') AS t`, true))) continue;
    // Si el usuario de la base no es el dueño de la tabla, el REVOKE no puede hacerse: no frena la migración (el rastro queda como estaba).
    try {
      await ejecutar(`REVOKE UPDATE, DELETE, TRUNCATE ON ${tabla} FROM ${ROL_DE_LA_APP}`);
      hechas.push(tabla);
    } catch (e) {
      console.warn(`[rls] no se pudo dejar ${tabla} de solo agregar: ${e && e.message}`);
    }
  }
  return hechas;
}

/** Vuelve a darles UPDATE y DELETE (rollback de la migración). */
async function conBorradoDelRastro(ejecutar) {
  for (const tabla of SOLO_AGREGAR) {
    if (!(await ejecutar(`SELECT to_regclass('public.${tabla}') AS t`, true))) continue;
    await ejecutar(`GRANT UPDATE, DELETE ON ${tabla} TO ${ROL_DE_LA_APP}`);
  }
}

/** Deshace las políticas y el RLS de las tablas (o solo de las `tandas` que se pidan). El rol y las funciones quedan: no estorban. */
async function quitarRls(ejecutar, { tandas } = {}) {
  for (const tabla of tablasDe(tandas)) {
    const existe = await ejecutar(`SELECT to_regclass('public.${tabla}') AS t`, true);
    if (!existe) continue;
    for (const op of ['select', 'insert', 'update', 'delete']) await ejecutar(`DROP POLICY IF EXISTS ${tabla}_${op} ON ${tabla}`);
    await ejecutar(`ALTER TABLE ${tabla} DISABLE ROW LEVEL SECURITY`);
  }
}

module.exports = { ROL_DE_LA_APP, TABLAS, TANDAS, SOLO_AGREGAR, aplicarRls, quitarRls, sqlDelRol, sqlDeLaTabla, tablasDe, sinBorrarElRastro, conBorradoDelRastro };
