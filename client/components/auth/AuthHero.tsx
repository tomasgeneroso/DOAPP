import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Wallet, Undo2, Scale, Gift } from "lucide-react";

/**
 * El panel de la izquierda en las pantallas de sesión.
 *
 * Quien llega acá no siempre sabe qué es DOAPP: entró por un link, por un
 * trabajo que le pasaron, por una búsqueda. Un formulario solo, sobre fondo
 * gris, no le dice nada. Este panel usa ese espacio muerto para contar las
 * cinco cosas que hacen distinta a la plataforma, una por vez.
 *
 * Rotan en lugar de mostrarse todas juntas porque una lista de cinco ítems no
 * se lee: se ignora. De a uno, con tiempo suficiente para leerlo, alguno queda.
 *
 * Sigue el tema de la aplicación. Antes era oscuro y punto, así que en modo
 * claro quedaba un rectángulo negro pegado a un formulario blanco: no se leía
 * como diseño, se leía como algo a medio cargar.
 *
 * Sobre el movimiento y `prefers-reduced-motion`: el mensaje avanza igual —eso
 * es lo que hace que el panel sirva—, pero sin el desvanecido, cambiando de
 * golpe. Lo que molesta a quien pidió menos movimiento es la animación, no que
 * el contenido cambie. Y para que nadie pierda un mensaje a medio leer, la
 * rotación se detiene mientras el puntero está encima o algo de acá tiene el
 * foco del teclado.
 */

interface Mensaje {
  icono: typeof ShieldCheck;
  titulo: string;
  resaltado: string;
  cuerpo: string;
}

const INTERVALO_MS = 6000;
/** Lo que tarda el desvanecido; tiene que coincidir con la clase `duration-300`. */
const FUNDIDO_MS = 350;

export default function AuthHero({ className = "" }: { className?: string }) {
  const { t } = useTranslation();

  const mensajes: Mensaje[] = [
    {
      icono: ShieldCheck,
      titulo: t("authHero.escrowTitle", "Tu dinero,"),
      resaltado: t("authHero.escrowHighlight", "protegido en escrow"),
      cuerpo: t(
        "authHero.escrowBody",
        "El pago queda retenido por DOAPP hasta que confirmás que el trabajo se hizo. Ni el trabajador cobra antes, ni vos pagás después.",
      ),
    },
    {
      icono: Wallet,
      titulo: t("authHero.workerTitle", "El trabajador cobra"),
      resaltado: t("authHero.workerHighlight", "el precio completo"),
      cuerpo: t(
        "authHero.workerBody",
        "Sin descuentos ni sorpresas: la comisión y el costo de procesamiento los paga el cliente, aparte y a la vista.",
      ),
    },
    {
      icono: Undo2,
      titulo: t("authHero.cancelTitle", "Si cancelás,"),
      resaltado: t("authHero.cancelHighlight", "no perdés todo"),
      cuerpo: t(
        "authHero.cancelBody",
        "Mientras no haya un trabajador elegido, el precio y la comisión vuelven. Elegís si quedan como saldo o te los devolvemos.",
      ),
    },
    {
      icono: Scale,
      titulo: t("authHero.disputeTitle", "Si algo sale mal,"),
      resaltado: t("authHero.disputeHighlight", "hay con quién hablar"),
      cuerpo: t(
        "authHero.disputeBody",
        "Primero 72 horas para arreglarlo entre las partes. Si no hay acuerdo, interviene una persona de DOAPP y el dinero queda congelado.",
      ),
    },
    {
      icono: Gift,
      titulo: t("authHero.betaTitle", "Los primeros 1000:"),
      resaltado: t("authHero.betaHighlight", "3 contratos sin comisión"),
      cuerpo: t(
        "authHero.betaBody",
        "Durante la beta DOAPP no cobra comisión a nadie. Pagás el trabajo y el costo de procesamiento del pago, nada más.",
      ),
    },
  ];

  const cantidad = mensajes.length;

  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);
  const [pausado, setPausado] = useState(false);
  const [sinMovimiento, setSinMovimiento] = useState(false);

  /** Fundido pendiente. En un ref para poder cancelarlo al desmontar. */
  const fundido = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Se escucha el cambio, no sólo el valor inicial: alguien puede activar
  // "reducir movimiento" con la pantalla abierta.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSinMovimiento(consulta.matches);
    const alCambiar = (e: MediaQueryListEvent) => setSinMovimiento(e.matches);
    consulta.addEventListener?.("change", alCambiar);
    return () => consulta.removeEventListener?.("change", alCambiar);
  }, []);

  /** Va a un mensaje: con desvanecido, o de golpe si se pidió menos movimiento. */
  const ir = useCallback(
    (destino: number | ((n: number) => number), demora = FUNDIDO_MS) => {
      if (fundido.current) clearTimeout(fundido.current);
      if (sinMovimiento) {
        setI(destino);
        setVisible(true);
        return;
      }
      setVisible(false);
      fundido.current = setTimeout(() => {
        setI(destino);
        setVisible(true);
        fundido.current = null;
      }, demora);
    },
    [sinMovimiento],
  );

  useEffect(() => {
    if (pausado || cantidad < 2) return;
    const id = setInterval(() => ir((n) => (n + 1) % cantidad), INTERVALO_MS);
    return () => clearInterval(id);
  }, [pausado, cantidad, ir]);

  // Si el componente se va con un fundido a medio camino, el texto no puede
  // quedar invisible ni el temporizador escribiendo sobre algo desmontado.
  useEffect(
    () => () => {
      if (fundido.current) clearTimeout(fundido.current);
    },
    [],
  );

  const m = mensajes[i];
  const Icono = m.icono;

  return (
    <aside
      className={`relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-slate-200 bg-gradient-to-br from-sky-50 via-white to-slate-100 p-10 text-slate-900 dark:border-transparent dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-white ${className}`}
      aria-label={t("authHero.aria", "Sobre DOAPP")}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocusCapture={() => setPausado(true)}
      onBlurCapture={() => setPausado(false)}
    >
      {/* Luz de fondo. Puramente decorativa: fuera del árbol accesible. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full bg-sky-400/20 blur-3xl dark:bg-sky-500/20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-600/10"
      />

      <div className="relative flex items-center gap-2">
        <img src="/logo.svg?v=4" alt="" className="h-8 w-8" aria-hidden="true" />
        <span className="text-lg font-semibold tracking-tight">
          D<span className="text-sky-600 dark:text-sky-400">o</span>App
        </span>
      </div>

      {/*
        aria-live="polite": quien usa lector de pantalla se entera del cambio
        sin que le interrumpa lo que esté haciendo en el formulario.
      */}
      <div className="relative" aria-live="polite">
        <div
          className={`transition-all ${sinMovimiento ? "duration-0" : "duration-300"} ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          }`}
        >
          <Icono className="mb-5 h-7 w-7 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          <h2 className="text-3xl font-bold leading-tight xl:text-4xl">
            {m.titulo}
            <br />
            <span className="text-sky-600 dark:text-sky-400">{m.resaltado}</span>
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {m.cuerpo}
          </p>
        </div>

        {/* Los puntos también son botones: si un mensaje interesa, se puede volver. */}
        <div className="mt-8 flex gap-2">
          {mensajes.map((msg, n) => (
            <button
              key={msg.resaltado}
              type="button"
              onClick={() => ir(n, 200)}
              aria-label={`${msg.titulo} ${msg.resaltado}`}
              aria-current={n === i}
              className={`h-1.5 rounded-full transition-all ${
                n === i
                  ? "w-8 bg-sky-600 dark:bg-sky-400"
                  : "w-1.5 bg-slate-900/20 hover:bg-slate-900/40 dark:bg-white/25 dark:hover:bg-white/50"
              }`}
            />
          ))}
        </div>
      </div>

      <p className="relative flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <ShieldCheck className="h-4 w-4 text-sky-600 dark:text-sky-500" aria-hidden="true" />
        {t("authHero.footer", "Mercado Pago · CBU/CVU · el pago se libera cuando el trabajo está hecho")}
      </p>
    </aside>
  );
}
