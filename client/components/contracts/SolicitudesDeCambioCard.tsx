import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, FileEdit } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const API_URL = import.meta.env.VITE_API_URL || "/api";

/** Estados del contrato en los que se puede pedir un cambio (los mismos que acepta el servidor). */
export const ESTADOS_CON_CAMBIOS = ["pending", "ready", "accepted", "in_progress"];

interface Solicitud {
  id: string;
  type: "cancel" | "modify";
  status: string;
  reason: string;
  requestedById?: string | null;
  requestedBy?: { id: string; name: string } | null;
}

/**
 * En el contrato: la solicitud de cambio pendiente (para que la otra parte la vea y responda sin depender del correo) y
 * el acceso para pedir un cambio o la cancelación. Solo para las dos partes, y solo mientras el contrato admite cambios.
 */
export default function SolicitudesDeCambioCard({ contractId, status, esParte }: { contractId: string; status: string; esParte: boolean }) {
  const { token, user } = useAuth();
  const [pendiente, setPendiente] = useState<Solicitud | null | undefined>(undefined);

  useEffect(() => {
    if (!esParte || !token) return;
    let vigente = true;
    fetch(`${API_URL}/contract-change-requests/contract/${contractId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (!vigente) return;
        const lista: Solicitud[] = d?.success === true && Array.isArray(d.changeRequests) ? d.changeRequests : [];
        setPendiente(lista.find((s) => s.status === "pending") ?? null);
      })
      .catch(() => vigente && setPendiente(null));
    return () => {
      vigente = false;
    };
  }, [contractId, esParte, token]);

  if (!esParte || !ESTADOS_CON_CAMBIOS.includes(status)) return null;

  const pidioYo = !!pendiente && String(pendiente.requestedBy?.id ?? pendiente.requestedById ?? "") === String(user?.id ?? "");

  return (
    <div className="mb-6 space-y-3">
      {!!pendiente && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900 dark:text-amber-100">
              {pidioYo
                ? `Pediste ${pendiente.type === "cancel" ? "cancelar el contrato" : "un cambio en el contrato"}: esperando la respuesta de la otra parte`
                : `${pendiente.requestedBy?.name || "La otra parte"} pidió ${pendiente.type === "cancel" ? "cancelar el contrato" : "un cambio en el contrato"}`}
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">{pendiente.reason}</p>
            <Link
              to={`/contracts/${contractId}/change-requests/${pendiente.id}`}
              className="inline-block mt-2 text-sm font-semibold text-amber-900 dark:text-amber-100 underline"
            >
              {pidioYo ? "Ver la solicitud" : "Ver y responder"}
            </Link>
          </div>
        </div>
      )}

      {pendiente === null && (
        <Link
          to={`/contracts/${contractId}/request-changes`}
          className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
        >
          <FileEdit className="h-5 w-5" />
          Pedir un cambio o cancelar el contrato
        </Link>
      )}
    </div>
  );
}
