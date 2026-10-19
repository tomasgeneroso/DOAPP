import { useRef, type ComponentType, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

export interface Pestana {
  id: string;
  rotulo: string;
  icono?: ComponentType<{ className?: string }>;
  /** Un número o texto chico al lado del rótulo (por ejemplo, cuántos hay para revisar). */
  insignia?: string | number;
}

/**
 * Qué pestaña está abierta, guardada en la dirección (`?tab=`): se puede copiar el enlace, el botón «atrás» funciona y una página que
 * quiere abrir directo en una pestaña (por ejemplo, la guía de errores que linkea el servidor) solo pasa `porDefecto`.
 */
export function usePestana(pestanas: Pestana[], porDefecto?: string): [string, (id: string) => void] {
  const [params, setParams] = useSearchParams();
  const pedida = params.get("tab");
  const actual = pestanas.some((p) => p.id === pedida) ? (pedida as string) : porDefecto && pestanas.some((p) => p.id === porDefecto) ? porDefecto : pestanas[0].id;
  const cambiar = (id: string) => {
    const siguiente = new URLSearchParams(params);
    siguiente.set("tab", id);
    setParams(siguiente, { replace: false });
  };
  return [actual, cambiar];
}

/** Barra de pestañas accesible (flechas izquierda/derecha, Inicio y Fin) para los paneles de administración. */
export function BarraDePestanas({ pestanas, actual, onCambiar, etiqueta }: { pestanas: Pestana[]; actual: string; onCambiar: (id: string) => void; etiqueta: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const alTeclear = (e: React.KeyboardEvent, i: number) => {
    let destino = -1;
    if (e.key === "ArrowRight") destino = (i + 1) % pestanas.length;
    else if (e.key === "ArrowLeft") destino = (i - 1 + pestanas.length) % pestanas.length;
    else if (e.key === "Home") destino = 0;
    else if (e.key === "End") destino = pestanas.length - 1;
    if (destino < 0) return;
    e.preventDefault();
    onCambiar(pestanas[destino].id);
    refs.current[pestanas[destino].id]?.focus();
  };

  return (
    <div role="tablist" aria-label={etiqueta} className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700">
      {pestanas.map((p, i) => {
        const activa = p.id === actual;
        const Icono = p.icono;
        return (
          <button
            key={p.id}
            ref={(el) => { refs.current[p.id] = el; }}
            role="tab"
            id={`pestana-${p.id}`}
            aria-selected={activa}
            aria-controls={`panel-${p.id}`}
            tabIndex={activa ? 0 : -1}
            onClick={() => onCambiar(p.id)}
            onKeyDown={(e) => alTeclear(e, i)}
            className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              activa
                ? "border-sky-600 text-sky-700 dark:border-sky-400 dark:text-sky-300"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {Icono && <Icono className="h-4 w-4" />}
            {p.rotulo}
            {p.insignia !== undefined && p.insignia !== "" && (
              <span className="rounded-full bg-slate-200 px-1.5 text-[11px] font-semibold tabular-nums text-slate-700 dark:bg-slate-700 dark:text-slate-200">{p.insignia}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** El contenido de la pestaña abierta: entra con un fundido corto al cambiar (nada aparece de golpe; ver `.pestana-entra` en global.css). */
export function PanelDePestana({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div key={id} role="tabpanel" id={`panel-${id}`} aria-labelledby={`pestana-${id}`} className="pestana-entra">
      {children}
    </div>
  );
}
