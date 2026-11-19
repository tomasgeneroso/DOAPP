import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { AYUDAS } from '@/content/ayudas';
import { posicionarGlobo } from '@/utils/posicionDeGlobo';

/**
 * El botoncito «i» al lado de un título o un dato: explica en una o dos oraciones qué es y qué se puede hacer ahí (pedido del dueño, 2026-11-19).
 *
 * Accesible: es un botón con nombre («Más información: Mis trabajos»), se llega con Tab, abre al enfocar con teclado y Escape lo cierra. Con mouse abre al pasar
 * por encima; con el dedo, al tocar (tocar afuera lo cierra). El globo va en el `body` con `position: fixed`, así ningún contenedor con scroll lo recorta.
 * Mismo globo y misma posición que `Concepto` (utils/posicionDeGlobo). Si el texto no existe en `content/ayudas.ts`, no dibuja nada en vez de un botón vacío.
 */
export default function InfoIcono({ ayuda, className = '' }: { ayuda: string; className?: string }) {
  const texto = AYUDAS[ayuda];
  const id = useId();
  const boton = useRef<HTMLButtonElement>(null);
  const globo = useRef<HTMLDivElement>(null);
  const tipoDePuntero = useRef('mouse');
  const [abierto, setAbierto] = useState(false);
  const [lugar, setLugar] = useState<{ top: number; left: number } | null>(null);

  const ubicar = useCallback(() => {
    const d = boton.current;
    const g = globo.current;
    if (!d || !g) return;
    const r = d.getBoundingClientRect();
    const { top, left } = posicionarGlobo(
      { left: r.left, top: r.top, width: r.width, height: r.height },
      { width: g.offsetWidth, height: g.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    setLugar({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (abierto) ubicar();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se mide el globo antes de pintarlo y al cerrar se descarta la medida
    else setLugar(null);
  }, [abierto, ubicar]);

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    const alTocarAfuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!boton.current?.contains(t) && !globo.current?.contains(t)) setAbierto(false);
    };
    window.addEventListener('keydown', alTeclear);
    window.addEventListener('scroll', ubicar, true);
    window.addEventListener('resize', ubicar);
    document.addEventListener('pointerdown', alTocarAfuera);
    return () => {
      window.removeEventListener('keydown', alTeclear);
      window.removeEventListener('scroll', ubicar, true);
      window.removeEventListener('resize', ubicar);
      document.removeEventListener('pointerdown', alTocarAfuera);
    };
  }, [abierto, ubicar]);

  if (!texto) return null;

  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-label={`Más información: ${ayuda}`}
        aria-expanded={abierto}
        aria-describedby={abierto ? id : undefined}
        data-testid="info-icono"
        className={`inline-flex h-6 w-6 shrink-0 cursor-help items-center justify-center rounded-full align-middle text-slate-400 transition-colors hover:bg-sky-50 hover:text-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-sky-300 ${className}`}
        onPointerDown={e => { tipoDePuntero.current = e.pointerType; }}
        onPointerEnter={e => { if (e.pointerType === 'mouse') setAbierto(true); }}
        onPointerLeave={e => { if (e.pointerType === 'mouse') setAbierto(false); }}
        onClick={() => { if (tipoDePuntero.current !== 'mouse') setAbierto(v => !v); }}
        // Solo el foco de TECLADO abre: con el dedo, tocar enfoca antes del click y el click lo cerraría al instante.
        onFocus={e => { if (e.currentTarget.matches(':focus-visible')) setAbierto(true); }}
        onBlur={() => setAbierto(false)}
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      {abierto &&
        createPortal(
          <div
            ref={globo}
            id={id}
            role="tooltip"
            style={{
              position: 'fixed',
              top: lugar?.top ?? 0,
              left: lugar?.left ?? 0,
              visibility: lugar ? 'visible' : 'hidden',
              maxWidth: 'min(20rem, calc(100vw - 16px))',
              zIndex: 70,
            }}
            className="pointer-events-none rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal normal-case leading-snug tracking-normal text-white shadow-lg dark:bg-slate-100 dark:text-slate-900"
          >
            {texto}
          </div>,
          document.body,
        )}
    </>
  );
}
