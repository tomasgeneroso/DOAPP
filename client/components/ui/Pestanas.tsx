import { useRef, type KeyboardEvent, type ReactNode } from "react";

/**
 * Las pestañas de la app: UN solo diseño (pedido del dueño, 2026-11-15: «mantener congruencias de diseño de toda la app: los botones "Posts" y "Artículos" no son lo mismo
 * que "Trabajos" y "Publicados"»). Antes el perfil tenía tres estilos distintos para lo mismo (una barra con ícono, píldoras sueltas y botones planos).
 *
 * Es una barra segmentada: un recuadro con las opciones adentro y la elegida resaltada. `grande` lleva el ícono y es para el nivel de arriba de una pantalla; `normal`
 * es para el nivel de abajo. Funciona con el teclado (flechas, Inicio y Fin) y le avisa a los lectores de pantalla cuál está elegida.
 */
export interface OpcionDePestana<T extends string> {
  id: T;
  texto: string;
  icono?: ReactNode;
}

export default function Pestanas<T extends string>({
  opciones,
  valor,
  onCambiar,
  ariaLabel,
  tamano = "normal",
  testid,
}: {
  opciones: OpcionDePestana<T>[];
  valor: T;
  onCambiar: (id: T) => void;
  ariaLabel: string;
  tamano?: "grande" | "normal";
  testid?: string;
}) {
  const botones = useRef<Array<HTMLButtonElement | null>>([]);

  const alTeclear = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    let destino = -1;
    if (e.key === "ArrowRight") destino = (i + 1) % opciones.length;
    else if (e.key === "ArrowLeft") destino = (i - 1 + opciones.length) % opciones.length;
    else if (e.key === "Home") destino = 0;
    else if (e.key === "End") destino = opciones.length - 1;
    if (destino < 0) return;
    e.preventDefault();
    onCambiar(opciones[destino].id);
    botones.current[destino]?.focus();
  };

  const relleno = tamano === "grande" ? "py-3 px-4 text-base" : "py-2 px-4 text-sm";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-testid={testid}
      data-tamano={tamano}
      className="flex gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800"
    >
      {opciones.map((o, i) => {
        const elegida = o.id === valor;
        return (
          <button
            key={o.id}
            ref={(el) => {
              botones.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={elegida}
            tabIndex={elegida ? 0 : -1}
            onClick={() => onCambiar(o.id)}
            onKeyDown={(e) => alTeclear(e, i)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${relleno} ${
              elegida
                ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            }`}
          >
            {o.icono}
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}
