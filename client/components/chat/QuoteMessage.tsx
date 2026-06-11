import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Check, X, ExternalLink, ArrowRight } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const STATUS_LABELS: Record<string, string> = {
  sent: 'Pendiente',
  const { t } = useTranslation();
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  expired: 'Vencida',
  cancelled: 'Cancelada',
  draft: 'Borrador',
};

const STATUS_COLORS: Record<string, string> = {
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  expired: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
  draft: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
};

interface Props {
  message: {
    id?: string;
    _id?: string;
    sender?: { id?: string; _id?: string; name?: string } | null;
    metadata?: {
      quoteId?: string;
      quoteNumber?: string;
      quoteTitle?: string;
      quoteTotal?: number;
      quoteStatus?: string;
      quoteAction?: string;
      jobId?: string;
    };
    createdAt: string;
  };
  onRefresh?: () => void;
  token?: string | null;
}

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function QuoteMessage({ message, onRefresh, token }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const meta = message.metadata || {};
  const [acting, setActing] = useState(false);
  const [localStatus, setLocalStatus] = useState(meta.quoteStatus || 'sent');
  const [contractId, setContractId] = useState<string | null>(null);

  const quoteId = meta.quoteId;
  const hasJobId = !!meta.jobId;
  const isRecipient = (message.sender?.id || message.sender?._id) !== user?.id;

  const handleAccept = async () => {
    if (!quoteId || acting) return;
    setActing(true);
    try {
      const res = await fetch(`${API_URL}/quotes/${quoteId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setLocalStatus('accepted');
        if (data.contractId) {
          setContractId(data.contractId);
        }
        onRefresh?.();
      }
    } catch {}
    setActing(false);
  };

  const handlePay = async () => {
    if (!quoteId || acting) return;
    setActing(true);
    try {
      const res = await fetch(`${API_URL}/quotes/${quoteId}/pay`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        alert(data.message || 'Error al iniciar el pago');
      }
    } catch {
      alert('Error de conexión');
    }
    setActing(false);
  };

  const handleReject = async () => {
    if (!quoteId || acting) return;
    const reason = window.prompt('Motivo del rechazo (opcional):') ?? undefined;
    if (reason === null) return; // user cancelled prompt
    setActing(true);
    try {
      const res = await fetch(`${API_URL}/quotes/${quoteId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (data.success) {
        setLocalStatus('rejected');
        onRefresh?.();
      }
    } catch {}
    setActing(false);
  };

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
                ${Number(meta.quoteTotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS
              </p>
            )}
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {new Date(message.createdAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

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

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
          {quoteId && (
            <Link
              to={`/quotes/${quoteId}`}
              className="flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 hover:underline font-medium"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Ver cotización
            </Link>
          )}

          {isRecipient && localStatus === 'sent' && quoteId && (
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handleReject}
                disabled={acting}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Rechazar
              </button>
              {hasJobId ? (
                <button
                  onClick={handleAccept}
                  disabled={acting}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg"
                >
                  <Check className="h-3.5 w-3.5" />
                  Aceptar y crear contrato
                </button>
              ) : (
                <button
                  onClick={handlePay}
                  disabled={acting}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg"
                >
                  <Check className="h-3.5 w-3.5" />
                  Pagar y aceptar (+8%)
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
    </div>
  );
}
