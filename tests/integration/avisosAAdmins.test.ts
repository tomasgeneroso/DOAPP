import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { User } from '../../server/models/sql/User.model.js';
import { DONDE_ES_ADMIN, DONDE_ES_ADMIN_O_SOPORTE } from '../../server/utils/admins.js';

/**
 * Los avisos a administración no le llegaban a nadie.
 *
 * Más de quince lugares buscaban administradores con `role IN ('admin','super_admin','owner')`, pero
 * `User.role` sólo vale user|client|doer|both: el rol de administración vive en `adminRole`. La búsqueda
 * devolvía una lista vacía y los avisos —plata sin mover, pago con monto inesperado, disputa lista para
 * resolver, conciliación con diferencias, botón de emergencia— no se enviaban, sin error ni registro.
 */

describe('a quién se le avisa en administración', () => {
  const emails = [
    'adm-owner@aviso.test', 'adm-admin@aviso.test', 'adm-super@aviso.test', 'adm-soporte@aviso.test',
    'adm-marketing@aviso.test', 'adm-comun@aviso.test', 'adm-viejo@aviso.test',
  ];

  const crear = (clave: string, extra: Record<string, unknown>) =>
    User.create({ email: `adm-${clave}@aviso.test`, name: `Persona ${clave}`, username: `aviso${clave}`, password: 'password123', role: 'doer', ...extra } as any);

  beforeAll(async () => {
    await User.destroy({ where: { email: emails } });
    await crear('owner', { adminRole: 'owner' });
    await crear('admin', { adminRole: 'admin' });
    await crear('super', { adminRole: 'super_admin' });
    await crear('soporte', { adminRole: 'support' });
    await crear('marketing', { adminRole: 'marketing' });
    await crear('comun', {});
    // Una fila vieja que todavía tenga el rol de administración en `role`.
    await crear('viejo', { role: 'admin' });
  });

  afterAll(async () => {
    await User.destroy({ where: { email: emails } });
  });

  const correos = async (donde: any) =>
    ((await User.findAll({ where: { ...donde, email: emails } as any, attributes: ['email'] })) as any[]).map((u) => u.email).sort();

  it('encuentra a quien tiene el rol en adminRole (owner, super_admin, admin), y a la fila vieja con el rol en role', async () => {
    expect(await correos(DONDE_ES_ADMIN)).toEqual(['adm-admin@aviso.test', 'adm-owner@aviso.test', 'adm-super@aviso.test', 'adm-viejo@aviso.test']);
  });

  it('no incluye a soporte, marketing ni a un usuario común', async () => {
    const lista = await correos(DONDE_ES_ADMIN);
    for (const no of ['adm-soporte@aviso.test', 'adm-marketing@aviso.test', 'adm-comun@aviso.test']) expect(lista).not.toContain(no);
  });

  it('la variante con soporte suma a soporte (disputas) y sigue sin incluir a marketing ni a usuarios comunes', async () => {
    const lista = await correos(DONDE_ES_ADMIN_O_SOPORTE);
    expect(lista).toContain('adm-soporte@aviso.test');
    expect(lista).toContain('adm-owner@aviso.test');
    expect(lista).not.toContain('adm-marketing@aviso.test');
    expect(lista).not.toContain('adm-comun@aviso.test');
  });

  it('el campo `role` de un usuario común nunca tiene valores de administración (la causa del bug)', async () => {
    const roles = (await User.findAll({ where: { email: emails } as any, attributes: ['email', 'role', 'adminRole'] }) as any[])
      .filter((u) => u.adminRole)
      .map((u) => u.role);
    expect(roles.every((r) => ['user', 'client', 'doer', 'both'].includes(r))).toBe(true);
  });
});

describe('el código no vuelve a buscar administradores por `role`', () => {
  const raiz = process.cwd();
  const archivos = (dir: string, acc: string[] = []): string[] => {
    for (const e of readdirSync(join(raiz, dir), { withFileTypes: true })) {
      const ruta = `${dir}/${e.name}`;
      if (e.isDirectory()) archivos(ruta, acc);
      else if (/\.ts$/.test(e.name)) acc.push(ruta);
    }
    return acc;
  };

  it("ninguna consulta de servidor filtra `role` por 'admin', 'super_admin' u 'owner'", () => {
    const malos: string[] = [];
    for (const f of archivos('server')) {
      if (f.endsWith('utils/admins.ts')) continue; // el helper acepta `role` a propósito, por las filas viejas
      const texto = readFileSync(join(raiz, f), 'utf8');
      // `role: { [Op.in]: [ ... 'admin' ... ] }`, `role: 'admin'` y `{ role: 'owner' }`
      const re = /role:\s*(?:\{\s*\[Op\.in\]:\s*\[[^\]]*['"](?:admin|super_admin|owner)['"][^\]]*\]\s*\}|['"](?:admin|super_admin|owner)['"])/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(texto))) {
        const linea = texto.slice(0, m.index).split('\n').length;
        // Quedan fuera las comparaciones y los tipos (`role: 'owner' | 'admin'`, parámetros), no las consultas.
        const contexto = texto.slice(Math.max(0, m.index - 80), m.index + m[0].length + 20);
        if (/where|findAll|findOne|count\(|\[Op\./.test(contexto)) malos.push(`${f}:${linea}`);
      }
    }
    expect(malos).toEqual([]);
  });
});
