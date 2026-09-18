import { CreditCard, Wallet, Landmark, Clock } from "lucide-react";

export interface CaminoDePagoDto {
  id: "tarjeta_credito" | "tarjeta_debito" | "dinero_en_cuenta";
  titulo: string;
  descripcion: string;
  ratePct: number;
  clientePaga: number;
  pasarela: number;
  trabajadorRecibe: number;
  liberacionDias: number;
}

const ars = (n: number) => "$" + Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });

const ICONOS = {
  tarjeta_credito: CreditCard,
  tarjeta_debito: Landmark,
  dinero_en_cuenta: Wallet,
};

/**
 * Como cambia lo que recibe el trabajador, y cuando, segun con que pague el
 * cliente. El cliente paga lo mismo en todos; lo que cambia es la tarifa de
 * la pasarela (la absorbe el trabajador) y los dias que MP retiene la plata.
 *
 * `para` decide el enfasis: al cliente se le dice "asi ayudas al trabajador";
 * al trabajador, "esto es lo que podes recibir segun como te paguen".
 */
export default function PaymentPaths({
  caminos,
  para,
  className = "",
}: {
  caminos: CaminoDePagoDto[];
  para: "cliente" | "trabajador";
  className?: string;
}) {
  if (!caminos || caminos.length === 0) return null;
  const unico = caminos.length === 1;

  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/50 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
        {para === "cliente" ? "Cómo pagás cambia lo que recibe el trabajador" : "Lo que recibís depende de cómo pague el cliente"}
      </h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {para === "cliente"
          ? "Vos pagás lo mismo en todos los casos. La pasarela le descuenta su tarifa al trabajador, y con algunos medios retiene la plata más días."
          : "El cliente paga lo mismo siempre. Lo que te descuenta la pasarela y cuándo libera la plata depende del medio que use. El descuento exacto es el del pago real y lo ves al confirmar."}
      </p>

      <ul className="mt-3 space-y-2">
        {caminos.map((c) => {
          const Icono = ICONOS[c.id] || CreditCard;
          return (
            <li key={c.id} className="flex items-start gap-3 rounded-lg border border-slate-100 p-3 dark:border-slate-700/60">
              <Icono className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.titulo}</span>
                  <span className="text-sm tabular-nums">
                    <span className="text-slate-500 dark:text-slate-400">{para === "cliente" ? "el trabajador recibe " : "recibís "}</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">{ars(c.trabajadorRecibe)}</span>
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>pasarela {c.ratePct}% = −{ars(c.pasarela)}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {c.liberacionDias === 0 ? "MP libera al instante" : `MP libera a los ${c.liberacionDias} días`}
                  </span>
                </div>
                {!unico && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{c.descripcion}</p>}
              </div>
            </li>
          );
        })}
      </ul>

      {unico && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Si el cliente paga con dinero en cuenta de Mercado Pago o débito, la tarifa suele ser menor y la liberación más rápida. Los números exactos de esos medios los informa la pasarela en cada pago.
        </p>
      )}
    </div>
  );
}
