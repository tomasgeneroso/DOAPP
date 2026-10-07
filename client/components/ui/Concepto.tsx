import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CONCEPTOS } from '@/content/conceptos';
import { posicionarGlobo } from '@/utils/posicionDeGlobo';

interface Props {
  /** El concepto, tal como figura en `client/content/conceptos.ts`. */
  c: string;
  /** Lo que se muestra; por defecto, el propio nombre del concepto. */
  children?: ReactNode;
}

/**
 * Un concepto con su explicación breve al pasar el mouse.
 *
 * - Con mouse: aparece al pasar por encima y se va al salir.
 * - Con el dedo: se abre y se cierra tocando; tocar afuera lo cierra.
 * - Con teclado: aparece al enfocarlo (Tab) y Escape lo cierra.
 *
 * El globo se dibuja en el `body` con `position: fixed`, no adentro del concepto:
 * las tablas del plan viven en contenedores con scroll horizontal que recortan
 * todo lo que sobresale, y un globo adentro quedaba cortado. La posición se
 * calcula en `posicionarGlobo` (probada aparte).
 *
 * Si el concepto no tiene texto se muestra sin globo, en vez de un subrayado que
 * promete una explicación que no existe.
 */
export default function Concepto({ c, children }: Props) {
  const texto = CONCEPTOS[c];
  const id = useId();
  const disparador = useRef<HTMLSpanElement>(null);
  const globo = useRef<HTMLDivElement>(null);
  const tipoDePuntero = useRef('mouse');
  const [abierto, setAbierto] = useState(false);
  const [lugar, setLugar] = useState<{ top: number; left: number } | null>(null);

  const ubicar = useCallback(() => {
    const d = disparador.current;
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

  // Se mide después de dibujarlo (oculto) y antes de que se vea: así no hay un
  // destello del globo en un lugar equivocado.
  useLayoutEffect(() => {
    if (abierto) ubicar();
    else setLugar(null);
  }, [abierto, ubicar]);

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    const alTocarAfuera = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!disparador.current?.contains(t) && !globo.current?.contains(t)) setAbierto(false);
    };
    window.addEventListener('keydown', alTeclear);
    // En captura: el scroll de cualquier contenedor mueve el concepto.
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

  const contenido = children ?? c;
  if (!texto) return <>{contenido}</>;

  return (
    <>
      <span
        ref={disparador}
        tabIndex={0}
        aria-describedby={abierto ? id : undefined}
        className="cursor-help underline decoration-slate-400 decoration-dotted underline-offset-4 outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-sky-500"
        onPointerDown={e => { tipoDePuntero.current = e.pointerType; }}
        onPointerEnter={e => { if (e.pointerType === 'mouse') setAbierto(true); }}
        onPointerLeave={e => { if (e.pointerType === 'mouse') setAbierto(false); }}
        onClick={() => { if (tipoDePuntero.current !== 'mouse') setAbierto(v => !v); }}
        // Sólo el foco de TECLADO abre: en el dedo, tocar enfoca el elemento antes de que
        // llegue el click, y si el foco también abriera, el click lo cerraba al instante.
        onFocus={e => { if (e.currentTarget.matches(':focus-visible')) setAbierto(true); }}
        onBlur={() => setAbierto(false)}
      >
        {contenido}
      </span>
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
