import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Aparece y desaparece con una transición, en vez de «pop».
 *
 * Un aviso que se monta y desmonta de golpe (el «Guardado» que se esfuma a los 4 s, un error que sale al corregir) mueve todo lo que
 * hay debajo de un salto. Acá el contenido se despliega al aparecer y se pliega al irse (altura + opacidad), y se mantiene lo último
 * que mostró mientras se va, para que no cambie el texto a mitad de la salida.
 *
 *   <Transicion mostrar={!!mensaje}>{mensaje && <Aviso {...mensaje} />}</Transicion>
 *
 * Respeta «reducir movimiento»: sin animación, aparece y se va igual pero sin deslizarse.
 */
const DURACION_MS = 250;

export default function Transicion({ mostrar, children, className = "" }: { mostrar: boolean; children: ReactNode; className?: string }) {
  const [montado, setMontado] = useState(mostrar);
  const [abierto, setAbierto] = useState(mostrar);
  // Lo último que se mostró, para que no cambie el contenido a mitad de la salida.
  const [ultimo, setUltimo] = useState<ReactNode>(children);
  if (mostrar && children !== ultimo) setUltimo(children);

  useEffect(() => {
    if (mostrar) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- entrada/salida animada: el estado cambia en respuesta a la prop `mostrar` y se completa con temporizadores; no se puede derivar
      setMontado(true);
      // un cuadro después de montar, para que la transición parta del estado cerrado
      const f = requestAnimationFrame(() => requestAnimationFrame(() => setAbierto(true)));
      return () => cancelAnimationFrame(f);
    }
    setAbierto(false);
    const t = window.setTimeout(() => {
      setMontado(false);
      setUltimo(null);
    }, DURACION_MS);
    return () => window.clearTimeout(t);
  }, [mostrar]);

  if (!montado) return null;

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] ease-out motion-reduce:transition-none ${abierto ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"} ${className}`}
      style={{ transitionDuration: `${DURACION_MS}ms` }}
      aria-hidden={!abierto || undefined}
    >
      <div className="min-h-0 overflow-hidden">{mostrar ? children : ultimo}</div>
    </div>
  );
}
