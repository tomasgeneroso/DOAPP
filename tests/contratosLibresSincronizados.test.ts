import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { POLITICAS } from '../shared/constants/policies.js';

/**
 * Contratos libres de comisión: una sola regla (las primeras 2000 personas verificadas tienen 1 contrato libre, una vez, y 1 mes de PRO), escrita en UN lugar (`POLITICAS`).
 *
 * Antes la promesa vivía en cinco lugares con números distintos: «3 para los primeros 1000» en pantallas y mensajes, 1 en `markEarlyUser` (que nadie
 * llamaba), 3 como valor por defecto de TODA cuenta, 3 cada mes para PRO por un cron, y un cupo mensual de 1 (PRO) o 2 (SUPER PRO) que contradecía que la
 * membresía no modifica la comisión (T&C 7.3 y 8.1). Esta guarda impide que vuelvan los restos.
 */
const RAIZ = process.cwd();
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

function archivos(dir: string, extensiones: string[], acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === 'dist' || nombre === '.expo') continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, extensiones, acc);
    else if (extensiones.some((e) => ruta.endsWith(e))) acc.push(ruta);
  }
  return acc;
}

describe('contratos libres de comisión: una sola regla', () => {
  it('las constantes son 1 contrato libre UNA vez y 1 mes de PRO, para las primeras 2000 personas verificadas', () => {
    expect((POLITICAS as Record<string, unknown>).CONTRATOS_LIBRES_DE_COMISION).toBeUndefined(); // la regla de las «6 para 2000» ya no existe
    expect((POLITICAS as Record<string, unknown>).MESES_DE_CONTRATOS_LIBRES).toBeUndefined(); // ni el «1 por mes durante 12 meses» (regla del 2026-11-06)
    expect(POLITICAS.CONTRATOS_LIBRES_DE_LANZAMIENTO).toBe(1);
    // Los términos (7.13) dicen «el primer período mensual»: si se cambia el mes, hay que cambiar el texto de los dos idiomas.
    expect(POLITICAS.MESES_DE_PRO_DE_LANZAMIENTO).toBe(1);
    expect(POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES).toBe(2000);
    // El contrato libre por mes es de la membresía PRO, no del lanzamiento.
    expect(POLITICAS.CONTRATOS_LIBRES_POR_MES).toBe(1);
  });

  it('una cuenta nueva nace sin contratos libres en el contador (la marca de primera cuenta la da `otorgarContratosLibres`)', () => {
    expect(leer('server/models/sql/User.model.ts')).toMatch(/@Default\(0\)\s+@AllowNull\(false\)\s+@Column\(DataType\.INTEGER\)\s+freeContractsRemaining!/);
  });

  it('el contrato libre del mes de PRO sale de la fecha del último uso: no hay contador de membresía ni el cron que lo reseteaba', () => {
    const exencion = leer('server/services/exencionDeComision.ts');
    expect(exencion).toMatch(/tieneProVigente/); // PRO tiene su contrato libre por mes (regla del dueño, 2026-10-25)
    expect(exencion).not.toMatch(/proContractsUsedThisMonth/); // pero sin el contador mensual de antes
    expect(leer('server/index.ts')).not.toMatch(/resetProMembershipCounters|startResetProMembershipCountersJob/);
    expect(() => readFileSync(join(RAIZ, 'server/jobs/resetProMembershipCounters.ts'))).toThrow();
  });

  it('ninguna pantalla ni mensaje promete «3 contratos / publicaciones» sin comisión para los primeros 1000', () => {
    const viejo = /(?:\b3\b|tres)\s+(?:publicaciones|contratos)\s+(?:libres\s+de\s+comisi[oó]n|sin\s+comisi[oó]n|gratis)|libres?\s+de\s+comisi[oó]n\s*\(primeros\s+1[.,]?000|primeros\s+1[.,]?000\s+usuarios\)\s*$/im;
    const culpables = [
      ...archivos(join(RAIZ, 'server'), ['.ts']),
      ...archivos(join(RAIZ, 'client'), ['.ts', '.tsx', '.json']),
      ...archivos(join(RAIZ, 'mobile/app'), ['.ts', '.tsx']),
      ...archivos(join(RAIZ, 'mobile/components'), ['.ts', '.tsx']),
      ...archivos(join(RAIZ, 'shared'), ['.ts']),
    ].filter((f) => viejo.test(readFileSync(f, 'utf8')));
    expect(culpables.map((f) => f.replace(RAIZ, ''))).toEqual([]);
  });

  it('los textos que cuentan la regla la toman de la constante, no de un literal', () => {
    for (const ruta of ['server/routes/membership.ts', 'server/routes/referrals.ts', 'client/components/auth/AuthHero.tsx', 'client/components/MembershipOfferModal.tsx']) {
      expect([ruta, /POLITICAS\.(CONTRATOS_LIBRES_POR_MES|CONTRATOS_LIBRES_DE_LANZAMIENTO|MESES_DE_PRO_DE_LANZAMIENTO|PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES)/.test(leer(ruta))]).toEqual([ruta, true]);
    }
  });
});
