import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { GUIAS, marcarGuiaHecha, type IdDeGuia, type PasoDeGuia } from './guias';

/**
 * La guía paso a paso: un aro sobre el lugar exacto y una tarjeta que dice qué tocar (ver `guias.ts`). No bloquea la pantalla: la persona toca el botón de verdad y la
 * guía pasa sola al paso siguiente. Si la persona se va por otro lado, la guía espera en silencio y siempre se puede salir.
 */
interface Contexto {
  guiaActiva: IdDeGuia | null;
  iniciar: (id: IdDeGuia) => void;
  salir: () => void;
  /** Cambia cuando se termina una guía: para que las listas que muestran «hecha» se redibujen. */
  version: number;
}

const SinGuia: Contexto = { guiaActiva: null, iniciar: () => undefined, salir: () => undefined, version: 0 };
const GuiaContext = createContext<Contexto>(SinGuia);

export const useGuiaPasoAPaso = (): Contexto => useContext(GuiaContext);

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const ANCHO_TARJETA = 300;
const SEPARACION = 14;

const visible = (el: Element | null): el is Element => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

function ubicarLaTarjeta(rect: Rect, posicion: PasoDeGuia['posicion']): { style: React.CSSProperties; lado: PasoDeGuia['posicion'] } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const chico = vw < 640;
  let lado = posicion;
  // En pantallas angostas la tarjeta va siempre arriba o abajo del elemento (a los costados no entra).
  if (chico && (lado === 'izquierda' || lado === 'derecha')) lado = 'abajo';
  if (lado === 'abajo' && rect.top + rect.height + SEPARACION + 170 > vh && rect.top > 190) lado = 'arriba';
  if (lado === 'arriba' && rect.top < 190 && vh - (rect.top + rect.height) > 190) lado = 'abajo';
  if (lado === 'izquierda' && rect.left < ANCHO_TARJETA + SEPARACION + 8) lado = 'abajo';
  if (lado === 'derecha' && rect.left + rect.width + SEPARACION + ANCHO_TARJETA > vw - 8) lado = 'abajo';

  const centradoX = Math.min(Math.max(rect.left + rect.width / 2 - ANCHO_TARJETA / 2, 8), Math.max(vw - ANCHO_TARJETA - 8, 8));
  switch (lado) {
    case 'arriba':
      return { lado, style: { top: rect.top - SEPARACION, left: centradoX, transform: 'translateY(-100%)' } };
    case 'izquierda':
      return { lado, style: { top: rect.top + rect.height / 2, left: rect.left - SEPARACION, transform: 'translate(-100%, -50%)' } };
    case 'derecha':
      return { lado, style: { top: rect.top + rect.height / 2, left: rect.left + rect.width + SEPARACION, transform: 'translateY(-50%)' } };
    default:
      return { lado: 'abajo', style: { top: rect.top + rect.height + SEPARACION, left: centradoX } };
  }
}

export function GuiaPasoAPasoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [guiaActiva, setGuiaActiva] = useState<IdDeGuia | null>(null);
  const [indice, setIndice] = useState(0);
  const [version, setVersion] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const faltaDesde = useRef<number | null>(null);
  const yaMostrado = useRef<string | null>(null);

  const guia = guiaActiva ? GUIAS[guiaActiva] : null;
  const paso: PasoDeGuia | null = guia ? guia.pasos[indice] ?? null : null;

  const avanzarRef = useRef<() => void>(() => undefined);

  const salir = useCallback(() => {
    setGuiaActiva(null);
    setIndice(0);
    setRect(null);
    yaMostrado.current = null;
    faltaDesde.current = null;
  }, []);

  const iniciar = useCallback((id: IdDeGuia) => {
    setGuiaActiva(id);
    setIndice(0);
    setRect(null);
    yaMostrado.current = null;
    faltaDesde.current = null;
  }, []);

  const avanzar = useCallback(() => {
    if (!guia) return;
    if (indice >= guia.pasos.length - 1) {
      marcarGuiaHecha(user?.id, guia.id);
      setVersion((v) => v + 1);
      salir();
      return;
    }
    setIndice((i) => i + 1);
    setRect(null);
    yaMostrado.current = null;
    faltaDesde.current = null;
  }, [guia, indice, user?.id, salir]);

  avanzarRef.current = avanzar;

  // Cerrar sesión o cambiar de persona corta la guía.
  useEffect(() => {
    if (!user) salir();
  }, [user, salir]);

  // Sigue al elemento marcado (el menú se abre, la página se desplaza, se redimensiona la ventana).
  useEffect(() => {
    if (!paso) return undefined;
    const seguir = () => {
      const enLaRuta = !paso.ruta || paso.ruta.test(location.pathname);
      const el = enLaRuta ? document.querySelector(paso.objetivo) : null;
      if (visible(el)) {
        const r = el.getBoundingClientRect();
        setRect((previo) =>
          previo && Math.abs(previo.top - r.top) < 0.5 && Math.abs(previo.left - r.left) < 0.5 && Math.abs(previo.width - r.width) < 0.5 && Math.abs(previo.height - r.height) < 0.5
            ? previo
            : { top: r.top, left: r.left, width: r.width, height: r.height },
        );
        faltaDesde.current = null;
        // Una sola vez por paso: si el elemento queda fuera de la pantalla, se lo trae con un desplazamiento suave.
        if (yaMostrado.current !== paso.id) {
          yaMostrado.current = paso.id;
          if (r.top < 70 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else {
        setRect((previo) => (previo ? null : previo));
        // Un paso de «leer» cuyo lugar no existe en esta pantalla (el formulario cambió) se salta solo en vez de dejar a la persona esperando.
        if (paso.avanzaCon === 'boton' && enLaRuta) {
          const ahora = Date.now();
          if (faltaDesde.current === null) faltaDesde.current = ahora;
          if (ahora - faltaDesde.current > 2500) {
            faltaDesde.current = null;
            avanzarRef.current();
          }
        }
        if (paso.volverSiFalta && enLaRuta && indice > 0) {
          const ahora = Date.now();
          if (faltaDesde.current === null) faltaDesde.current = ahora;
          if (ahora - faltaDesde.current > 700) {
            faltaDesde.current = null;
            yaMostrado.current = null;
            setIndice((i) => Math.max(0, i - 1));
          }
        }
      }
    };
    seguir();
    const intervalo = window.setInterval(seguir, 150);
    window.addEventListener('resize', seguir);
    window.addEventListener('scroll', seguir, true);
    return () => {
      window.clearInterval(intervalo);
      window.removeEventListener('resize', seguir);
      window.removeEventListener('scroll', seguir, true);
    };
  }, [paso, location.pathname, indice]);

  // Pasa sola al paso siguiente cuando la persona toca el elemento marcado.
  useEffect(() => {
    if (!paso || paso.avanzaCon !== 'click') return undefined;
    const alTocar = (e: MouseEvent) => {
      const el = document.querySelector(paso.objetivo);
      if (el && e.target instanceof Node && el.contains(e.target)) window.setTimeout(avanzar, 60);
    };
    document.addEventListener('click', alTocar, true);
    return () => document.removeEventListener('click', alTocar, true);
  }, [paso, avanzar]);

  // Escape sale de la guía.
  useEffect(() => {
    if (!guiaActiva) return undefined;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') salir();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [guiaActiva, salir]);

  const valor = useMemo<Contexto>(() => ({ guiaActiva, iniciar, salir, version }), [guiaActiva, iniciar, salir, version]);

  const ubicada = rect && paso ? ubicarLaTarjeta(rect, paso.posicion) : null;
  const esElUltimo = !!guia && indice >= guia.pasos.length - 1;

  const capa =
    guia && paso ? (
      <>
        {rect && (
          <div
            aria-hidden="true"
            data-testid="aro-de-la-guia"
            className="pointer-events-none fixed z-[9990] rounded-xl motion-safe:animate-pulse"
            style={{
              top: rect.top - 6,
              left: rect.left - 6,
              width: rect.width + 12,
              height: rect.height + 12,
              boxShadow: '0 0 0 3px #0ea5e9, 0 0 0 8px rgba(14,165,233,0.28)',
              transition: 'top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease',
            }}
          />
        )}
        {rect && ubicada ? (
          <div
            role="dialog"
            aria-live="polite"
            aria-label={`${guia.titulo}: paso ${indice + 1} de ${guia.pasos.length}`}
            data-testid="tarjeta-de-la-guia"
            data-paso={paso.id}
            className="fixed z-[9991] rounded-2xl border border-sky-200 bg-white p-4 shadow-2xl dark:border-sky-800 dark:bg-slate-900"
            style={{ width: ANCHO_TARJETA, maxWidth: 'calc(100vw - 16px)', ...ubicada.style }}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-sky-600 dark:text-sky-400">
                {guia.titulo} · paso {indice + 1} de {guia.pasos.length}
              </p>
              <button type="button" onClick={salir} aria-label="Salir de la guía" title="Salir de la guía" className="-mr-1 -mt-1 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white">{paso.titulo}</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{paso.texto}</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button type="button" onClick={salir} className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                Salir de la guía
              </button>
              {paso.avanzaCon === 'boton' ? (
                <button type="button" onClick={avanzar} data-testid="siguiente-de-la-guia" className="rounded-lg bg-sky-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-sky-600">
                  {esElUltimo ? 'Listo' : 'Siguiente'}
                </button>
              ) : (
                <span className="text-xs font-medium text-sky-600 dark:text-sky-400">Tocá el lugar marcado</span>
              )}
            </div>
          </div>
        ) : (
          // El lugar de este paso todavía no está a la vista (se está cargando, o la persona sigue en otra pantalla): solo queda la salida.
          <button
            type="button"
            onClick={salir}
            data-testid="guia-en-espera"
            className="fixed bottom-4 left-4 z-[9991] inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-lg ring-1 ring-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700"
          >
            <X className="h-3.5 w-3.5" /> Salir de la guía
          </button>
        )}
      </>
    ) : null;

  return (
    <GuiaContext.Provider value={valor}>
      {children}
      {capa && createPortal(capa, document.body)}
    </GuiaContext.Provider>
  );
}

