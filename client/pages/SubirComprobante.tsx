import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AlertCircle, CheckCircle, Loader2, MessageSquareWarning, Upload } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { validarDatosDeTransferencia } from '../../shared/pagos/transferencia';

/**
 * «Subir el comprobante de un pago» (reporte del dueño, 2026-11-19): quien pagó por transferencia o por Binance puede subir —o volver a subir— su comprobante cuando quiera, desde
 * «Mis trabajos», desde el aviso del equipo («Soporte te escribió sobre tu comprobante») o desde la notificación. Si el equipo dejó una nota, se muestra arriba. Los datos que se piden
 * son los mismos que en la pantalla de pago y el servidor los vuelve a validar.
 */
interface Resumen {
  id: string;
  paymentType: string;
  method: string;
  status: string;
  amount: number;
  jobId: string | null;
  jobTitle: string | null;
  proofSubmitted: boolean;
  proofStatus: string | null;
  ultimaNotaDelEquipo: string | null;
  puedeSubir: boolean;
}

const campo = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white';
const ars = (n: number) => '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SubirComprobante() {
  const { paymentId } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [listo, setListo] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [f, setF] = useState({ numero: '', nombre: '', documento: '', banco: '', fecha: '', binanceTransactionId: '', binanceSenderUserId: '' });

  useEffect(() => {
    let vivo = true;
    fetch(`/api/payments/${paymentId}/resumen`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        if (d.success) setResumen(d.data);
        else setError(d.message || 'No encontramos ese pago.');
      })
      .catch(() => vivo && setError('No pudimos cargar el pago. Probá de nuevo.'))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [paymentId, token]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resumen || !archivo) {
      setError('Elegí el archivo del comprobante (imagen o PDF).');
      return;
    }
    setError(null);
    if (resumen.method === 'bank_transfer') {
      const v = validarDatosDeTransferencia({ numero: f.numero, nombre: f.nombre, documento: f.documento, banco: f.banco, fecha: f.fecha }, { exigirArchivo: false });
      if (!v.ok) {
        setError(Object.values(v.errores).join(' '));
        return;
      }
    } else if (!f.binanceTransactionId.trim() || !f.binanceSenderUserId.trim()) {
      setError('Completá el ID de la transacción y tu ID de Binance.');
      return;
    }
    setEnviando(true);
    try {
      const cuerpo = new FormData();
      cuerpo.append('proof', archivo);
      if (resumen.method === 'bank_transfer') {
        cuerpo.append('bankReference', f.numero);
        cuerpo.append('senderName', f.nombre);
        cuerpo.append('senderDocument', f.documento);
        cuerpo.append('senderBankName', f.banco);
        cuerpo.append('transferDate', f.fecha);
        cuerpo.append('transferAmount', String(resumen.amount));
        cuerpo.append('isOwnBankAccount', 'true');
      } else {
        cuerpo.append('binanceTransactionId', f.binanceTransactionId);
        cuerpo.append('binanceSenderUserId', f.binanceSenderUserId);
      }
      const r = await fetch(`/api/payments/${resumen.id}/upload-proof`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: cuerpo });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success) {
        setError(d.message || 'No se pudo subir el comprobante.');
        return;
      }
      setListo(true);
    } catch {
      setError('No pudimos conectar con DOAPP. Probá de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  const cambiar = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Helmet><title>Subir comprobante - DOAPP</title></Helmet>
      <h1 className="mb-1 text-2xl font-bold text-slate-900 dark:text-white">Subir comprobante de pago</h1>

      {cargando && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-sky-500" aria-label="Cargando" /></div>}

      {!cargando && !resumen && (
        <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </div>
      )}

      {resumen && listo && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200" data-testid="comprobante-subido">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle className="h-5 w-5" aria-hidden="true" /> Comprobante subido</p>
          <p className="mt-1 text-sm">Un administrador lo va a revisar y te avisamos cuando esté aprobado.</p>
          <button type="button" onClick={() => navigate(resumen.jobId ? '/my-jobs' : '/payments')} className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Listo</button>
        </div>
      )}

      {resumen && !listo && (
        <>
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
            {resumen.jobTitle ? <>Publicación «{resumen.jobTitle}» · </> : null}
            {resumen.method === 'binance' ? 'Binance' : 'Transferencia'} · {ars(resumen.amount)}
          </p>

          {resumen.ultimaNotaDelEquipo && (
            <div role="note" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200" data-testid="nota-del-equipo">
              <MessageSquareWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div><p className="font-semibold">Mensaje del equipo de DOAPP</p><p className="mt-0.5">{resumen.ultimaNotaDelEquipo}</p></div>
            </div>
          )}

          {!resumen.puedeSubir ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Este pago está en «{resumen.status}» y por ahora no admite un comprobante nuevo. {resumen.proofSubmitted ? 'Ya subiste uno: el equipo lo está revisando.' : ''} <Link to="/payments" className="font-semibold text-sky-600 underline">Ver mis pagos</Link>
            </p>
          ) : (
            <form onSubmit={enviar} className="space-y-4" noValidate>
              {resumen.proofSubmitted && <p className="text-sm text-slate-600 dark:text-slate-400">Ya subiste un comprobante. Si subís otro, reemplaza al anterior.</p>}
              <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Archivo del comprobante (imagen o PDF) *</span>
                <input type="file" accept="image/png,image/jpeg,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className={campo} required />
              </label>
              {resumen.method === 'bank_transfer' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm sm:col-span-2"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Número de operación *</span><input className={campo} value={f.numero} onChange={cambiar('numero')} maxLength={60} autoComplete="off" /></label>
                  <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Nombre de quien transfirió *</span><input className={campo} value={f.nombre} onChange={cambiar('nombre')} maxLength={160} autoComplete="off" /></label>
                  <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">DNI o CUIL/CUIT *</span><input className={campo} value={f.documento} onChange={cambiar('documento')} inputMode="numeric" maxLength={14} autoComplete="off" /></label>
                  <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Banco o billetera *</span><input className={campo} value={f.banco} onChange={cambiar('banco')} maxLength={80} autoComplete="off" /></label>
                  <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Fecha de la transferencia *</span><input type="date" className={campo} value={f.fecha} max={new Date().toISOString().slice(0, 10)} onChange={cambiar('fecha')} /></label>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">ID de la transacción *</span><input className={campo} value={f.binanceTransactionId} onChange={cambiar('binanceTransactionId')} maxLength={80} autoComplete="off" /></label>
                  <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Tu ID de Binance *</span><input className={campo} value={f.binanceSenderUserId} onChange={cambiar('binanceSenderUserId')} maxLength={40} autoComplete="off" /></label>
                </div>
              )}
              {error && <p role="alert" className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{error}</p>}
              <button type="submit" disabled={enviando} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                Subir comprobante
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
