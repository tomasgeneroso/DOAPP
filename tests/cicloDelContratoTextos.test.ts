import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { POLITICAS } from '../shared/constants/policies.js';

/**
 * El contrato empieza solo a la hora de inicio y termina cuando las dos partes lo confirman o una hora después de la hora de fin (regla del dueño,
 * 2026-10-24; services/cicloDelContrato.ts). Esta guarda impide que la pantalla vuelva a contradecirlo: decir «¡Trabajo finalizado!» de un contrato que
 * nunca empezó, o pedir que «un administrador lo apruebe» antes de empezar.
 */
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');

describe('el ciclo del contrato en las pantallas y en los mensajes', () => {
  it('la hora de gracia del final es una constante de una hora', () => {
    expect(POLITICAS.AUTO_FINALIZACION_HORAS).toBe(1);
    expect(leer('server/services/cicloDelContrato.ts')).toMatch(/POLITICAS\.AUTO_FINALIZACION_HORAS/);
  });

  it('nadie dice que un administrador tiene que aprobar el contrato para que el trabajo empiece', () => {
    for (const ruta of ['client/pages/JobDetail.tsx', 'server/routes/contracts.ts']) {
      expect([ruta, /un administrador tiene que aprobarlo/.test(leer(ruta))]).toEqual([ruta, false]);
    }
  });

  it('el cartel de «trabajo finalizado» no sale mientras el contrato no empezó', () => {
    const pantalla = leer('client/pages/JobDetail.tsx');
    expect(pantalla).toMatch(/const contratoSinEmpezar = /);
    expect(pantalla).toMatch(/const trabajoYaTermino = .*&& !contratoSinEmpezar/);
    // Los tres carteles (el del cliente y los dos del trabajador) miran esa bandera, no solo la fecha de fin.
    expect((pantalla.match(/trabajoYaTermino/g) || []).length).toBeGreaterThanOrEqual(4);
  });

  it('el cron del ciclo está registrado al arrancar el servidor', () => {
    expect(leer('server/index.ts')).toMatch(/startCicloDelContratoJob\(\);/);
  });
});
