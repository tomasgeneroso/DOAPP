import { useEffect, useState } from "react";
import { getImageUrl } from '@/utils/imageUrl';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import {
  ArrowLeft,
  FileText,
  Calendar,
  DollarSign,
  User,
  Clock,
  CheckCircle,
  XCircle,
  MessageCircle,
} from "lucide-react";
import MultipleRatings from "../components/user/MultipleRatings";
import ConfirmModal from "../components/ui/ConfirmModal";

interface Proposal {
  id?: string;
  job: {
    id?: string;
    title: string;
    summary: string;
    price: number;
    location: string;
    category: string;
  };
  freelancer: {
    id?: string;
    name: string;
    avatar?: string;
    rating?: number;
    reviewsCount?: number;
    completedJobs?: number;
  };
  client: {
    id?: string;
    name: string;
    avatar?: string;
  };
  proposedPrice: number;
  estimatedDuration: number;
  coverLetter: string;
  status: string;
  isCounterOffer: boolean;
  originalJobPrice?: number;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export default function ProposalDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  // Replaces native confirm()/alert()/prompt()
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmAcceptOpen, setConfirmAcceptOpen] = useState(false);
  /** Desglose de lo que falta pagar para poder aceptar. Null = no falta nada. */
  const [liquidacion, setLiquidacion] = useState<any>(null);
  /** Estado en vivo de la aceptación, tal como lo ve el trabajador. */
  const [faseCotizacion, setFaseCotizacion] = useState<'pagando' | 'aceptada' | null>(null);

  /**
   * Manda a pagar la cotización.
   *
   * El trabajador queda seleccionado cuando el pago se acredita, no al volver
   * de la pasarela: si el contrato se creara al regresar, un pago abandonado a
   * mitad de camino dejaría al trabajador comprometido sin que nadie pagara.
   */
  const irAPagarCotizacion = async () => {
    if (!proposal || !token) return;
    setActionLoading(true);
    try {
      const pago = await fetch(`/api/payments/quote/${proposal.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const pagoData = await pago.json();
      if (pagoData.success && pagoData.paymentUrl) {
        window.location.href = pagoData.paymentUrl;
        return;
      }
      setLiquidacion(null);
      setNotice(pagoData.message || t('proposals.errorPayment', 'No se pudo iniciar el pago'));
    } catch {
      setLiquidacion(null);
      setNotice(t('proposals.errorProcessing', 'Error al procesar la solicitud'));
    } finally {
      setActionLoading(false);
    }
  };

  const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-AR')}`;
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const { token } = useAuth();
  const { registerQuoteStatusHandler } = useSocket();

  /**
   * El trabajador ve el avance sin recargar.
   *
   * Se filtra por propuesta porque un trabajador puede tener varias abiertas y
   * el evento llega a su usuario, no a esta pantalla.
   */
  useEffect(() => {
    registerQuoteStatusHandler((data: any) => {
      if (!id || data?.proposalId !== id) return;
      setFaseCotizacion(data.fase);
      if (data.fase === 'aceptada') loadProposal();
    });
  }, [id, registerQuoteStatusHandler]);

  useEffect(() => {
    if (id) {
      loadProposal();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const loadProposal = async () => {
    try {
      const response = await fetch(`/api/proposals/${id}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setProposal(data.proposal);
      }
    } catch (error) {
      console.error("Error loading proposal:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-amber-100 text-amber-800 dark:bg-amber-900/20 dark:text-amber-400";
      case "approved":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      case "rejected":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
      case "withdrawn":
        return "bg-slate-100 text-slate-800 dark:bg-slate-900/20 dark:text-slate-400";
      case "cancelled":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
      default:
        return "bg-slate-100 text-slate-800 dark:bg-slate-900/20 dark:text-slate-400";
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "Pendiente",
      approved: "Aprobada",
      rejected: "Rechazada",
      withdrawn: "Retirada",
      cancelled: "Cancelada",
    };
    return labels[status] || status;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle className="h-6 w-6" />;
      case "rejected":
      case "cancelled":
        return <XCircle className="h-6 w-6" />;
      default:
        return <Clock className="h-6 w-6" />;
    }
  };

  const handleAccept = () => {
    if (!proposal || !token) return;
    setConfirmAcceptOpen(true);
  };

  const doAccept = async () => {
    if (!proposal || !token) return;
    setConfirmAcceptOpen(false);
    setActionLoading(true);
    try {
      const response = await fetch(`/api/proposals/${proposal.id}/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      // 402: la cotización supera lo pagado (o se publicó "a cotizar" y no se
      // pagó nada). Se manda a pagar en vez de mostrar un error: no hay nada
      // que corregir, sólo falta la plata.
      //
      // El trabajador queda seleccionado cuando el pago se acredita, no acá.
      // Es el webhook el que crea el contrato: si se creara al volver de la
      // pasarela, un pago abandonado a mitad de camino dejaría al trabajador
      // comprometido con un contrato que nadie pagó.
      if (response.status === 402 && data.requierePago) {
        setLiquidacion(data.liquidacion || null);
        return;
      }

      if (data.success) {
        if (data.contractId) {
          navigate(`/contracts/${data.contractId}/summary`);
        } else {
          loadProposal();
        }
      } else {
        setNotice(data.message || t('proposals.errorAccepting', 'Error al aceptar la propuesta'));
      }
    } catch (error) {
      console.error('Error:', error);
      setNotice(t('proposals.errorProcessing', 'Error al procesar la solicitud'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = () => {
    if (!proposal || !token) return;
    setRejectReason('');
    setRejectOpen(true);
  };

  const doReject = async () => {
    if (!proposal || !token) return;
    const reason = rejectReason;
    setRejectOpen(false);
    setActionLoading(true);
    try {
      const response = await fetch(`/api/proposals/${proposal.id}/reject`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });

      const data = await response.json();
      if (data.success) {
        loadProposal();
      } else {
        setNotice(data.message || t('proposals.errorRejecting', 'Error al rechazar la propuesta'));
      }
    } catch (error) {
      console.error('Error:', error);
      setNotice(t('proposals.errorProcessing', 'Error al procesar la solicitud'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Propuesta no encontrada
          </h2>
          <button
            onClick={() => navigate("/proposals")}
            className="mt-4 text-sky-600 hover:text-sky-700"
          >
            Volver a Propuestas
          </button>
        </div>
      </div>
    );
  }

  const currentUserId = user?.id || user?.id;
  const freelancerId = proposal.freelancer.id || proposal.freelancer.id;
  const clientId = proposal.client.id || proposal.client.id;
  const isFreelancer = freelancerId === currentUserId;
  const isClient = clientId === currentUserId;
  const otherParty = isFreelancer ? proposal.client : proposal.freelancer;

  return (
    <>
      <Helmet>
        <title>
          {proposal.isCounterOffer ? "Contraoferta" : "Aplicación"} -{" "}
          {proposal.job.title} - Do
        </title>
      </Helmet>

      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back Button - Only visible on mobile */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-6 md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
            Volver
          </button>

          {/* Avance de la aceptación, en vivo. Sólo aparece cuando hay algo
              que contar: el trabajador necesita saber que alguien está pagando
              su cotización mientras ocurre, no cuando ya terminó. */}
          {faseCotizacion === 'pagando' && (
            <div className="mb-6 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                El cliente está abonando tu cotización
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                Quedás seleccionado cuando el pago se acredite. Te avisamos acá mismo.
              </p>
            </div>
          )}
          {faseCotizacion === 'aceptada' && (
            <div className="mb-6 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3">
              <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
                Tu cotización fue pagada y aceptada
              </p>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1">
                El contrato ya está creado y queda a la espera de la aprobación administrativa.
              </p>
            </div>
          )}

          {/* Header */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  {proposal.isCounterOffer && (
                    <span className="px-3 py-1 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-sm font-bold rounded">
                      CONTRAOFERTA
                    </span>
                  )}
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 ${getStatusColor(
                      proposal.status
                    )}`}
                  >
                    {getStatusIcon(proposal.status)}
                    {getStatusLabel(proposal.status)}
                  </span>
                </div>
                <Link
                  to={`/jobs/${proposal.job.id}`}
                  className="text-2xl font-bold text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400"
                >
                  {proposal.job.title}
                </Link>
                <p className="mt-2 text-slate-600 dark:text-slate-400">
                  {proposal.job.summary}
                </p>
              </div>
            </div>

            {/* Price Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                  Precio Original
                </p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">
                  ${proposal.job.price.toLocaleString()}
                </p>
              </div>
              <div className={`${proposal.isCounterOffer ? "bg-sky-50 dark:bg-sky-900/20 border-2 border-sky-500" : "bg-slate-50 dark:bg-slate-900/50"} rounded-lg p-4`}>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                  {proposal.isCounterOffer ? "Tu Contraoferta" : "Precio Propuesto"}
                </p>
                <p className={`text-2xl font-bold ${proposal.isCounterOffer ? "text-sky-600" : "text-slate-900 dark:text-white"}`}>
                  ${proposal.proposedPrice.toLocaleString()}
                </p>
              </div>
              {proposal.isCounterOffer && (
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4">
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-1">
                    Diferencia
                  </p>
                  <p className={`text-2xl font-bold ${proposal.proposedPrice < proposal.job.price ? "text-green-600" : "text-red-600"}`}>
                    {proposal.proposedPrice < proposal.job.price ? "-" : "+"}$
                    {Math.abs(proposal.proposedPrice - proposal.job.price).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Cover Letter / Message */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-sky-600" />
              {proposal.isCounterOffer ? "Mensaje de la Contraoferta" : "Carta de Presentación"}
            </h2>
            <div className="prose prose-slate dark:prose-invert max-w-none">
              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {proposal.coverLetter}
              </p>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Parties */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-sky-600" />
                Partes
              </h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                    Freelancer
                  </p>
                  <Link to={`/users/${proposal.freelancer.id}`} className="flex items-center gap-3 group">
                    <img
                      src={getImageUrl(proposal.freelancer.avatar)}
                      alt={proposal.freelancer.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                    <div className="flex-1">
                      <p className="font-medium text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                        {proposal.freelancer.name}
                      </p>
                      {proposal.freelancer.rating && (
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                          ⭐ {(Number(proposal.freelancer.rating) || 0).toFixed(1)} ({proposal.freelancer.reviewsCount || 0} reviews)
                        </p>
                      )}
                    </div>
                  </Link>
                  {/* Multiple Ratings for Freelancer */}
                  <div className="mt-3">
                    <MultipleRatings user={proposal.freelancer as any} />
                  </div>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">Cliente</p>
                  <Link to={`/users/${proposal.client.id}`} className="flex items-center gap-3 group">
                    <img
                      src={getImageUrl(proposal.client.avatar)}
                      alt={proposal.client.name}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                    <p className="font-medium text-slate-900 dark:text-white group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                      {proposal.client.name}
                    </p>
                  </Link>
                </div>
              </div>
            </div>

            {/* Job Details */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-sky-600" />
                Detalles
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Categoría</p>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {proposal.job.category}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Ubicación</p>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {proposal.job.location}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Duración Estimada
                  </p>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {proposal.estimatedDuration} días
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Fecha de Envío</p>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {new Date(proposal.createdAt).toLocaleDateString("es-AR", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Rejection Reason */}
          {proposal.status === "rejected" && proposal.rejectionReason && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 mb-6">
              <h2 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2 flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                Razón del Rechazo
              </h2>
              <p className="text-red-800 dark:text-red-300">{proposal.rejectionReason}</p>
            </div>
          )}

          {/* Actions for Client when Pending */}
          {isClient && proposal.status === 'pending' && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 text-center">
                {proposal.isCounterOffer ? '¿Aceptar esta contraoferta?' : '¿Seleccionar a este profesional?'}
              </h2>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={handleAccept}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg hover:from-green-600 hover:to-emerald-700 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  <CheckCircle className="h-5 w-5" />
                  {actionLoading ? 'Procesando...' : 'Aceptar'}
                </button>
                <button
                  onClick={handleReject}
                  disabled={actionLoading}
                  className="flex items-center gap-2 px-8 py-3 bg-white dark:bg-slate-700 border-2 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <XCircle className="h-5 w-5" />
                  Rechazar
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              to={`/jobs/${proposal.job.id}`}
              className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition font-semibold"
            >
              <FileText className="h-5 w-5" />
              Ver Trabajo
            </Link>
            <button
              onClick={() => navigate(`/chat/${proposal.freelancer.id}`)}
              className="flex items-center gap-2 px-6 py-3 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition font-semibold"
            >
              <MessageCircle className="h-5 w-5" />
              Enviar Mensaje
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmAcceptOpen}
        tone="success"
        title={t('proposals.acceptProposal', 'Aceptar propuesta')}
        message={t('proposals.confirmAccept', '¿Aceptar esta propuesta? Se creará el contrato automáticamente.')}
        confirmLabel={t('common.accept', 'Aceptar')}
        loading={actionLoading}
        onConfirm={doAccept}
        onClose={() => setConfirmAcceptOpen(false)}
      />

      <ConfirmModal
        open={!!liquidacion}
        tone="success"
        title={t('proposals.payToAccept', 'Para aceptar la cotización, aboná el total')}
        message={
          <div className="space-y-3 text-sm">
            <p className="text-slate-600 dark:text-slate-300">
              El trabajador queda seleccionado cuando se acredite el pago. Hasta entonces
              la cotización sigue disponible y nadie queda comprometido.
            </p>
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
              <div className="flex justify-between px-3 py-2">
                <span className="text-slate-600 dark:text-slate-400">Cotización</span>
                <span className="font-medium">{pesos(liquidacion?.acordado)}</span>
              </div>
              {liquidacion?.yaPagado > 0 && (
                <div className="flex justify-between px-3 py-2">
                  <span className="text-slate-600 dark:text-slate-400">Ya abonado</span>
                  <span className="font-medium">−{pesos(liquidacion?.yaPagado)}</span>
                </div>
              )}
              <div className="flex justify-between px-3 py-2">
                <span className="text-slate-600 dark:text-slate-400">Comisión</span>
                <span className="font-medium">{pesos(liquidacion?.comision)}</span>
              </div>
              <div className="flex justify-between px-3 py-2">
                <span className="text-slate-600 dark:text-slate-400">IVA</span>
                <span className="font-medium">{pesos(liquidacion?.iva)}</span>
              </div>
              <div className="flex justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800">
                <span className="font-semibold">Total a pagar</span>
                <span className="font-semibold">{pesos(liquidacion?.totalACobrar)}</span>
              </div>
            </div>
          </div>
        }
        confirmLabel={t('proposals.goToPay', 'Ir a pagar')}
        loading={actionLoading}
        onConfirm={irAPagarCotizacion}
        onClose={() => setLiquidacion(null)}
      />

      <ConfirmModal
        open={rejectOpen}
        tone="danger"
        title={t('proposals.rejectProposal', 'Rechazar propuesta')}
        message={
          <div>
            <p className="mb-3">{t('proposals.rejectReasonPrompt', '¿Por qué rechazás esta propuesta? (opcional)')}</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
              placeholder={t('proposals.rejectReasonPlaceholder', 'Motivo (opcional)')}
            />
          </div>
        }
        confirmLabel={t('common.reject', 'Rechazar')}
        loading={actionLoading}
        onConfirm={doReject}
        onClose={() => setRejectOpen(false)}
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
    </>
  );
}
