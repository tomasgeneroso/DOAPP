import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, ChevronLeft, Check, Star, Loader2 } from "lucide-react";

/**
 * El teléfono del hero: el último tramo del proceso, el que decide si alguien
 * se anima a usar la app.
 *
 * Qué muestra y por qué ése momento: el miedo de los dos lados es el mismo —el
 * cliente teme pagar y que no le hagan el trabajo; el trabajador, trabajar y no
 * cobrar—. Todo lo que diga la portada sobre "pagos seguros" es una promesa
 * hasta que se ve el instante en que el dinero efectivamente cambia de manos.
 * Por eso la animación arranca con el botón de confirmar y termina con la plata
 * acreditada, que es la respuesta a las dos preguntas a la vez.
 *
 * Se puede tocar. El botón "Confirmar finalización" adelanta la secuencia, y
 * ahí está la idea: quien lo aprieta hace el gesto que después va a hacer de
 * verdad. Si nadie lo toca, el ciclo corre solo y vuelve a empezar.
 *
 * Va DETRÁS del texto del hero, así que el texto lleva `pointer-events-none`
 * (ver Index.tsx) para que los clics lleguen hasta acá.
 *
 * Con `prefers-reduced-motion` no hay ciclo: queda fijo en el estado final,
 * que es el que cuenta la historia completa en una sola imagen.
 */

type Paso = "en_curso" | "confirmando" | "liberado";

const MS_ANTES_DE_CONFIRMAR = 4200;
const MS_CONFIRMANDO = 1100;
const MS_MOSTRANDO_RESULTADO = 5200;

export default function MovilPagoLiberado({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const [paso, setPaso] = useState<Paso>("en_curso");
  const [tocado, setTocado] = useState(false);

  const sinMovimiento =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (sinMovimiento) {
      setPaso("liberado");
      return;
    }
    // Un solo temporizador por paso: encadenarlos con setTimeout anidados deja
    // temporizadores huérfanos si el componente se desmonta a mitad del ciclo.
    const espera =
      paso === "en_curso" ? MS_ANTES_DE_CONFIRMAR
        : paso === "confirmando" ? MS_CONFIRMANDO
          : MS_MOSTRANDO_RESULTADO;

    const id = setTimeout(() => {
      setPaso((p) => (p === "en_curso" ? "confirmando" : p === "confirmando" ? "liberado" : "en_curso"));
    }, espera);

    return () => clearTimeout(id);
  }, [paso, sinMovimiento]);

  const confirmar = useCallback(() => {
    if (paso !== "en_curso") return;
    setTocado(true);
    setPaso("confirmando");
  }, [paso]);

  const pasos = [
    t("home.movilPaso1", "Pagado"),
    t("home.movilPaso2", "En curso"),
    t("home.movilPaso3", "Confirmado"),
  ];
  const indiceActivo = paso === "liberado" ? 2 : 1;

  return (
    <div className={`relative select-none ${className}`} aria-hidden={false}>
      {/* Resplandor detrás del equipo. Decorativo. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 rounded-[3rem] bg-sky-500/15 blur-3xl"
      />

      <div
        className="relative w-[280px] rounded-[2.5rem] border-[10px] border-slate-950 bg-slate-950 shadow-2xl shadow-black/60 ring-1 ring-white/10"
        style={{ transform: "rotate(-4deg)" }}
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
              {paso === "liberado"
                ? t("home.movilTituloFin", "Trabajo terminado")
                : t("home.movilTitulo", "Trabajo en curso")}
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
                <p className="truncate text-[11px] text-slate-400">
                  {t("home.movilOficio", "Técnico en computadoras")}
                </p>
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

            {/* Estado del dinero */}
            <div
              className={`mt-4 rounded-xl border px-3 py-2.5 transition-colors duration-500 ${
                paso === "liberado"
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-sky-500/30 bg-sky-500/10"
              }`}
            >
              <p
                className={`flex items-center gap-1.5 text-[11px] font-semibold transition-colors duration-500 ${
                  paso === "liberado" ? "text-emerald-300" : "text-sky-300"
                }`}
              >
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                {paso === "liberado"
                  ? t("home.movilPagoLiberado", "Pago liberado")
                  : t("home.movilPagoProtegido", "Pago protegido")}
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-slate-400">
                {paso === "liberado"
                  ? t("home.movilPagoLiberadoTexto", "Se acreditaron $96.000 en el saldo de Matías.")
                  : t(
                      "home.movilPagoProtegidoTexto",
                      "El dinero está retenido por DoApp hasta que confirmes que el trabajo se hizo.",
                    )}
              </p>
            </div>

            {/* Progreso */}
            <div className="mt-4">
              <div className="relative flex items-center justify-between">
                {/* Riel */}
                <div className="absolute left-2 right-2 top-[7px] h-[2px] bg-slate-700" aria-hidden="true" />
                <div
                  className="absolute left-2 top-[7px] h-[2px] bg-emerald-400 transition-all duration-700 ease-out"
                  style={{ width: indiceActivo === 2 ? "calc(100% - 1rem)" : "50%" }}
                  aria-hidden="true"
                />
                {pasos.map((etiqueta, i) => {
                  const hecho = i <= indiceActivo;
                  return (
                    <div key={etiqueta} className="relative z-10 flex flex-col items-center gap-1">
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-all duration-500 ${
                          hecho
                            ? "border-emerald-400 bg-emerald-400"
                            : "border-slate-600 bg-slate-900"
                        }`}
                      >
                        {hecho && <Check className="h-2.5 w-2.5 text-slate-900" strokeWidth={4} aria-hidden="true" />}
                      </span>
                      <span
                        className={`text-[8px] transition-colors duration-500 ${
                          hecho ? "text-slate-300" : "text-slate-500"
                        }`}
                      >
                        {etiqueta}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Acción */}
            <div className="mt-4 min-h-[68px]">
              {paso === "liberado" ? (
                <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-3 text-center">
                  <p className="text-[11px] font-semibold text-white">
                    {t("home.movilListo", "Listo. El trabajo quedó cerrado.")}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {t("home.movilCalificar", "Ahora califican los dos.")}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={paso === "confirmando"}
                  className="w-full rounded-xl bg-sky-500 px-3 py-3 text-xs font-bold text-white shadow-lg shadow-sky-500/25 transition-all duration-200 hover:bg-sky-400 active:scale-95 disabled:opacity-80"
                >
                  {paso === "confirmando" ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      {t("home.movilLiberando", "Liberando el pago…")}
                    </span>
                  ) : (
                    t("home.movilConfirmar", "Confirmar finalización")
                  )}
                </button>
              )}
              {/* Sólo aparece si nadie tocó nada: es una invitación, no una instrucción. */}
              {!tocado && paso === "en_curso" && !sinMovimiento && (
                <p className="mt-1.5 animate-pulse text-center text-[9px] text-slate-500">
                  {t("home.movilTocalo", "Tocá el botón")}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
