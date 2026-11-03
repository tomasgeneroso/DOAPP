/**
 * Avisos en vivo a una persona, venga el cambio de donde venga.
 *
 * Antes cada ruta avisaba a mano (`notifyUser`, `notifyContractUpdate`…) y se olvidaba en los demás caminos: un cron que da por terminado un contrato, el
 * webhook de Mercado Pago que acredita un pago, una devolución al saldo, una notificación creada desde un servicio… cambiaban datos y la pantalla abierta de
 * la otra persona se quedaba con lo viejo hasta recargar. Acá, en cambio, se engancha el MODELO: cualquier guardado de un contrato, trabajo, propuesta, pago,
 * asiento de saldo, retiro, reclamo, mensaje o notificación avisa a las personas involucradas, lo guarde quien lo guarde (ruta, cron, webhook).
 *
 * Reglas:
 * - Los avisos van a la sala PERSONAL de cada usuario (`user:<id>`): llegan a todas sus pestañas y dispositivos, no sólo a la última que se conectó.
 * - Salen DESPUÉS de confirmar la transacción: si salieran antes, la pantalla recargaría y vería todavía lo viejo.
 * - Los avisos de «recargá» (sin datos propios) se juntan: guardar un contrato toca contrato, trabajo, pago, saldo y mensajes en el mismo instante, y la pantalla
 *   recarga una vez, no cinco. Los que traen datos (una notificación nueva, un mensaje de sistema) salen todos, uno por uno.
 * - Sólo viajan identificadores y estados, nunca datos de la persona ni importes.
 * - Sin servidor (pruebas, scripts) no hay nadie registrado y no hace nada.
 */
import type { Model, ModelStatic, Transaction } from 'sequelize';
import { conSistema } from '../db/contextoRls.js';

/** Sala a la que entran los administradores al conectarse (`services/socket.ts`). */
export const SALA_DE_ADMINISTRACION = 'admins';

type EmisorAUsuario =(usuarioId: string, evento: string, datos: unknown) => void;
type EmisorASala = (sala: string, evento: string, datos: unknown) => void;

let aUsuario: EmisorAUsuario | null = null;
let aSala: EmisorASala | null = null;

/** El servidor dice cómo llegar a la sala personal de alguien y a una sala cualquiera (`server/index.ts`). */
export function registrarAvisosEnVivo(emisores: { aUsuario: EmisorAUsuario; aSala: EmisorASala }): void {
  aUsuario = emisores.aUsuario;
  aSala = emisores.aSala;
}

/** Cuánto se espera para juntar avisos iguales. Corto: la persona no lo nota, y un guardado en cascada sale como uno. */
const VENTANA_MS = 120;

const pendientes = new Map<string, { usuarioId: string; evento: string; datos: unknown }>();
let temporizador: ReturnType<typeof setTimeout> | null = null;

function vaciarPendientes(): void {
  temporizador = null;
  const lote = [...pendientes.values()];
  pendientes.clear();
  for (const p of lote) {
    try {
      aUsuario?.(p.usuarioId, p.evento, p.datos);
    } catch {
      /* sin conexión en vivo: la pantalla lo ve en su próxima carga */
    }
  }
}

const idsValidos = (ids: Array<string | null | undefined>): string[] => [...new Set(ids.filter((i): i is string => !!i).map(String))];

export interface Aviso {
  /** A quiénes. Se descartan vacíos y repetidos. */
  usuarios?: Array<string | null | undefined>;
  /** O a una sala (la conversación abierta). */
  sala?: string;
  evento: string;
  datos?: Record<string, unknown>;
  /** Distingue avisos del mismo evento que NO deben juntarse (por ejemplo, dos contratos distintos). Sin clave se juntan todos los de ese evento. */
  clave?: string;
  /** Sale ya y entero, sin juntarse con otros: para lo que trae datos propios y no puede perderse ninguno (una notificación, un mensaje). */
  alInstante?: boolean;
}

/** Avisa a las personas, juntando los repetidos de los próximos milisegundos. Para «recargá esta pantalla». */
export function avisarJuntando(aviso: Aviso): void {
  if (!aUsuario) return;
  for (const usuarioId of idsValidos(aviso.usuarios ?? [])) {
    pendientes.set(`${usuarioId}|${aviso.evento}|${aviso.clave ?? ''}`, { usuarioId, evento: aviso.evento, datos: aviso.datos ?? {} });
  }
  if (pendientes.size && !temporizador) {
    temporizador = setTimeout(vaciarPendientes, VENTANA_MS);
    (temporizador as unknown as { unref?: () => void }).unref?.();
  }
}

/** Avisa ya, sin juntar. Para lo que trae datos propios y no se puede perder ninguno (una notificación, un mensaje). */
export function avisarAlInstante(usuarios: Array<string | null | undefined>, evento: string, datos: unknown): void {
  if (!aUsuario) return;
  for (const usuarioId of idsValidos(usuarios)) {
    try {
      aUsuario(usuarioId, evento, datos);
    } catch {
      /* ídem */
    }
  }
}

/** A una sala (la conversación abierta, los administradores). */
export function avisarASala(sala: string, evento: string, datos: unknown): void {
  try {
    aSala?.(sala, evento, datos);
  } catch {
    /* ídem */
  }
}

/** Ejecuta `fn` cuando el cambio ya quedó guardado: al confirmar la transacción si hay una, y ya si no la hay. */
export function cuandoQuedeGuardado(transaccion: Transaction | null | undefined, fn: () => void): void {
  if (transaccion && typeof transaccion.afterCommit === 'function') transaccion.afterCommit(fn);
  else fn();
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------
// Enganche a los modelos
// ---------------------------------------------------------------------------------------------------------------------------------------------------

type Fila = Record<string, any>;

export interface Fuente {
  modelo: ModelStatic<Model>;
  /** Columnas que hacen falta para saber a quién avisar y qué (se leen sólo estas en los cambios en masa). */
  columnas: string[];
  /** Qué avisar por una fila. Puede buscar a las personas involucradas si la fila no las trae (un reclamo sólo sabe su contrato). */
  avisos: (fila: Fila, esNueva: boolean) => Aviso[] | Promise<Aviso[]>;
}

/** Los cambios en masa que tocan más filas que esto no avisan una por una (un barrido de recordatorios no necesita mover pantallas). */
const TOPE_DE_FILAS_EN_MASA = 200;

async function emitir(fuente: Fuente, fila: Fila, esNueva: boolean): Promise<void> {
  try {
    const avisos = await fuente.avisos(fila, esNueva);
    for (const aviso of avisos) {
      if (aviso.sala) avisarASala(aviso.sala, aviso.evento, aviso.datos ?? {});
      else if (aviso.alInstante) avisarAlInstante(aviso.usuarios ?? [], aviso.evento, aviso.datos ?? {});
      else avisarJuntando(aviso);
    }
  } catch {
    /* un aviso en vivo nunca puede romper el guardado que lo originó */
  }
}

/**
 * Engancha una fuente a su modelo: avisa al guardar/crear una instancia y también en los cambios en masa (`Model.update(…, { where })`), que son el camino de los
 * «reclamos atómicos» (`UPDATE … WHERE estado IN (…)`) y de los crons, y que no traen las filas: se leen los ids ANTES de cambiarlas y se vuelven a leer después.
 */
export function engancharFuente(fuente: Fuente): void {
  const nombre = `avisosEnVivo:${fuente.modelo.name}`;
  const { modelo } = fuente;

  // `afterCreate` corre antes que `afterSave` con las MISMAS opciones: ahí se anota que la fila es nueva.
  modelo.addHook('afterCreate', `${nombre}:nueva`, (_instancia: Model, opciones: any) => {
    if (opciones) opciones.__avisosEsNueva = true;
  });

  modelo.addHook('afterSave', nombre, (instancia: Model, opciones: any) => {
    const fila = (instancia as unknown as { get: (o: { plain: true }) => Fila }).get({ plain: true });
    const esNueva = !!opciones?.__avisosEsNueva;
    cuandoQuedeGuardado(opciones?.transaction, () => void emitir(fuente, fila, esNueva));
  });

  modelo.addHook('beforeBulkUpdate', nombre, async (opciones: any) => {
    if (!opciones?.where) return;
    try {
      const ids = await conSistema(() =>
        modelo.findAll({ where: opciones.where, attributes: ['id'], raw: true, limit: TOPE_DE_FILAS_EN_MASA + 1, transaction: opciones.transaction ?? undefined }),
      );
      opciones.__avisosEnVivoIds = (ids as unknown as Fila[]).map((f) => f.id);
    } catch {
      opciones.__avisosEnVivoIds = [];
    }
  });

  modelo.addHook('afterBulkUpdate', nombre, async (opciones: any) => {
    const ids: string[] = opciones?.__avisosEnVivoIds ?? [];
    if (!ids.length || ids.length > TOPE_DE_FILAS_EN_MASA) return;
    try {
      // Se releen DESPUÉS del cambio (dentro de la misma transacción, que es la única que ve lo nuevo) para avisar el estado de ahora.
      const filas = await conSistema(() =>
        modelo.findAll({ where: { id: ids } as any, attributes: fuente.columnas, raw: true, transaction: opciones.transaction ?? undefined }),
      );
      cuandoQuedeGuardado(opciones.transaction, () => {
        for (const fila of filas as unknown as Fila[]) void emitir(fuente, fila, false);
      });
    } catch {
      /* ídem */
    }
  });

  modelo.addHook('afterBulkCreate', nombre, (instancias: Model[], opciones: { transaction?: Transaction | null }) => {
    const filas = instancias.map((i) => (i as unknown as { get: (o: { plain: true }) => Fila }).get({ plain: true }));
    cuandoQuedeGuardado(opciones?.transaction, () => {
      for (const fila of filas) void emitir(fuente, fila, true);
    });
  });
}
