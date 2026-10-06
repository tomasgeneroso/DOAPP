import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  crearGuardador,
  motivoDeFallo,
  type EstadoDeGuardado,
} from '../client/utils/guardadoAutomatico.js';

/**
 * El autoguardado del plan: nunca llega un valor viejo después de uno nuevo, y
 * nunca se miente sobre el estado.
 *
 * Qué motivó esto: "no me guardan los valores que cambio". Tres defectos del
 * temporizador suelto que había en la pantalla explican ese síntoma: el
 * indicador decía "Guardado" durante el retraso previo al envío, los envíos
 * podían pisarse y el viejo llegar último, y un fallo no decía por qué.
 *
 * Los envíos se controlan a mano (cada uno es una promesa que el test resuelve
 * cuando quiere) para poder armar exactamente las carreras que en la pantalla
 * dependen de lo lento que esté el servidor.
 */

interface EnvioPendiente {
  valor: number;
  alSalir: boolean;
  resolver: () => void;
  rechazar: (e: Error) => void;
}

function armar(esperaMs = 800) {
  const pendientes: EnvioPendiente[] = [];
  const enviados: number[] = []; // en el orden en que SALIERON
  const guardados: number[] = []; // en el orden en que el servidor los CONFIRMÓ
  const estados: EstadoDeGuardado['tipo'][] = [];
  let simultaneos = 0;
  let maximoSimultaneos = 0;

  const guardador = crearGuardador<number>({
    esperaMs,
    alCambiar: (e) => estados.push(e.tipo),
    enviar: (valor, contexto) =>
      new Promise<void>((resolve, reject) => {
        enviados.push(valor);
        simultaneos++;
        maximoSimultaneos = Math.max(maximoSimultaneos, simultaneos);
        pendientes.push({
          valor,
          alSalir: contexto.alSalir,
          resolver: () => {
            simultaneos--;
            guardados.push(valor);
            resolve();
          },
          rechazar: (e) => {
            simultaneos--;
            reject(e);
          },
        });
      }),
  });

  return { guardador, pendientes, enviados, guardados, estados, maximo: () => maximoSimultaneos };
}

/** Deja correr las promesas encadenadas sin avanzar el reloj. */
const asentar = () => jest.advanceTimersByTimeAsync(0);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('el estado no miente', () => {
  it('queda "pendiente" desde el instante del cambio, no desde que sale el pedido', async () => {
    /**
     * LA diferencia con lo que había: antes el indicador seguía diciendo
     * "Guardado" durante los 800 ms previos al envío. Quien recargaba en ese
     * lapso perdía el cambio sin saber que había algo sin guardar.
     */
    const { guardador, estados } = armar();
    guardador.programar(1);

    expect(guardador.estado().tipo).toBe('pendiente');
    expect(guardador.hayCambiosSinGuardar()).toBe(true);
    expect(estados).toEqual(['pendiente']);
  });

  it('recorre pendiente → guardando → guardado', async () => {
    const { guardador, pendientes, estados } = armar();
    guardador.programar(1);

    await jest.advanceTimersByTimeAsync(800);
    expect(guardador.estado().tipo).toBe('guardando');

    pendientes[0].resolver();
    await asentar();

    expect(estados).toEqual(['pendiente', 'guardando', 'guardado']);
    expect(guardador.hayCambiosSinGuardar()).toBe(false);
  });

  it('sin cambios no hay nada sin guardar', () => {
    const { guardador } = armar();
    expect(guardador.estado().tipo).toBe('ocioso');
    expect(guardador.hayCambiosSinGuardar()).toBe(false);
  });
});

describe('espera antes de enviar', () => {
  it('varios cambios seguidos salen como un solo envío, con el último valor', async () => {
    const { guardador, enviados, pendientes } = armar();

    guardador.programar(1);
    await jest.advanceTimersByTimeAsync(300);
    guardador.programar(2);
    await jest.advanceTimersByTimeAsync(300);
    guardador.programar(3);

    await jest.advanceTimersByTimeAsync(799);
    expect(enviados).toEqual([]); // todavía esperando

    await jest.advanceTimersByTimeAsync(1);
    expect(enviados).toEqual([3]);
    pendientes[0].resolver();
    await asentar();
  });
});

describe('los envíos no se pisan', () => {
  it('nunca hay dos pedidos a la vez', async () => {
    const { guardador, pendientes, maximo } = armar();

    guardador.programar(1);
    await jest.advanceTimersByTimeAsync(800); // sale el 1, sigue en vuelo
    guardador.programar(2);
    await jest.advanceTimersByTimeAsync(800); // vence la espera del 2 con el 1 en vuelo
    guardador.programar(3);
    await jest.advanceTimersByTimeAsync(800);

    pendientes[0].resolver();
    await asentar();
    pendientes[1]?.resolver();
    await asentar();

    expect(maximo()).toBe(1);
  });

  it('con el servidor lento, lo último en llegar a la base es lo último que se tipeó', async () => {
    /**
     * La carrera que revertía valores: el guardado viejo, lento, confirmaba
     * DESPUÉS del nuevo. Con un envío a la vez eso no puede pasar: el nuevo ni
     * siquiera sale hasta que el viejo terminó.
     */
    const { guardador, pendientes, guardados, enviados } = armar();

    guardador.programar(1);
    await jest.advanceTimersByTimeAsync(800);
    expect(enviados).toEqual([1]);

    guardador.programar(2);
    await jest.advanceTimersByTimeAsync(800);
    // El 2 todavía no salió: el 1 sigue en vuelo.
    expect(enviados).toEqual([1]);

    pendientes[0].resolver(); // el servidor confirma el 1 (lento)
    await asentar();
    expect(enviados).toEqual([1, 2]); // recién ahora sale el 2

    pendientes[1].resolver();
    await asentar();

    expect(guardados).toEqual([1, 2]);
    expect(guardados[guardados.length - 1]).toBe(2);
    expect(guardador.hayCambiosSinGuardar()).toBe(false);
  });

  it('si llegan varios cambios con uno en vuelo, sale sólo el último de ellos', async () => {
    const { guardador, pendientes, enviados } = armar();

    guardador.programar(1);
    await jest.advanceTimersByTimeAsync(800);

    guardador.programar(2);
    guardador.programar(3);
    guardador.programar(4);
    await jest.advanceTimersByTimeAsync(800);

    pendientes[0].resolver();
    await asentar();

    // El 2 y el 3 no hace falta enviarlos: el 4 los reemplaza.
    expect(enviados).toEqual([1, 4]);
    pendientes[1].resolver();
    await asentar();
  });

  it('una secuencia larga termina siempre en el último valor, en orden creciente', async () => {
    const { guardador, pendientes, guardados } = armar();

    for (let valor = 1; valor <= 25; valor++) {
      guardador.programar(valor);
      await jest.advanceTimersByTimeAsync(100 + (valor % 7) * 300);
      // El servidor confirma lo que haya en vuelo, a veces tarde.
      while (pendientes.length && guardados.length < pendientes.length) {
        pendientes[guardados.length].resolver();
        await asentar();
      }
    }
    await jest.advanceTimersByTimeAsync(2000);
    while (guardados.length < pendientes.length) {
      pendientes[guardados.length].resolver();
      await asentar();
    }

    expect(guardados[guardados.length - 1]).toBe(25);
    // Nunca retrocede: cada valor confirmado es mayor que el anterior.
    for (let i = 1; i < guardados.length; i++) expect(guardados[i]).toBeGreaterThan(guardados[i - 1]);
    expect(guardador.hayCambiosSinGuardar()).toBe(false);
  });
});

describe('cuando falla', () => {
  it('informa el motivo y no pierde el valor', async () => {
    const { guardador, pendientes } = armar();
    guardador.programar(7);
    await jest.advanceTimersByTimeAsync(800);

    pendientes[0].rechazar(new Error('tu sesión venció'));
    await asentar();

    expect(guardador.estado()).toEqual({ tipo: 'error', motivo: 'tu sesión venció' });
    expect(guardador.hayCambiosSinGuardar()).toBe(true);
  });

  it('"reintentar" vuelve a enviar el mismo valor', async () => {
    const { guardador, pendientes, guardados } = armar();
    guardador.programar(7);
    await jest.advanceTimersByTimeAsync(800);
    pendientes[0].rechazar(new Error('error del servidor'));
    await asentar();

    const intento = guardador.reintentar();
    await asentar();
    expect(pendientes).toHaveLength(2);
    expect(pendientes[1].valor).toBe(7);

    pendientes[1].resolver();
    await intento;
    expect(guardados).toEqual([7]);
    expect(guardador.estado().tipo).toBe('guardado');
  });

  it('el próximo cambio también reintenta, con el valor más nuevo', async () => {
    const { guardador, pendientes, enviados } = armar();
    guardador.programar(1);
    await jest.advanceTimersByTimeAsync(800);
    pendientes[0].rechazar(new Error('sin conexión'));
    await asentar();

    guardador.programar(2); // el usuario sigue tipeando
    await jest.advanceTimersByTimeAsync(800);

    expect(enviados).toEqual([1, 2]);
    pendientes[1].resolver();
    await asentar();
    expect(guardador.estado().tipo).toBe('guardado');
  });

  it('un cambio que llega mientras falla el envío en curso no se pierde', async () => {
    const { guardador, pendientes, enviados } = armar();
    guardador.programar(1);
    await jest.advanceTimersByTimeAsync(800);

    guardador.programar(2); // llega con el 1 en vuelo
    pendientes[0].rechazar(new Error('error del servidor'));
    await asentar();

    expect(guardador.estado().tipo).toBe('error');
    expect(guardador.hayCambiosSinGuardar()).toBe(true);

    const intento = guardador.reintentar();
    await asentar();
    expect(enviados).toEqual([1, 2]); // el reintento lleva el 2, no el 1
    pendientes[1].resolver();
    await intento;
  });

  it('no se queda reintentando en bucle', async () => {
    const { guardador, pendientes, enviados } = armar();
    guardador.programar(1);
    await jest.advanceTimersByTimeAsync(800);
    pendientes[0].rechazar(new Error('boom'));
    await asentar();

    await jest.advanceTimersByTimeAsync(60_000);
    expect(enviados).toEqual([1]); // un minuto después, sigue siendo uno solo
  });

  it('un rechazo sin mensaje igual dice algo', async () => {
    const { guardador, pendientes } = armar();
    guardador.programar(1);
    await jest.advanceTimersByTimeAsync(800);
    pendientes[0].rechazar(new Error(''));
    await asentar();

    const e = guardador.estado();
    expect(e.tipo).toBe('error');
    expect((e as any).motivo.length).toBeGreaterThan(5);
  });
});

describe('al salir de la pantalla', () => {
  it('"vaciar" envía ya, sin esperar, y avisa que es porque se sale', async () => {
    /**
     * Quien tipea y recarga antes de los 800 ms perdía el cambio. Al ocultarse
     * la página se fuerza el envío, con `keepalive` para que sobreviva al cierre.
     */
    const { guardador, pendientes, enviados } = armar();
    guardador.programar(9);

    void guardador.vaciar({ alSalir: true });
    await asentar();

    expect(enviados).toEqual([9]);
    expect(pendientes[0].alSalir).toBe(true);
  });

  it('después de vaciar, la espera pendiente no manda un segundo envío', async () => {
    const { guardador, pendientes, enviados } = armar();
    guardador.programar(9);
    void guardador.vaciar({ alSalir: true });
    await asentar();
    pendientes[0].resolver();
    await asentar();

    await jest.advanceTimersByTimeAsync(5000);
    expect(enviados).toEqual([9]);
  });

  it('sin nada pendiente, vaciar no envía nada', async () => {
    const { guardador, enviados } = armar();
    await guardador.vaciar({ alSalir: true });
    expect(enviados).toEqual([]);
  });

  it('mientras algo está en vuelo, vaciar espera a ese en vez de duplicarlo', async () => {
    const { guardador, pendientes, enviados } = armar();
    guardador.programar(1);
    await jest.advanceTimersByTimeAsync(800);

    const a = guardador.vaciar();
    const b = guardador.vaciar({ alSalir: true });
    await asentar();
    expect(enviados).toEqual([1]);

    pendientes[0].resolver();
    await Promise.all([a, b]);
    expect(enviados).toEqual([1]);
  });

  it('cancelar la espera no descarta lo pendiente', async () => {
    const { guardador, enviados, pendientes } = armar();
    guardador.programar(5);
    guardador.cancelarEspera();

    await jest.advanceTimersByTimeAsync(5000);
    expect(enviados).toEqual([]); // no salió solo...
    expect(guardador.hayCambiosSinGuardar()).toBe(true); // ...pero sigue pendiente

    void guardador.vaciar();
    await asentar();
    expect(enviados).toEqual([5]);
    pendientes[0].resolver();
    await asentar();
  });
});

describe('motivoDeFallo', () => {
  it('traduce los estados que importan', () => {
    expect(motivoDeFallo(401)).toMatch(/sesión/);
    expect(motivoDeFallo(403, 'Acceso denegado: se requiere rol owner o analista')).toMatch(/Acceso denegado/);
    expect(motivoDeFallo(413)).toMatch(/demasiado grande/);
    expect(motivoDeFallo(429)).toMatch(/demasiados pedidos/);
    expect(motivoDeFallo(500)).toMatch(/error del servidor/);
    expect(motivoDeFallo(502, 'Bad gateway')).toMatch(/Bad gateway/);
  });

  it('una respuesta sin JSON dice que fue algo delante de la aplicación', () => {
    /**
     * Un 403 con una página HTML no es un problema de permisos: es Cloudflare o
     * nginx cortando el pedido antes de que llegue a la aplicación. Decirlo ahorra
     * horas de mirar los permisos de un usuario que los tiene.
     */
    const m = motivoDeFallo(403, undefined, false);
    expect(m).toMatch(/403/);
    expect(m).toMatch(/Cloudflare|servidor web/);
    expect(m).not.toMatch(/permiso/);
  });

  it('nunca devuelve vacío', () => {
    for (const estado of [200, 400, 404, 418, 599]) {
      expect(motivoDeFallo(estado).length).toBeGreaterThan(3);
    }
  });
});
