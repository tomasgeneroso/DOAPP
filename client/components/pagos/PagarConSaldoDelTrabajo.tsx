import { useEffect, useState } from "react";
import PagarConSaldo from "./PagarConSaldo";

/**
 * «Reprogramar con el saldo de esta publicación» directo desde el detalle del trabajo (sin pasar por la pantalla de pago). Calcula el total con
 * la misma cuenta del servidor (precio + comisión + IVA de la comisión) y, si el saldo vinculado a ESTA publicación lo cubre, ofrece pagarlo.
 */
export default function PagarConSaldoDelTrabajo({
  token,
  jobId,
  precio,
  alPagar,
}: {
  token: string | null;
  jobId: string;
  precio: number;
  /** Se llama con el mensaje de éxito cuando el pago salió bien (para refrescar el trabajo). */
  alPagar: (mensaje: string, estado: string | undefined) => void;
}) {
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !(precio > 0)) return;
    let cancelado = false;
    fetch(`/api/payments/quote?price=${precio}&jobId=${jobId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (cancelado || !d?.success) return;
        setTotal(Math.round((Number(d.data.price) + Number(d.data.commission) + Number(d.data.vat)) * 100) / 100);
      })
      .catch(() => {
        /* sin total no se ofrece */
      });
    return () => {
      cancelado = true;
    };
  }, [token, jobId, precio]);

  const pagar = async (confirmaRetiroPendiente: boolean) => {
    setError(null);
    try {
      const r = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        credentials: "include",
        body: JSON.stringify({ jobId, paymentType: "job_publication", paymentMethod: "balance", confirmaRetiroPendiente }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.message || "No se pudo pagar con tu saldo.");
      alPagar(d.message || "Publicación pagada con tu saldo.", d.jobStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo pagar con tu saldo.");
    }
  };

  if (total === null) return null;
  return (
    <>
      <PagarConSaldo token={token} jobId={jobId} total={total} onPagar={pagar} />
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </>
  );
}
