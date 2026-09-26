import { ShieldOff } from "lucide-react";
import { avisoSinProteccion, type Momento, type Rol } from "../../../shared/pagos/modoDePago";

/**
 * El aviso de que este trabajo no tiene protección de pago.
 *
 * Aparece tres veces a lo largo del recorrido —al ver la publicación, al
 * postularse y al contratar— y las tres veces dice lo mismo con distinto nivel
 * de detalle. Está en un componente y el texto está en `shared/pagos` por la
 * misma razón: es la misma promesa dicha tres veces, y si se escribe tres
 * veces, en algún momento dice tres cosas distintas.
 *
 * El `rol` importa. El cliente y el trabajador no corren el mismo riesgo ni
 * tienen la misma responsabilidad: al cliente hay que decirle que él es el
 * responsable de pagar, al trabajador qué le pasa si el cliente no lo hace. Un
 * texto neutro termina siendo vago para los dos. Cuando no se sabe quién mira
 * —una publicación abierta, por ejemplo— va el neutro.
 *
 * Sobre el tono. No es un cartel de peligro: quien publica así suele tener un
 * motivo razonable, hay rubros donde nadie paga por adelantado. Lo que no
 * puede pasar es que el trabajador se entere después de haber trabajado. Por
 * eso es ámbar y no rojo, y por eso describe qué pasa en vez de desaconsejar.
 */

export default function AvisoSinProteccion({
  momento,
  rol,
  className = "",
  compacto = false,
}: {
  momento: Momento;
  /** Quién está mirando. Sin esto va el texto neutro. */
  rol?: Rol | null;
  className?: string;
  /** Una línea, para listados donde no hay lugar para el párrafo entero. */
  compacto?: boolean;
}) {
  const aviso = avisoSinProteccion(momento, rol);

  if (compacto) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/25 dark:text-amber-300 ${className}`}
        title={aviso.cuerpo}
      >
        <ShieldOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Se paga al terminar
      </span>
    );
  }

  return (
    <div
      className={`flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/60 dark:bg-amber-900/20 ${className}`}
      role="note"
    >
      <ShieldOff
        className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="font-semibold text-amber-900 dark:text-amber-200">{aviso.titulo}</p>
        <p className="mt-1 text-sm leading-relaxed text-amber-800 dark:text-amber-300/90">
          {aviso.cuerpo}
        </p>
      </div>
    </div>
  );
}
