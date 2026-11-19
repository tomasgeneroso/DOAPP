import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Un bloque que cambia de alto SIN dar un salto: mide lo que tiene adentro y acompaña el cambio con una transición (pedido del dueño, 2026-11-17: «cuando
 * cambio de login a registrarme se mueve mucho la pantalla, debe ser todo suave y encajar justo»).
 *
 * Sirve para formularios que cambian de campos (ingresar ↔ crear cuenta), secciones que se despliegan o listas que crecen: lo de abajo se desliza en vez de
 * teletransportarse. Los bordes tienen un poco de aire para que el contorno de enfoque de los campos no se corte.
 */
export default function AlturaSuave({ children, className = '' }: { children: ReactNode; className?: string }) {
  const interior = useRef<HTMLDivElement>(null);
  const [alto, setAlto] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = interior.current;
    if (!el) return;
    setAlto(el.offsetHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(() => setAlto(el.offsetHeight));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return (
    <div
      className={`-mx-2 -mb-2 overflow-hidden px-2 pb-2 ${className}`}
      style={{ height: alto ?? undefined, transition: 'height 380ms cubic-bezier(0.22, 1, 0.36, 1)' }}
    >
      <div ref={interior}>{children}</div>
    </div>
  );
}
