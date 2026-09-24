import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Wallet, Undo2, Scale, Gift } from "lucide-react";

/**
 * El panel oscuro de la izquierda en las pantallas de sesión.
 *
 * Quien llega acá no siempre sabe qué es DOAPP: entró por un link, por un
 * trabajo que le pasaron, por una búsqueda. Un formulario solo, sobre fondo
 * gris, no le dice nada. Este panel usa ese espacio muerto para contar las
 * cuatro cosas que hacen distinta a la plataforma, una por vez.
 *
 * Rotan en lugar de mostrarse todas juntas porque una lista de cinco ítems no
 * se lee: se ignora. De a uno, con tiempo suficiente para leerlo, alguno queda.
 *
 * Respeta `prefers-reduced-motion`: para quien pidió menos movimiento, el
 * mensaje queda fijo en el primero (el del escrow, que es el que más pesa
 * cuando la duda es "¿le doy mi plata a esta app?").
 */

interface Mensaje {
  icono: typeof ShieldCheck;
  titulo: string;
  resaltado: string;
  cuerpo: string;
}

const INTERVALO_MS = 6000;

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

  const [i, setI] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // El navegador puede no soportar matchMedia (tests, SSR): sin él se asume
    // que el movimiento está permitido, que es el caso normal.
    const sinMovimiento =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (sinMovimiento || mensajes.length < 2) return;

    const id = setInterval(() => {
      // Se apaga, se cambia, se enciende: sin esto el texto salta de golpe y
      // se lee como un error de la página.
      setVisible(false);
      setTimeout(() => {
        setI((n) => (n + 1) % mensajes.length);
        setVisible(true);
      }, 350);
    }, INTERVALO_MS);

    return () => clearInterval(id);
  }, [mensajes.length]);

  const m = mensajes[i];
  const Icono = m.icono;

  return (
    <aside
      className={`relative hidden lg:flex flex-col justify-between overflow-hidden bg-slate-950 p-10 text-white ${className}`}
      aria-label={t("authHero.aria", "Sobre DOAPP")}
    >
      {/* Luz de fondo. Puramente decorativa: fuera del árbol accesible. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full bg-sky-500/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl"
      />

      <div className="relative flex items-center gap-2">
        <img src="/logo.svg?v=4" alt="" className="h-8 w-8" aria-hidden="true" />
        <span className="text-lg font-semibold tracking-tight">
          D<span className="text-sky-400">o</span>App
        </span>
      </div>

      {/*
        aria-live="polite": quien usa lector de pantalla se entera del cambio
        sin que le interrumpa lo que esté haciendo en el formulario.
      */}
      <div className="relative" aria-live="polite">
        <div
          className={`transition-all duration-300 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          }`}
        >
          <Icono className="mb-5 h-7 w-7 text-sky-400" aria-hidden="true" />
          <h2 className="text-3xl font-bold leading-tight xl:text-4xl">
            {m.titulo}
            <br />
            <span className="text-sky-400">{m.resaltado}</span>
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-300">{m.cuerpo}</p>
        </div>

        {/* Los puntos también son botones: si un mensaje interesa, se puede volver. */}
        <div className="mt-8 flex gap-2">
          {mensajes.map((msg, n) => (
            <button
              key={msg.resaltado}
              type="button"
              onClick={() => {
                setVisible(false);
                setTimeout(() => {
                  setI(n);
                  setVisible(true);
                }, 200);
              }}
              aria-label={`${msg.titulo} ${msg.resaltado}`}
              aria-current={n === i}
              className={`h-1.5 rounded-full transition-all ${
                n === i ? "w-8 bg-sky-400" : "w-1.5 bg-white/25 hover:bg-white/50"
              }`}
            />
          ))}
        </div>
      </div>

      <p className="relative flex items-center gap-2 text-xs text-slate-400">
        <ShieldCheck className="h-4 w-4 text-sky-500" aria-hidden="true" />
        {t("authHero.footer", "Mercado Pago · CBU/CVU · el pago se libera cuando el trabajo está hecho")}
      </p>
    </aside>
  );
}
