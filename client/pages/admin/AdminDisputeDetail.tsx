import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../hooks/useAuth';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Attachment {
  fileName: string;
  fileUrl: string;
  fileType: 'image' | 'video' | 'pdf' | 'other';
  fileSize: number;
  uploadedAt: Date;
}

interface DisputeMessage {
  from: string;
  message: string;
  attachments?: Attachment[];
  isAdmin?: boolean;
  createdAt: Date;
}

interface LogEntry {
  action: string;
  performedBy: string;
  timestamp: Date;
  details?: string;
}

interface Dispute {
  id: string;
  contractId: string;
  paymentId?: string;
  reason: string;
  detailedDescription: string;
  category: string;
  status: string;
  priority: string;
  importanceLevel?: string;
  evidence: Attachment[];
  messages: DisputeMessage[];
  logs: LogEntry[];
  createdAt: Date;
  initiator: {
    name: string;
    email?: string;
    avatar?: string;
  };
  defendant: {
    name: string;
    email?: string;
    avatar?: string;
  };
  assignee?: {
    name: string;
    email?: string;
  };
  resolver?: {
    name: string;
  };
  contract?: {
    id: string;
    price: number;
    status: string;
  };
  payment?: {
    id: string;
    status: string;
    amount: number;
  } | null;
  resolution?: string;
  resolutionType?: string;
  resolvedAt?: Date;
  refundAmount?: number;
  initiatedBy?: string;
}

const AdminDisputeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState('');
  const [resolutionType, setResolutionType] = useState('');
  const [refundAmount, setRefundAmount] = useState<number | ''>('');
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [note, setNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [adminMessage, setAdminMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const fetchDispute = async () => {
    try {
      const response = await axios.get(`${API_URL}/admin/disputes/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDispute(response.data.data);
    } catch (error) {
      console.error('Error fetching dispute:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDispute();
  }, [id]);

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolution.trim() || !resolutionType) return;

    setResolving(true);
    try {
      await axios.post(`${API_URL}/admin/disputes/${id}/resolve`, {
        resolution,
        resolutionType,
        refundAmount: resolutionType === 'partial_refund' ? refundAmount : undefined,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchDispute();
      setShowResolveForm(false);
    } catch (error) {
      console.error('Error resolving dispute:', error);
      alert('Error al resolver la disputa');
    } finally {
      setResolving(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;

    setAddingNote(true);
    try {
      await axios.post(`${API_URL}/admin/disputes/${id}/note`, {
        note,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNote('');
      await fetchDispute();
    } catch (error) {
      console.error('Error adding note:', error);
    } finally {
      setAddingNote(false);
    }
  };

  const handleUpdatePriority = async (newPriority: string) => {
    try {
      await axios.put(`${API_URL}/admin/disputes/${id}/priority`, {
        priority: newPriority,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchDispute();
    } catch (error) {
      console.error('Error updating priority:', error);
    }
  };

  const handleSendAdminMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminMessage.trim()) return;

    setSendingMessage(true);
    try {
      await axios.post(`${API_URL}/admin/disputes/${id}/messages`, {
        message: adminMessage,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAdminMessage('');
      await fetchDispute();
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Error al enviar el mensaje');
    } finally {
      setSendingMessage(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      open: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      in_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      awaiting_info: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      resolved_released: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      resolved_refunded: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      resolved_partial: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    };

    const labels: Record<string, string> = {
      open: 'Abierta',
      in_review: 'En Revision',
      awaiting_info: 'Esperando Info',
      resolved_released: 'Resuelta - Liberado',
      resolved_refunded: 'Resuelta - Reembolsado',
      resolved_partial: 'Resuelta - Parcial',
      cancelled: 'Cancelada',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${styles[status] || styles.open}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      low: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[priority] || styles.medium}`}>
        {priority?.toUpperCase()}
      </span>
    );
  };

  const hasPayment = !!dispute?.payment || !!dispute?.paymentId;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-sky-200 dark:border-sky-900 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-sky-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="mt-4 text-gray-600 dark:text-gray-400 font-medium">Cargando disputa...</p>
          <p className="text-sm text-gray-500 dark:text-gray-500">Recuperando información del caso</p>
        </div>
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
            <svg className="w-10 h-10 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Disputa no encontrada
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Esta disputa puede haber sido eliminada o el ID es incorrecto.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/admin/disputes')}
              className="px-6 py-2.5 bg-sky-600 text-white font-medium rounded-lg hover:bg-sky-700 transition-colors"
            >
              Ver todas las disputas
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 text-gray-700 dark:text-gray-300 font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Recargar
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isResolved = dispute.status.startsWith('resolved') || dispute.status === 'cancelled';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/admin/disputes')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Volver a disputas
          </button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{dispute.reason}</h1>
              <div className="flex items-center gap-3 flex-wrap">
                {getStatusBadge(dispute.status)}
                {getPriorityBadge(dispute.priority)}
                {hasPayment ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                    Con Pago
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    Sin Pago
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(`/disputes/${id}`)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Ver como usuario
              </button>
              {!isResolved && (
                <button
                  onClick={() => setShowResolveForm(true)}
                  className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
                >
                  Resolver Disputa
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Descripcion</h2>
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{dispute.detailedDescription}</p>
            </div>

            {/* Evidence */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Evidencia ({dispute.evidence?.length || 0} archivos)
              </h2>

              {dispute.evidence && dispute.evidence.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {dispute.evidence.map((attachment, index) => (
                    <a
                      key={index}
                      href={attachment.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 hover:ring-2 hover:ring-sky-500 transition-all hover:shadow-lg"
                    >
                      {attachment.fileType === 'image' ? (
                        <img
                          src={attachment.fileUrl}
                          alt={attachment.fileName}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : attachment.fileType === 'video' ? (
                        <div className="relative w-full h-full">
                          <video src={attachment.fileUrl} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center">
                              <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800">
                          <svg className="w-12 h-12 text-sky-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                          </svg>
                          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 text-center truncate w-full font-medium">
                            {attachment.fileName}
                          </p>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                        <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-all transform scale-90 group-hover:scale-100" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 bg-gray-50 dark:bg-gray-700/30 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 font-medium mb-1">Sin evidencia adjunta</p>
                  <p className="text-sm text-gray-500 dark:text-gray-500">El usuario no ha subido archivos</p>
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Mensajes ({dispute.messages?.length || 0})
              </h2>

              <div className="space-y-4 max-h-96 overflow-y-auto mb-4">
                {dispute.messages && dispute.messages.length > 0 ? (
                  dispute.messages.map((msg, index) => {
                    const isAdmin = msg.isAdmin;
                    const isInitiatorMsg = !isAdmin && msg.from === dispute.initiatedBy;

                    // Determine display name
                    let displayName: string;
                    if (isAdmin) {
                      displayName = 'Soporte DoApp';
                    } else if (isInitiatorMsg) {
                      displayName = dispute.initiator?.name || 'Iniciador';
                    } else {
                      displayName = dispute.defendant?.name || 'Demandado';
                    }

                    const avatarClass = isAdmin
                      ? 'bg-purple-100 dark:bg-purple-900/40'
                      : (isInitiatorMsg ? 'bg-sky-100 dark:bg-sky-900/40' : 'bg-orange-100 dark:bg-orange-900/40');
                    const textClass = isAdmin
                      ? 'text-purple-600 dark:text-purple-400'
                      : (isInitiatorMsg ? 'text-sky-600 dark:text-sky-400' : 'text-orange-600 dark:text-orange-400');
                    const badgeClass = isAdmin
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      : (isInitiatorMsg ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400');
                    const badgeLabel = isAdmin ? 'Admin' : (isInitiatorMsg ? 'Iniciador' : 'Demandado');

                    return (
                      <div key={index} className="flex gap-3 group">
                        <div className="flex-shrink-0">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-gray-700 shadow-sm ${avatarClass}`}>
                            {isAdmin ? (
                              <svg className={`w-5 h-5 ${textClass}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                              </svg>
                            ) : (
                              <span className={`text-sm font-semibold ${textClass}`}>
                                {displayName.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                          <div className="flex items-baseline gap-2 mb-1">
                            <p className="font-semibold text-gray-900 dark:text-white text-sm">
                              {displayName}
                            </p>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${badgeClass}`}>
                              {badgeLabel}
                            </span>
                            <p className="text-xs text-gray-400 dark:text-gray-500 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                              {new Date(msg.createdAt).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          {msg.message && (
                            <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{msg.message}</p>
                          )}
                          {/* Message Attachments */}
                          {msg.attachments && msg.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {msg.attachments.map((att, attIdx) => (
                                <a
                                  key={attIdx}
                                  href={att.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-600 rounded-lg border border-gray-200 dark:border-gray-500 hover:border-sky-400 transition-colors"
                                >
                                  {att.fileType === 'image' ? (
                                    <img src={att.fileUrl} alt={att.fileName} className="w-8 h-8 object-cover rounded" />
                                  ) : att.fileType === 'pdf' ? (
                                    <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                    </svg>
                                  ) : (
                                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                                    </svg>
                                  )}
                                  <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[100px]">{att.fileName}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <h4 className="text-gray-900 dark:text-white font-medium mb-1">Sin conversación</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                      Las partes no han intercambiado mensajes en esta disputa.
                    </p>
                  </div>
                )}
              </div>

              {/* Admin Message Form */}
              {!isResolved && (
                <form onSubmit={handleSendAdminMessage} className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={adminMessage}
                        onChange={(e) => setAdminMessage(e.target.value)}
                        placeholder="Enviar mensaje como soporte..."
                        disabled={sendingMessage}
                        className="w-full px-4 py-3 pr-12 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:text-white placeholder-gray-400 disabled:opacity-50 transition-all"
                      />
                      <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs ${adminMessage.length > 450 ? 'text-red-500' : 'text-gray-400'}`}>
                        {adminMessage.length}/500
                      </span>
                    </div>
                    <button
                      type="submit"
                      disabled={sendingMessage || !adminMessage.trim() || adminMessage.length > 500}
                      className="flex items-center gap-2 px-5 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow active:scale-[0.98]"
                    >
                      {sendingMessage ? (
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          <span className="hidden sm:inline">Enviar</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Admin Notes */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Notas Admin / Historial</h2>

              <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
                {dispute.logs && dispute.logs.length > 0 ? (
                  dispute.logs.map((log, index) => (
                    <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm">
                      <div className="flex justify-between items-start">
                        <span className="font-medium text-gray-900 dark:text-white">{log.action}</span>
                        <span className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                      {log.details && (
                        <p className="text-gray-600 dark:text-gray-400 mt-1">{log.details}</p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">Sin registros</p>
                )}
              </div>

              {!isResolved && (
                <form onSubmit={handleAddNote} className="relative">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Agregar nota interna..."
                        disabled={addingNote}
                        className="w-full px-4 py-3 pr-12 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent dark:bg-gray-700 dark:text-white placeholder-gray-400 disabled:opacity-50 transition-all"
                      />
                      <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs ${note.length > 450 ? 'text-red-500' : 'text-gray-400'}`}>
                        {note.length}/500
                      </span>
                    </div>
                    <button
                      type="submit"
                      disabled={addingNote || !note.trim() || note.length > 500}
                      className="flex items-center gap-2 px-5 py-3 bg-gray-600 text-white rounded-xl hover:bg-gray-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow active:scale-[0.98]"
                    >
                      {addingNote ? (
                        <>
                          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span className="hidden sm:inline">Guardando...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          <span className="hidden sm:inline">Agregar</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Resolution */}
            {dispute.resolution && (
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-6">
                <h3 className="font-semibold text-green-900 dark:text-green-200 mb-2">Resolucion</h3>
                <p className="text-green-800 dark:text-green-300 mb-2">{dispute.resolution}</p>
                <div className="flex items-center gap-4 text-sm text-green-700 dark:text-green-400">
                  <span>Tipo: {dispute.resolutionType}</span>
                  {dispute.refundAmount && <span>Monto: ${dispute.refundAmount}</span>}
                  {dispute.resolvedAt && <span>Fecha: {new Date(dispute.resolvedAt).toLocaleString()}</span>}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Info Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Informacion</h3>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Categoria</p>
                  <p className="font-medium text-gray-900 dark:text-white capitalize">
                    {dispute.category?.replace(/_/g, ' ')}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Iniciado por</p>
                  <p className="font-medium text-gray-900 dark:text-white">{dispute.initiator?.name}</p>
                  {dispute.initiator?.email && (
                    <p className="text-xs text-gray-500">{dispute.initiator.email}</p>
                  )}
                </div>

                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Contra</p>
                  <p className="font-medium text-gray-900 dark:text-white">{dispute.defendant?.name}</p>
                  {dispute.defendant?.email && (
                    <p className="text-xs text-gray-500">{dispute.defendant.email}</p>
                  )}
                </div>

                {dispute.contract && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Contrato</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      ${dispute.contract.price?.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">Estado: {dispute.contract.status}</p>
                  </div>
                )}

                {dispute.payment && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Pago</p>
                    <p className="font-medium text-gray-900 dark:text-white">
                      ${dispute.payment.amount?.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">Estado: {dispute.payment.status}</p>
                  </div>
                )}

                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Fecha de creacion</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {new Date(dispute.createdAt).toLocaleString()}
                  </p>
                </div>

                {dispute.assignee && (
                  <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Asignado a</p>
                    <p className="font-medium text-gray-900 dark:text-white">{dispute.assignee.name}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Priority Update */}
            {!isResolved && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Cambiar Prioridad</h3>
                <div className="grid grid-cols-2 gap-2">
                  {['low', 'medium', 'high', 'urgent'].map((p) => (
                    <button
                      key={p}
                      onClick={() => handleUpdatePriority(p)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        dispute.priority === p
                          ? 'bg-sky-600 text-white'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                    >
                      {p.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Resolve Modal */}
        {showResolveForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Resolver Disputa</h3>

              <form onSubmit={handleResolve} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Tipo de Resolucion
                  </label>
                  <select
                    value={resolutionType}
                    onChange={(e) => setResolutionType(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 dark:bg-gray-700 dark:text-white"
                    required
                  >
                    <option value="">Seleccionar...</option>
                    <option value="full_release">Liberar pago al proveedor</option>
                    <option value="full_refund">Reembolso completo al cliente</option>
                    <option value="partial_refund">Reembolso parcial</option>
                    <option value="no_action">Sin accion</option>
                  </select>
                </div>

                {resolutionType === 'partial_refund' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Monto a reembolsar
                    </label>
                    <input
                      type="number"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value ? Number(e.target.value) : '')}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 dark:bg-gray-700 dark:text-white"
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Explicacion de la resolucion
                  </label>
                  <textarea
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 dark:bg-gray-700 dark:text-white"
                    required
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowResolveForm(false)}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={resolving}
                    className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:bg-gray-400 transition-colors"
                  >
                    {resolving ? 'Resolviendo...' : 'Resolver'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDisputeDetail;
