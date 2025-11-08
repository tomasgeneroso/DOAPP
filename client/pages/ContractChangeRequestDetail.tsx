import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '@/hooks/useAuth';
import {
  ArrowLeft,
  Clock,
  Check,
  X,
  AlertCircle,
  FileText,
  User,
  DollarSign,
  Calendar,
  MessageCircle,
} from 'lucide-react';

interface ContractChangeRequest {
  _id: string;
  contract: {
    _id: string;
    job: {
      title: string;
    };
    client: {
      _id: string;
      name: string;
      avatar?: string;
    };
    doer: {
      _id: string;
      name: string;
      avatar?: string;
    };
    price: number;
    startDate: string;
    endDate: string;
  };
  requestedBy: {
    _id: string;
    name: string;
    avatar?: string;
  };
  type: 'cancel' | 'modify';
  reason: string;
  status: 'pending' | 'accepted' | 'rejected' | 'escalated_to_support';
  newTerms?: {
    price?: number;
    startDate?: string;
    endDate?: string;
    description?: string;
  };
  respondedBy?: {
    name: string;
  };
  respondedAt?: string;
  escalatedAt?: string;
  createdAt: string;
}

export default function ContractChangeRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [request, setRequest] = useState<ContractChangeRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    if (id) {
      loadRequest();
    }
  }, [id]);

  const loadRequest = async () => {
    try {
      const response = await fetch(`/api/contract-change-requests/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setRequest(data.changeRequest);
      }
    } catch (error) {
      console.error('Error loading request:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (accept: boolean) => {
    if (!request) return;

    if (
      !confirm(
        accept
          ? '¿Estás seguro de aceptar esta solicitud?'
          : '¿Estás seguro de rechazar esta solicitud?'
      )
    ) {
      return;
    }

    setResponding(true);
    try {
      const response = await fetch(`/api/contract-change-requests/${id}/respond`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ accept }),
      });

      const data = await response.json();
      if (data.success) {
        alert(data.message);
        navigate(`/contracts/${request.contract._id}`);
      } else {
        alert(data.message || 'Error al responder la solicitud');
      }
    } catch (error) {
      console.error('Error responding to request:', error);
      alert('Error al responder la solicitud');
    } finally {
      setResponding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Solicitud no encontrada
          </h2>
          <button
            onClick={() => navigate('/contracts')}
            className="mt-4 text-sky-600 hover:text-sky-700"
          >
            Volver a contratos
          </button>
        </div>
      </div>
    );
  }

  const isRequester = request.requestedBy._id === user?._id;
  const canRespond = !isRequester && request.status === 'pending';
  const statusColor = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    accepted: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    escalated_to_support:
      'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  }[request.status];

  const typeLabel = request.type === 'cancel' ? 'Cancelación' : 'Modificación';

  return (
    <>
      <Helmet>
        <title>Solicitud de {typeLabel} - DOAPP</title>
      </Helmet>

      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back Button */}
          <button
            onClick={() => navigate(`/contracts/${request.contract._id}`)}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            Volver al contrato
          </button>

          {/* Header */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  Solicitud de {typeLabel}
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  {request.contract.job.title}
                </p>
              </div>
              <span className={`px-4 py-2 rounded-full font-semibold ${statusColor}`}>
                {request.status === 'pending' && 'Pendiente'}
                {request.status === 'accepted' && 'Aceptada'}
                {request.status === 'rejected' && 'Rechazada'}
                {request.status === 'escalated_to_support' && 'Escalada a soporte'}
              </span>
            </div>

            {request.status === 'pending' && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 flex gap-3 border-2 border-amber-200 dark:border-amber-800">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-900 dark:text-amber-200">
                  <p className="font-semibold mb-1">Tiempo límite de respuesta</p>
                  <p>
                    Esta solicitud se escalará automáticamente a soporte si no se responde en 2
                    días desde su creación.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Request Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Requester */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-sky-600" />
                Solicitado por
              </h2>
              <div className="flex items-center gap-3">
                {request.requestedBy.avatar ? (
                  <img
                    src={request.requestedBy.avatar}
                    alt={request.requestedBy.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                    <User className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {request.requestedBy.name}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {new Date(request.createdAt).toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* Contract Info */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <FileText className="h-5 w-5 text-sky-600" />
                Contrato
              </h2>
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Cliente</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {request.contract.client.name}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Proveedor</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {request.contract.doer.name}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Reason */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-sky-600" />
              Razón de la solicitud
            </h2>
            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
              {request.reason}
            </p>
          </div>

          {/* New Terms (if modify) */}
          {request.type === 'modify' && request.newTerms && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Nuevos términos propuestos
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {request.newTerms.price !== undefined && (
                  <div className="flex items-start gap-3 p-4 bg-sky-50 dark:bg-sky-900/20 rounded-lg">
                    <DollarSign className="h-5 w-5 text-sky-600 dark:text-sky-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Precio</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">
                        ${request.newTerms.price.toLocaleString('es-AR')}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Actual: ${request.contract.price.toLocaleString('es-AR')}
                      </p>
                    </div>
                  </div>
                )}
                {request.newTerms.startDate && (
                  <div className="flex items-start gap-3 p-4 bg-sky-50 dark:bg-sky-900/20 rounded-lg">
                    <Calendar className="h-5 w-5 text-sky-600 dark:text-sky-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Fecha de inicio</p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {new Date(request.newTerms.startDate).toLocaleDateString('es-AR')}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Actual:{' '}
                        {new Date(request.contract.startDate).toLocaleDateString('es-AR')}
                      </p>
                    </div>
                  </div>
                )}
                {request.newTerms.endDate && (
                  <div className="flex items-start gap-3 p-4 bg-sky-50 dark:bg-sky-900/20 rounded-lg">
                    <Calendar className="h-5 w-5 text-sky-600 dark:text-sky-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Fecha de fin</p>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {new Date(request.newTerms.endDate).toLocaleDateString('es-AR')}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Actual: {new Date(request.contract.endDate).toLocaleDateString('es-AR')}
                      </p>
                    </div>
                  </div>
                )}
                {request.newTerms.description && (
                  <div className="md:col-span-2 p-4 bg-sky-50 dark:bg-sky-900/20 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Descripción</p>
                    <p className="text-gray-900 dark:text-white">{request.newTerms.description}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Response Info */}
          {(request.status === 'accepted' || request.status === 'rejected') &&
            request.respondedBy && (
              <div
                className={`rounded-xl shadow-lg p-6 mb-6 ${
                  request.status === 'accepted'
                    ? 'bg-green-50 dark:bg-green-900/20 border-2 border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800'
                }`}
              >
                <div className="flex items-start gap-3">
                  {request.status === 'accepted' ? (
                    <Check className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                  ) : (
                    <X className="h-6 w-6 text-red-600 dark:text-red-400 flex-shrink-0" />
                  )}
                  <div>
                    <h3
                      className={`text-lg font-semibold mb-2 ${
                        request.status === 'accepted'
                          ? 'text-green-900 dark:text-green-100'
                          : 'text-red-900 dark:text-red-100'
                      }`}
                    >
                      Solicitud {request.status === 'accepted' ? 'aceptada' : 'rechazada'}
                    </h3>
                    <p
                      className={`text-sm ${
                        request.status === 'accepted'
                          ? 'text-green-800 dark:text-green-200'
                          : 'text-red-800 dark:text-red-200'
                      }`}
                    >
                      Por <strong>{request.respondedBy.name}</strong> el{' '}
                      {new Date(request.respondedAt!).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            )}

          {/* Escalated Info */}
          {request.status === 'escalated_to_support' && (
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl shadow-lg p-6 mb-6 border-2 border-orange-200 dark:border-orange-800">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-6 w-6 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold text-orange-900 dark:text-orange-100 mb-2">
                    Escalada a soporte
                  </h3>
                  <p className="text-sm text-orange-800 dark:text-orange-200">
                    Esta solicitud ha sido escalada automáticamente a nuestro equipo de soporte
                    porque no se recibió respuesta en 2 días. El equipo se pondrá en contacto
                    pronto.
                  </p>
                  {request.escalatedAt && (
                    <p className="text-xs text-orange-700 dark:text-orange-300 mt-2">
                      Escalada el{' '}
                      {new Date(request.escalatedAt).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {canRespond && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Responder a esta solicitud
              </h2>
              <div className="flex gap-4">
                <button
                  onClick={() => handleRespond(false)}
                  disabled={responding}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  {responding ? (
                    <>
                      <Clock className="h-5 w-5 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <X className="h-5 w-5" />
                      Rechazar
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleRespond(true)}
                  disabled={responding}
                  className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  {responding ? (
                    <>
                      <Clock className="h-5 w-5 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Check className="h-5 w-5" />
                      Aceptar
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
