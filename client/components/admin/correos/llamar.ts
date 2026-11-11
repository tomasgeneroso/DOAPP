/**
 * Llamadas del módulo de correos a la API de administración (`/api/admin/correos`). Devuelve siempre la misma forma, con el motivo en lenguaje claro si falló, para que
 * cada pantalla muestre el mensaje del servidor tal cual (el servidor ya habla con palabras simples).
 */
export interface Respuesta<T = any> {
  ok: boolean;
  estado: number;
  datos?: T;
  mensaje?: string;
  campo?: string;
  codigo?: string;
  /** Datos extra de un error (por ejemplo, el total nuevo cuando el grupo cambió). */
  extra?: any;
}

export async function llamar<T = any>(ruta: string, metodo: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', cuerpo?: unknown): Promise<Respuesta<T>> {
  try {
    const r = await fetch(`/api/admin/correos${ruta}`, {
      method: metodo,
      credentials: 'include',
      headers: cuerpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    return { ok: !!d?.success, estado: r.status, datos: d?.data, mensaje: d?.message, campo: d?.field, codigo: d?.code, extra: d?.data };
  } catch {
    return { ok: false, estado: 0, mensaje: 'Error de conexión. Probá de nuevo.' };
  }
}

export const ROTULO_DE_ESTADO: Record<string, { texto: string; clase: string }> = {
  draft: { texto: 'Borrador', clase: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200' },
  sending: { texto: 'Enviando', clase: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' },
  sent: { texto: 'Enviada', clase: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  cancelled: { texto: 'Cancelada', clase: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
};

export const ROTULO_DE_CATEGORIA: Record<string, string> = {
  servicio: 'Recordatorio de la cuenta',
  promocional: 'Novedades y ofertas',
};

export const ROTULO_DE_RITMO: Record<string, string> = {
  lento: 'Lento · 60 por hora',
  normal: 'Normal · 180 por hora',
  rapido: 'Rápido · 300 por hora',
};
