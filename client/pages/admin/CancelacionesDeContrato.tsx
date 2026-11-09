import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useCambiosDeAdministracion } from '../../hooks/useSocket';
import IdBadge from '../../components/admin/IdBadge';
import Transicion from '../../components/ui/Transicion';

/**
 * Pedidos de cancelación de contrato.
 *
 * Aceptar una cancelación entre las partes NO cancela el contrato: abre un pedido oficial que resuelve un administrador, que es quien decide el dinero (T&C 9.2 y 9.3).
 * La API para resolverlos existía (`/api/admin/contracts/cancellation-requests`) pero ninguna pantalla la llamaba: los pedidos quedaban sin atender. Acá se ven, se
 * toman, se anotan y se aprueban o rechazan, con el motivo escrito. Al aprobar se aplica la regla de los términos (comisión retenida y, si cancelaron tarde, la parte del
 * trabajador); un apartamiento de la regla se hace desde la API, con justificación.
 *
 * Aprobar o rechazar exige el permiso `contracts:update` (super_admin y dueño): el servidor lo decide, la pantalla solo lo refleja con el mensaje que devuelva.
 */

interface Persona { id: string; name: string; email?: string }
interface Pedido {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  priority?: string;
  reason: string;
  requestType?: string;
  category?: string | null;
  createdAt: string;
  resolutionNote?: string | null;
  resolution?: string | null;
  refundAmount?: number | null;
  contract?: { id: string; status?: string; price?: number; job?: { id: string; title: string } | null } | null;
  requester?: Persona | null;
  otherParty?: Persona | null;
  assignedAdmin?: Persona | null;
  adminNotes?: Array<{ note: string; createdAt?: string; addedBy?: string }>;
}

const ESTADOS: Array<{ clave: string; rotulo: string }> = [
  { clave: 'pending', rotulo: 'Por resolver' },
  { clave: 'approved', rotulo: 'Aprobados' },
  { clave: 'rejected', rotulo: 'Rechazados' },
];
const ROTULO_DE_ESTADO: Record<string, string> = { pending: 'Por resolver', approved: 'Aprobado', rejected: 'Rechazado' };
const COLOR_DE_ESTADO: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  rejected: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};
const MINIMO_DEL_MOTIVO = 15;

export default function CancelacionesDeContrato() {
  const { token, user } = useAuth();
  const [estado, setEstado] = useState('pending');
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<Pedido | null>(null);
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const cabecera = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/contracts/cancellation-requests?status=${estado}&limit=50`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'No se pudieron cargar los pedidos');
      setPedidos(data.data || []);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'No se pudieron cargar los pedidos');
    } finally {
      setCargando(false);
    }
  }, [estado, token]);

  useEffect(() => {
    setCargando(true);
    void cargar();
  }, [cargar]);
  useCambiosDeAdministracion(['contract', 'payment'], () => void cargar());

  const abrir = async (p: Pedido) => {
    setAbierto(p);
    setNota('');
    setAviso(null);
    try {
      const res = await fetch(`/api/admin/contracts/cancellation-requests/${p.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setAbierto(data.data);
    } catch {
      /* se queda con lo de la lista */
    }
  };

  const accion = async (ruta: string, cuerpo: Record<string, unknown>, exito: string) => {
    if (!abierto) return;
    setEnviando(true);
    setAviso(null);
    try {
      const res = await fetch(`/api/admin/contracts/cancellation-requests/${abierto.id}/${ruta}`, { method: 'POST', headers: cabecera, body: JSON.stringify(cuerpo) });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'No se pudo completar la acción');
      setAviso(exito);
      setNota('');
      await cargar();
      const otra = await fetch(`/api/admin/contracts/cancellation-requests/${abierto.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const d2 = await otra.json();
      if (d2.success) setAbierto(d2.data);
    } catch (e: any) {
      setAviso(`⚠ ${e?.message || 'No se pudo completar la acción'}`);
    } finally {
      setEnviando(false);
    }
  };

  const motivoValido = nota.trim().length >= MINIMO_DEL_MOTIVO;

  return (
    <div className="space-y-4">
      <Helmet><title>Pedidos de cancelación · Administración</title></Helmet>
      <div>
        <Link to="/admin/contracts" className="inline-flex items-center gap-1 text-sm text-sky-600 hover:underline dark:text-sky-400"><ArrowLeft className="h-4 w-4" /> Contratos</Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">Pedidos de cancelación de contrato</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Cuando las dos partes aceptan cancelar, el contrato no se cancela solo: lo resuelve una persona del equipo, que decide el dinero (términos 9.2 y 9.3). Al aprobar se aplica la regla de los términos; al rechazar, el contrato sigue.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
        {ESTADOS.map((e) => (
          <button key={e.clave} type="button" onClick={() => setEstado(e.clave)} aria-pressed={estado === e.clave}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${estado === e.clave ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700'}`}>
            {e.rotulo}
          </button>
        ))}
      </div>

      <Transicion mostrar={!!error}>
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</div>
      </Transicion>

      <div className="overflow-x-auto rounded-lg bg-white shadow dark:bg-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-700/50 dark:text-slate-400">
            <tr>
              <th scope="col" className="px-4 py-3">Contrato</th>
              <th scope="col" className="px-4 py-3">Lo pidió</th>
              <th scope="col" className="px-4 py-3">Motivo</th>
              <th scope="col" className="px-4 py-3">Estado</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Abrir</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {cargando && pedidos.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-500" aria-label="Cargando" /></td></tr>
            ) : pedidos.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500 dark:text-slate-400">{estado === 'pending' ? 'No hay pedidos de cancelación por resolver.' : 'No hay pedidos en este estado.'}</td></tr>
            ) : (
              pedidos.map((p) => (
                <tr key={p.id} className="align-top hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 dark:text-white">{p.contract?.job?.title || 'Contrato'}</div>
                    <IdBadge id={p.contract?.id} />
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    <div>{p.requester?.name || '—'}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">con {p.otherParty?.name || '—'} · {new Date(p.createdAt).toLocaleDateString('es-AR')}</div>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-slate-700 dark:text-slate-300"><span className="line-clamp-3">{p.reason}</span></td>
                  <td className="px-4 py-3"><span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${COLOR_DE_ESTADO[p.status] ?? ''}`}>{ROTULO_DE_ESTADO[p.status] ?? p.status}</span></td>
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => void abrir(p)} className="rounded-lg border border-sky-300 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-300 dark:hover:bg-sky-900/20">
                      {p.status === 'pending' ? 'Resolver' : 'Ver'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !enviando && setAbierto(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="titulo-cancelacion" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-700">
              <h2 id="titulo-cancelacion" className="text-lg font-semibold text-slate-900 dark:text-white">Pedido de cancelación</h2>
              <button type="button" onClick={() => setAbierto(null)} disabled={enviando} aria-label="Cerrar" className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 p-4 text-sm text-slate-700 dark:text-slate-300">
              <p><strong>{abierto.contract?.job?.title || 'Contrato'}</strong> · <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_DE_ESTADO[abierto.status] ?? ''}`}>{ROTULO_DE_ESTADO[abierto.status] ?? abierto.status}</span></p>
              <p>Lo pidió <strong>{abierto.requester?.name || '—'}</strong>, con <strong>{abierto.otherParty?.name || '—'}</strong>.{abierto.assignedAdmin ? ` Lo atiende ${abierto.assignedAdmin.name}.` : ' Nadie lo tomó todavía.'}</p>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/40"><p className="mb-1 font-semibold">Motivo</p><p className="whitespace-pre-wrap">{abierto.reason}</p></div>
              <div className="flex flex-wrap gap-3 text-xs">
                {abierto.contract?.id && <Link to={`/contracts/${abierto.contract.id}`} className="text-sky-600 hover:underline dark:text-sky-400">Ver el contrato</Link>}
                {abierto.contract?.id && <Link to={`/admin/jobs?q=${abierto.contract.id}`} className="text-sky-600 hover:underline dark:text-sky-400">Ver la publicación, el contrato y el pago</Link>}
              </div>
              {abierto.status !== 'pending' && abierto.resolutionNote && (
                <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-700/40"><p className="mb-1 font-semibold">Cómo se resolvió</p><p className="whitespace-pre-wrap">{abierto.resolutionNote}</p></div>
              )}
              {(abierto.adminNotes || []).length > 0 && (
                <div><p className="mb-1 font-semibold">Notas del equipo</p>
                  <ul className="list-disc space-y-1 pl-5">{(abierto.adminNotes || []).map((n, i) => <li key={i}>{n.note}</li>)}</ul>
                </div>
              )}

              {abierto.status === 'pending' && (
                <>
                  <label className="block">
                    <span className="mb-1 block font-medium">Motivo o nota (al menos {MINIMO_DEL_MOTIVO} caracteres para aprobar o rechazar)</span>
                    <textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} placeholder="Qué comprobaste y por qué decidís así. Queda anotado y lo ven las partes."
                      className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900 focus:ring-2 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white" />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {!abierto.assignedAdmin && user?.id && (
                      <button type="button" disabled={enviando} onClick={() => void accion('assign', { adminId: user.id }, 'Lo tomaste.')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-700">Tomarlo</button>
                    )}
                    <button type="button" disabled={enviando || nota.trim().length === 0} onClick={() => void accion('add-note', { note: nota.trim() }, 'Nota agregada.')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-700">Agregar nota</button>
                    <button type="button" disabled={enviando || !motivoValido} onClick={() => void accion('approve', { resolutionNote: nota.trim() }, 'Aprobado: se aplicó la regla de los términos.')} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Aprobar (aplica la regla de los términos)</button>
                    <button type="button" disabled={enviando || !motivoValido} onClick={() => void accion('reject', { resolutionNote: nota.trim() }, 'Rechazado: el contrato sigue.')} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">Rechazar</button>
                  </div>
                </>
              )}
              <Transicion mostrar={!!aviso}>
                <p role="status" className={`rounded-md p-2 ${aviso?.startsWith('⚠') ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'}`}>{aviso}</p>
              </Transicion>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
