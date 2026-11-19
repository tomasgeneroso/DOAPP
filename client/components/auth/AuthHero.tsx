import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldCheck, Wallet, Undo2, Scale, Gift } from "lucide-react";
import { POLITICAS } from "../../../shared/constants/policies";

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
 * Cómo cambia de mensaje (pedido del dueño, 2026-11-17: «el carousel debe cambiar suave»): los cinco mensajes están apilados en el mismo lugar y se
 * cruzan —uno se desvanece mientras el otro aparece—, así no hay un instante en blanco, el panel no cambia de alto y los puntos de abajo no se mueven. Quien pidió
 * menos movimiento (`prefers-reduced-motion`) conserva el cruce de opacidad, que es suave y no se desplaza; solo pierde el deslizamiento y el desenfoque. Para que
 * nadie pierda un mensaje a medio leer, la rotación se detiene mientras el puntero está encima o algo de acá tiene el foco del teclado.
 */

interface Mensaje {
  icono: typeof ShieldCheck;
  titulo: string;
  resaltado: string;
  cuerpo: string;
}

const INTERVALO_MS = 6000;
/** Lo que dura el cruce entre un mensaje y el siguiente (clase `duration-[900ms]` de abajo). */

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
      resaltado: t("authHero.cancelHighlight", "podés recibir tu dinero de vuelta"),
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
      titulo: t("authHero.betaTitle", "Las primeras {{usuarios}} cuentas:", { usuarios: POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES }),
      resaltado: t("authHero.betaHighlight", "{{cantidad}} contrato sin comisión y PRO gratis por {{meses}} mes", {
        cantidad: POLITICAS.CONTRATOS_LIBRES_DE_LANZAMIENTO,
        meses: POLITICAS.MESES_DE_PRO_DE_LANZAMIENTO,
      }),
      cuerpo: t(
        "authHero.betaBody",
        "Es un solo contrato: después pagás la comisión de siempre, que paga el cliente. En ese primer contrato pagás el trabajo y el costo de procesamiento del pago, nada más.",
      ),
    },
  ];

  const cantidad = mensajes.length;

  const [i, setI] = useState(0);
  const [pausado, setPausado] = useState(false);

  useEffect(() => {
    if (pausado || cantidad < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % cantidad), INTERVALO_MS);
    return () => clearInterval(id);
  }, [pausado, cantidad]);

  return (
    <aside
      className={`relative hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:self-start flex-col justify-between overflow-hidden border-r border-slate-200 bg-gradient-to-br from-sky-50 via-white to-slate-100 p-10 text-slate-900 dark:border-transparent dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:text-white ${className}`}
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
        <img src="/logo.svg?v=7" alt="" className="h-8 w-8" aria-hidden="true" />
        <span className="text-lg font-semibold tracking-tight">
          D<span className="text-sky-600 dark:text-sky-400">o</span>App
        </span>
      </div>

      {/*
        Los mensajes se apilan en una misma celda de la grilla: el alto es el del más largo y nunca cambia. El de ahora tiene opacidad 1 y los demás 0, y se
        cruzan con una transición. aria-live avisa a quien usa lector de pantalla sin interrumpir lo que esté haciendo en el formulario.
      */}
      <div className="relative" aria-live="polite">
        <div className="grid">
          {mensajes.map((msg, n) => {
            const Icono = msg.icono;
            const activo = n === i;
            return (
              <div
                key={msg.resaltado}
                aria-hidden={!activo}
                className={`col-start-1 row-start-1 transition-[opacity,transform] duration-[900ms] ease-in-out ${
                  activo ? "opacity-100 motion-safe:translate-y-0" : "pointer-events-none opacity-0 motion-safe:translate-y-2"
                }`}
              >
                <Icono className="mb-5 h-7 w-7 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                <h2 className="text-3xl font-bold leading-tight xl:text-4xl">
                  {msg.titulo}
                  <br />
                  <span className="text-sky-600 dark:text-sky-400">{msg.resaltado}</span>
                </h2>
                <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-300">{msg.cuerpo}</p>
              </div>
            );
          })}
        </div>

        {/* Los puntos también son botones: si un mensaje interesa, se puede volver. */}
        <div className="mt-8 flex gap-2">
          {mensajes.map((msg, n) => (
            <button
              key={msg.resaltado}
              type="button"
              onClick={() => setI(n)}
              aria-label={`${msg.titulo} ${msg.resaltado}`}
              aria-current={n === i}
              className={`h-1.5 rounded-full transition-all duration-500 ease-out ${
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
