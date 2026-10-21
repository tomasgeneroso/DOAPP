import { describe, it, expect, jest } from '@jest/globals';
import { activarRlsSiLaBaseEstaLista, instalarRls, rlsAplicandose, activarRls } from '../server/db/contextoRls.js';

/**
 * Incidente 2026-10-18: se puso RLS_ACTIVO=true en producción sin que el rol `doapp_app` existiera en la base y TODAS las consultas
 * fallaron con «role "doapp_app" does not exist». Encender RLS sin la base lista no puede tumbar la app: se queda sin RLS y lo grita.
 */
describe('RLS sin el rol en la base', () => {
  it('al arrancar, si el rol no existe ni se puede crear, NO se activa (la app sigue funcionando)', async () => {
    const sequelize: any = {
      query: jest.fn(async (sql: string) => {
        if (/pg_roles WHERE rolname = 'doapp_app'\) AS existe/.test(sql)) return [[{ existe: false, puede: false }]];
        throw new Error('permission denied to create role');
      }),
    };
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await activarRlsSiLaBaseEstaLista(sequelize)).toBe(false);
    expect(rlsAplicandose()).toBe(false);
    expect(err).toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('si el rol existe pero faltan las políticas (base copiada con el historial de migraciones) las crea; si no puede, arranca sin RLS', async () => {
    let politicas = false;
    const sequelize: any = {
      query: jest.fn(async (sql: string) => {
        if (/AS rol,/.test(sql)) return [[{ rol: true, puede: true, sin_permiso: [], politicas }]];
        if (/CREATE POLICY/.test(sql)) politicas = true;
        if (/ AS t$/.test(sql.trim()) || /AS t\b/.test(sql)) return [[{ t: true }]];
        return [[]];
      }),
    };
    expect(await activarRlsSiLaBaseEstaLista(sequelize)).toBe(true);
    expect(politicas).toBe(true);

    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const sinPoder: any = { query: jest.fn(async (sql: string) => (/AS rol,/.test(sql) ? [[{ rol: true, puede: true, sin_permiso: [], politicas: false }]] : [[{ t: false }]])) };
    expect(await activarRlsSiLaBaseEstaLista(sinPoder)).toBe(false);
    expect(String(err.mock.calls[0][0])).toContain('faltan las políticas');
    jest.restoreAllMocks();
  });

  it('si el rol aparece después de intentar crearlo, se activa', async () => {
    let creado = false;
    const sequelize: any = {
      query: jest.fn(async (sql: string) => {
        if (/AS rol,/.test(sql)) return [[{ rol: creado, puede: creado, sin_permiso: [], politicas: creado }]];
        if (/CREATE ROLE/.test(sql)) creado = true;
        if (/to_regclass/.test(sql)) return [[{ t: false }]];
        return [[]];
      }),
    };
    expect(await activarRlsSiLaBaseEstaLista(sequelize)).toBe(true);
    expect(rlsAplicandose()).toBe(true);
  });

  it('si el rol desaparece con la app andando, el pedido sigue (RLS se apaga a los gritos) y no revienta', async () => {
    let gancho: any;
    instalarRls({ addHook: (_n: string, f: any) => (gancho = f) } as any);
    activarRls();
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const conexion = { query: jest.fn(async () => { throw Object.assign(new Error('role "doapp_app" does not exist'), { code: '22023' }); }) };
    await expect(gancho(conexion)).resolves.toBeUndefined();
    expect(rlsAplicandose()).toBe(false);
    expect(err).toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('un error que no es de rol (conexión caída) sí se propaga', async () => {
    let gancho: any;
    instalarRls({ addHook: (_n: string, f: any) => (gancho = f) } as any);
    activarRls();
    const conexion = { query: jest.fn(async () => { throw Object.assign(new Error('connection terminated'), { code: '57P01' }); }) };
    await expect(gancho(conexion)).rejects.toThrow('connection terminated');
  });
});
