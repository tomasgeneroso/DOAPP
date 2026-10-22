import { Link } from "react-router-dom";
import { Wallet } from "lucide-react";
import Transicion from "../ui/Transicion";

const plata = (n: number) => `$${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

/**
 * Aviso al cliente: aceptó una cotización o contraoferta menor a lo que pagó por la publicación, y la diferencia quedó a su favor (no se devuelve a
 * la tarjeta). Si Mercado Pago todavía no liberó el pago original (`pendienteHasta`), es a favor PENDIENTE: todavía no está en su saldo ni es suyo
 * hasta esa fecha. Sin saldo a favor no se dibuja nada.
 */
export default function AvisoSaldoAFavor({ monto, pendienteHasta, className = "" }: { monto?: number | null; pendienteHasta?: string | null; className?: string }) {
  const valor = Number(monto) > 0 ? Number(monto) : 0;
  const hasta = pendienteHasta ? new Date(pendienteHasta) : null;
  const pendiente = !!hasta && Number.isFinite(hasta.getTime());
  return (
    <Transicion mostrar={valor > 0} className={className}>
      {valor > 0 && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-100">
          <Wallet className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          {pendiente ? (
            <p>
              <strong>Te quedan {plata(valor)} a favor, pendientes de liquidar.</strong> Lo contratado es menos de lo que pagaste por la publicación. Esa diferencia pasa a tu saldo el {hasta!.toLocaleDateString("es-AR")}, cuando Mercado Pago libera el pago original; hasta entonces todavía no es tuya. Después la podés usar en la app o pedir su retiro desde{" "}
              <Link to="/balance" className="font-semibold underline">Balance</Link> (no se retira sola).
            </p>
          ) : (
            <p>
              <strong>Te quedaron {plata(valor)} a favor.</strong> Lo contratado es menos de lo que pagaste por la publicación: la diferencia se acreditó en tu saldo de DOAPP; no sale a tu banco sola. La podés usar en la app o pedir su retiro desde{" "}
              <Link to="/balance" className="font-semibold underline">Balance</Link>.
            </p>
          )}
        </div>
      )}
    </Transicion>
  );
}
