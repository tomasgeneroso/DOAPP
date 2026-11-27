import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { useEventoEnVivo } from '@/hooks/useSocket';

/**
 * «Antes de ofrecer algo, verificar que no exista; si existe, enlazarlo» (pedido del dueño, 2026-11-27). Avisos para lo que ya está hecho, con el enlace.
 */
const cabeceras = (token: string | null | undefined) => ({ Authorization: `Bearer ${token}` });

/** Mi postulación vigente a este trabajo, si ya me postulé (una retirada o rechazada permite volver a intentar). */
export function useMiPostulacion(trabajoId: string | undefined, token: string | null | undefined): string | null | undefined {
  const [respuesta, setRespuesta] = useState<{ id: string | undefined; postulacion: string | null } | null>(null);
  useEffect(() => {
    if (!trabajoId || !token) return;
    let vigente = true;
    fetch('/api/proposals?type=sent', { credentials: 'include', headers: cabeceras(token) })
      .then((r) => r.json())
      .then((d) => {
        const mia = (d?.proposals || d?.data || []).find((p: any) => String(p?.job?.id || p?.jobId) === String(trabajoId) && !['withdrawn', 'rejected'].includes(p?.status));
        if (vigente) setRespuesta({ id: trabajoId, postulacion: mia ? String(mia.id) : null });
      })
      .catch(() => { if (vigente) setRespuesta({ id: trabajoId, postulacion: null }); });
    return () => { vigente = false; };
  }, [trabajoId, token]);
  return respuesta && respuesta.id === trabajoId ? respuesta.postulacion : undefined;
}

export function YaTePostulaste({ postulacionId }: { postulacionId: string }) {
  return (
    <div className="animate-fadeIn mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-300 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20" data-testid="ya-te-postulaste">
      <span className="inline-flex items-center gap-2 font-medium text-green-900 dark:text-green-200"><CheckCircle className="h-5 w-5" aria-hidden="true" />Ya te postulaste a este trabajo</span>
      <Link to={`/proposals/${postulacionId}`} className="font-semibold text-sky-700 hover:underline dark:text-sky-300">Ver mi postulación →</Link>
    </div>
  );
}

/** Mis consultas a soporte todavía abiertas sobre un contrato. Se puede escribir de nuevo igual (regla del dueño: soporte siempre). */
export function ConsultaAbiertaDelContrato({ contractId, token }: { contractId: string; token: string | null | undefined }) {
  const [abierta, setAbierta] = useState<{ id: string; ticketNumber?: string } | null>(null);
  const cargar = useCallback(async () => {
    if (!contractId || !token) return;
    try {
      const d = await fetch('/api/tickets', { credentials: 'include', headers: cabeceras(token) }).then((r) => r.json());
      const t = (d?.tickets || []).find((x: any) => String(x?.relatedContract) === String(contractId) && !['closed', 'resolved'].includes(x?.status));
      setAbierta(t ? { id: String(t.id), ticketNumber: t.ticketNumber } : null);
    } catch {
      setAbierta(null);
    }
  }, [contractId, token]);
  useEffect(() => { void cargar(); }, [cargar]);
  useEventoEnVivo(['notification:new', 'socket:reconectado'], () => { void cargar(); });
  if (!abierta) return null;
  return (
    <p className="animate-fadeIn basis-full text-sm text-slate-600 dark:text-slate-300" data-testid="consulta-ya-abierta">
      Ya tenés una consulta abierta sobre este contrato{abierta.ticketNumber ? ` (${abierta.ticketNumber})` : ''}.{' '}
      <Link to={`/tickets/${abierta.id}`} className="font-semibold text-sky-700 hover:underline dark:text-sky-300">Verla →</Link>
    </p>
  );
}
