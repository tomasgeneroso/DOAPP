import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { usePermissions } from '../hooks/usePermissions';
import { api } from '@/lib/api';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface FileWithPreview extends File {
  preview?: string;
}

interface Contract {
  id: string;
  _id?: string; // MongoDB compatibility
  job?: {
    title: string;
    summary?: string;
    location?: string;
  };
  jobId?: {
    title: string;
  };
  client?: {
    name: string;
    avatar?: string;
  };
  clientId?: {
    name: string;
  };
  doer?: {
    name: string;
    avatar?: string;
  };
  doerId?: {
    name: string;
  };
  price: number;
  status: string;
  startDate: string;
}

const CreateDispute: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const contractIdFromUrl = searchParams.get('contractId');
  const { hasPermission, PERMISSIONS } = usePermissions();

  // Check permissions on mount
  useEffect(() => {
    if (!hasPermission(PERMISSIONS.DISPUTE_CREATE)) {
      navigate('/dashboard', {
        replace: true,
        state: { error: 'No tienes permiso para crear disputas' }
      });
    }
  }, [hasPermission, navigate, PERMISSIONS]);

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContract, setSelectedContract] = useState<string>(contractIdFromUrl || '');
  const [loadingContracts, setLoadingContracts] = useState(false);

  const [formData, setFormData] = useState({
    reason: '',
    description: '',
    category: 'quality_issues',
  });

  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load user's contracts if no contractId in URL
  useEffect(() => {
    if (!contractIdFromUrl) {
      loadUserContracts();
    }
  }, [contractIdFromUrl]);

  const loadUserContracts = async () => {
    try {
      setLoadingContracts(true);
      // Include all disputable statuses: in_progress, awaiting_confirmation, completed
      const response = await api.get('/contracts?status=in_progress,awaiting_confirmation,completed&limit=100');
      console.log('📋 Contracts response:', response);
      if (response.success) {
        const contractsList = response.contracts || response.data || [];
        console.log('📋 Contracts found:', contractsList.length, contractsList);
        setContracts(contractsList);
      } else {
        console.log('📋 Response not successful:', response);
      }
    } catch (error) {
      console.error('Error loading contracts:', error);
    } finally {
      setLoadingContracts(false);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const filesWithPreview = acceptedFiles.map(file => Object.assign(file, {
      preview: URL.createObjectURL(file)
    }));
    setFiles(prev => [...prev, ...filesWithPreview]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
      'video/*': ['.mp4', '.mpeg', '.mov', '.avi', '.webm'],
      'application/pdf': ['.pdf'],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
    multiple: true,
  });

  const removeFile = (index: number) => {
    setFiles(prev => {
      const newFiles = [...prev];
      if (newFiles[index].preview) {
        URL.revokeObjectURL(newFiles[index].preview!);
      }
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!selectedContract) {
        setError('Debes seleccionar un contrato');
        return;
      }

      const formDataToSend = new FormData();
      formDataToSend.append('contractId', selectedContract);
      formDataToSend.append('reason', formData.reason);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('category', formData.category);

      files.forEach(file => {
        formDataToSend.append('attachments', file);
      });

      const response = await axios.post(`${API_URL}/disputes`, formDataToSend, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        withCredentials: true,
      });

      navigate(`/disputes/${response.data.data.id || response.data.data._id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al crear la disputa');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    return () => {
      files.forEach(file => {
        if (file.preview) {
          URL.revokeObjectURL(file.preview);
        }
      });
    };
  }, [files]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Abrir Disputa</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Reporta un problema con el contrato</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Contract Selector */}
            {!contractIdFromUrl && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Seleccionar Contrato *
                </label>
                {loadingContracts ? (
                  <div className="text-center py-4">
                    <p className="text-gray-500 dark:text-gray-400">Cargando contratos...</p>
                  </div>
                ) : contracts.length === 0 ? (
                  <div className="text-center py-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      No tienes contratos activos para disputar
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {contracts.map((contract) => {
                      const contractId = contract.id || contract._id;
                      const jobTitle = contract.job?.title || contract.jobId?.title || 'Sin título';
                      const clientName = contract.client?.name || contract.clientId?.name || 'Cliente';
                      const doerName = contract.doer?.name || contract.doerId?.name || 'Proveedor';
                      const statusLabels: Record<string, string> = {
                        in_progress: 'En progreso',
                        awaiting_confirmation: 'Esperando confirmación',
                        completed: 'Completado',
                      };
                      return (
                        <button
                          key={contractId}
                          type="button"
                          onClick={() => setSelectedContract(contractId)}
                          className={`w-full p-4 rounded-lg border-2 transition text-left ${
                            selectedContract === contractId
                              ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900 dark:text-white">
                                {jobTitle}
                              </p>
                              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                                <span>Cliente: {clientName}</span>
                                <span>•</span>
                                <span>Proveedor: {doerName}</span>
                                <span>•</span>
                                <span className="font-semibold">${contract.price?.toLocaleString('es-AR')}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <span
                                  className={`text-xs px-2 py-1 rounded-full ${
                                    contract.status === 'in_progress'
                                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                      : contract.status === 'completed'
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                      : contract.status === 'awaiting_confirmation'
                                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {statusLabels[contract.status] || contract.status}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  Inicio: {new Date(contract.startDate).toLocaleDateString('es-AR')}
                                </span>
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Categoría del problema
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-white"
                required
              >
                <option value="service_not_delivered">Servicio no entregado</option>
                <option value="incomplete_work">Trabajo incompleto</option>
                <option value="quality_issues">Problemas de calidad</option>
                <option value="payment_issues">Problemas de pago</option>
                <option value="breach_of_contract">Incumplimiento de contrato</option>
                <option value="other">Otro</option>
              </select>
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Motivo (título breve)
              </label>
              <input
                type="text"
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Ej: El trabajo no cumple con lo acordado"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-white"
                maxLength={200}
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Descripción detallada
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe en detalle qué sucedió y por qué no estás satisfecho con el trabajo..."
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-white"
                rows={6}
                maxLength={2000}
                required
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {formData.description.length}/2000 caracteres
              </p>
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Evidencia (opcional)
              </label>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-red-400 dark:hover:border-red-500'
                }`}
              >
                <input {...getInputProps()} />
                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {isDragActive ? (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">Suelta los archivos aquí...</p>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      Arrastra archivos aquí o haz clic para seleccionar
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                      Fotos, videos (max 50MB) o PDFs
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Preview Files */}
            {files.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {files.map((file, index) => (
                  <div key={index} className="relative group">
                    <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                      {file.type.startsWith('image/') ? (
                        <img
                          src={file.preview}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                      ) : file.type.startsWith('video/') ? (
                        <video
                          src={file.preview}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-12 h-12 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 truncate">{file.name}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Warning */}
            <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <div className="flex gap-3">
                <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div className="text-sm">
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">Importante</p>
                  <p className="mt-1 text-yellow-700 dark:text-yellow-300">
                    Al abrir una disputa, el pago quedará retenido en escrow hasta que un administrador resuelva el caso.
                    El proceso puede tomar de 3 a 5 días hábiles.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex-1 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition-colors"
              >
                {loading ? 'Creando disputa...' : 'Abrir Disputa'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateDispute;
