import { COMPONENTES, type ComponenteId, type ComponenteReportable } from '../../shared/salud/componentes.js';
import { avisarAlDuenoPorCorreo, ENTRE_AVISOS_MS } from './avisoAlDueno.js';
import { avisosAlDuenoActivos } from './avisosAlDuenoActivos.js';

/**
 * Qué partes de DOAPP están fallando AHORA y cuándo avisar (pedido del dueño, 2026-11-27).
 *
 *  - Un tropiezo suelto no avisa. Una parte se da por caída cuando falla `FALLAS_PARA_AVISAR` veces en `VENTANA_DE_FALLAS_MS`, cuando su chequeo falla dos
 *    veces seguidas, o cuando la reportan `CONEXIONES_PARA_AVISAR` conexiones distintas desde el navegador (así un bloqueador de anuncios o un celular sin
 *    señal no dan una falsa alarma).
 *  - Al caerse: correo al owner y aviso dentro de DOAPP (que llega aunque lo caído sea el correo). Si sigue caída, se recuerda cada 6 h. Al volver: otro
 *    correo con cuánto duró.
 *  - El estado vive en memoria: si el servidor se reinicia, empieza de cero (y vuelve a avisar si sigue fallando).
 */
export const FALLAS_PARA_AVISAR = 3;
export const VENTANA_DE_FALLAS_MS = 15 * 60_000;
export const CHEQUEOS_SEGUIDOS_PARA_AVISAR = 2;
export const CONEXIONES_PARA_AVISAR = 3;
export const VENTANA_DEL_NAVEGADOR_MS = 10 * 60_000;
/** Entre dos intentos de mandar el correo de una misma caída (si el que falla es el correo, no se insiste a cada rato). */
export const ENTRE_INTENTOS_MS = 15 * 60_000;
/** Una parte sin chequeo propio que deja de fallar este tiempo se da por buena, en silencio. */
export const CALMA_PARA_OLVIDAR_MS = 60 * 60_000;

interface Estado {
  fallas: number[];
  chequeosFallidos: number;
  conexiones: Map<string, number>;
  caidaDesde: number | null;
  fallasEnLaCaida: number;
  ultimaFalla: number;
  motivo: string;
  ultimoAviso: number | null;
  ultimoIntento: number | null;
}

const estados = new Map<ComponenteId, Estado>();

function de(id: ComponenteId): Estado {
  let e = estados.get(id);
  if (!e) {
    e = { fallas: [], chequeosFallidos: 0, conexiones: new Map(), caidaDesde: null, fallasEnLaCaida: 0, ultimaFalla: 0, motivo: '', ultimoAviso: null, ultimoIntento: null };
    estados.set(id, e);
  }
  return e;
}

/** Para las pruebas. */
export function __reiniciarSalud(): void {
  estados.clear();
}

export function componentesCaidos(): Array<{ id: ComponenteId; desde: number; motivo: string }> {
  return [...estados.entries()].filter(([, e]) => e.caidaDesde !== null).map(([id, e]) => ({ id, desde: e.caidaDesde!, motivo: e.motivo }));
}

const hora = (ms: number): string => new Date(ms).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' });

async function avisarDentroDeDoapp(titulo: string, mensaje: string): Promise<void> {
  try {
    const [{ User }, { Notification }, { conSistema }] = await Promise.all([
      import('../models/sql/User.model.js'), import('../models/sql/Notification.model.js'), import('../db/contextoRls.js'),
    ]);
    await conSistema(async () => {
      const duenos = await User.findAll({ where: { adminRole: 'owner' } as never, attributes: ['id'] });
      for (const d of duenos) {
        await Notification.create({ recipientId: d.id, type: 'error', category: 'system', title: titulo.slice(0, 200), message: mensaje, actionUrl: '/admin/manual', sentVia: ['in_app'] } as never);
      }
    });
  } catch (e) {
    console.error('[salud] no se pudo dejar el aviso dentro de DOAPP:', (e as Error).message);
  }
}

async function mandarElCorreo(id: ComponenteId, e: Estado, ahora: number): Promise<void> {
  if (e.caidaDesde === null) return;
  if (e.ultimoAviso !== null && ahora - e.ultimoAviso < ENTRE_AVISOS_MS) return;
  if (e.ultimoIntento !== null && ahora - e.ultimoIntento < ENTRE_INTENTOS_MS) return;
  // Se anota ANTES de mandar: si lo que falla es el correo, la falla de este mismo envío no dispara otro.
  e.ultimoIntento = ahora;
  const c = COMPONENTES[id];
  const salio = await avisarAlDuenoPorCorreo({
    clave: `salud:caida:${id}`,
    asunto: `Está fallando: ${c.nombre}`,
    quePaso: `${c.nombre} está fallando desde ${hora(e.caidaDesde)}. Afecta: ${c.afecta}`,
    queHacer: c.queHacer,
    detalle: e.motivo,
  }, ahora);
  if (salio) e.ultimoAviso = ahora;
}

async function declararCaida(id: ComponenteId, ahora: number): Promise<void> {
  const e = de(id);
  if (e.caidaDesde === null) {
    e.caidaDesde = ahora;
    // La cuenta de la caída arranca con las fallas que llevaron a declararla.
    e.fallasEnLaCaida = Math.max(1, e.fallas.length, e.chequeosFallidos, e.conexiones.size);
    console.error(`[COMPONENTE CAÍDO] ${COMPONENTES[id].nombre}: ${e.motivo}`);
    await avisarDentroDeDoapp(`Está fallando: ${COMPONENTES[id].nombre}`, `${COMPONENTES[id].afecta} ${COMPONENTES[id].queHacer}`);
  }
  await mandarElCorreo(id, e, ahora);
}

async function declararRecuperada(id: ComponenteId, ahora: number): Promise<void> {
  const e = de(id);
  const desde = e.caidaDesde;
  const fallas = e.fallasEnLaCaida;
  estados.delete(id);
  if (desde === null) return;
  const minutos = Math.max(1, Math.round((ahora - desde) / 60_000));
  console.warn(`[COMPONENTE RECUPERADO] ${COMPONENTES[id].nombre}, después de ${minutos} min.`);
  await avisarAlDuenoPorCorreo({
    clave: `salud:vuelta:${id}`,
    asunto: `Volvió a funcionar: ${COMPONENTES[id].nombre}`,
    quePaso: `${COMPONENTES[id].nombre} volvió a funcionar. Falló desde ${hora(desde)} hasta ${hora(ahora)} (${minutos} minutos); se registraron ${fallas} fallas.`,
    queHacer: id === 'correos' ? 'Los correos que no salieron en ese rato no se reenvían solos: quien esperaba uno puede volver a pedirlo.' : undefined,
  }, ahora);
}

const anotar = (e: Estado, motivo: string, ahora: number): void => {
  e.ultimaFalla = ahora;
  e.fallasEnLaCaida++;
  if (motivo) e.motivo = motivo.slice(0, 400);
};

/** Un tropiezo que atrapó el código. */
export async function reportarFalla(id: ComponenteId, motivo: string, ahora: number = Date.now()): Promise<void> {
  if (!avisosAlDuenoActivos()) return;
  const e = de(id);
  anotar(e, motivo, ahora);
  e.fallas = [...e.fallas.filter((t) => ahora - t < VENTANA_DE_FALLAS_MS), ahora].slice(-FALLAS_PARA_AVISAR);
  if (e.caidaDesde !== null || e.fallas.length >= FALLAS_PARA_AVISAR) await declararCaida(id, ahora);
}

/** Algo de esa parte salió bien. */
export async function reportarExito(id: ComponenteId, ahora: number = Date.now()): Promise<void> {
  const e = estados.get(id);
  if (!e) return;
  if (e.caidaDesde !== null) await declararRecuperada(id, ahora);
  else e.fallas = [];
}

/** El resultado de un chequeo propio: `null` si anda, o el motivo. */
export async function anotarChequeo(id: ComponenteId, motivo: string | null, ahora: number = Date.now()): Promise<void> {
  if (!avisosAlDuenoActivos()) return;
  if (motivo === null) {
    const e = estados.get(id);
    if (!e) return;
    e.chequeosFallidos = 0;
    if (e.caidaDesde !== null) await declararRecuperada(id, ahora);
    return;
  }
  const e = de(id);
  anotar(e, motivo, ahora);
  e.chequeosFallidos++;
  if (e.caidaDesde !== null || e.chequeosFallidos >= CHEQUEOS_SEGUIDOS_PARA_AVISAR) await declararCaida(id, ahora);
}

/** Lo que reporta un navegador. `origen` es un resumen irreversible de la conexión, que vive solo en memoria y solo para contar cuántas distintas son. */
export async function reportarDesdeElNavegador(id: ComponenteReportable, origen: string, ahora: number = Date.now()): Promise<void> {
  if (!avisosAlDuenoActivos()) return;
  const e = de(id);
  for (const [o, t] of e.conexiones) if (ahora - t >= VENTANA_DEL_NAVEGADOR_MS) e.conexiones.delete(o);
  if (e.conexiones.size < 1000) e.conexiones.set(origen, ahora);
  anotar(e, `Lo reportan desde el navegador ${e.conexiones.size} conexión(es) distinta(s) en los últimos ${VENTANA_DEL_NAVEGADOR_MS / 60_000} minutos.`, ahora);
  if (e.conexiones.size >= CONEXIONES_PARA_AVISAR) await declararCaida(id, ahora);
}

/** Las partes sin chequeo propio que llevan un rato sin fallar se dan por buenas (así la próxima falla vuelve a avisar). */
export function olvidarLasCalmadas(conChequeo: ReadonlySet<ComponenteId>, ahora: number = Date.now()): void {
  for (const [id, e] of estados) {
    if (!conChequeo.has(id) && ahora - e.ultimaFalla >= CALMA_PARA_OLVIDAR_MS) estados.delete(id);
  }
}
