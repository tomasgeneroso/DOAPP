import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

export type ModalTone = "neutral" | "danger" | "warning" | "info" | "success";

const BORDES: Record<ModalTone, string> = {
  neutral: "border-slate-600",
  danger: "border-red-600",
  warning: "border-amber-600",
  info: "border-sky-600",
  success: "border-emerald-600",
};

const ANCHOS = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" } as const;

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Icono a la izquierda del título. */
  icon?: ReactNode;
  tone?: ModalTone;
  size?: keyof typeof ANCHOS;
  /** Botones: quedan fijos abajo y siempre se ven, aunque el contenido sea más alto que la pantalla. */
  footer?: ReactNode;
  /** Si tocar el fondo cierra. Por defecto sí; ponelo en false cuando se está procesando algo. */
  cerrarAlTocarElFondo?: boolean;
  children: ReactNode;
}

const DURACION_MS = 200;

/**
 * Ventana modal base. Hecha para que NUNCA quede cortada:
 *
 *  - La capa de fondo scrollea (`overflow-y-auto`) y el panel se centra con `min-h-full` + `my-auto`: si el contenido es más alto que
 *    la pantalla, empieza arriba y se baja scrolleando. El patrón viejo (`fixed inset-0 flex items-center` con un panel más alto que la
 *    pantalla) recortaba arriba y abajo y no había forma de llegar a los botones.
 *  - El título y los botones quedan fijos arriba y abajo del panel; solo el contenido del medio se desplaza (`max-h` en `dvh`, que descuenta
 *    la barra del navegador del celular).
 *  - Aparece y se va con una transición (opacidad + escala), nunca de golpe, y respeta «reducir movimiento».
 *  - Escape cierra, el fondo no scrollea por detrás, y el foco entra al panel.
 */
export default function Modal({ open, onClose, title, icon, tone = "neutral", size = "md", footer, cerrarAlTocarElFondo = true, children }: ModalProps) {
  const [montado, setMontado] = useState(open);
  const [visible, setVisible] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    if (open) {
      setMontado(true);
      const f = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(f);
    }
    setVisible(false);
    const t = window.setTimeout(() => setMontado(false), DURACION_MS);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", alTeclear);
    panel.current?.focus();
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener("keydown", alTeclear);
    };
  }, [open, onClose]);

  if (!montado) return null;

  return (
    <div
      className={`fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/70 transition-opacity ease-out motion-reduce:transition-none ${visible ? "opacity-100" : "opacity-0"}`}
      style={{ transitionDuration: `${DURACION_MS}ms` }}
      onMouseDown={(e) => {
        if (cerrarAlTocarElFondo && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          ref={panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={idTitulo}
          tabIndex={-1}
          className={`my-auto flex max-h-[calc(100dvh-2rem)] w-full ${ANCHOS[size]} flex-col rounded-2xl border bg-slate-900 shadow-2xl outline-none transition-transform ease-out motion-reduce:transition-none ${BORDES[tone]} ${
            visible ? "scale-100" : "scale-95"
          }`}
          style={{ transitionDuration: `${DURACION_MS}ms` }}
        >
          <div className="flex items-center gap-3 border-b border-slate-700/70 px-6 py-4">
            {icon}
            <h2 id={idTitulo} className="min-w-0 flex-1 text-lg font-bold text-white">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="border-t border-slate-700/70 px-6 py-4">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
