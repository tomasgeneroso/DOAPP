/**
 * El autoguardado del plan de negocio, aislado de la pantalla.
 *
 * ── Qué problema resuelve ───────────────────────────────────────────────────
 *
 * "No me guardan los valores que cambio." El guardado era un temporizador suelto
 * dentro del componente, y tenía tres defectos que explican justo ese síntoma:
 *
 *  1. El indicador mentía. Después de un cambio seguía diciendo "Guardado", en
 *     verde, hasta que salía el pedido —800 ms más tarde—. Quien recargaba o
 *     cerraba en ese lapso perdía el cambio, y nada le había avisado que había
 *     algo sin guardar.
 *
 *  2. Los guardados podían pisarse. Cada uno salía sin esperar al anterior: con
 *     un servidor lento, el guardado viejo podía LLEGAR después del nuevo y
 *     revertirlo, y lo último que quedaba en la base era lo penúltimo que
 *     tipeaste.
 *
 *  3. Cuando fallaba decía "Error al guardar" y nada más. Sin el motivo no hay
 *     forma de distinguir una sesión vencida, un bloqueo de Cloudflare o un error
 *     del servidor, que se arreglan de maneras completamente distintas.
 *
 * ── Qué garantiza ───────────────────────────────────────────────────────────
 *
 *  - Un solo envío a la vez, y siempre del valor MÁS NUEVO: si llegan cambios
 *    mientras otro se está enviando, se envía el último apenas termine el
 *    anterior. Nunca llega un valor viejo después de uno nuevo.
 *  - El estado es honesto: "pendiente" desde el instante del cambio, no desde que
 *    sale el pedido.
 *  - Un fallo no se pierde: el valor queda pendiente, se informa el motivo, y se
 *    reintenta solo con el próximo cambio o a mano.
 *  - Se puede forzar el envío ya (`vaciar`), para no perder lo que se tipeó justo
 *    antes de cerrar o salir de la pantalla.
 *
 * No sabe nada de React ni de `fetch`: recibe una función `enviar`. Por eso se
 * puede probar con temporizadores falsos.
 */

export type EstadoDeGuardado =
  | { tipo: 'ocioso' }
  | { tipo: 'pendiente' }
  | { tipo: 'guardando' }
  | { tipo: 'guardado' }
  | { tipo: 'error'; motivo: string };

export interface OpcionesDelGuardador<T> {
  /**
   * Envía el valor. Tiene que rechazar (con un `Error` cuyo mensaje se pueda
   * mostrar) si no se guardó. `alSalir` es verdadero cuando se envía porque la
   * página se está cerrando: ahí hace falta `fetch` con `keepalive`.
   */
  enviar: (valor: T, contexto: { alSalir: boolean }) => Promise<void>;
  /** Cuánto se espera, sin cambios nuevos, antes de enviar. */
  esperaMs?: number;
  alCambiar?: (estado: EstadoDeGuardado) => void;
}

export interface Guardador<T> {
  /** Registra un cambio: queda pendiente y se envía tras `esperaMs` sin otros. */
  programar(valor: T): void;
  /** Envía ya lo pendiente, sin esperar. No hace nada si no hay nada. */
  vaciar(opciones?: { alSalir?: boolean }): Promise<void>;
  /** Vuelve a intentar lo que no se pudo guardar. */
  reintentar(): Promise<void>;
  /** Hay algo que el servidor todavía no tiene (pendiente, enviándose o fallado). */
  hayCambiosSinGuardar(): boolean;
  estado(): EstadoDeGuardado;
  /** Anula la espera. No descarta lo pendiente: `vaciar` lo sigue enviando. */
  cancelarEspera(): void;
}

const MENSAJE_POR_DEFECTO = 'no se pudo guardar';

export function crearGuardador<T>({
  enviar,
  esperaMs = 800,
  alCambiar,
}: OpcionesDelGuardador<T>): Guardador<T> {
  let ultimo: T | undefined;
  let pendiente = false;
  let enVuelo: Promise<void> | null = null;
  let temporizador: ReturnType<typeof setTimeout> | null = null;
  let actual: EstadoDeGuardado = { tipo: 'ocioso' };

  const cambiar = (estado: EstadoDeGuardado) => {
    actual = estado;
    alCambiar?.(estado);
  };

  const limpiarEspera = () => {
    if (temporizador !== null) {
      clearTimeout(temporizador);
      temporizador = null;
    }
  };

  /**
   * Envía lo pendiente, de a uno y siempre el más nuevo, hasta que no quede nada.
   * Si ya hay un envío en curso devuelve ESE: el bucle que lo corre va a levantar
   * lo que haya llegado mientras tanto, así nunca hay dos pedidos a la vez.
   */
  function vaciarTodo(alSalir: boolean): Promise<void> {
    limpiarEspera();
    if (enVuelo) return enVuelo;
    if (!pendiente) return Promise.resolve();

    enVuelo = (async () => {
      try {
        while (pendiente) {
          const valor = ultimo as T;
          pendiente = false;
          cambiar({ tipo: 'guardando' });
          try {
            await enviar(valor, { alSalir });
          } catch (error) {
            // El servidor no lo tiene: sigue pendiente (junto con cualquier valor
            // más nuevo que haya llegado). No se reintenta en bucle: se espera
            // al próximo cambio o a que alguien toque "Reintentar".
            pendiente = true;
            cambiar({
              tipo: 'error',
              motivo: error instanceof Error && error.message ? error.message : MENSAJE_POR_DEFECTO,
            });
            return;
          }
        }
        cambiar({ tipo: 'guardado' });
      } finally {
        enVuelo = null;
      }
    })();

    return enVuelo;
  }

  return {
    programar(valor) {
      ultimo = valor;
      pendiente = true;
      // Mientras hay un envío en curso el estado sigue siendo "guardando": el
      // bucle va a enviar este valor apenas termine el anterior.
      if (actual.tipo !== 'guardando') cambiar({ tipo: 'pendiente' });
      limpiarEspera();
      temporizador = setTimeout(() => {
        temporizador = null;
        void vaciarTodo(false);
      }, esperaMs);
    },

    vaciar(opciones) {
      return vaciarTodo(Boolean(opciones?.alSalir));
    },

    reintentar() {
      return vaciarTodo(false);
    },

    hayCambiosSinGuardar() {
      return pendiente || enVuelo !== null;
    },

    estado() {
      return actual;
    },

    cancelarEspera: limpiarEspera,
  };
}

/**
 * Por qué falló un guardado, en palabras que se puedan accionar.
 *
 * `esJson` es si la respuesta venía con cuerpo JSON de la aplicación. Cuando no,
 * quien contestó no fue el servidor de la aplicación sino algo delante —Cloudflare
 * o nginx— y eso se dice, porque es la pista que más tiempo ahorra: un 403 sin
 * JSON es casi siempre un bloqueo del proxy, no un problema de permisos.
 */
export function motivoDeFallo(estado: number, mensaje?: string, esJson = true): string {
  if (!esJson) {
    return `el pedido fue rechazado con ${estado} antes de llegar a la aplicación (Cloudflare o el servidor web lo bloquearon)`;
  }
  if (estado === 401) return 'tu sesión venció: volvé a iniciar sesión';
  if (estado === 403) return mensaje || 'no tenés permiso para editar el plan';
  if (estado === 409) return mensaje || 'otra persona guardó cambios mientras editabas: recargá la página';
  if (estado === 413) return 'el plan es demasiado grande';
  if (estado === 429) return 'demasiados pedidos seguidos: esperá un momento';
  if (estado >= 500) return mensaje ? `error del servidor (${mensaje})` : 'error del servidor';
  return mensaje || `error ${estado}`;
}
