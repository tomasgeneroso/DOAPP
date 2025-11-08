import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useDropzone } from 'react-dropzone';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface Attachment {
  fileName: string;
  fileUrl: string;
  fileType: 'image' | 'video' | 'pdf' | 'other';
  fileSize: number;
  uploadedAt: Date;
}

interface DisputeMessage {
  from: {
    _id: string;
    name: string;
    avatar?: string;
  };
  message: string;
  createdAt: Date;
}

interface Dispute {
  _id: string;
  contractId: string;
  reason: string;
  detailedDescription: string;
  category: string;
  status: string;
  priority: string;
  evidence: Attachment[];
  messages: DisputeMessage[];
  createdAt: Date;
  initiatedBy: {
    _id: string;
    name: string;
    avatar?: string;
  };
  against: {
    _id: string;
    name: string;
    avatar?: string;
  };
  resolution?: string;
  resolvedAt?: Date;
}

const DisputeDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);

  const fetchDispute = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/disputes/${id}`, {
        withCredentials: true,
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

      await axios.post(`${API_URL}/api/disputes/${id}/evidence`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        withCredentials: true,
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
    if (!message.trim()) return;

    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/api/disputes/${id}/messages`, {
        message,
      }, {
        withCredentials: true,
      });

      setMessage('');
      await fetchDispute();
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSubmitting(false);
    }
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Disputa no encontrada</h2>
          <button
            onClick={() => navigate('/disputes')}
            className="mt-4 text-red-600 hover:text-red-700"
          >
            Volver a disputas
          </button>
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
                      className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 hover:ring-2 hover:ring-red-500"
                    >
                      {attachment.fileType === 'image' ? (
                        <img
                          src={attachment.fileUrl}
                          alt={attachment.fileName}
                          className="w-full h-full object-cover"
                        />
                      ) : attachment.fileType === 'video' ? (
                        <video
                          src={attachment.fileUrl}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-4">
                          <svg className="w-12 h-12 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                          </svg>
                          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 text-center truncate w-full">
                            {attachment.fileName}
                          </p>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity flex items-center justify-center">
                        <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 mb-4">No hay evidencia adjunta</p>
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
                  dispute.messages.map((msg, index) => (
                    <div key={index} className="flex gap-3">
                      <div className="flex-shrink-0">
                        {msg.from.avatar ? (
                          <img src={msg.from.avatar} alt={msg.from.name} className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              {msg.from.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className="font-medium text-gray-900 dark:text-white text-sm">{msg.from.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(msg.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <p className="mt-1 text-gray-700 dark:text-gray-300 text-sm">{msg.message}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">No hay mensajes aún</p>
                )}
              </div>

              {!dispute.status.startsWith('resolved') && (
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Escribe un mensaje..."
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={submitting || !message.trim()}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition-colors"
                  >
                    Enviar
                  </button>
                </form>
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
                  <p className="font-medium text-gray-900 dark:text-white">{dispute.initiatedBy.name}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Contra</p>
                  <p className="font-medium text-gray-900 dark:text-white">{dispute.against.name}</p>
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
