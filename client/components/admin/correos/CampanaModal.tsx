import { useEffect, useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import Transicion from '../../ui/Transicion';
import VistaPrevia from './VistaPrevia';
import { llamar, ROTULO_DE_CATEGORIA, ROTULO_DE_ESTADO, ROTULO_DE_RITMO } from './llamar';

const campo = 'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent';
const POR_MINUTO: Record<string, number> = { lento: 1, normal: 3, rapido: 5 };

export interface PlantillaDeLista {
  id: string;
  name: string;
  category: 'servicio' | 'promocional';
  subject: string;
  body: string;
  buttonLabel: string | null;
  buttonUrl: string | null;
}
export interface GrupoDeLista {
  id: string;
  name: string;
  description: string | null;
  resumen: string;
  filters: Record<string, unknown>;
  servicio: number;
  promocional: number;
}

/** Cuánto tarda en salir todo, dicho para una persona: «unos 40 minutos», «unas 2 horas». */
export function tiempoDeEnvio(personas: number, ritmo: string): string {
  const minutos = Math.ceil(personas / Math.min(POR_MINUTO[ritmo] ?? 3, 10));
  if (minutos <= 1) return 'menos de un minuto';
  if (minutos < 90) return `unos ${minutos} minutos`;
  return `unas ${Math.round(minutos / 60)} horas`;
}

/** Armar una campaña: elegir una plantilla, elegir un grupo y el ritmo. Queda en borrador: todavía no se manda nada. */
export function CampanaNueva({ plantillas, grupos, onCerrar, onCreada }: { plantillas: PlantillaDeLista[]; grupos: GrupoDeLista[]; onCerrar: () => void; onCreada: (id: string) => void }) {
  const [nombre, setNombre] = useState('');
  const [plantillaId, setPlantillaId] = useState(plantillas[0]?.id ?? '');
  const [grupoId, setGrupoId] = useState(grupos[0]?.id ?? '');
  const [ritmo, setRitmo] = useState('normal');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const plantilla = plantillas.find((p) => p.id === plantillaId);
  const grupo = grupos.find((g) => g.id === grupoId);
  const alcanza = grupo ? (plantilla?.category === 'promocional' ? grupo.promocional : grupo.servicio) : 0;

  const crear = async () => {
    setGuardando(true);
    setError(null);
    const r = await llamar<{ id: string }>('/campaigns', 'POST', { name: nombre, templateId: plantillaId, audienceId: grupoId, pace: ritmo });
    setGuardando(false);
    if (!r.ok || !r.datos) {
      setError(r.mensaje || 'No pudimos armar la campaña.');
      return;
    }
    onCreada(r.datos.id);
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="camp-titulo" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="my-6 w-full max-w-4xl rounded-2xl bg-white dark:bg-slate-800 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-700 p-5">
          <div>
            <h2 id="camp-titulo" className="text-lg font-bold text-slate-900 dark:text-white">Nueva campaña</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Elegí qué mandar y a quiénes. Se arma como borrador: no sale nada hasta que lo confirmes.</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="h-5 w-5" /></button>
        </div>

        {plantillas.length === 0 || grupos.length === 0 ? (
          <p className="p-6 text-sm text-slate-600 dark:text-slate-300">Para armar una campaña hace falta al menos una plantilla y un grupo. Creálos en las otras pestañas.</p>
        ) : (
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label htmlFor="ca-nombre" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre de la campaña</label>
                <input id="ca-nombre" className={campo} value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} placeholder="Recordatorio de registro · noviembre" />
              </div>
              <div>
                <label htmlFor="ca-plantilla" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Plantilla</label>
                <select id="ca-plantilla" className={campo} value={plantillaId} onChange={(e) => setPlantillaId(e.target.value)}>
                  {plantillas.map((p) => <option key={p.id} value={p.id}>{p.name} · {ROTULO_DE_CATEGORIA[p.category]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ca-grupo" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Grupo de destinatarios</label>
                <select id="ca-grupo" className={campo} value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
                  {grupos.map((g) => <option key={g.id} value={g.id}>{g.name} ({plantilla?.category === 'promocional' ? g.promocional : g.servicio} personas hoy)</option>)}
                </select>
                {grupo && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{grupo.resumen}</p>}
              </div>
              <div>
                <label htmlFor="ca-ritmo" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Ritmo de envío</label>
                <select id="ca-ritmo" className={campo} value={ritmo} onChange={(e) => setRitmo(e.target.value)}>
                  {Object.entries(ROTULO_DE_RITMO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Se manda de a poco para no saturar el correo de la plataforma. {alcanza > 0 && <>Para {alcanza} personas: {tiempoDeEnvio(alcanza, ritmo)}.</>}</p>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">El correo</h3>
              {plantilla && <VistaPrevia plantilla={{ asunto: plantilla.subject, cuerpo: plantilla.body, botonTexto: plantilla.buttonLabel, botonUrl: plantilla.buttonUrl }} alto={360} />}
              <p className="text-xs text-slate-500 dark:text-slate-400">Se guarda una copia del texto y de los filtros: si después cambiás la plantilla o el grupo, esta campaña sigue igual.</p>
            </div>
          </div>
        )}

        {error && <div role="alert" className="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
        <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-700 p-5">
          <button type="button" onClick={onCerrar} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Cancelar</button>
          <button type="button" onClick={crear} disabled={guardando || !nombre.trim() || !plantillaId || !grupoId} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Armar borrador
          </button>
        </div>
      </div>
    </div>
  );
}

interface Detalle {
  id: string;
  name: string;
  status: string;
  category: string;
  templateName: string | null;
  audienceName: string | null;
  subject: string;
  body: string;
  buttonLabel: string | null;
  buttonUrl: string | null;
  pace: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  resumenDelGrupo: string;
  motivos: Array<{ estado: string; motivo: string; cantidad: number }>;
  alcanzaHoy: number | null;
}

/** Ver una campaña: el correo, a quiénes, cómo va. Si es un borrador: mandar una prueba y enviarla (con confirmación). Si está enviando: cancelar. */
export function CampanaDetalle({ id, onCerrar, onCambio }: { id: string; onCerrar: () => void; onCambio: () => void }) {
  const [d, setD] = useState<Detalle | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [entiendo, setEntiendo] = useState(false);
  const [ocupado, setOcupado] = useState<null | 'prueba' | 'enviar' | 'cancelar' | 'borrar'>(null);

  const cargar = async () => {
    const r = await llamar<Detalle>(`/campaigns/${id}`);
    if (r.ok && r.datos) setD(r.datos);
    else setAviso({ tipo: 'error', texto: r.mensaje || 'No pudimos traer la campaña.' });
  };
  useEffect(() => {
    void cargar();
    // mientras envía, se actualiza sola
    const t = setInterval(() => void cargar(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const hacer = async (que: 'prueba' | 'enviar' | 'cancelar' | 'borrar') => {
    setOcupado(que);
    setAviso(null);
    const r =
      que === 'prueba' ? await llamar(`/campaigns/${id}/test`, 'POST')
      : que === 'enviar' ? await llamar(`/campaigns/${id}/send`, 'POST', { confirmaTotal: d?.alcanzaHoy })
      : que === 'cancelar' ? await llamar(`/campaigns/${id}/cancel`, 'POST')
      : await llamar(`/campaigns/${id}`, 'DELETE');
    setOcupado(null);
    setAviso({ tipo: r.ok ? 'ok' : 'error', texto: r.mensaje || (r.ok ? 'Listo.' : 'No se pudo.') });
    if (que === 'enviar') {
      setConfirmando(false);
      setEntiendo(false);
    }
    onCambio();
    if (r.ok && que === 'borrar') onCerrar();
    else await cargar();
  };

  const estado = d ? ROTULO_DE_ESTADO[d.status] : null;
  const hechos = d ? d.sent + d.failed + d.skipped : 0;
  const porcentaje = d && d.total > 0 ? Math.round((hechos / d.total) * 100) : 0;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="det-titulo" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="my-6 w-full max-w-4xl rounded-2xl bg-white dark:bg-slate-800 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-700 p-5">
          <div>
            <h2 id="det-titulo" className="text-lg font-bold text-slate-900 dark:text-white">{d?.name ?? 'Campaña'}</h2>
            {d && <p className="text-sm text-slate-500 dark:text-slate-400">Plantilla «{d.templateName}» · grupo «{d.audienceName}» · {ROTULO_DE_RITMO[d.pace]}</p>}
          </div>
          <div className="flex items-center gap-3">
            {estado && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${estado.clase}`}>{estado.texto}</span>}
            <button onClick={onCerrar} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {!d ? (
          <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-label="Cargando" /></div>
        ) : (
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-700 dark:text-slate-300">
                <p className="font-semibold text-slate-900 dark:text-white">A quiénes</p>
                <p className="mt-1">{d.resumenDelGrupo}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{ROTULO_DE_CATEGORIA[d.category]}</p>
              </div>

              {d.status === 'draft' ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <p className="text-sm text-slate-600 dark:text-slate-300">Hoy lo recibirían</p>
                  <p className="text-4xl font-bold text-slate-900 dark:text-white" aria-live="polite">{d.alcanzaHoy ?? '—'} <span className="text-base font-medium text-slate-500">personas</span></p>
                  {!!d.alcanzaHoy && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Saldría de a poco: {tiempoDeEnvio(d.alcanzaHoy, d.pace)}.</p>}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <div className="flex justify-between text-sm text-slate-600 dark:text-slate-300"><span>Avance</span><span>{hechos} de {d.total}</span></div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100} aria-label="Avance del envío">
                    <div className="h-full rounded-full bg-sky-600 transition-all duration-500" style={{ width: `${porcentaje}%` }} />
                  </div>
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                    {([['Enviados', d.sent, 'text-emerald-600 dark:text-emerald-400'], ['Pendientes', d.pending, 'text-sky-600 dark:text-sky-400'], ['No salieron', d.failed, 'text-red-600 dark:text-red-400'], ['Salteados', d.skipped, 'text-amber-600 dark:text-amber-400']] as const).map(([t, n, c]) => (
                      <div key={t}><dd className={`text-xl font-bold ${c}`}>{n}</dd><dt className="text-slate-500 dark:text-slate-400">{t}</dt></div>
                    ))}
                  </dl>
                  {d.motivos.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {d.motivos.map((m, i) => <li key={i}>{m.cantidad} · {m.estado === 'failed' ? 'No salió' : 'Salteado'}: {m.motivo || 'sin motivo'}</li>)}
                    </ul>
                  )}
                </div>
              )}

              <Transicion mostrar={!!aviso}>
                {aviso && <div role="status" className={`rounded-lg border p-3 text-sm ${aviso.tipo === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'}`}>{aviso.texto}</div>}
              </Transicion>

              {d.status === 'draft' && (
                <div className="space-y-3">
                  <button type="button" onClick={() => hacer('prueba')} disabled={ocupado !== null} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">
                    {ocupado === 'prueba' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviarme una prueba
                  </button>
                  {!confirmando ? (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setConfirmando(true)} disabled={!d.alcanzaHoy || ocupado !== null} className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">Enviar la campaña…</button>
                      <button type="button" onClick={() => hacer('borrar')} disabled={ocupado !== null} className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20">Borrar borrador</button>
                    </div>
                  ) : (
                    <div className="rounded-xl border-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4" role="group" aria-label="Confirmar el envío">
                      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Vas a mandar «{d.name}» a {d.alcanzaHoy} personas.</p>
                      <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">Sale de a poco ({tiempoDeEnvio(d.alcanzaHoy ?? 0, d.pace)}). Lo que ya salió no se puede deshacer; podés cancelar lo que falte.</p>
                      <label className="mt-3 flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
                        <input type="checkbox" className="mt-0.5" checked={entiendo} onChange={(e) => setEntiendo(e.target.checked)} />
                        Revisé el texto (mandé una prueba) y el grupo.
                      </label>
                      <div className="mt-3 flex gap-2">
                        <button type="button" onClick={() => hacer('enviar')} disabled={!entiendo || ocupado !== null} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                          {ocupado === 'enviar' && <Loader2 className="h-4 w-4 animate-spin" />} Sí, enviar a {d.alcanzaHoy}
                        </button>
                        <button type="button" onClick={() => { setConfirmando(false); setEntiendo(false); }} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700">Volver</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {d.status === 'sending' && (
                <button type="button" onClick={() => hacer('cancelar')} disabled={ocupado !== null} className="inline-flex items-center gap-2 rounded-lg border border-red-300 dark:border-red-800 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                  {ocupado === 'cancelar' && <Loader2 className="h-4 w-4 animate-spin" />} Cancelar lo que falta enviar
                </button>
              )}
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">El correo</h3>
              <VistaPrevia plantilla={{ asunto: d.subject, cuerpo: d.body, botonTexto: d.buttonLabel, botonUrl: d.buttonUrl }} alto={380} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
