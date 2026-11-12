import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Check, X, ExternalLink, ArrowRight, Handshake } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import ConfirmModal from '../ui/ConfirmModal';

const STATUS_LABELS: Record<string, string> = {
  sent: 'Pendiente',
  pending_payment: 'Pago pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  expired: 'Vencida',
  cancelled: 'Cancelada',
  draft: 'Borrador',
};

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  pending_payment: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  expired: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  draft: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
};

interface Props {
  message: {
    id?: string;
    sender?: { id?: string; name?: string } | null;
    metadata?: {
      quoteId?: string;
      quoteNumber?: string;
      quoteTitle?: string;
      quoteTotal?: number;
      quoteStatus?: string;
      quoteAction?: string;
      jobId?: string;
      /** La propuesta que dejó la cotización aceptada: por ahí se contrata y se paga. */
      proposalId?: string;
      /** El total que propuso quien recibió la cotización (contraoferta). */
      counterOfferAmount?: number | null;
    };
    createdAt: string;
  };
  onRefresh?: () => void;
  token?: string | null;
}

const API_URL = import.meta.env.VITE_API_URL || '/api';
const pesos = (n: unknown) => `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

type Panel = 'rechazar' | 'contraofertar' | null;

export default function QuoteMessage({ message, onRefresh, token }: Props) {
  // Faltaba, y el componente usa `t` en cuatro lugares: cualquiera de los dos
  // errores de pago (o abrir el modal de aviso) tiraba "t is not defined" y
  // rompía el chat entero en vez de mostrar el mensaje.
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const meta = message.metadata || {};
  const [acting, setActing] = useState(false);
  const [localStatus, setLocalStatus] = useState(meta.quoteStatus || 'sent');
  const [contractId, setContractId] = useState<string | null>(null);
  // Aceptar una cotización de un trabajo no crea el contrato: deja la propuesta lista para contratar (y pagar lo que falte).
  const [proposalId, setProposalId] = useState<string | null>(meta.proposalId || null);
  // Replaces native alert()
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmarPago, setConfirmarPago] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [texto, setTexto] = useState('');
  const [monto, setMonto] = useState('');

  const quoteId = meta.quoteId;
  const hasJobId = !!meta.jobId;
  const isRecipient = (message.sender?.id) !== user?.id;
  const contraoferta = Number(meta.counterOfferAmount) > 0 ? Number(meta.counterOfferAmount) : 0;

  // El estado de la tarjeta lo manda el servidor (aceptaron, rechazaron, contraofertaron): si llega un cambio, la tarjeta lo muestra sin recargar.
  useEffect(() => {
    if (meta.quoteStatus) setLocalStatus(meta.quoteStatus);
  }, [meta.quoteStatus]);
  useEffect(() => {
    if (meta.proposalId) setProposalId(meta.proposalId);
  }, [meta.proposalId]);

  const cabeceras = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  /** Contratar y pagar: aprueba la propuesta (si falta plata, el servidor lo dice) y lleva a Mercado Pago por lo que falte. */
  const contratarYPagar = async (pid: string) => {
    const r = await fetch(`${API_URL}/proposals/${pid}/approve`, { method: 'PUT', headers: cabeceras });
    const d = await r.json();
    if (r.status === 402 && d.requierePago) {
      const p = await fetch(`${API_URL}/payments/quote/${pid}`, { method: 'POST', headers: cabeceras });
      const pd = await p.json();
      if (pd.success && pd.paymentUrl) {
        window.location.href = pd.paymentUrl;
        return;
      }
      setNotice(pd.message || t('quote.errorStartingPayment', 'Error al iniciar el pago'));
      return;
    }
    if (d.success) {
      if (d.contractId) navigate(`/contracts/${d.contractId}/summary`);
      else onRefresh?.();
      return;
    }
    setNotice(d.message || t('proposals.errorAccepting', 'No se pudo completar la contratación'));
  };

  /** «Aceptar y pagar»: acepta la cotización (si todavía está pendiente) y sigue con la contratación y el pago. */
  const aceptarYPagar = async () => {
    if (!quoteId || acting) return;
    setConfirmarPago(false);
    setActing(true);
    try {
      let pid = proposalId;
      if (localStatus === 'sent') {
        const res = await fetch(`${API_URL}/quotes/${quoteId}/accept`, { method: 'POST', headers: cabeceras });
        const data = await res.json();
        if (!data.success) {
          setNotice(data.message || t('common.connectionError', 'Error de conexión'));
          return;
        }
        setLocalStatus('accepted');
        pid = data.proposalId || null;
        if (pid) setProposalId(pid);
        onRefresh?.();
      } else if (!pid) {
        const res = await fetch(`${API_URL}/quotes/${quoteId}`, { headers: cabeceras });
        const data = await res.json();
        pid = data?.data?.proposalId || null;
        if (pid) setProposalId(pid);
      }
      if (!pid) {
        setNotice('Aceptaste la cotización, pero no encontramos la propuesta para seguir con el pago. Abrí el trabajo y contratá desde ahí.');
        return;
      }
      await contratarYPagar(pid);
    } catch {
      setNotice(t('common.connectionError', 'Error de conexión'));
    } finally {
      setActing(false);
    }
  };

  const handlePay = async () => {
    if (!quoteId || acting) return;
    setActing(true);
    try {
      const res = await fetch(`${API_URL}/quotes/${quoteId}/pay`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success && data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        setNotice(data.message || t('quote.errorStartingPayment', 'Error al iniciar el pago'));
      }
    } catch {
      setNotice(t('common.connectionError', 'Error de conexión'));
    }
    setActing(false);
  };

  const rechazar = async () => {
    if (!quoteId || acting) return;
    setActing(true);
    try {
      const res = await fetch(`${API_URL}/quotes/${quoteId}/reject`, { method: 'POST', headers: cabeceras, body: JSON.stringify({ reason: texto.trim() || undefined }) });
      const data = await res.json();
      if (data.success) {
        setLocalStatus('rejected');
        setPanel(null);
        setTexto('');
        onRefresh?.();
      } else {
        setNotice(data.message || t('common.connectionError', 'Error de conexión'));
      }
    } catch {
      setNotice(t('common.connectionError', 'Error de conexión'));
    }
    setActing(false);
  };

  const contraofertar = async () => {
    if (!quoteId || acting) return;
    const importe = Number(String(monto).replace(',', '.'));
    if (!Number.isFinite(importe) || importe <= 0) {
      setNotice('Escribí el total que proponés pagar (mayor que $0).');
      return;
    }
    setActing(true);
    try {
      const res = await fetch(`${API_URL}/quotes/${quoteId}/counter`, { method: 'POST', headers: cabeceras, body: JSON.stringify({ amount: importe, note: texto.trim() || undefined }) });
      const data = await res.json();
      if (data.success) {
        setLocalStatus('rejected');
        setPanel(null);
        setTexto('');
        setMonto('');
        onRefresh?.();
      } else {
        setNotice(data.message || t('common.connectionError', 'Error de conexión'));
      }
    } catch {
      setNotice(t('common.connectionError', 'Error de conexión'));
    }
    setActing(false);
  };

  const aceptarContraoferta = async () => {
    if (!quoteId || acting) return;
    setActing(true);
    try {
      const res = await fetch(`${API_URL}/quotes/${quoteId}/accept-counter`, { method: 'POST', headers: cabeceras });
      const data = await res.json();
      if (data.success) {
        setLocalStatus('sent');
        onRefresh?.();
      } else {
        setNotice(data.message || t('common.connectionError', 'Error de conexión'));
      }
    } catch {
      setNotice(t('common.connectionError', 'Error de conexión'));
    }
    setActing(false);
  };

  const puedeResponder = isRecipient && localStatus === 'sent' && !!quoteId;
  const aceptadaPorMi = isRecipient && localStatus === 'accepted' && !!proposalId && !contractId && hasJobId;

  return (
    <div className="flex justify-center my-2">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 w-full max-w-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg shrink-0">
            <FileText className="h-5 w-5 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {meta.quoteNumber || 'COTIZACIÓN'}
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[localStatus] || STATUS_COLORS.sent}`}>
                {STATUS_LABELS[localStatus] || localStatus}
              </span>
            </div>
            <p className="font-semibold text-slate-900 dark:text-white text-sm leading-snug truncate">
              {meta.quoteTitle || 'Cotización'}
            </p>
            {meta.quoteTotal !== undefined && (
              <p className="text-sky-700 dark:text-sky-400 font-bold text-lg mt-1">
                {pesos(meta.quoteTotal)} ARS
              </p>
            )}
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {new Date(message.createdAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        {/* Contraoferta: la ve quien envió la cotización */}
        {!isRecipient && localStatus === 'rejected' && contraoferta > 0 && (
          <div className="mt-3 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg" data-testid="contraoferta-recibida">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-1.5">
              El cliente propone {pesos(contraoferta)} ARS. Podés aceptarlo o editar la cotización y reenviarla.
            </p>
            <button
              onClick={aceptarContraoferta}
              disabled={acting}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 px-3 py-1.5 rounded-lg w-full justify-center"
            >
              <Handshake className="h-3.5 w-3.5" />
              Aceptar contraoferta
            </button>
          </div>
        )}
        {isRecipient && localStatus === 'rejected' && contraoferta > 0 && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">Contraofertaste {pesos(contraoferta)} ARS. Esperando la respuesta.</p>
        )}

        {/* Aceptada: falta contratar y pagar (el servidor ya dejó la propuesta con el precio acordado) */}
        {aceptadaPorMi && (
          <div className="mt-3 p-2.5 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1.5">✓ Cotización aceptada. Falta contratar y pagar.</p>
            <button
              onClick={aceptarYPagar}
              disabled={acting}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-50 px-3 py-1.5 rounded-lg w-full justify-center"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Continuar con el pago
            </button>
          </div>
        )}
        {!isRecipient && localStatus === 'accepted' && hasJobId && (
          <p className="mt-3 text-xs font-semibold text-green-700 dark:text-green-400">✓ Te aceptaron la cotización. Falta que el cliente la pague.</p>
        )}

        {/* Contract auto-created banner */}
        {localStatus === 'accepted' && contractId && (
          <div className="mt-3 p-2.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1.5">
              ✓ Contrato generado automáticamente
            </p>
            <button
              onClick={() => navigate(`/contracts/${contractId}`)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg w-full justify-center"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Ver contrato
            </button>
          </div>
        )}

        {/* Rechazar / contraofertar: un cuadro corto dentro de la tarjeta */}
        {puedeResponder && panel && (
          <div className="mt-3 p-2.5 border border-slate-200 dark:border-slate-600 rounded-lg space-y-2" data-testid="panel-respuesta">
            {panel === 'contraofertar' && (
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Total que proponés pagar (ARS)
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder={String(meta.quoteTotal ?? '')}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white"
                />
              </label>
            )}
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
              {panel === 'rechazar' ? 'Motivo del rechazo (opcional)' : 'Mensaje (opcional)'}
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={2}
                maxLength={1000}
                className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white"
              />
            </label>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setPanel(null); setTexto(''); setMonto(''); }}
                disabled={acting}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={panel === 'rechazar' ? rechazar : contraofertar}
                disabled={acting}
                className={`px-3 py-1.5 text-xs font-semibold text-white rounded-lg disabled:opacity-50 ${panel === 'rechazar' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
              >
                {panel === 'rechazar' ? 'Confirmar rechazo' : 'Enviar contraoferta'}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
          {quoteId && (
            <Link
              to={`/quotes/${quoteId}`}
              className="flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 hover:underline font-medium"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver cotización
            </Link>
          )}

          {puedeResponder && !panel && (
            <div className="flex flex-wrap items-center gap-2 ml-auto" data-testid="acciones-cotizacion">
              <button
                onClick={() => setPanel('rechazar')}
                disabled={acting}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Rechazar
              </button>
              {hasJobId && (
                <button
                  onClick={() => setPanel('contraofertar')}
                  disabled={acting}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50"
                >
                  <Handshake className="h-3.5 w-3.5" />
                  Contraofertar
                </button>
              )}
              {hasJobId ? (
                <button
                  onClick={() => setConfirmarPago(true)}
                  disabled={acting}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg"
                >
                  <Check className="h-3.5 w-3.5" />
                  Aceptar y pagar
                </button>
              ) : (
                <button
                  onClick={handlePay}
                  disabled={acting}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg"
                >
                  <Check className="h-3.5 w-3.5" />
                  Pagar y aceptar
                </button>
              )}
            </div>
          )}
          {isRecipient && localStatus === 'pending_payment' && (
            <div className="ml-auto">
              <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-full">
                Pago pendiente
              </span>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmarPago}
        title="Aceptar y pagar"
        message={`Aceptás la cotización por ${pesos(meta.quoteTotal)} ARS y seguís con la contratación. Si hay que pagar, te llevamos a Mercado Pago.`}
        confirmLabel="Aceptar y pagar"
        onConfirm={aceptarYPagar}
        onClose={() => setConfirmarPago(false)}
      />

      <ConfirmModal
        open={!!notice}
        tone="danger"
        title={t('common.attention', 'Atención')}
        message={notice || ''}
        confirmLabel={t('common.accept', 'Aceptar')}
        hideCancel
        onConfirm={() => setNotice(null)}
        onClose={() => setNotice(null)}
      />
    </div>
  );
}
