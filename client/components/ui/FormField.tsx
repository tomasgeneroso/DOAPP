import { ReactNode, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle, Lock, X } from "lucide-react";

/**
 * Campo de formulario accesible.
 *
 * Resuelve tres cosas que estaban rotas o faltaban en los formularios:
 *
 * 1. **El error no llegaba al lector de pantalla.** Se mostraba en un `<p>`
 *    suelto debajo del input, sin ninguna relación programática. Quien no ve
 *    la pantalla completaba el formulario, lo enviaba, y no se enteraba de por
 *    qué no pasaba nada. Ahora el input lleva `aria-invalid` y el error se
 *    anuncia por `aria-describedby` + `role="alert"`.
 *
 * 2. **No había forma de explicar un campo.** El ícono de pregunta despliega
 *    la explicación y queda enlazada al input por `aria-describedby`, asi que
 *    el lector de pantalla la lee junto con el campo aunque esté colapsada.
 *    Es un `<button>` real: funciona con teclado, con touch y con voz. Un
 *    `title=` no hace nada de eso — no se abre con teclado ni en celular.
 *
 * 3. **Las promesas de privacidad estaban escondidas o no existían.** Para qué
 *    usamos un dato es lo primero que alguien quiere saber antes de darlo.
 *
 * La distinción entre `help` y `note` es a propósito y no es cosmética:
 *
 *   help  →  "qué escribo acá". Puede ir colapsado: es una duda que aparece
 *            solo si el campo no se entiende.
 *   note  →  "qué hacemos con esto". **Siempre visible.** Una promesa de
 *            privacidad detrás de un ícono que hay que descubrir no es una
 *            promesa: es letra chica. Si el dato es sensible (teléfono, DNI,
 *            CBU, dirección), usá `note`, no `help`.
 */

export interface FieldRenderProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}

interface FormFieldProps {
  /** Base del id. Si no se pasa, se genera uno estable. */
  id?: string;
  label: string;
  required?: boolean;
  /** "Qué escribo acá". Se despliega con el ícono de pregunta. */
  help?: ReactNode;
  /** "Qué hacemos con este dato". Siempre visible. Para datos sensibles. */
  note?: ReactNode;
  /** Si `note` describe un dato que no se publica, muestra el candado. */
  privado?: boolean;
  error?: string | null;
  className?: string;
  children: (field: FieldRenderProps) => ReactNode;
}

export function FormField({
  id,
  label,
  required,
  help,
  note,
  privado,
  error,
  className,
  children,
}: FormFieldProps) {
  const { t } = useTranslation();
  const generado = useId();
  const base = id || generado;

  const helpId = `${base}-help`;
  const noteId = `${base}-note`;
  const errorId = `${base}-error`;

  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  // Cerrar con Escape y al tocar fuera: si se abre en un formulario largo,
  // quedarse abierto tapa el campo siguiente.
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [abierto]);

  /**
   * El input describe todo lo que le aplica. El orden importa: el lector lee
   * la nota (qué hacemos con el dato) antes que la ayuda, y el error primero
   * de todo cuando existe, porque es lo que bloquea.
   */
  const describedBy = [
    error ? errorId : null,
    note ? noteId : null,
    help ? helpId : null,
  ]
    .filter(Boolean)
    .join(" ") || undefined;

  return (
    <div ref={contenedor} className={className}>
      <div className="flex items-center gap-1.5">
        <label
          htmlFor={base}
          className="block text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
        >
          {label}
          {required && (
            <>
              {" "}
              <span className="text-red-500" aria-hidden="true">*</span>
              <span className="sr-only"> ({t("form.required", "obligatorio")})</span>
            </>
          )}
        </label>

        {help && (
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            aria-controls={helpId}
            // El label va en el aria-label porque "¿Qué es esto?" repetido diez
            // veces en una página no le sirve a nadie que navegue por botones.
            aria-label={t("form.whatIsThis", "Qué significa {{campo}}", { campo: label })}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/30 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-1 dark:focus:ring-offset-slate-900 transition-colors"
          >
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/*
        Siempre en el DOM, oculto con `hidden`, para que aria-describedby lo
        encuentre aunque esté colapsado. Si se desmontara, el lector de
        pantalla no leería nada al enfocar el campo.
      */}
      {help && (
        <div
          id={helpId}
          hidden={!abierto}
          className="mt-2 flex items-start gap-2 rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50/70 dark:bg-sky-900/20 px-3 py-2 text-xs leading-relaxed text-slate-700 dark:text-slate-200"
        >
          <span className="flex-1">{help}</span>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            aria-label={t("form.closeHelp", "Cerrar la explicación")}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 rounded"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="mt-2">{children({
        id: base,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required || undefined,
      })}</div>

      {note && (
        <p
          id={noteId}
          className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400"
        >
          {privado && <Lock className="h-3 w-3 mt-0.5 flex-shrink-0" aria-hidden="true" />}
          <span>{note}</span>
        </p>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1.5 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export default FormField;
