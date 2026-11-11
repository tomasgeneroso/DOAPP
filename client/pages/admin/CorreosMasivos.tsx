import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Edit2, FileText, Loader2, Mail, Plus, Trash2, Users } from 'lucide-react';
import { useCambiosDeAdministracion } from '../../hooks/useSocket';
import Transicion from '../../components/ui/Transicion';
import { llamar, ROTULO_DE_CATEGORIA, ROTULO_DE_ESTADO, ROTULO_DE_RITMO } from '../../components/admin/correos/llamar';
import PlantillaModal, { PLANTILLA_EN_BLANCO, type PlantillaEditable } from '../../components/admin/correos/PlantillaModal';
import GrupoModal, { GRUPO_EN_BLANCO, type GrupoEditable } from '../../components/admin/correos/GrupoModal';
import { CampanaDetalle, CampanaNueva, type GrupoDeLista, type PlantillaDeLista } from '../../components/admin/correos/CampanaModal';

/**
 * Correos a usuarios (regla del dueño, 2026-11-11): escribir plantillas, armar grupos de destinatarios y mandar campañas, por ejemplo «terminá tu registro» a quienes lo dejaron sin
 * terminar. Tres pestañas: Campañas (lo que se manda y cómo va), Plantillas (el texto) y Grupos (a quiénes). Todo se actualiza en vivo.
 */
interface Campana {
  id: string;
  name: string;
  status: string;
  category: string;
  templateName: string | null;
  audienceName: string | null;
  subject: string;
  pace: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  createdAt: string;
}

type Pestana = 'campanas' | 'plantillas' | 'grupos';
const PESTANAS: Array<{ id: Pestana; texto: string; icono: typeof Mail }> = [
  { id: 'campanas', texto: 'Campañas', icono: Mail },
  { id: 'plantillas', texto: 'Plantillas', icono: FileText },
  { id: 'grupos', texto: 'Grupos', icono: Users },
];

const fecha = (iso: string) => new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });

export default function CorreosMasivos() {
  const [pestana, setPestana] = useState<Pestana>('campanas');
  const [campanas, setCampanas] = useState<Campana[] | null>(null);
  const [plantillas, setPlantillas] = useState<PlantillaDeLista[] | null>(null);
  const [grupos, setGrupos] = useState<GrupoDeLista[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [plantillaEditable, setPlantillaEditable] = useState<PlantillaEditable | null>(null);
  const [grupoEditable, setGrupoEditable] = useState<(GrupoEditable & { filters: any }) | null>(null);
  const [nuevaCampana, setNuevaCampana] = useState(false);
  const [campanaAbierta, setCampanaAbierta] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    const [c, p, g] = await Promise.all([llamar<Campana[]>('/campaigns'), llamar<PlantillaDeLista[]>('/templates'), llamar<any[]>('/audiences')]);
    if (!c.ok || !p.ok || !g.ok) {
      setError(c.mensaje || p.mensaje || g.mensaje || 'No pudimos traer los datos.');
      return;
    }
    setError(null);
    setCampanas(c.datos ?? []);
    setPlantillas(p.datos ?? []);
    setGrupos((g.datos ?? []) as GrupoDeLista[]);
  }, []);

  useEffect(() => {
    void recargar(); // eslint-disable-line react-hooks/set-state-in-effect -- async fetch, not direct setState
  }, [recargar]);
  useCambiosDeAdministracion(['campaign'], () => void recargar());

  const avisar = (texto: string) => {
    setAviso(texto);
    setTimeout(() => setAviso(null), 4000);
  };

  const borrarPlantilla = async (p: PlantillaDeLista) => {
    if (!window.confirm(`¿Borrar la plantilla «${p.name}»? Las campañas que ya armaste con ella no cambian.`)) return;
    const r = await llamar(`/templates/${p.id}`, 'DELETE');
    if (r.ok) avisar(r.mensaje || 'Plantilla borrada.');
    else setError(r.mensaje || 'No pudimos borrarla.');
    void recargar();
  };
  const borrarGrupo = async (g: GrupoDeLista) => {
    if (!window.confirm(`¿Borrar el grupo «${g.name}»? Las campañas que ya armaste con él no cambian.`)) return;
    const r = await llamar(`/audiences/${g.id}`, 'DELETE');
    if (r.ok) avisar(r.mensaje || 'Grupo borrado.');
    else setError(r.mensaje || 'No pudimos borrarlo.');
    void recargar();
  };

  const cargando = campanas === null || plantillas === null || grupos === null;
  const boton = 'inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700';
  const tarjeta = 'rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4';

  return (
    <>
      <Helmet><title>Correos a usuarios · Admin</title></Helmet>
      <div className="mx-auto max-w-6xl p-4 sm:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">Correos a usuarios</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              Escribí una <strong>plantilla</strong>, armá un <strong>grupo</strong> de personas y mandá una <strong>campaña</strong>. Por ejemplo: «Terminá tu registro» a quienes lo dejaron sin terminar.
              Los correos salen de a poco y todos llevan el enlace para darse de baja.
            </p>
          </div>
          {!cargando && (
            <div className="flex gap-2">
              {pestana === 'campanas' && <button type="button" className={boton} onClick={() => setNuevaCampana(true)}><Plus className="h-4 w-4" /> Nueva campaña</button>}
              {pestana === 'plantillas' && <button type="button" className={boton} onClick={() => setPlantillaEditable({ ...PLANTILLA_EN_BLANCO })}><Plus className="h-4 w-4" /> Nueva plantilla</button>}
              {pestana === 'grupos' && <button type="button" className={boton} onClick={() => setGrupoEditable({ ...GRUPO_EN_BLANCO })}><Plus className="h-4 w-4" /> Nuevo grupo</button>}
            </div>
          )}
        </div>

        <Transicion mostrar={!!error}>
          {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
        </Transicion>
        <Transicion mostrar={!!aviso}>
          {aviso && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">{aviso}</div>}
        </Transicion>

        <div role="tablist" aria-label="Secciones" className="mb-5 flex gap-1 border-b border-slate-200 dark:border-slate-700">
          {PESTANAS.map((t) => {
            const Icono = t.icono;
            const activa = pestana === t.id;
            return (
              <button key={t.id} role="tab" aria-selected={activa} type="button" onClick={() => setPestana(t.id)} className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium ${activa ? 'border-sky-600 text-sky-700 dark:text-sky-300' : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                <Icono className="h-4 w-4" aria-hidden="true" /> {t.texto}
              </button>
            );
          })}
        </div>

        {cargando ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-label="Cargando" /></div>
        ) : (
          <>
            {pestana === 'campanas' && (
              <div role="tabpanel" aria-label="Campañas" className="space-y-3">
                {campanas.length === 0 ? (
                  <div className={`${tarjeta} text-center text-sm text-slate-600 dark:text-slate-300`}>
                    <Mail className="mx-auto mb-2 h-8 w-8 text-slate-400" aria-hidden="true" />
                    Todavía no armaste ninguna campaña. Ya hay una plantilla de «Terminá tu registro» y un grupo de «Registro sin terminar» listos para usar.
                  </div>
                ) : (
                  campanas.map((c) => {
                    const est = ROTULO_DE_ESTADO[c.status];
                    const hechos = c.sent + c.failed + c.skipped;
                    const pct = c.total > 0 ? Math.round((hechos / c.total) * 100) : 0;
                    return (
                      <button key={c.id} type="button" onClick={() => setCampanaAbierta(c.id)} className={`${tarjeta} block w-full text-left hover:border-sky-400 dark:hover:border-sky-600`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">{c.name}</span>
                          <span className={`rounded-full px-3 py-0.5 text-xs font-semibold ${est?.clase}`}>{est?.texto ?? c.status}</span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{c.templateName} → {c.audienceName} · {ROTULO_DE_CATEGORIA[c.category]} · {ROTULO_DE_RITMO[c.pace]} · {fecha(c.createdAt)}</p>
                        {c.status !== 'draft' && (
                          <div className="mt-3">
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-sky-600 transition-all duration-500" style={{ width: `${pct}%` }} /></div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{c.sent} enviados de {c.total}{c.failed > 0 && ` · ${c.failed} no salieron`}{c.skipped > 0 && ` · ${c.skipped} salteados`}</p>
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {pestana === 'plantillas' && (
              <div role="tabpanel" aria-label="Plantillas" className="grid gap-3 md:grid-cols-2">
                {plantillas.map((p) => (
                  <div key={p.id} className={tarjeta}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{p.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{ROTULO_DE_CATEGORIA[p.category]}</p>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" aria-label={`Editar ${p.name}`} onClick={() => setPlantillaEditable({ id: p.id, name: p.name, category: p.category, subject: p.subject, body: p.body, buttonLabel: p.buttonLabel ?? '', buttonUrl: p.buttonUrl ?? '' })} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"><Edit2 className="h-4 w-4" /></button>
                        <button type="button" aria-label={`Borrar ${p.name}`} onClick={() => borrarPlantilla(p)} className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-300"><span className="text-slate-500 dark:text-slate-400">Asunto:</span> {p.subject}</p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm text-slate-500 dark:text-slate-400">{p.body}</p>
                  </div>
                ))}
              </div>
            )}

            {pestana === 'grupos' && (
              <div role="tabpanel" aria-label="Grupos" className="grid gap-3 md:grid-cols-2">
                {grupos.map((g) => (
                  <div key={g.id} className={tarjeta}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{g.name}</p>
                        {g.description && <p className="text-xs text-slate-500 dark:text-slate-400">{g.description}</p>}
                      </div>
                      <div className="flex gap-1">
                        <button type="button" aria-label={`Editar ${g.name}`} onClick={() => { setGrupoEditable({ id: g.id, name: g.name, description: g.description ?? '', filters: g.filters ?? {} }); }} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"><Edit2 className="h-4 w-4" /></button>
                        <button type="button" aria-label={`Borrar ${g.name}`} onClick={() => borrarGrupo(g)} className="rounded p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{g.resumen}</p>
                    <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
                      <span className="text-2xl font-bold text-slate-900 dark:text-white">{g.servicio}</span> personas hoy
                      <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">({g.promocional} aceptaron novedades)</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {plantillaEditable && <PlantillaModal inicial={plantillaEditable} onCerrar={() => setPlantillaEditable(null)} onGuardada={() => { setPlantillaEditable(null); avisar('Plantilla guardada.'); void recargar(); }} />}
      {grupoEditable && <GrupoModal inicial={grupoEditable} onCerrar={() => setGrupoEditable(null)} onGuardado={() => { setGrupoEditable(null); avisar('Grupo guardado.'); void recargar(); }} />}
      {nuevaCampana && plantillas && grupos && (
        <CampanaNueva plantillas={plantillas} grupos={grupos} onCerrar={() => setNuevaCampana(false)} onCreada={(id) => { setNuevaCampana(false); void recargar(); setCampanaAbierta(id); }} />
      )}
      {campanaAbierta && <CampanaDetalle id={campanaAbierta} onCerrar={() => setCampanaAbierta(null)} onCambio={() => void recargar()} />}
    </>
  );
}
