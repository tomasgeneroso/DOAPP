import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import ContractDetail from './ContractDetail';

/**
 * Una sola vista para el contrato y el trabajo (pedido del dueño, 2026-11-22): quien es parte del contrato (quien contrató o el trabajador) entra por `/contracts/:id` y va a la vista del
 * trabajo, que trae todo el contrato adentro («Seguimiento del contrato»). El equipo de DOAPP y cualquiera que no sea parte siguen viendo la pantalla completa del contrato.
 */
export default function ContratoEnElTrabajo() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [destino, setDestino] = useState<string | null>(null);
  const [esAjeno, setEsAjeno] = useState(false);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const r: any = await api.get(`/contracts/${id}`);
        const c = r?.contract || r;
        const yo = String((user as any)?.id ?? '');
        const esParte = !!yo && [c?.clientId, c?.doerId, c?.client?.id, c?.doer?.id].some((x) => x && String(x) === yo);
        const jobId = c?.job?.id || c?.jobId?.id || (typeof c?.jobId === 'string' ? c.jobId : null);
        if (!vigente) return;
        if (esParte && jobId) setDestino(`/jobs/${jobId}?contrato=${encodeURIComponent(String(id))}`);
        else setEsAjeno(true);
      } catch {
        if (vigente) setEsAjeno(true);
      }
    })();
    return () => { vigente = false; };
  }, [id, user]);

  if (destino) return <Navigate to={destino} replace />;
  if (esAjeno) return <ContractDetail />;
  return (
    <div className="flex min-h-[50vh] items-center justify-center" data-testid="yendo-al-trabajo">
      <Loader2 className="h-10 w-10 animate-spin text-sky-500" aria-label="Cargando" />
    </div>
  );
}
