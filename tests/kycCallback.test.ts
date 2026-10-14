import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ESPERA_ENTRE_CONSULTAS_MS,
  MAXIMO_DE_CONSULTAS,
  estadoDeLaVerificacion,
  hayQueVolverAPreguntar,
  textoDelEstado,
} from '../client/utils/kycCallback.js';

/**
 * La pantalla a la que Didit devuelve a la persona al terminar la verificación de identidad.
 *
 * Qué pasó: el servidor le dice a Didit que vuelva a `${clientUrl}/kyc/callback`, pero esa pantalla nunca existió.
 * Quien terminaba la verificación caía en una página inexistente (404) aunque hubiera salido bien. Acá se fija
 * qué ruta pide el servidor, que la web la tenga y cómo se cuenta cada resultado.
 */

const RAIZ = process.cwd();

describe('la dirección de retorno de Didit existe en la web', () => {
  it('el servidor pide exactamente /kyc/callback', () => {
    const auth = readFileSync(join(RAIZ, 'server/routes/auth.ts'), 'utf8');
    expect(auth).toMatch(/clientUrl[^`]*\}\/kyc\/callback`/);
  });

  it('y la web tiene esa ruta', () => {
    const app = readFileSync(join(RAIZ, 'client/App.tsx'), 'utf8');
    expect(app).toMatch(/<Route\s+path="\/kyc\/callback"/);
  });
});

describe('los botones de la pantalla de retorno van a doapparg.com', () => {
  it('no usan el esquema doapp:// (que no lleva a ningún lado sin la app instalada)', () => {
    const pantalla = readFileSync(join(RAIZ, 'client/pages/KycCallback.tsx'), 'utf8');
    expect(pantalla).not.toContain('doapp://');
  });

  it('en el retorno de Mercado Pago desde la app, el botón principal es un enlace de la web y la app queda como opción secundaria', () => {
    const pago = readFileSync(join(RAIZ, 'client/pages/PagoDesdeApp.tsx'), 'utf8');
    expect(pago).toMatch(/<Link\s+to="\/login"[\s\S]*?Ir a DOAPP/);
    expect(pago).not.toMatch(/Abrir la app de DOAPP/);
  });
});

describe('estadoDeLaVerificacion', () => {
  it('solo cuenta como aprobada lo que el servidor confirma', () => {
    expect(estadoDeLaVerificacion('Approved')).toBe('aprobada');
    expect(estadoDeLaVerificacion('In Progress', true)).toBe('aprobada');
    // `dniVerified: true` manda aunque el texto diga otra cosa: es lo que escribe el servidor al aprobar
    expect(estadoDeLaVerificacion('Declined', true)).toBe('aprobada');
  });

  it('lo que falte o venga raro es pendiente, nunca aprobado', () => {
    for (const raro of [undefined, null, '', 'Not Started', 'In Progress', 'cualquier cosa', 42, {}]) {
      expect(estadoDeLaVerificacion(raro)).toBe('pendiente');
    }
    expect(estadoDeLaVerificacion('Approved', false)).toBe('aprobada'); // el texto de Didit ya lo dice
    expect(estadoDeLaVerificacion('approved ')).toBe('aprobada');
  });

  it('rechazada y en revisión', () => {
    expect(estadoDeLaVerificacion('Declined')).toBe('rechazada');
    expect(estadoDeLaVerificacion('Expired')).toBe('rechazada');
    expect(estadoDeLaVerificacion('Abandoned')).toBe('rechazada');
    expect(estadoDeLaVerificacion('In Review')).toBe('en_revision');
  });
});

describe('cuándo volver a preguntar', () => {
  it('solo mientras está pendiente y quedan intentos', () => {
    expect(hayQueVolverAPreguntar('pendiente', 1)).toBe(true);
    expect(hayQueVolverAPreguntar('pendiente', MAXIMO_DE_CONSULTAS)).toBe(false);
    for (const resuelto of ['aprobada', 'rechazada', 'en_revision'] as const) {
      expect(hayQueVolverAPreguntar(resuelto, 1)).toBe(false);
    }
  });

  it('la espera total es acotada (no queda consultando para siempre)', () => {
    expect(ESPERA_ENTRE_CONSULTAS_MS * MAXIMO_DE_CONSULTAS).toBeLessThanOrEqual(30_000);
  });
});

describe('textoDelEstado', () => {
  it('lo no confirmado se dice como tal', () => {
    expect(textoDelEstado('pendiente', true).titulo).toMatch(/procesando/i);
    expect(textoDelEstado('pendiente', false).titulo).toMatch(/Confirmando/);
    expect(textoDelEstado('pendiente', true).titulo).not.toMatch(/verificada/i);
  });

  it('cada resultado tiene su mensaje', () => {
    expect(textoDelEstado('aprobada', false).titulo).toBe('Identidad verificada');
    expect(textoDelEstado('rechazada', false).titulo).toMatch(/No pudimos/);
    expect(textoDelEstado('en_revision', false).titulo).toMatch(/revisión/);
  });
});
