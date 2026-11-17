import type { ComponentType, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import Pestanas from "../ui/Pestanas";

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

/**
 * La barra de pestañas de los paneles de administración. Es EL MISMO componente que usa el resto de la app (components/ui/Pestanas): antes tenía su propio diseño
 * subrayado y el panel se veía distinto del resto (pedido del dueño, 2026-11-17: congruencia de diseño en toda la app).
 */
export function BarraDePestanas({ pestanas, actual, onCambiar, etiqueta }: { pestanas: Pestana[]; actual: string; onCambiar: (id: string) => void; etiqueta: string }) {
  return (
    <Pestanas
      ariaLabel={etiqueta}
      valor={actual}
      onCambiar={onCambiar}
      className="mb-4"
      conPanel
      opciones={pestanas.map((p) => ({ id: p.id, texto: p.rotulo, insignia: p.insignia, icono: p.icono ? <p.icono className="h-4 w-4" /> : undefined }))}
    />
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
