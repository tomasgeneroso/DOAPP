import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../hooks/useAuth';
import { FileText, Download, Check, X, Edit, ArrowLeft, Clock, Briefcase } from 'lucide-react';
import type { Quote } from '../types/index';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  expired: 'Vencida',
  cancelled: 'Cancelada',
};
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  accepted: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  expired: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

export default function QuoteDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth();

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [rejecting, setRejecting] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const loadQuote = async () => {
    try {
      const res = await fetch(`${API_URL}/quotes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setQuote(data.data);
    } catch (e) {
      console.error('Error loading quote:', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (id) loadQuote();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleAccept = async () => {
    if (!id) return;
    setAccepting(true);
    try {
      const res = await fetch(`${API_URL}/quotes/${id}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setQuote(prev => prev ? { ...prev, status: 'accepted' } : prev);
    } catch (_) { /* silenced */ }
    setAccepting(false);
  };

  const handleReject = async () => {
    if (!id) return;
    setRejecting(true);
    try {
      const res = await fetch(`${API_URL}/quotes/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const data = await res.json();
      if (data.success) {
        setQuote(prev => prev ? { ...prev, status: 'rejected', rejectionReason: rejectReason } : prev);
        setShowRejectModal(false);
      }
    } catch (_) { /* silenced */ }
    setRejecting(false);
  };

  const handleDownloadPdf = async () => {
    if (!id) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch(`${API_URL}/quotes/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${quote?.quoteNumber || 'cotizacion'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (_) { /* silenced */ }
    setDownloadingPdf(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="text-center py-16 text-slate-500 dark:text-slate-400">
        Cotización no encontrada
      </div>
    );
  }

  const isRecipient = (quote.recipientId === user?.id || quote.recipient?.id === user?.id);
  const isSender = (quote.senderId === user?.id || quote.sender?.id === user?.id);

  return (
    <>
      <Helmet>
        <title>{quote.quoteNumber} - Cotización - DOAPP</title>
      </Helmet>

      <div className="container mx-auto max-w-4xl px-4 py-8">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white mb-6 text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </button>

        {/* Header */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-sky-100 dark:bg-sky-900/30 rounded-xl">
                <FileText className="h-6 w-6 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{quote.title}</h1>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[quote.status]}`}>
                    {t(`quoteStatus.${quote.status}`, STATUS_LABELS[quote.status])}
                  </span>
                </div>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                  {quote.quoteNumber} · {new Date(quote.createdAt).toLocaleDateString('es-AR')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-medium"
              >
                <Download className="h-4 w-4" />
                {downloadingPdf ? 'Generando...' : 'Descargar PDF'}
              </button>

              {isSender && quote.status === 'rejected' && (
                <Link
                  to={`/quotes/${quote.id}/edit`}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm font-medium"
                >
                  <Edit className="h-4 w-4" />
                  Revisar y reenviar
                </Link>
              )}

              {isRecipient && quote.status === 'sent' && (
                <>
                  <button
                    onClick={() => setShowRejectModal(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium"
                  >
                    <X className="h-4 w-4" />
                    Rechazar
                  </button>
                  <button
                    onClick={handleAccept}
                    disabled={accepting}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
                  >
                    <Check className="h-4 w-4" />
                    {accepting ? 'Aceptando...' : 'Aceptar cotización'}
                  </button>
                </>
              )}
            </div>
          </div>

          {quote.rejectionReason && quote.status === 'rejected' && (
            <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">Motivo de rechazo:</p>
              <p className="text-sm text-red-600 dark:text-red-300 mt-1">{quote.rejectionReason}</p>
            </div>
          )}

          {quote.revisionCount > 0 && (
            <div className="mt-3 flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs">
              <Clock className="h-3.5 w-3.5" />
              Revisión #{quote.revisionCount}
            </div>
          )}
        </div>

        {/* Sender / Recipient */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2">Remitente</p>
            <p className="font-semibold text-slate-900 dark:text-white">{quote.senderInfo?.name || quote.sender?.name}</p>
            {quote.senderInfo?.address && <p className="text-sm text-slate-500 dark:text-slate-400">{quote.senderInfo.address}</p>}
            {quote.senderInfo?.city && <p className="text-sm text-slate-500 dark:text-slate-400">{quote.senderInfo.city}</p>}
            {quote.senderInfo?.cuit && <p className="text-xs text-slate-400 mt-1">CUIT: {quote.senderInfo.cuit}</p>}
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2">Destinatario</p>
            <p className="font-semibold text-slate-900 dark:text-white">{quote.recipientInfo?.name || quote.recipient?.name}</p>
            {quote.recipientInfo?.address && <p className="text-sm text-slate-500 dark:text-slate-400">{quote.recipientInfo.address}</p>}
            {quote.recipientInfo?.city && <p className="text-sm text-slate-500 dark:text-slate-400">{quote.recipientInfo.city}</p>}
            {quote.recipientInfo?.cuit && <p className="text-xs text-slate-400 mt-1">CUIT: {quote.recipientInfo.cuit}</p>}
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-2">Detalles</p>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Nº cotización</span>
                <span className="font-medium text-slate-900 dark:text-white">{quote.quoteNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Fecha</span>
                <span className="font-medium text-slate-900 dark:text-white">{new Date(quote.createdAt).toLocaleDateString('es-AR')}</span>
              </div>
              {quote.validUntil && (
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Válida hasta</span>
                  <span className="font-medium text-slate-900 dark:text-white">{new Date(quote.validUntil).toLocaleDateString('es-AR')}</span>
                </div>
              )}
              {quote.job && (
                <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" /> Trabajo</span>
                  <Link to={`/jobs/${quote.jobId}`} className="text-sky-600 dark:text-sky-400 hover:underline font-medium text-xs">{quote.job.title}</Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Items table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 mb-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                  <th className="text-center py-3 px-3 text-slate-600 dark:text-slate-400 font-semibold w-16">CANT.</th>
                  <th className="text-left py-3 px-3 text-slate-600 dark:text-slate-400 font-semibold">DESCRIPCIÓN</th>
                  <th className="text-right py-3 px-3 text-slate-600 dark:text-slate-400 font-semibold w-36">PRECIO UNIT.</th>
                  <th className="text-right py-3 px-3 text-slate-600 dark:text-slate-400 font-semibold w-36">IMPORTE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {quote.items.map((item, i) => (
                  <tr key={i}>
                    <td className="py-3 px-3 text-center text-slate-900 dark:text-white">{item.qty}</td>
                    <td className="py-3 px-3 text-slate-900 dark:text-white">{item.description}</td>
                    <td className="py-3 px-3 text-right text-slate-900 dark:text-white">${Number(item.unitPrice).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                    <td className="py-3 px-3 text-right font-medium text-slate-900 dark:text-white">${Number(item.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mt-4 flex justify-end">
            <div className="w-64 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">Subtotal</span>
                <span className="font-medium text-slate-900 dark:text-white">${Number(quote.subtotal).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 dark:text-slate-400">IVA {Number(quote.taxRate).toFixed(1)}%</span>
                <span className="font-medium text-slate-900 dark:text-white">${Number(quote.taxAmount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              {(quote.otherTaxes || []).map((t, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-slate-600 dark:text-slate-400">{t.name} {t.rate}%</span>
                  <span className="font-medium text-slate-900 dark:text-white">${Number(t.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                </div>
              ))}
              <div className="flex justify-between border-t-2 border-slate-300 dark:border-slate-600 pt-2">
                <span className="font-bold text-slate-900 dark:text-white text-base">TOTAL</span>
                <span className="font-bold text-sky-700 dark:text-sky-400 text-base">${Number(quote.total).toLocaleString('es-AR', { minimumFractionDigits: 2 })} ARS</span>
              </div>
            </div>
          </div>
        </div>

        {/* Notes / Terms */}
        {(quote.paymentTerms || quote.notes) && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
            {quote.paymentTerms && (
              <>
                <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">Condiciones de pago</p>
                <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">{quote.paymentTerms}</p>
              </>
            )}
            {quote.notes && (
              <>
                <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 mb-1">Observaciones</p>
                <p className="text-sm text-slate-700 dark:text-slate-300">{quote.notes}</p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Reject modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-slate-900 dark:text-white text-lg mb-4">Rechazar cotización</h3>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Motivo (opcional)</label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              placeholder={t('quote.rejectReasonPlaceholder', 'Explica por qué rechazas esta cotización...')}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm resize-none mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
              >
                {rejecting ? 'Rechazando...' : 'Confirmar rechazo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
