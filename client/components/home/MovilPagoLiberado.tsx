import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, ChevronLeft, Check, Star, Pause, Play } from "lucide-react";

/**
 * El teléfono del hero: el recorrido de un trabajo, de la postulación al cobro.
 *
 * Qué muestra y por qué: el miedo de los dos lados es el mismo —el cliente teme pagar y que no le hagan el trabajo; el trabajador, trabajar y no cobrar—.
 * Todo lo que diga la portada sobre «pagos seguros» es una promesa hasta que se ve el instante en que el dinero efectivamente llega.
 *
 * Qué se mueve (pedido del dueño, 2026-11-15): una barra con tres etapas —«te postulaste al trabajo», «trabajando», «pago terminado»— que va pasando de
 * gris a verde sola, una etapa tras otra. Debajo, el «Pago liberado» queda en gris y, cuando la barra se completa, se pone en verde. Después de un rato
 * vuelve a empezar.
 *
 * «Reducir movimiento» del sistema NO lo detiene (el dueño lo tiene activado en su equipo, vio el teléfono quieto y creyó que no tenía movimiento). En su lugar lleva un
 * botón de PAUSA —lo que pide la accesibilidad para lo que se mueve solo—: quien no quiera ver el movimiento lo detiene con un toque. Pausado queda fijo en el estado
 * final, que cuenta la historia completa en una sola imagen.
 *
 * Va DETRÁS del texto del hero (el texto lleva `pointer-events-none`, ver Index.tsx); el botón de pausa sí recibe toques.
 */

/** Cuántas etapas están cumplidas: 0 = todo gris … 3 = barra completa y pago liberado. */
type Cumplidas = 0 | 1 | 2 | 3;

const MS_ANTES_DE_EMPEZAR = 1200;
const MS_ENTRE_ETAPAS = 1500;
const MS_MOSTRANDO_RESULTADO = 5200;

export default function MovilPagoLiberado({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  // Pausado: el ciclo se detiene y queda el estado final (la historia completa en una sola imagen).
  const [pausado, setPausado] = useState(false);
  const sinMovimiento = pausado;
  const [cumplidas, setCumplidas] = useState<Cumplidas>(0);
  /**
   * `montado` es la entrada: el teléfono sube y aparece una vez. `vueltas` cuenta los ciclos y sirve de `key` en el cartel del pago, para que su
   * celebración corra de nuevo cada vez que se completa (con la misma key React reusa el nodo y la animación no se repite).
   */
  const [montado, setMontado] = useState(false);
  const [vueltas, setVueltas] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMontado(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Al pausar queda el estado final; al reanudar, el ciclo empieza de nuevo.
  useEffect(() => {
    setCumplidas(pausado ? 3 : 0);
  }, [pausado]);

  useEffect(() => {
    if (pausado) return;
    // Un solo temporizador por etapa: encadenarlos con setTimeout anidados deja temporizadores huérfanos si se desmonta a mitad del ciclo.
    const espera = cumplidas === 0 ? MS_ANTES_DE_EMPEZAR : cumplidas === 3 ? MS_MOSTRANDO_RESULTADO : MS_ENTRE_ETAPAS;
    const id = setTimeout(() => {
      const siguiente = (cumplidas === 3 ? 0 : cumplidas + 1) as Cumplidas;
      if (siguiente === 3) setVueltas((v) => v + 1);
      setCumplidas(siguiente);
    }, espera);
    return () => clearTimeout(id);
  }, [cumplidas, pausado]);

  const etapas = [
    t("home.movilPaso1", "Te postulaste al trabajo"),
    t("home.movilPaso2", "Trabajando"),
    t("home.movilPaso3", "Pago terminado"),
  ];
  const completo = cumplidas === 3;
  // El riel va de la mitad de la primera columna a la mitad de la última (1/6 a 5/6 del ancho): el relleno llega a cada punto, uno tras otro.
  const rellenoPorCiento = cumplidas <= 1 ? 0 : cumplidas === 2 ? 33.333 : 66.666;

  return (
    <div className={`relative select-none ${className}`} aria-hidden={false}>
      {/* Resplandor detrás del equipo. Decorativo. */}
      <div aria-hidden="true" className="pointer-events-none absolute -inset-10 rounded-[3rem] bg-sky-500/15 blur-3xl" />

      <div
        data-testid="movil-de-la-portada"
        data-cumplidas={cumplidas}
        className={`relative w-[280px] rounded-[2.5rem] border-[10px] border-slate-950 bg-slate-950 shadow-2xl shadow-black/60 ring-1 ring-white/10 ${
          sinMovimiento
            ? ""
            : `transition-[opacity,transform] duration-[900ms] ease-out ${montado ? "opacity-100" : "opacity-0"} animate-[flotar_7s_ease-in-out_infinite]`
        }`}
        style={{
          // La inclinación convive con la flotación: el keyframe la repite en cada paso para no pelearse con este transform.
          transform: sinMovimiento || montado ? "rotate(-4deg)" : "rotate(-4deg) translateY(28px)",
        }}
      >
        {/* Isla dinámica */}
        <div className="absolute left-1/2 top-2 z-20 h-5 w-20 -translate-x-1/2 rounded-full bg-black" />

        <div className="overflow-hidden rounded-[1.9rem] bg-slate-900">
          {/* Barra de estado */}
          <div className="flex items-center justify-between px-5 pb-1 pt-3 text-[10px] font-medium text-slate-400">
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-[2px] bg-slate-500" />
              <span className="inline-block h-2 w-2 rounded-full bg-slate-500" />
              <span className="inline-block h-2 w-4 rounded-[2px] border border-slate-500" />
            </span>
          </div>

          {/* Cabecera */}
          <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2.5">
            <ChevronLeft className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <span className="text-xs font-semibold text-white">
              {completo ? t("home.movilTituloFin", "Trabajo terminado") : t("home.movilTitulo", "Trabajo en curso")}
            </span>
          </div>

          <div className="px-4 py-4">
            {/* Trabajador */}
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-sm font-bold text-white">
                MR
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">Matías R.</p>
                <p className="truncate text-[11px] text-slate-400">{t("home.movilOficio", "Técnico en computadoras")}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                    <ShieldCheck className="h-2.5 w-2.5" aria-hidden="true" />
                    {t("home.movilVerificado", "Verificado")}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-400">
                    <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                    4,9
                  </span>
                </div>
              </div>
            </div>

            {/* Progreso: tres etapas que pasan de gris a verde una tras otra */}
            <ol className="relative mt-5 grid grid-cols-3" aria-label="Etapas del trabajo" data-testid="etapas-del-movil">
              {/* Riel gris y, encima, el relleno verde que avanza */}
              <div className="absolute left-[16.666%] right-[16.666%] top-[7px] h-[2px] bg-slate-700" aria-hidden="true" />
              <div
                className="absolute left-[16.666%] top-[7px] h-[2px] bg-emerald-400 transition-all duration-1000 ease-out"
                style={{ width: `${rellenoPorCiento}%` }}
                aria-hidden="true"
                data-testid="relleno-de-la-barra"
              />
              {etapas.map((etiqueta, i) => {
                const hecha = i < cumplidas;
                return (
                  <li key={etiqueta} className="relative z-10 flex flex-col items-center gap-1.5 px-0.5 text-center" data-hecha={hecha}>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                        hecha ? "border-emerald-400 bg-emerald-400" : "border-slate-600 bg-slate-900"
                      }`}
                    >
                      {hecha && <Check className="h-2.5 w-2.5 text-slate-900" strokeWidth={4} aria-hidden="true" />}
                    </span>
                    <span className={`text-[9px] leading-tight transition-colors duration-500 ${hecha ? "text-emerald-300" : "text-slate-500"}`}>{etiqueta}</span>
                  </li>
                );
              })}
            </ol>

            {/* El pago: en gris hasta que la barra se completa; ahí se pone en verde */}
            <div
              key={`dinero-${vueltas}`}
              data-testid="pago-liberado-del-movil"
              data-liberado={completo}
              className={`mt-5 rounded-xl border px-3 py-2.5 transition-colors duration-700 ${
                completo ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-700 bg-slate-800/60"
              } ${completo && !sinMovimiento ? "animate-[celebrar_900ms_ease-out]" : ""}`}
            >
              <p className={`flex items-center gap-1.5 text-[11px] font-semibold transition-colors duration-700 ${completo ? "text-emerald-300" : "text-slate-400"}`}>
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                {t("home.movilPagoLiberado", "Pago liberado")}
              </p>
              {/* Con `key` el nodo se reemplaza y el fundido corre de nuevo; sin ella el texto cambia de golpe. */}
              <p
                key={completo ? `liberado-${vueltas}` : "por-liberar"}
                className="mt-0.5 text-[10px] leading-snug text-slate-400 animate-[entrarTexto_520ms_ease-out]"
              >
                {completo
                  ? t("home.movilPagoLiberadoTexto", "Se acreditaron $96.000 en el saldo de Matías.")
                  : t("home.movilPagoPorLiberarTexto", "Se acreditarán $96.000 en el saldo de Matías.")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pausa: lo que se mueve solo se puede detener (accesibilidad). Va fuera del teléfono para que no tape nada. */}
      <button
        type="button"
        onClick={() => setPausado((p) => !p)}
        aria-pressed={pausado}
        aria-label={pausado ? "Reanudar la animación del teléfono" : "Pausar la animación del teléfono"}
        title={pausado ? "Reanudar la animación" : "Pausar la animación"}
        data-testid="pausa-del-movil"
        className="relative z-10 mx-auto mt-5 flex w-fit items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-[11px] font-medium text-slate-300 hover:text-white"
      >
        {pausado ? <Play className="h-3 w-3" aria-hidden="true" /> : <Pause className="h-3 w-3" aria-hidden="true" />}
        {pausado ? "Reanudar" : "Pausar"}
      </button>
    </div>
  );
}
