import { ErrorResponse } from "./errorHandler.js";

/**
 * Qué orígenes puede usar el navegador para hablar con la API.
 *
 * Vive acá y no inline en `server/index.ts` por dos razones:
 *
 *  1. Es lógica de seguridad (junto a `credentials: true` decide quién puede
 *     hacer pedidos con cookies) y no tenía una sola prueba.
 *
 *  2. Rechazaba con `new Error(...)` pelado. El manejador de errores le pone
 *     500 a todo lo que no trae `statusCode`, y loguea con stack trace todo lo
 *     que sea 500. Resultado: cada bot que sondea `/api/graphql` desde un
 *     origen cualquiera quedaba registrado como una falla del servidor, con
 *     diez líneas de stack, y le respondíamos un 500 que no corresponde.
 *
 *     Un origen no autorizado es un 403. Y tiene que NO loguearse: el manejador
 *     dice, con razón, que "los 500 son los únicos que hay que mirar". Los
 *     sondeos de los bots ensuciaban justo esa señal.
 *
 * El rechazo se mantiene —el pedido no llega a las rutas—: lo único que cambia
 * es que ahora es un 403 limpio en vez de un 500 con stack.
 */
export interface OpcionesDeOrigen {
  clientUrl: string;
  /** Orígenes adicionales (CORS_ORIGINS): por ejemplo staging. */
  corsOrigins: string[];
  /** En desarrollo se permite cualquier origen. */
  esDesarrollo: boolean;
}

type Callback = (err: Error | null, permitir?: boolean) => void;

export function crearVerificadorDeOrigen({
  clientUrl,
  corsOrigins,
  esDesarrollo,
}: OpcionesDeOrigen) {
  const permitidos = new Set([clientUrl, ...corsOrigins].filter(Boolean));

  return (origin: string | undefined, callback: Callback): void => {
    // Sin cabecera Origin: apps móviles, curl, llamadas servidor a servidor.
    if (!origin) return callback(null, true);

    // En desarrollo se acepta cualquier origen, así que no hace falta listar
    // los localhost de Expo y Vite como se hacía antes: eran redundantes.
    if (esDesarrollo || permitidos.has(origin)) return callback(null, true);

    callback(new ErrorResponse("Not allowed by CORS", 403));
  };
}
