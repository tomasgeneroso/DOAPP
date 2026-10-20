import { useEffect, useState } from "react";
import { useAuth } from "./useAuth";

export interface CuentaParaTransferir {
  cbu?: string;
  alias?: string;
  accountHolder?: string;
  cuit?: string;
  bank?: string;
}

export interface EstadoDeLaCuenta {
  cargado: boolean;
  /** true / false según el servidor; null si todavía no se sabe (cargando) o no se pudo preguntar. */
  disponible: boolean | null;
  cuenta: CuentaParaTransferir | null;
}

/**
 * La cuenta a la que se transfiere, tal como la tiene configurada el servidor (BANK_CBU, BANK_ALIAS…). La pantalla nunca lleva datos
 * bancarios escritos a mano: antes mostraba un CBU de ejemplo. Si el servidor dice que no hay cuenta, la transferencia no se ofrece.
 */
export function useDatosBancarios(): EstadoDeLaCuenta {
  const { token } = useAuth() as { token?: string | null };
  const [estado, setEstado] = useState<EstadoDeLaCuenta>({ cargado: false, disponible: null, cuenta: null });

  useEffect(() => {
    let vivo = true;
    fetch("/api/payments/bank-details", { headers: token ? { Authorization: `Bearer ${token}` } : undefined, credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (vivo) setEstado({ cargado: true, disponible: d?.success ? !!d.disponible : null, cuenta: d?.bankDetails ?? null });
      })
      .catch(() => {
        if (vivo) setEstado({ cargado: true, disponible: null, cuenta: null });
      });
    return () => {
      vivo = false;
    };
  }, [token]);

  return estado;
}
