import { useEffect, useState } from 'react';
import { Loader2, Users, X } from 'lucide-react';
import { llamar } from './llamar';
import { describirFiltros, type FiltrosDeGrupo } from '../../../../shared/correos/grupos';

export interface GrupoEditable {
  id?: string;
  name: string;
  description: string;
  filters: FiltrosDeGrupo;
}

export const GRUPO_EN_BLANCO: GrupoEditable = { name: '', description: '', filters: {} };

const campo = 'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent';

interface Muestra {
  total: number;
  muestra: Array<{ nombre: string; correo: string }>;
}

/**
 * Crear o editar un grupo de destinatarios: filtros con un nombre. A la derecha, cuántas personas alcanza HOY y una muestra con el correo tapado, para ver que es el grupo
 * que se espera antes de usarlo.
 */
export default function GrupoModal({ inicial, onCerrar, onGuardado }: { inicial: GrupoEditable; onCerrar: () => void; onGuardado: () => void }) {
  const [g, setG] = useState<GrupoEditable>(inicial);
  const [categoria, setCategoria] = useState<'servicio' | 'promocional'>('servicio');
  const [error, setError] = useState<string | null>(null);
  const [errorDeNombre, setErrorDeNombre] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [vista, setVista] = useState<Muestra | null>(null);
  const [cargando, setCargando] = useState(false);

  const filtro = <K extends keyof FiltrosDeGrupo>(clave: K, valor: FiltrosDeGrupo[K] | '' | undefined) => {
    setG((x) => {
      const filters = { ...x.filters };
      if (valor === '' || valor === undefined || (Array.isArray(valor) && valor.length === 0)) delete filters[clave];
      else filters[clave] = valor as FiltrosDeGrupo[K];
      return { ...x, filters };
    });
  };
  const numero = (clave: 'creadosHaceMasDeHoras' | 'creadosHaceMenosDeDias' | 'sinIngresarHaceDias', texto: string) => filtro(clave, texto === '' ? '' : (Math.max(0, Math.floor(Number(texto))) as never));
  const tri = (v: boolean | undefined) => (v === undefined ? '' : v ? 'si' : 'no');

  // La vista previa se actualiza sola cuando cambian los filtros (con una pausa para no preguntar en cada tecla).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consulta con pausa: se marca «calculando» en cuanto cambian los filtros y se completa con la respuesta
    setCargando(true);
    const t = setTimeout(async () => {
      const r = await llamar<Muestra>('/audiences/preview', 'POST', { filters: g.filters, category: categoria });
      setCargando(false);
      if (r.ok && r.datos) {
        setVista(r.datos);
        setError(null);
      } else setError(r.mensaje || 'No pudimos calcular el grupo.');
    }, 350);
    return () => clearTimeout(t);
  }, [g.filters, categoria]);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    setErrorDeNombre(null);
    const cuerpo = { name: g.name, description: g.description, filters: g.filters };
    const r = g.id ? await llamar(`/audiences/${g.id}`, 'PUT', cuerpo) : await llamar('/audiences', 'POST', cuerpo);
    setGuardando(false);
    if (!r.ok) {
      if (r.campo === 'name') setErrorDeNombre(r.mensaje || 'Revisá el nombre.');
      else setError(r.mensaje || 'No pudimos guardar el grupo.');
      return;
    }
    onGuardado();
  };

  const f = g.filters;
  const rotulo = 'mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300';
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="grupo-titulo" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="my-6 w-full max-w-4xl rounded-2xl bg-white dark:bg-slate-800 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-700 p-5">
          <div>
            <h2 id="grupo-titulo" className="text-lg font-bold text-slate-900 dark:text-white">{g.id ? 'Editar grupo' : 'Nuevo grupo'}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Un grupo son filtros guardados: siempre trae a quienes los cumplen HOY.</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label htmlFor="gr-nombre" className={rotulo}>Nombre del grupo</label>
              <input id="gr-nombre" className={campo} value={g.name} maxLength={80} onChange={(e) => { setG({ ...g, name: e.target.value }); setErrorDeNombre(null); }} placeholder="Registro sin terminar" />
              {errorDeNombre && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{errorDeNombre}</p>}
            </div>
            <div>
              <label htmlFor="gr-desc" className={rotulo}>Para qué sirve (opcional)</label>
              <input id="gr-desc" className={campo} value={g.description} maxLength={300} onChange={(e) => setG({ ...g, description: e.target.value })} />
            </div>

            <fieldset className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-700 dark:text-slate-300">Quiénes entran</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="f-registro" className={rotulo}>Registro</label>
                  <select id="f-registro" className={campo} value={f.registro ?? ''} onChange={(e) => filtro('registro', e.target.value as never)}>
                    <option value="">Cualquiera</option>
                    <option value="incompleto">Sin terminar</option>
                    <option value="completo">Completo</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="f-identidad" className={rotulo}>Identidad</label>
                  <select id="f-identidad" className={campo} value={f.identidad ?? ''} onChange={(e) => filtro('identidad', e.target.value as never)}>
                    <option value="">Cualquiera</option>
                    <option value="verificada">Verificada</option>
                    <option value="sin_verificar">Sin verificar</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="f-dni" className={rotulo}>DNI</label>
                  <select id="f-dni" className={campo} value={f.dni ?? ''} onChange={(e) => filtro('dni', e.target.value as never)}>
                    <option value="">Cualquiera</option>
                    <option value="con">Con DNI cargado</option>
                    <option value="sin">Sin DNI cargado</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="f-correo" className={rotulo}>Correo</label>
                  <select id="f-correo" className={campo} value={tri(f.correoVerificado)} onChange={(e) => filtro('correoVerificado', e.target.value === '' ? undefined : e.target.value === 'si')}>
                    <option value="">Cualquiera</option>
                    <option value="si">Confirmado</option>
                    <option value="no">Sin confirmar</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="f-membresia" className={rotulo}>Plan</label>
                  <select id="f-membresia" className={campo} value={f.membresia ?? ''} onChange={(e) => filtro('membresia', e.target.value as never)}>
                    <option value="">Cualquiera</option>
                    <option value="pro">Con membresía PRO</option>
                    <option value="gratis">Gratuito</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="f-beneficio" className={rotulo}>Beneficio de lanzamiento</label>
                  <select id="f-beneficio" className={campo} value={tri(f.beneficioDeLanzamiento)} onChange={(e) => filtro('beneficioDeLanzamiento', e.target.value === '' ? undefined : e.target.value === 'si')}>
                    <option value="">Cualquiera</option>
                    <option value="si">Lo recibieron</option>
                    <option value="no">No lo recibieron</option>
                  </select>
                </div>
              </div>
              <div>
                <span className={rotulo}>Tipo de cuenta</span>
                <div className="flex flex-wrap gap-3">
                  {([['client', 'Cliente'], ['doer', 'Trabajador'], ['both', 'Ambos'], ['user', 'Sin elegir']] as const).map(([valor, texto]) => (
                    <label key={valor} className="inline-flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                      <input type="checkbox" checked={!!f.rol?.includes(valor)} onChange={(e) => filtro('rol', e.target.checked ? [...(f.rol ?? []), valor] : (f.rol ?? []).filter((r) => r !== valor))} />
                      {texto}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="f-mas" className={rotulo}>Cuenta creada hace más de (horas)</label>
                  <input id="f-mas" type="number" min={0} className={campo} value={f.creadosHaceMasDeHoras ?? ''} onChange={(e) => numero('creadosHaceMasDeHoras', e.target.value)} placeholder="24" />
                </div>
                <div>
                  <label htmlFor="f-menos" className={rotulo}>Creada hace menos de (días)</label>
                  <input id="f-menos" type="number" min={0} className={campo} value={f.creadosHaceMenosDeDias ?? ''} onChange={(e) => numero('creadosHaceMenosDeDias', e.target.value)} placeholder="30" />
                </div>
                <div>
                  <label htmlFor="f-sin" className={rotulo}>Sin entrar hace más de (días)</label>
                  <input id="f-sin" type="number" min={0} className={campo} value={f.sinIngresarHaceDias ?? ''} onChange={(e) => numero('sinIngresarHaceDias', e.target.value)} placeholder="60" />
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Nunca entran: cuentas suspendidas, unidas a otra, sin correo, del equipo, ni quienes se dieron de baja de los correos.</p>
            </fieldset>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="gr-categoria" className={rotulo}>Contar para un correo de tipo</label>
              <select id="gr-categoria" className={campo} value={categoria} onChange={(e) => setCategoria(e.target.value as 'servicio' | 'promocional')}>
                <option value="servicio">Recordatorio de la cuenta</option>
                <option value="promocional">Novedades y ofertas (solo quienes aceptaron)</option>
              </select>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4">
              <p className="text-sm text-slate-600 dark:text-slate-300">{describirFiltros(g.filters)}</p>
              <div className="mt-3 flex items-center gap-3" aria-live="polite">
                <Users className="h-6 w-6 text-sky-600" aria-hidden="true" />
                {cargando && !vista ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-label="Calculando" /> : <span className="text-3xl font-bold text-slate-900 dark:text-white">{vista?.total ?? '—'}</span>}
                <span className="text-sm text-slate-500 dark:text-slate-400">personas hoy</span>
                {cargando && vista && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />}
              </div>
              {!!vista?.muestra.length && (
                <ul className="mt-3 divide-y divide-slate-200 dark:divide-slate-700 text-sm" aria-label="Muestra de personas">
                  {vista.muestra.map((m, i) => (
                    <li key={i} className="flex justify-between gap-3 py-1.5 text-slate-700 dark:text-slate-300">
                      <span>{m.nombre}</span>
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{m.correo}</span>
                    </li>
                  ))}
                </ul>
              )}
              {vista && vista.total === 0 && <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">Ahora mismo nadie cumple estos filtros.</p>}
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">De cada persona se muestra solo el primer nombre y el correo tapado.</p>
            </div>
          </div>
        </div>

        {error && <div role="alert" className="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">{error}</div>}
        <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-700 p-5">
          <button type="button" onClick={onCerrar} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Cancelar</button>
          <button type="button" onClick={guardar} disabled={guardando} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar grupo
          </button>
        </div>
      </div>
    </div>
  );
}
