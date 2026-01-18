import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '../hooks/useAuth';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface Attachment {
  fileName: string;
  fileUrl: string;
  fileType: 'image' | 'video' | 'pdf' | 'other';
  fileSize: number;
  uploadedAt: Date;
}

interface DisputeMessage {
  from: string | {
    _id?: string;
    id?: string;
    name: string;
    avatar?: string;
  };
  message: string;
  attachments?: Attachment[];
  isAdmin?: boolean;
  createdAt: Date;
}

interface Dispute {
  id: string;
  _id?: string;
  contractId: string;
  reason: string;
  detailedDescription: string;
  category: string;
  status: string;
  priority: string;
  evidence: Attachment[];
  messages: DisputeMessage[];
  createdAt: Date;
  // Backend returns these as 'initiator' and 'defendant' from includes
  initiator?: {
    id?: string;
    _id?: string;
    name: string;
    avatar?: string;
  };
  defendant?: {
    id?: string;
    _id?: string;
    name: string;
    avatar?: string;
  };
  // Also keep raw IDs
  initiatedBy: string;
  against: string;
  resolution?: string;
  resolvedAt?: Date;
}

const DisputeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth();

  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const fetchDispute = async () => {
    try {
      const response = await axios.get(`${API_URL}/disputes/${id}`, {
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

  const onDrop = async (acceptedFiles: File[]) => {
    setUploadingEvidence(true);
    try {
      const formData = new FormData();
      acceptedFiles.forEach(file => {
        formData.append('attachments', file);
      });

      await axios.post(`${API_URL}/disputes/${id}/evidence`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`,
        },
      });

      await fetchDispute();
    } catch (error) {
      console.error('Error uploading evidence:', error);
    } finally {
      setUploadingEvidence(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'video/*': ['.mp4', '.mpeg', '.mov', '.avi', '.webm'],
      'application/pdf': ['.pdf'],
    },
    maxSize: 50 * 1024 * 1024,
    multiple: true,
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && messageFiles.length === 0) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      if (message.trim()) {
        formData.append('message', message);
      }
      messageFiles.forEach(file => {
        formData.append('attachments', file);
      });

      const response = await axios.post(`${API_URL}/disputes/${id}/messages`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data.success) {
        setMessage('');
        setMessageFiles([]);
        await fetchDispute();
      } else {
        alert(response.data.message || 'Error al enviar el mensaje');
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || 'Error al enviar el mensaje';
      alert(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMessageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setMessageFiles(Array.from(e.target.files));
    }
  };

  const removeMessageFile = (index: number) => {
    setMessageFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      open: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      in_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      awaiting_info: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      resolved_released: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      resolved_refunded: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      resolved_partial: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    };

    const labels = {
      open: 'Abierta',
      in_review: 'En Revisión',
      awaiting_info: 'Esperando Información',
      resolved_released: 'Resuelta - Pago Liberado',
      resolved_refunded: 'Resuelta - Reembolsado',
      resolved_partial: 'Resuelta - Reembolso Parcial',
      cancelled: 'Cancelada',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${styles[status as keyof typeof styles] || styles.open}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const styles = {
      low: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
      medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    };

    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[priority as keyof typeof styles]}`}>
        {priority.toUpperCase()}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-red-200 dark:border-red-900 rounded-full"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="mt-4 text-gray-600 dark:text-gray-400 font-medium">Cargando disputa...</p>
          <p className="text-sm text-gray-500 dark:text-gray-500">Esto solo tomará un momento</p>
        </div>
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            No pudimos encontrar esta disputa
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Es posible que la disputa haya sido eliminada o que no tengas permiso para verla.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/disputes')}
              className="px-6 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
            >
              Ver mis disputas
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 text-gray-700 dark:text-gray-300 font-medium rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Intentar de nuevo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/disputes')}
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
              <div className="flex items-center gap-3">
                {getStatusBadge(dispute.status)}
                {getPriorityBadge(dispute.priority)}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Descripción</h2>
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{dispute.detailedDescription}</p>
            </div>

            {/* Evidence */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Evidencia</h2>

              {dispute.evidence && dispute.evidence.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                  {dispute.evidence.map((attachment, index) => (
                    <a
                      key={index}
                      href={attachment.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700 hover:ring-2 hover:ring-red-500 transition-all hover:shadow-lg"
                    >
                      {attachment.fileType === 'image' ? (
                        <img
                          src={attachment.fileUrl}
                          alt={attachment.fileName}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : attachment.fileType === 'video' ? (
                        <div className="relative w-full h-full">
                          <video
                            src={attachment.fileUrl}
                            className="w-full h-full object-cover"
                          />
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
                          <svg className="w-12 h-12 text-red-400" fill="currentColor" viewBox="0 0 20 20">
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
                <div className="text-center py-8 mb-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 font-medium mb-1">Sin evidencia adjunta</p>
                  <p className="text-sm text-gray-500 dark:text-gray-500">Sube fotos, videos o PDFs para respaldar tu caso</p>
                </div>
              )}

              {/* Upload more evidence */}
              {!dispute.status.startsWith('resolved') && (
                <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${isDragActive ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-red-400'}`}>
                  <input {...getInputProps()} />
                  <svg className="mx-auto h-10 w-10 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {uploadingEvidence ? 'Subiendo...' : 'Agregar más evidencia'}
                  </p>
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Conversación</h2>

              <div className="space-y-4 mb-4 max-h-96 overflow-y-auto">
                {dispute.messages && dispute.messages.length > 0 ? (
                  dispute.messages.map((msg, index) => {
                    // Handle both string (userId) and object (populated user) for 'from'
                    const isFromObject = typeof msg.from === 'object' && msg.from !== null;
                    const senderAvatar = isFromObject ? (msg.from as any).avatar : null;

                    // Check if sender is the initiator, defendant, or admin
                    const isAdmin = msg.isAdmin;
                    const senderId = isFromObject
                      ? ((msg.from as any)._id || (msg.from as any).id)
                      : msg.from;
                    const isInitiator = senderId === dispute.initiatedBy;

                    // Determine display name
                    let displayName: string;
                    if (isAdmin) {
                      displayName = 'Soporte DoApp';
                    } else if (isFromObject && (msg.from as any).name) {
                      displayName = (msg.from as any).name;
                    } else if (isInitiator) {
                      displayName = dispute.initiator?.name || 'Iniciador';
                    } else {
                      displayName = dispute.defendant?.name || 'Demandado';
                    }

                    const avatarClass = isAdmin
                      ? 'bg-purple-100 dark:bg-purple-900/40'
                      : (isInitiator ? 'bg-red-100 dark:bg-red-900/40' : 'bg-blue-100 dark:bg-blue-900/40');
                    const textClass = isAdmin
                      ? 'text-purple-600 dark:text-purple-400'
                      : (isInitiator ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400');
                    const badgeClass = isAdmin
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      : (isInitiator ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400');
                    const badgeLabel = isAdmin ? 'Admin' : (isInitiator ? 'Iniciador' : 'Demandado');

                    return (
                      <div key={index} className="flex gap-3 group">
                        <div className="flex-shrink-0">
                          {senderAvatar && !isAdmin ? (
                            <img src={senderAvatar} alt={displayName} className="w-10 h-10 rounded-full ring-2 ring-white dark:ring-gray-700 shadow-sm" />
                          ) : (
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
                          )}
                        </div>
                        <div className="flex-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                          <div className="flex items-baseline gap-2 mb-1">
                            <p className="font-semibold text-gray-900 dark:text-white text-sm">{displayName}</p>
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
                                  className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-600 rounded-lg border border-gray-200 dark:border-gray-500 hover:border-red-400 transition-colors"
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
                    <h4 className="text-gray-900 dark:text-white font-medium mb-1">Sin mensajes todavía</h4>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                      Envía un mensaje para comunicarte con la otra parte sobre esta disputa.
                    </p>
                  </div>
                )}
              </div>

              {!dispute.status.startsWith('resolved') ? (
                <form onSubmit={handleSendMessage} className="space-y-3">
                  {/* Selected Files Preview */}
                  {messageFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      {messageFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-2 py-1 bg-white dark:bg-gray-600 rounded border border-gray-200 dark:border-gray-500">
                          {file.type.startsWith('image/') ? (
                            <img src={URL.createObjectURL(file)} alt={file.name} className="w-6 h-6 object-cover rounded" />
                          ) : (
                            <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                            </svg>
                          )}
                          <span className="text-xs text-gray-600 dark:text-gray-300 truncate max-w-[80px]">{file.name}</span>
                          <button
                            type="button"
                            onClick={() => removeMessageFile(idx)}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 items-end">
                    {/* Attach File Button */}
                    <label className="flex-shrink-0 p-3 rounded-xl border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                      <input
                        type="file"
                        multiple
                        accept="image/*,.pdf"
                        onChange={handleMessageFileSelect}
                        className="hidden"
                        disabled={submitting}
                      />
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                    </label>
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Escribe tu mensaje aquí..."
                        disabled={submitting}
                        className="w-full px-4 py-3 pr-12 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent dark:bg-gray-700 dark:text-white placeholder-gray-400 disabled:opacity-50 transition-all"
                      />
                      <span className={`absolute right-4 top-1/2 -translate-y-1/2 text-xs ${message.length > 450 ? 'text-red-500' : 'text-gray-400'}`}>
                        {message.length}/500
                      </span>
                    </div>
                    <button
                      type="submit"
                      disabled={submitting || (!message.trim() && messageFiles.length === 0) || message.length > 500}
                      className="flex items-center gap-2 px-5 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow active:scale-[0.98]"
                    >
                      {submitting ? (
                        <>
                          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span className="hidden sm:inline">Enviando...</span>
                        </>
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
                  {message.length > 500 && (
                    <p className="text-xs text-red-500">El mensaje excede el límite de 500 caracteres</p>
                  )}
                </form>
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-100 dark:bg-gray-700/50 rounded-xl text-gray-500 dark:text-gray-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-sm">Esta disputa ha sido resuelta. No se pueden enviar más mensajes.</span>
                </div>
              )}
            </div>

            {/* Resolution */}
            {dispute.resolution && (
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <h3 className="font-semibold text-green-900 dark:text-green-200 mb-2">Resolución</h3>
                    <p className="text-green-800 dark:text-green-300">{dispute.resolution}</p>
                    {dispute.resolvedAt && (
                      <p className="mt-2 text-sm text-green-700 dark:text-green-400">
                        Resuelto el {new Date(dispute.resolvedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Info Card */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Información</h3>

              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Categoría</p>
                  <p className="font-medium text-gray-900 dark:text-white capitalize">
                    {dispute.category.replace(/_/g, ' ')}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Iniciado por</p>
                  <p className="font-medium text-gray-900 dark:text-white">{dispute.initiator?.name || 'No disponible'}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Contra</p>
                  <p className="font-medium text-gray-900 dark:text-white">{dispute.defendant?.name || 'No disponible'}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Fecha de creación</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {new Date(dispute.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Estado</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-yellow-500 mt-2"></div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900 dark:text-white font-medium">Disputa abierta</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {new Date(dispute.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                {dispute.status.startsWith('resolved') && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-2"></div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-900 dark:text-white font-medium">Disputa resuelta</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {dispute.resolvedAt && new Date(dispute.resolvedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisputeDetail;
