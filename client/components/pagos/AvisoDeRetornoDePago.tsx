import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle, Clock, Info, X } from "lucide-react";

/**
 * Lo que ve quien vuelve de pagar en Mercado Pago.
 *
 * Mercado Pago devuelve a la persona a la pantalla del contrato o de la cotización con `?pago=ok` (o
 * `?pago=cancelado`). El pago de las cotizaciones y de los contratos lo confirma, sin que nadie mire, el aviso
 * automático de Mercado Pago, que llega a los pocos segundos. Hasta ahora la pantalla ignoraba ese parámetro y
 * quien acababa de pagar no veía ningún mensaje.
 *
 * Qué hace:
 *  - mientras el pago no se ve reflejado, muestra «estamos confirmando» y vuelve a pedir los datos de la pantalla
 *    cada pocos segundos (hasta un minuto);
 *  - cuando se refleja, lo dice con el texto que le pasa cada pantalla (lo que sigue depende del tipo de pago);
 *  - si pasó el minuto y no se refleja, lo dice con honestidad y le pide que NO pague de nuevo: el aviso le llega por
 *    notificación y por email apenas se registre;
 *  - si canceló, le aclara que no se cobró nada.
 * Se cierra con la X y saca el parámetro de la dirección, así no reaparece al recargar.
 */

const INTERVALO_MS = 4000;
const MAX_CONSULTAS = 15;

interface Props {
  /** El pago ya se ve reflejado en los datos de la pantalla. */
  confirmado: boolean;
  /** Vuelve a pedir los datos de la pantalla; se llama cada pocos segundos mientras se espera. */
  onActualizar: () => void | Promise<unknown>;
  /** Qué se le dice cuando el pago ya quedó registrado. */
  textoConfirmado: string;
}

export default function AvisoDeRetornoDePago({ confirmado, onActualizar, textoConfirmado }: Props) {
  const [params, setParams] = useSearchParams();
  const pago = params.get("pago");
  const [cerrado, setCerrado] = useState(false);
  const [consultas, setConsultas] = useState(0);
  const actualizarRef = useRef(onActualizar);
  // La referencia se pone al día en un efecto (no durante el render) para que el temporizador llame siempre a la última.
  useEffect(() => {
    actualizarRef.current = onActualizar;
  }, [onActualizar]);

  const esperando = pago === "ok" && !confirmado && !cerrado && consultas < MAX_CONSULTAS;

  useEffect(() => {
    if (!esperando) return;
    const temporizador = setTimeout(async () => {
      try {
        await actualizarRef.current();
      } catch {
        /* se vuelve a intentar en el próximo ciclo */
      }
      setConsultas((n) => n + 1);
    }, INTERVALO_MS);
    return () => clearTimeout(temporizador);
  }, [esperando, consultas]);

  if ((pago !== "ok" && pago !== "cancelado") || cerrado) return null;

  const cerrar = () => {
    setCerrado(true);
    const siguiente = new URLSearchParams(params);
    siguiente.delete("pago");
    setParams(siguiente, { replace: true });
  };

  let tono: "verde" | "azul" | "ambar" | "gris";
  let titulo: string;
  let texto: string;
  if (pago === "cancelado") {
    tono = "gris";
    titulo = "Cancelaste el pago";
    texto = "No se cobró nada. Podés volver a intentarlo cuando quieras.";
  } else if (confirmado) {
    tono = "verde";
    titulo = "¡Recibimos tu pago!";
    texto = `${textoConfirmado} También te avisamos por notificación y por email.`;
  } else if (esperando) {
    tono = "azul";
    titulo = "Estamos confirmando tu pago";
    texto = "Volviste de Mercado Pago y lo estamos registrando; puede tardar unos segundos. No hace falta que hagas nada ni que pagues de nuevo.";
  } else {
    tono = "ambar";
    titulo = "Todavía no vemos tu pago reflejado";
    texto = "No lo pagues de nuevo. Apenas se registre te avisamos con una notificación y un email. Si pasan más de unas horas, escribinos desde el Centro de ayuda.";
  }

  const estilos = {
    verde: "border-green-300 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-900/20 dark:text-green-200",
    azul: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-200",
    ambar: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200",
    gris: "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
  }[tono];
  const Icono = tono === "verde" ? CheckCircle : tono === "azul" ? Clock : Info;

  return (
    <div role="status" aria-live="polite" className={`mb-6 flex items-start gap-3 rounded-lg border px-4 py-3 ${estilos}`}>
      <Icono className={`mt-0.5 h-5 w-5 flex-shrink-0 ${tono === "azul" ? "animate-pulse" : ""}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{titulo}</p>
        <p className="text-sm">{texto}</p>
      </div>
      <button type="button" onClick={cerrar} aria-label="Cerrar aviso" className="flex-shrink-0 rounded p-1 hover:bg-black/5 dark:hover:bg-white/10">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
