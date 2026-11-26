/** Pedidos de «momentos». La sesión va en la cookie; el encabezado es el marcador de siempre (ver utils/sesion.ts). */
export async function pedirMomentos<T = any>(ruta: string, cuerpo?: unknown): Promise<{ ok: boolean; data?: T; message?: string }> {
  try {
    const r = await fetch(`/api/momentos${ruta}`, {
      method: cuerpo === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const j = await r.json().catch(() => null);
    return { ok: r.ok && !!j?.success, data: j?.data, message: j?.message };
  } catch {
    return { ok: false, message: 'Revisá tu conexión y probá de nuevo.' };
  }
}

/** Comparte con la hoja del teléfono; si el navegador no la tiene, copia el texto. Devuelve qué pasó para poder decirlo. */
export async function compartirTexto(texto: string, url?: string): Promise<'compartido' | 'copiado' | 'nada'> {
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share(url ? { text: texto, url } : { text: texto });
      return 'compartido';
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') return 'nada';
  }
  try {
    await navigator.clipboard.writeText(url ? `${texto} ${url}` : texto);
    return 'copiado';
  } catch {
    return 'nada';
  }
}
