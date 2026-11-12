import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Handshake } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useEventoEnVivo } from '../../hooks/useSocket';

/**
 * «Un trabajo con cotización» (pedido del dueño, 2026-11-12): en la pantalla del trabajo se ven las cotizaciones ligadas a él (el cliente, todas; cada trabajador, las suyas)
 * y, si hay una aceptada, el precio acordado. Desde la cotización se llega al trabajo y desde el trabajo, a la cotización. El presupuesto publicado no se reescribe:
 * el precio acordado es el que va a tener el contrato.
 */
interface Fila {
  id: string;
  quoteNumber: string;
  title: string;
  total: number;
  status: string;
  counterOfferAmount?: number | null;
  sender?: { name?: string; username?: string };
}

const ETIQUETAS: Record<string, string> = {
  sent: 'Pendiente',
  pending_payment: 'Pago pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  expired: 'Vencida',
  cancelled: 'Cancelada',
};
const COLORES: Record<string, string> = {
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  pending_payment: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};
const pesos = (n: unknown) => `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

export default function CotizacionesDelTrabajo({ jobId }: { jobId: string }) {
  const { token, user } = useAuth();
  const [filas, setFilas] = useState<Fila[]>([]);
  const [precioAcordado, setPrecioAcordado] = useState<number | null>(null);
  const [precioPublicado, setPrecioPublicado] = useState<number | null>(null);
  const [esElCliente, setEsElCliente] = useState(false);

  const cargar = async () => {
    if (!jobId || !token) return;
    try {
      const r = await fetch(`/api/quotes/by-job/${jobId}`, { headers: { Authorization: `Bearer ${token}` }, credentials: 'include' });
      const d = await r.json();
      if (d.success) {
        setFilas(d.data || []);
        setPrecioAcordado(d.precioAcordado ?? null);
        setPrecioPublicado(d.precioPublicado ?? null);
        setEsElCliente(!!d.esElCliente);
      }
    } catch {
      /* sin respuesta: el bloque no se muestra */
    }
  };

  useEffect(() => {
    cargar();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, token, user?.id]);
  // Una cotización que cambia de estado (aceptada, rechazada, contraoferta) llega en vivo.
  useEventoEnVivo(['proposal:updated', 'job:updated', 'socket:reconectado'], cargar);

  if (filas.length === 0) return null;

  return (
    <section className="mt-4 rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-900/10 p-4" data-testid="cotizaciones-del-trabajo">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-sky-800 dark:text-sky-300">
        <FileText className="h-4 w-4" aria-hidden="true" />
        {esElCliente ? 'Cotizaciones de este trabajo' : 'Tu cotización para este trabajo'}
      </h2>

      {precioAcordado !== null && (
        <p className="mt-2 flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100" data-testid="precio-acordado">
          <Handshake className="h-4 w-4 text-green-600" aria-hidden="true" />
          Precio acordado por cotización: <strong>{pesos(precioAcordado)} ARS</strong>
          {precioPublicado !== null && Number(precioPublicado) !== Number(precioAcordado) && (
            <span className="text-xs text-slate-500 dark:text-slate-400">(publicado: {pesos(precioPublicado)})</span>
          )}
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {filas.map((q) => (
          <li key={q.id}>
            <Link
              to={`/quotes/${q.id}`}
              className="flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 hover:border-sky-400"
            >
              <span className="min-w-0">
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {q.quoteNumber}
                  {esElCliente && q.sender?.name ? ` · ${q.sender.name}` : ''}
                </span>
                <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{q.title}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm font-bold text-sky-700 dark:text-sky-400">{pesos(q.total)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${COLORES[q.status] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                  {ETIQUETAS[q.status] || q.status}
                  {q.status === 'rejected' && Number(q.counterOfferAmount) > 0 ? ' · contraoferta' : ''}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
