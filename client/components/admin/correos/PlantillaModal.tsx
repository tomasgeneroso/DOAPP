import { useRef, useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import Transicion from '../../ui/Transicion';
import VistaPrevia from './VistaPrevia';
import { llamar, ROTULO_DE_CATEGORIA } from './llamar';
import { LIMITES_DE_PLANTILLA, VARIABLES_DE_PLANTILLA } from '../../../../shared/correos/plantillas';

export interface PlantillaEditable {
  id?: string;
  name: string;
  category: 'servicio' | 'promocional';
  subject: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
}

export const PLANTILLA_EN_BLANCO: PlantillaEditable = { name: '', category: 'servicio', subject: '', body: '', buttonLabel: '', buttonUrl: '' };

const campo = 'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent';

/** Crear o editar una plantilla: texto con variables, botón opcional, vista previa en vivo y «enviarme una prueba». */
export default function PlantillaModal({ inicial, onCerrar, onGuardada }: { inicial: PlantillaEditable; onCerrar: () => void; onGuardada: () => void }) {
  const [p, setP] = useState<PlantillaEditable>(inicial);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [probando, setProbando] = useState(false);
  const cuerpoRef = useRef<HTMLTextAreaElement>(null);
  const cambiar = (k: keyof PlantillaEditable, v: string) => {
    setP((x) => ({ ...x, [k]: v }));
    setErrores((e) => {
      const { [k]: _q, ...resto } = e;
      return resto;
    });
  };

  const insertar = (variable: string) => {
    const el = cuerpoRef.current;
    const marca = `{{${variable}}}`;
    if (!el) return cambiar('body', p.body + marca);
    const desde = el.selectionStart ?? p.body.length;
    const hasta = el.selectionEnd ?? desde;
    cambiar('body', p.body.slice(0, desde) + marca + p.body.slice(hasta));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(desde + marca.length, desde + marca.length);
    });
  };

  const cuerpoDelPedido = { name: p.name, category: p.category, subject: p.subject, body: p.body, buttonLabel: p.buttonLabel, buttonUrl: p.buttonUrl };
  const guardar = async () => {
    setGuardando(true);
    setAviso(null);
    const r = p.id ? await llamar(`/templates/${p.id}`, 'PUT', cuerpoDelPedido) : await llamar('/templates', 'POST', cuerpoDelPedido);
    setGuardando(false);
    if (!r.ok) {
      const nombres: Record<string, string> = { nombre: 'name', asunto: 'subject', cuerpo: 'body', botonTexto: 'buttonLabel', botonUrl: 'buttonUrl' };
      if (r.campo) setErrores({ [nombres[r.campo] ?? r.campo]: r.mensaje || 'Revisá este dato.' });
      else setAviso({ tipo: 'error', texto: r.mensaje || 'No pudimos guardar la plantilla.' });
      return;
    }
    onGuardada();
  };
  const probar = async () => {
    setProbando(true);
    setAviso(null);
    const r = await llamar('/templates/test', 'POST', cuerpoDelPedido);
    setProbando(false);
    setAviso({ tipo: r.ok ? 'ok' : 'error', texto: r.mensaje || (r.ok ? 'Te mandamos la prueba.' : 'No se pudo mandar la prueba.') });
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="plantilla-titulo" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="my-6 w-full max-w-5xl rounded-2xl bg-white dark:bg-slate-800 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-700 p-5">
          <div>
            <h2 id="plantilla-titulo" className="text-lg font-bold text-slate-900 dark:text-white">{p.id ? 'Editar plantilla' : 'Nueva plantilla'}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">Es texto, no HTML. Las variables se reemplazan por los datos de cada persona.</p>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label htmlFor="pl-nombre" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Nombre (solo para vos y tu equipo)</label>
              <input id="pl-nombre" className={campo} value={p.name} maxLength={LIMITES_DE_PLANTILLA.nombre} onChange={(e) => cambiar('name', e.target.value)} placeholder="Terminá tu registro" />
              {errores.name && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{errores.name}</p>}
            </div>
            <div>
              <label htmlFor="pl-categoria" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Qué tipo de correo es</label>
              <select id="pl-categoria" className={campo} value={p.category} onChange={(e) => cambiar('category', e.target.value)}>
                {Object.entries(ROTULO_DE_CATEGORIA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {p.category === 'servicio'
                  ? 'Recordatorios sobre la propia cuenta (por ejemplo, terminar el registro). Le llega a quien no apagó los correos ni se dio de baja.'
                  : 'Novedades y ofertas. Solo le llega a quien aceptó recibirlas y no se dio de baja.'}
              </p>
            </div>
            <div>
              <label htmlFor="pl-asunto" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Asunto</label>
              <input id="pl-asunto" className={campo} value={p.subject} maxLength={LIMITES_DE_PLANTILLA.asunto} onChange={(e) => cambiar('subject', e.target.value)} placeholder="{{saludo}}, terminá tu registro en DOAPP" />
              {errores.subject && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{errores.subject}</p>}
            </div>
            <div>
              <label htmlFor="pl-cuerpo" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Texto del correo</label>
              <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Variables">
                {VARIABLES_DE_PLANTILLA.map((v) => (
                  <button key={v.nombre} type="button" title={v.descripcion} onClick={() => insertar(v.nombre)} className="rounded-full border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 px-2.5 py-0.5 text-xs font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40">
                    {`{{${v.nombre}}}`}
                  </button>
                ))}
              </div>
              <textarea id="pl-cuerpo" ref={cuerpoRef} rows={9} className={campo} value={p.body} maxLength={LIMITES_DE_PLANTILLA.cuerpo} onChange={(e) => cambiar('body', e.target.value)} placeholder={'{{saludo}}:\n\nCreaste tu cuenta pero todavía no terminaste el registro…'} />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Una línea en blanco separa los párrafos. Tocá una variable para ponerla donde está el cursor.</p>
              {errores.body && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{errores.body}</p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="pl-boton" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Texto del botón (opcional)</label>
                <input id="pl-boton" className={campo} value={p.buttonLabel} maxLength={LIMITES_DE_PLANTILLA.botonTexto} onChange={(e) => cambiar('buttonLabel', e.target.value)} placeholder="Terminar mi registro" />
                {errores.buttonLabel && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{errores.buttonLabel}</p>}
              </div>
              <div>
                <label htmlFor="pl-url" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">A dónde lleva</label>
                <input id="pl-url" className={campo} value={p.buttonUrl} maxLength={LIMITES_DE_PLANTILLA.botonUrl} onChange={(e) => cambiar('buttonUrl', e.target.value)} placeholder="{{enlaceRegistro}}" />
                {errores.buttonUrl && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{errores.buttonUrl}</p>}
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">El botón solo puede llevar a DOAPP: {'{{enlaceRegistro}}'}, {'{{enlaceApp}}'} o una dirección https de doapparg.com.</p>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Así lo va a ver la persona</h3>
            <VistaPrevia plantilla={{ asunto: p.subject, cuerpo: p.body, botonTexto: p.buttonLabel, botonUrl: p.buttonUrl }} />
            <p className="text-xs text-slate-500 dark:text-slate-400">Los datos de la vista previa son de ejemplo (Ana López). El pie con el enlace para darse de baja lo pone siempre el sistema.</p>
          </div>
        </div>

        <Transicion mostrar={!!aviso} className="px-5">
          {aviso && (
            <div role="status" className={`mb-3 rounded-lg border p-3 text-sm ${aviso.tipo === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300' : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'}`}>{aviso.texto}</div>
          )}
        </Transicion>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700 p-5">
          <button type="button" onClick={probar} disabled={probando || !p.subject.trim() || !p.body.trim()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50">
            {probando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviarme una prueba
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onCerrar} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Cancelar</button>
            <button type="button" onClick={guardar} disabled={guardando} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar plantilla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
