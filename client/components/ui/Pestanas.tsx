import { useRef, type KeyboardEvent, type ReactNode } from "react";

/**
 * Las pestañas de la app: UN solo diseño en TODAS las pantallas (pedido del dueño, 2026-11-15 y 2026-11-17: «mantener congruencias de diseño de toda la app, no puede suceder
 * más»). Antes cada pantalla armaba las suyas (barra subrayada, botones sueltos, píldoras, botones planos) y lo mismo se veía distinto de una pantalla a otra.
 *
 * Es una barra segmentada: un recuadro con las opciones adentro y la elegida resaltada. `grande` lleva más aire y es para el nivel de arriba de una pantalla; `normal`
 * es para el nivel de abajo o para filtros; `compacto` para un selector chico dentro de otro componente (por ejemplo, el buscador). Una opción puede llevar ícono y una insignia con un número (cuántos hay). Funciona con el teclado (flechas, Inicio y Fin) y
 * le avisa a los lectores de pantalla cuál está elegida. `tests/guiasYDiseno.test.ts` frena que se vuelvan a armar pestañas a mano.
 */
export interface OpcionDePestana<T extends string> {
  id: T;
  texto: string;
  icono?: ReactNode;
  /** Un número o texto chico al lado del rótulo (por ejemplo, cuántos hay para revisar). */
  insignia?: string | number;
  /** Texto de ayuda al pasar el mouse. */
  titulo?: string;
}

export default function Pestanas<T extends string>({
  opciones,
  valor,
  onCambiar,
  ariaLabel,
  tamano = "normal",
  testid,
  className = "",
  conPanel = false,
}: {
  opciones: OpcionDePestana<T>[];
  valor: T;
  onCambiar: (id: T) => void;
  ariaLabel: string;
  tamano?: "grande" | "normal" | "compacto";
  testid?: string;
  /** Solo para el espaciado de afuera (márgenes). */
  className?: string;
  /** true si debajo hay un `PanelDePestana`: la pestaña lleva el id al que apunta el panel (lectores de pantalla). */
  conPanel?: boolean;
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

  const relleno = tamano === "grande" ? "py-3 px-4 text-base" : tamano === "compacto" ? "py-1 px-2.5 text-xs" : "py-2 px-4 text-sm";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-testid={testid}
      data-tamano={tamano}
      className={`flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${className}`}
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
            title={o.titulo}
            id={conPanel ? `pestana-${o.id}` : undefined}
            aria-controls={conPanel ? `panel-${o.id}` : undefined}
            aria-selected={elegida}
            tabIndex={elegida ? 0 : -1}
            onClick={() => onCambiar(o.id)}
            onKeyDown={(e) => alTeclear(e, i)}
            className={`flex min-w-fit flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${relleno} ${
              elegida
                ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            }`}
          >
            {o.icono}
            {o.texto}
            {o.insignia !== undefined && o.insignia !== "" && (
              <span className="rounded-full bg-slate-200 px-1.5 text-[11px] font-semibold tabular-nums text-slate-700 dark:bg-slate-700 dark:text-slate-200">{o.insignia}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
