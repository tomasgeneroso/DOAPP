import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, GraduationCap, X } from 'lucide-react';
import Transicion from '../ui/Transicion';
import { AVISO_ORIENTATIVO, GUIAS, PASOS_DE_BIENVENIDA, QUE_ES_EL_CENTRO, type PestanaDelCentro } from '../../content/centroProfesional';

/**
 * Las pantallas educativas del Centro Profesional: una bienvenida con los primeros pasos (se cierra y se recuerda) y, en cada pestaña, una guía plegable
 * («para qué sirve, cómo se lee, qué hacer»). Los textos están en `content/centroProfesional.ts`.
 */

/** Lo que se recuerda en el navegador de cada persona. Si el almacenamiento está bloqueado, la pantalla funciona igual (solo no recuerda). */
const leer = (clave: string): string | null => {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
};
const guardar = (clave: string, valor: string | null) => {
  try {
    if (valor === null) window.localStorage.removeItem(clave);
    else window.localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
};

const CLAVE_BIENVENIDA = (usuarioId: string | undefined) => `doapp:centro-bienvenida:${usuarioId ?? 'anonimo'}`;
const CLAVE_GUIA = (usuarioId: string | undefined, pestana: string) => `doapp:centro-guia:${usuarioId ?? 'anonimo'}:${pestana}`;

export function BienvenidaAlCentro({ usuarioId, alIr }: { usuarioId?: string; alIr: (pestana: PestanaDelCentro) => void }) {
  const [visible, setVisible] = useState(() => leer(CLAVE_BIENVENIDA(usuarioId)) !== 'cerrada');
  const cerrar = () => {
    setVisible(false);
    guardar(CLAVE_BIENVENIDA(usuarioId), 'cerrada');
  };
  return (
    <>
      <Transicion mostrar={visible}>
        <section aria-labelledby="bienvenida-centro" className="mb-6 rounded-2xl border border-purple-200 bg-purple-50 p-5 dark:border-purple-800 dark:bg-purple-900/20">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <GraduationCap className="mt-0.5 h-6 w-6 shrink-0 text-purple-600 dark:text-purple-300" aria-hidden="true" />
              <div>
                <h2 id="bienvenida-centro" className="text-lg font-bold text-slate-900 dark:text-white">¿Qué es el Centro Profesional?</h2>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{QUE_ES_EL_CENTRO}</p>
              </div>
            </div>
            <button type="button" onClick={cerrar} aria-label="Cerrar la bienvenida" className="rounded p-1 text-slate-400 hover:bg-purple-100 hover:text-slate-700 dark:hover:bg-purple-900/40 dark:hover:text-slate-200">
              <X className="h-5 w-5" />
            </button>
          </div>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {PASOS_DE_BIENVENIDA.map((p, i) => (
              <li key={p.titulo} className="rounded-xl bg-white p-3 text-sm dark:bg-slate-800">
                <p className="font-semibold text-slate-900 dark:text-white">
                  <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white">{i + 1}</span>
                  {p.titulo}
                </p>
                <p className="mt-1 text-slate-600 dark:text-slate-400">{p.texto}</p>
                <button type="button" onClick={() => alIr(p.pestana)} className="mt-2 text-xs font-medium text-purple-700 hover:underline dark:text-purple-300">
                  Ir ahí
                </button>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{AVISO_ORIENTATIVO}</p>
        </section>
      </Transicion>
      {!visible && (
        <div className="mb-4 text-right">
          <button
            type="button"
            onClick={() => { setVisible(true); guardar(CLAVE_BIENVENIDA(usuarioId), null); }}
            className="text-xs font-medium text-purple-700 hover:underline dark:text-purple-300"
          >
            ¿Qué es el Centro Profesional?
          </button>
        </div>
      )}
    </>
  );
}

export function GuiaDeLaPestana({ pestana, usuarioId }: { pestana: PestanaDelCentro; usuarioId?: string }) {
  const guia = GUIAS[pestana];
  // Abierta la primera vez; después se recuerda lo que la persona dejó.
  const [abierta, setAbierta] = useState(() => leer(CLAVE_GUIA(usuarioId, pestana)) !== 'plegada');
  const alternar = () => {
    setAbierta((a) => {
      guardar(CLAVE_GUIA(usuarioId, pestana), a ? 'plegada' : null);
      return !a;
    });
  };
  return (
    <section aria-label={`Guía: ${guia.titulo}`} className="mb-5 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
      <button
        type="button"
        onClick={alternar}
        aria-expanded={abierta}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-800 dark:text-slate-100"
      >
        <span className="inline-flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-purple-600 dark:text-purple-300" aria-hidden="true" />
          {guia.titulo}
        </span>
        {abierta ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
      </button>
      <Transicion mostrar={abierta}>
        <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300">
          <p><strong>Para qué sirve.</strong> {guia.paraQueSirve}</p>
          <div>
            <p className="font-semibold">Cómo se lee</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">{guia.comoSeLee.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          <div>
            <p className="font-semibold">Qué hacer</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">{guia.queHacer.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          {guia.glosario && guia.glosario.length > 0 && (
            <dl className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/40">
              <p className="mb-1 font-semibold">Palabras que conviene conocer</p>
              {guia.glosario.map((g) => (
                <div key={g.termino} className="mb-1 last:mb-0">
                  <dt className="inline font-medium">{g.termino}: </dt>
                  <dd className="inline">{g.significa}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">{AVISO_ORIENTATIVO}</p>
        </div>
      </Transicion>
    </section>
  );
}
