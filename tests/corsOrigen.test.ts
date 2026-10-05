import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { crearVerificadorDeOrigen } from '../server/middleware/corsOrigen.js';
import { errorHandler, ErrorResponse } from '../server/middleware/errorHandler.js';

/**
 * El filtro de orígenes de la API.
 *
 * Qué motivó esto: un bot sondeaba `POST /api/graphql` —que no existe— desde un
 * origen cualquiera, y cada sondeo quedaba en el log como una falla del
 * servidor con diez líneas de stack. El rechazo de CORS era un `Error` pelado,
 * el manejador le ponía 500 por defecto y loguea todo lo que sea 500.
 *
 * Un origen no autorizado es un 403, y el manejador dice con razón que "los 500
 * son los únicos que hay que mirar". Este archivo fija las dos mitades: quién
 * entra, y que rechazar a alguien no sea una alarma.
 */

type Verificador = ReturnType<typeof crearVerificadorDeOrigen>;

function verificar(v: Verificador, origin: string | undefined) {
  return new Promise<{ err: Error | null; permitir?: boolean }>((resolve) => {
    v(origin, (err, permitir) => resolve({ err, permitir }));
  });
}

const produccion = crearVerificadorDeOrigen({
  clientUrl: 'https://doapparg.com',
  corsOrigins: ['https://staging.doapparg.com'],
  esDesarrollo: false,
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('quién puede hablar con la API', () => {
  it('deja pasar los pedidos sin cabecera Origin (apps móviles, curl)', async () => {
    const r = await verificar(produccion, undefined);
    expect(r.err).toBeNull();
    expect(r.permitir).toBe(true);
  });

  it('deja pasar el sitio', async () => {
    expect((await verificar(produccion, 'https://doapparg.com')).permitir).toBe(true);
  });

  it('deja pasar lo que se agregó por CORS_ORIGINS (staging)', async () => {
    expect((await verificar(produccion, 'https://staging.doapparg.com')).permitir).toBe(true);
  });

  it('en producción NO deja pasar localhost', async () => {
    /**
     * Estaban permitidos sin condición, con `credentials: true` al lado: la API
     * de producción aceptaba pedidos con credenciales desde un origen local.
     */
    for (const o of ['http://localhost:5173', 'http://localhost:8081', 'http://localhost:19006']) {
      const r = await verificar(produccion, o);
      expect(r.err).not.toBeNull();
    }
  });

  it('no se deja engañar por un dominio que sólo se le parece', async () => {
    // Comparación exacta: un `startsWith` o `includes` dejaría pasar estos.
    for (const o of [
      'https://doapparg.com.evil.net',
      'https://evil-doapparg.com',
      'http://doapparg.com', // otro esquema
      'https://doapparg.com:8443', // otro puerto
    ]) {
      const r = await verificar(produccion, o);
      expect(r.err).not.toBeNull();
    }
  });

  it('en desarrollo deja pasar cualquier origen', async () => {
    const dev = crearVerificadorDeOrigen({
      clientUrl: 'http://localhost:5173',
      corsOrigins: [],
      esDesarrollo: true,
    });
    expect((await verificar(dev, 'http://localhost:8081')).permitir).toBe(true);
    expect((await verificar(dev, 'https://cualquiera.example')).permitir).toBe(true);
  });
});

describe('rechazar un origen no es una falla del servidor', () => {
  function pasarPorElManejador(err: Error) {
    const res = { status: jest.fn(), json: jest.fn() };
    res.status.mockReturnValue(res);
    errorHandler(
      err,
      { method: 'POST', originalUrl: '/api/graphql' } as any,
      res as any,
      jest.fn() as any,
    );
    return res;
  }

  it('el rechazo es un 403', async () => {
    const { err } = await verificar(produccion, 'https://evil.example');
    expect(err).toBeInstanceOf(ErrorResponse);
    expect((err as ErrorResponse).statusCode).toBe(403);
  });

  it('el manejador responde 403 y NO escribe nada en el log', async () => {
    const espia = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { err } = await verificar(produccion, 'https://evil.example');

    const res = pasarPorElManejador(err as Error);

    expect(res.status).toHaveBeenCalledWith(403);
    // Esto es lo que se veía: un stack de diez líneas por cada sondeo.
    expect(espia).not.toHaveBeenCalled();
  });

  it('un error de verdad sigue siendo un 500 y sigue logueándose', () => {
    /**
     * La otra cara: no se silencia el manejador entero. Si algo se rompe de
     * verdad tiene que seguir apareciendo.
     */
    const espia = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = pasarPorElManejador(new Error('se rompió algo'));

    expect(res.status).toHaveBeenCalledWith(500);
    expect(espia).toHaveBeenCalled();
  });
});
