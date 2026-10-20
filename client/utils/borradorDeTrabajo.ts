/**
 * El borrador de un trabajo a medio crear, guardado en el navegador.
 *
 * Si alguien deja a la mitad la pantalla de crear un trabajo (cierra la pestaña, se corta la conexión, sale a mirar otra cosa), lo escrito
 * se pierde. Acá se guarda solo, en este navegador y por cuenta, y se vuelve a cargar al regresar; aparece en el inicio como «borrador sin
 * publicar». No se sube a ningún servidor: no hay nada que pagar ni publicar hasta que la persona lo decida.
 *
 * Las FOTOS no se guardan (son archivos del dispositivo): hay que volver a elegirlas. Un borrador vence a los 30 días.
 */

export const VERSION_DEL_BORRADOR = 1;
export const DIAS_DE_VIDA_DEL_BORRADOR = 30;

export interface TareaDelBorrador {
  title: string;
  dueDate: string | null;
}

export interface BorradorDeTrabajo {
  version: number;
  guardadoEl: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  tags: string[];
  location: string;
  neighborhood: string;
  postalCode: string;
  addressStreet: string;
  addressNumber: string;
  addressDetails: string;
  budget: string;
  isQuotable: boolean;
  allowCounterOffers: boolean;
  singleDelivery: boolean;
  maxWorkers: number;
  requirements: string[];
  tareas: Array<{ title: string; dueDate: unknown }>;
  vacancyTaskAssignments: Array<{ slot: number; taskName: string }>;
  endDateFlexible: boolean;
  startDate: string | null;
  endDate: string | null;
  latitude: number | null;
  longitude: number | null;
  sinProteccion: boolean;
}

/** El almacenamiento mínimo que se usa (el `localStorage` del navegador, o uno falso en las pruebas). */
export interface Almacen {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
}

const almacenDelNavegador = (): Almacen | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // modo privado o almacenamiento bloqueado: el borrador simplemente no se guarda
  }
};

export const claveDelBorrador = (userId: string) => `doapp:borrador-de-trabajo:${userId}`;

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** ¿Hay algo escrito que valga la pena guardar? Un formulario vacío (o con solo los valores por defecto) no es un borrador. */
export function tieneContenido(b: Partial<BorradorDeTrabajo>): boolean {
  return (
    [b.title, b.summary, b.description, b.budget, b.location, b.addressStreet, b.neighborhood, b.addressDetails].some((v) => texto(v) !== "") ||
    (b.tags?.length ?? 0) > 0 ||
    (b.requirements ?? []).some((r) => texto(r) !== "") ||
    (b.tareas ?? []).some((t) => texto(t?.title) !== "")
  );
}

export function guardarBorrador(userId: string, borrador: Omit<BorradorDeTrabajo, "version" | "guardadoEl">, ahora = new Date(), almacen: Almacen | null = almacenDelNavegador()): boolean {
  if (!userId || !almacen) return false;
  try {
    if (!tieneContenido(borrador)) {
      almacen.removeItem(claveDelBorrador(userId));
      return false;
    }
    const completo: BorradorDeTrabajo = { ...borrador, version: VERSION_DEL_BORRADOR, guardadoEl: ahora.toISOString() };
    almacen.setItem(claveDelBorrador(userId), JSON.stringify(completo));
    return true;
  } catch {
    return false; // almacenamiento lleno o bloqueado
  }
}

/** El borrador de esta cuenta, o null si no hay, está vencido, es de una versión que ya no se entiende o está dañado (en esos casos se descarta). */
export function leerBorrador(userId: string, almacen: Almacen | null = almacenDelNavegador(), ahora = new Date()): BorradorDeTrabajo | null {
  if (!userId || !almacen) return null;
  const clave = claveDelBorrador(userId);
  try {
    const crudo = almacen.getItem(clave);
    if (!crudo) return null;
    const b = JSON.parse(crudo) as BorradorDeTrabajo;
    const guardado = new Date(b?.guardadoEl).getTime();
    const vencido = !Number.isFinite(guardado) || ahora.getTime() - guardado > DIAS_DE_VIDA_DEL_BORRADOR * 86_400_000;
    if (!b || b.version !== VERSION_DEL_BORRADOR || vencido || !tieneContenido(b)) {
      almacen.removeItem(clave);
      return null;
    }
    return b;
  } catch {
    try {
      almacen.removeItem(clave);
    } catch {
      /* nada más que hacer */
    }
    return null;
  }
}

export function borrarBorrador(userId: string, almacen: Almacen | null = almacenDelNavegador()): void {
  if (!userId || !almacen) return;
  try {
    almacen.removeItem(claveDelBorrador(userId));
  } catch {
    /* sin almacenamiento: no hay nada que borrar */
  }
}

/** «hace 5 minutos», «hace 2 horas», «ayer», «hace 3 días». */
export function haceCuanto(guardadoEl: string, ahora = new Date()): string {
  const min = Math.max(0, Math.round((ahora.getTime() - new Date(guardadoEl).getTime()) / 60_000));
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} ${min === 1 ? "minuto" : "minutos"}`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "ayer" : `hace ${dias} días`;
}
