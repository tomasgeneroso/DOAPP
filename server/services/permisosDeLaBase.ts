import { sequelize } from '../config/database.js';

/**
 * «permission denied for table X» (SQLSTATE 42501): el usuario con que corre la app no tiene permiso sobre una tabla. Casi siempre es una tabla
 * que creó OTRO usuario de la base (alguien la armó a mano como superusuario): el dueño es otro y la app nunca recibió permisos. Pasó con
 * `invoices` al anular el pago de «try». En la app se nota recién cuando algo la usa, y las facturas se generan en segundo plano, así que el
 * error se pierde en el registro.
 */
export const esPermisoDenegado = (e: unknown): boolean => {
  const x = e as { original?: { code?: string; message?: string }; parent?: { code?: string }; code?: string; message?: string } | null;
  const codigo = x?.original?.code ?? x?.parent?.code ?? x?.code;
  return codigo === '42501' || /permission denied for (table|relation) /i.test(String(x?.original?.message ?? x?.message ?? ''));
};

const PRIVILEGIOS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const;

const identificador = (nombre: string) => (/^[a-z_][a-z0-9_]*$/.test(nombre) ? nombre : `"${nombre.replace(/"/g, '""')}"`);

/**
 * Convierte un «permission denied» en algo que se pueda arreglar: de quién es la tabla, qué le falta al usuario de la app y qué correr (como
 * superusuario de PostgreSQL) para dejarlo bien. Cualquier otro error vuelve tal cual. `usuario` es solo para las pruebas: por defecto es el
 * usuario con que está conectada la app.
 */
export async function explicarPermisoDenegado(e: unknown, usuario?: string): Promise<string> {
  const original = String((e as { original?: { message?: string } })?.original?.message ?? (e as { message?: string })?.message ?? e);
  const tabla = /permission denied for (?:table|relation) "?([A-Za-z0-9_]+)"?/i.exec(original)?.[1];
  if (!tabla || !esPermisoDenegado(e)) return original;
  try {
    const privilegios = PRIVILEGIOS.map((p) => `has_table_privilege(COALESCE(CAST(:usuario AS text), current_user), format('public.%I', CAST(:tabla AS text)), '${p}') AS ${p.toLowerCase()}`).join(', ');
    const [filas] = (await sequelize.query(
      `SELECT COALESCE(CAST(:usuario AS text), current_user) AS usuario, current_database() AS base,
              (SELECT tableowner::text FROM pg_tables WHERE schemaname = 'public' AND tablename = CAST(:tabla AS text)) AS dueno, ${privilegios}`,
      { replacements: { usuario: usuario ?? null, tabla } },
    )) as unknown as Array<Record<string, any>>[];
    const f = filas?.[0];
    if (!f) return original;
    const faltan = PRIVILEGIOS.filter((p) => !f[p.toLowerCase()]);
    const quien = identificador(String(f.usuario));
    return [
      `${original}`,
      `   El usuario de la base «${f.usuario}» ${faltan.length > 0 ? `no tiene permiso de ${faltan.join(', ')}` : 'no pudo usar'} sobre la tabla «${tabla}» (base «${f.base}»).`,
      f.dueno && f.dueno !== f.usuario
        ? `   La tabla es de «${f.dueno}», no de «${f.usuario}»: la creó otro usuario de la base y la app nunca recibió permisos sobre ella.`
        : '   La tabla es del mismo usuario, así que alguien le quitó permisos con REVOKE.',
      `   Corregilo como superusuario de PostgreSQL, conectado a «${f.base}»:`,
      f.dueno && f.dueno !== f.usuario ? `      ALTER TABLE public.${identificador(tabla)} OWNER TO ${quien};` : `      GRANT SELECT, INSERT, UPDATE, DELETE ON public.${identificador(tabla)} TO ${quien};`,
      `   Y mirá si hay más tablas en la misma situación:`,
      `      SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public' AND tableowner <> '${String(f.usuario).replace(/'/g, "''")}' ORDER BY 1;`,
    ].join('\n');
  } catch {
    return original;
  }
}
