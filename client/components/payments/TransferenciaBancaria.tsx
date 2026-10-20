import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Copy, FileText, Loader2, Upload, X } from "lucide-react";
import { useDatosBancarios } from "@/hooks/useDatosBancarios";
import { TAMANO_MAXIMO_DEL_COMPROBANTE, TIPOS_DE_COMPROBANTE, type DatosDeTransferencia, type ErroresDeTransferencia } from "../../../shared/pagos/transferencia";

interface Props {
  /** Lo que hay que transferir, en pesos. */
  monto: number;
  yaPague: boolean;
  onYaPague: (valor: boolean) => void;
  datos: DatosDeTransferencia;
  onDatos: (datos: DatosDeTransferencia) => void;
  archivo: File | null;
  onArchivo: (archivo: File | null) => void;
  errores?: ErroresDeTransferencia;
}

function Copiar({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(valor).then(() => {
          setCopiado(true);
          window.setTimeout(() => setCopiado(false), 1500);
        });
      }}
      aria-label={`Copiar ${etiqueta}`}
      className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
    >
      {copiado ? <Check className="h-4 w-4 text-emerald-500" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
    </button>
  );
}

const estiloCampo =
  "block w-full h-11 rounded-xl border bg-slate-50 px-4 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:bg-slate-900 dark:text-white";

function Campo({
  id, etiqueta, error, ayuda, children,
}: { id: string; etiqueta: string; error?: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
        {etiqueta} <span className="text-red-500" aria-hidden>*</span>
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : ayuda ? (
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{ayuda}</p>
      ) : null}
    </div>
  );
}

/**
 * Pago por transferencia: los datos de la cuenta (del servidor, nunca escritos a mano) y, al tocar «Ya pagué», el formulario del comprobante:
 * archivo (PDF, JPG o PNG), número de operación y quién hizo la transferencia (nombre, documento), banco y fecha.
 */
export default function TransferenciaBancaria({ monto, yaPague, onYaPague, datos, onDatos, archivo, onArchivo, errores = {} }: Props) {
  const { cargado, disponible, cuenta } = useDatosBancarios();
  const [errorDeArchivo, setErrorDeArchivo] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  // Los límites del selector de fecha se toman una vez al montar (llamar a Date.now() al dibujar cambia el resultado entre dibujos).
  const [{ hoy, hace30 }] = useState(() => ({
    hoy: new Date().toISOString().slice(0, 10),
    hace30: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
  }));

  const vista = useMemo(() => (archivo && archivo.type.startsWith("image/") ? URL.createObjectURL(archivo) : null), [archivo]);
  useEffect(() => () => { if (vista) URL.revokeObjectURL(vista); }, [vista]);

  const cambiar = (campo: keyof DatosDeTransferencia) => (e: React.ChangeEvent<HTMLInputElement>) => onDatos({ ...datos, [campo]: e.target.value });
  const borde = (campo: keyof ErroresDeTransferencia) => (errores[campo] ? "border-red-400 dark:border-red-500" : "border-slate-200 dark:border-slate-700");

  const elegirArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!(TIPOS_DE_COMPROBANTE as readonly string[]).includes(ext)) {
      setErrorDeArchivo("El comprobante tiene que ser un PDF, un JPG o un PNG.");
      e.target.value = "";
      return;
    }
    if (f.size > TAMANO_MAXIMO_DEL_COMPROBANTE) {
      setErrorDeArchivo("El comprobante pesa más de 5 MB.");
      e.target.value = "";
      return;
    }
    setErrorDeArchivo(null);
    onArchivo(f);
  };

  if (cargado && disponible === false) {
    return (
      <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
        El pago por transferencia no está disponible en este momento. Elegí otro medio de pago.
      </p>
    );
  }

  const filas = [
    cuenta?.accountHolder && { etiqueta: "Titular", valor: cuenta.accountHolder },
    cuenta?.cuit && { etiqueta: "CUIT", valor: cuenta.cuit },
    cuenta?.bank && { etiqueta: "Banco", valor: cuenta.bank },
    cuenta?.cbu && { etiqueta: "CBU / CVU", valor: cuenta.cbu },
    cuenta?.alias && { etiqueta: "Alias", valor: cuenta.alias },
  ].filter(Boolean) as Array<{ etiqueta: string; valor: string }>;

  const errorArchivo = errorDeArchivo ?? errores.archivo;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <Building2 className="h-5 w-5 text-slate-500" aria-hidden />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Datos para la transferencia</span>
        </div>
        <div className="space-y-2.5 p-4 text-sm">
          {!cargado && <Loader2 className="h-5 w-5 animate-spin text-sky-500" aria-label="Cargando los datos de la cuenta" />}
          {filas.map(({ etiqueta, valor }) => (
            <div key={etiqueta} className="flex items-center justify-between gap-3">
              <span className="w-24 shrink-0 text-slate-500 dark:text-slate-400">{etiqueta}</span>
              <div className="flex flex-1 items-center justify-end gap-1">
                <span className="break-all text-right font-medium text-slate-800 dark:text-slate-200">{valor}</span>
                {(etiqueta === "CBU / CVU" || etiqueta === "Alias") && <Copiar valor={valor} etiqueta={etiqueta} />}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400">Monto a transferir</span>
            <span className="text-lg font-bold text-slate-900 dark:text-white">
              ${monto.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700">
        <button
          type="button"
          aria-expanded={yaPague}
          aria-controls="panel-ya-pague"
          onClick={() => onYaPague(!yaPague)}
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-sm font-semibold text-slate-800 transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800/60"
        >
          <Check className="h-5 w-5 text-emerald-500" aria-hidden />
          <span className="flex-1">Ya pagué</span>
          <span className="text-xs font-normal text-slate-500 dark:text-slate-400">adjuntar el comprobante</span>
          <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform duration-300 motion-reduce:transition-none ${yaPague ? "rotate-180" : ""}`} aria-hidden />
        </button>

        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${yaPague ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div id="panel-ya-pague" className="min-h-0 overflow-hidden" aria-hidden={!yaPague || undefined}>
            <div className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-700">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Completá los datos de la transferencia que hiciste. Los usamos para encontrarla en el extracto y aprobar tu pago.
              </p>

              <Campo id="tf-numero" etiqueta="Número de operación" error={errores.numero} ayuda="Figura en el comprobante de tu banco o billetera.">
                <input id="tf-numero" type="text" value={datos.numero} onChange={cambiar("numero")} maxLength={60} autoComplete="off" aria-invalid={!!errores.numero} aria-describedby={errores.numero ? "tf-numero-error" : undefined} placeholder="Ej: 0123456789" className={`${estiloCampo} ${borde("numero")}`} />
              </Campo>

              <div className="grid gap-4 sm:grid-cols-2">
                <Campo id="tf-nombre" etiqueta="Nombre de quien transfirió" error={errores.nombre}>
                  <input id="tf-nombre" type="text" value={datos.nombre} onChange={cambiar("nombre")} maxLength={160} autoComplete="name" aria-invalid={!!errores.nombre} aria-describedby={errores.nombre ? "tf-nombre-error" : undefined} placeholder="Nombre y apellido" className={`${estiloCampo} ${borde("nombre")}`} />
                </Campo>
                <Campo id="tf-documento" etiqueta="DNI o CUIL/CUIT" error={errores.documento}>
                  <input id="tf-documento" type="text" inputMode="numeric" value={datos.documento} onChange={cambiar("documento")} maxLength={14} autoComplete="off" aria-invalid={!!errores.documento} aria-describedby={errores.documento ? "tf-documento-error" : undefined} placeholder="Ej: 40182662" className={`${estiloCampo} ${borde("documento")}`} />
                </Campo>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Campo id="tf-banco" etiqueta="Banco o billetera de origen" error={errores.banco}>
                  <input id="tf-banco" type="text" value={datos.banco} onChange={cambiar("banco")} maxLength={80} autoComplete="off" aria-invalid={!!errores.banco} aria-describedby={errores.banco ? "tf-banco-error" : undefined} placeholder="Ej: Banco Galicia, Ualá…" className={`${estiloCampo} ${borde("banco")}`} />
                </Campo>
                <Campo id="tf-fecha" etiqueta="Fecha de la transferencia" error={errores.fecha}>
                  <input id="tf-fecha" type="date" value={datos.fecha} onChange={cambiar("fecha")} min={hace30} max={hoy} aria-invalid={!!errores.fecha} aria-describedby={errores.fecha ? "tf-fecha-error" : undefined} className={`${estiloCampo} ${borde("fecha")}`} />
                </Campo>
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Comprobante (PDF, JPG o PNG, hasta 5 MB) <span className="text-red-500" aria-hidden>*</span>
                </span>
                <input ref={entrada} id="tf-archivo" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={elegirArchivo} className="sr-only" aria-describedby={errorArchivo ? "tf-archivo-error" : undefined} />
                {!archivo ? (
                  <button
                    type="button"
                    onClick={() => entrada.current?.click()}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-sm font-medium text-slate-600 transition hover:border-sky-400 hover:text-sky-700 dark:text-slate-300 ${errorArchivo ? "border-red-400" : "border-slate-300 dark:border-slate-600"}`}
                  >
                    <Upload className="h-5 w-5" aria-hidden /> Elegir el comprobante
                  </button>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
                    {vista ? (
                      <img src={vista} alt="Vista previa del comprobante" className="h-14 w-14 rounded-lg border border-slate-200 object-cover dark:border-slate-600" />
                    ) : (
                      <FileText className="h-10 w-10 text-slate-400" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{archivo.name}</p>
                      <p className="text-xs text-slate-500">{(archivo.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onArchivo(null);
                        if (entrada.current) entrada.current.value = "";
                      }}
                      aria-label="Quitar el comprobante"
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-700"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                )}
                {errorArchivo && <p id="tf-archivo-error" role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{errorArchivo}</p>}
              </div>

              <p className="text-xs text-slate-400 dark:text-slate-500">
                ⏱ Verificación en 24-48 hs hábiles. El trabajo se publica cuando se aprueba el pago.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
