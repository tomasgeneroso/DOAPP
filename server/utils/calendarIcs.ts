import crypto from "crypto";
import { User } from "../models/sql/User.model.js";

/** Escape text for inclusion in an iCalendar (.ics) field. */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Format a Date as an iCalendar UTC timestamp (YYYYMMDDTHHMMSSZ). */
export function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Deterministic per-user token for the public calendar feed URL.
 * NOTE: secret source kept identical to the original inline implementation so
 * existing subscription URLs remain valid. (In production JWT_SECRET is set.)
 */
export function generateCalendarToken(userId: string): string {
  return crypto
    .createHash("sha256")
    .update(`${userId}-${process.env.JWT_SECRET || "doapp-secret"}-calendar`)
    .digest("hex")
    .substring(0, 32);
}

/**
 * De quién es el calendario de este enlace. El enlace no lleva el id de la persona (los que ya están suscriptos en Google Calendar tienen que seguir andando), así que
 * antes cada pedido ANÓNIMO traía a TODAS las cuentas de la base y calculaba un hash por cada una: con unos pocos pedidos se podía tumbar el servidor.
 * Ahora la lista de enlaces se arma una vez y se guarda 5 minutos; un enlace que no está se vuelve a buscar como mucho una vez por minuto (cuentas nuevas).
 */
const VIDA_DE_LA_LISTA_MS = 5 * 60 * 1000;
const ESPERA_ANTES_DE_BUSCAR_DE_NUEVO_MS = 60 * 1000;
let enlaces = new Map<string, string>();
let armadaEn = 0;
let armando: Promise<void> | null = null;

async function armarLista(): Promise<void> {
  if (!armando) {
    armando = (async () => {
      const cuentas = await User.findAll({ attributes: ["id"] });
      enlaces = new Map(cuentas.map((u) => [generateCalendarToken(String(u.id)), String(u.id)]));
      armadaEn = Date.now();
    })().finally(() => {
      armando = null;
    });
  }
  await armando;
}

export async function idDelDuenoDelCalendario(token: string): Promise<string | null> {
  if (!/^[a-f0-9]{32}$/.test(String(token))) return null;
  if (!armadaEn || Date.now() - armadaEn > VIDA_DE_LA_LISTA_MS) await armarLista();
  let id = enlaces.get(token);
  if (!id && Date.now() - armadaEn > ESPERA_ANTES_DE_BUSCAR_DE_NUEVO_MS) {
    await armarLista();
    id = enlaces.get(token);
  }
  return id ?? null;
}
