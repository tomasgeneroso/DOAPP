import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { usePermissions } from '../hooks/usePermissions';
import { ArrowLeft, AlertCircle, Paperclip, X, ExternalLink } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const CreateTicket: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasPermission, PERMISSIONS } = usePermissions();

  // Get query params for job-related tickets
  const jobId = searchParams.get('jobId');
  const ticketType = searchParams.get('type');
  const contractId = searchParams.get('contractId');

  const [formData, setFormData] = useState({
    subject: '',
    category: 'support',
    priority: 'medium',
    message: '',
  });
  const [relatedJobTitle, setRelatedJobTitle] = useState<string | null>(null);

  const [attachments, setAttachments] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Check permissions on mount
  useEffect(() => {
    if (!hasPermission(PERMISSIONS.TICKET_CREATE)) {
      navigate('/dashboard', {
        replace: true,
        state: { error: 'No tienes permiso para crear tickets' }
      });
    }
  }, [hasPermission, navigate, PERMISSIONS]);

  // Fetch job info and pre-fill form when jobId is provided
  useEffect(() => {
    const fetchJobInfo = async () => {
      if (!jobId) return;

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/jobs/${jobId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();

        if (data.success && data.job) {
          setRelatedJobTitle(data.job.title);

          // Pre-fill form based on ticket type
          if (ticketType === 'support') {
            setFormData(prev => ({
              ...prev,
              subject: `Problema con trabajo: ${data.job.title}`,
              category: 'support',
              message: `Referencia: Trabajo ID ${jobId}\nTítulo: ${data.job.title}\n\nDescribe tu problema o lo que necesitas modificar:\n`,
            }));
          } else if (ticketType === 'report_contract') {
            setFormData(prev => ({
              ...prev,
              subject: `Reporte de contrato - ${data.job.title}`,
              category: 'report_contract',
              message: `Referencia: Trabajo ID ${jobId}\nTítulo: ${data.job.title}\n${contractId ? `Contrato ID: ${contractId}\n` : ''}\nDescribe el problema con el contrato:\n`,
            }));
          } else if (ticketType === 'payment') {
            setFormData(prev => ({
              ...prev,
              subject: `Problema de pago - ${data.job.title}`,
              category: 'payment',
              message: `Referencia: Trabajo ID ${jobId}\nTítulo: ${data.job.title}\n\nDescribe el problema de pago:\n`,
            }));
          }
        }
      } catch (err) {
        console.error('Error fetching job info:', err);
      }
    };

    fetchJobInfo();
  }, [jobId, ticketType, contractId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    // Validate file types
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    const invalidFiles = files.filter(file => !validTypes.includes(file.type));

    if (invalidFiles.length > 0) {
      setError('Solo se permiten archivos JPG, PNG, WebP y PDF');
      return;
    }

    // Validate file size (10MB max)
    const oversizedFiles = files.filter(file => file.size > 10 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      setError('Los archivos no pueden superar los 10MB');
      return;
    }

    // Limit to 5 files
    if (attachments.length + files.length > 5) {
      setError('Máximo 5 archivos adjuntos');
      return;
    }

    setAttachments([...attachments, ...files]);
    setError('');
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');

      // Create FormData instead of JSON
      const formDataToSend = new FormData();
      formDataToSend.append('subject', formData.subject);
      formDataToSend.append('category', formData.category);
      formDataToSend.append('priority', formData.priority);
      formDataToSend.append('message', formData.message);

      // Append related job/contract info if present
      if (jobId) {
        formDataToSend.append('relatedJobId', jobId);
      }
      if (contractId) {
        formDataToSend.append('relatedContractId', contractId);
      }

      // Append attachments
      attachments.forEach((file) => {
        formDataToSend.append('attachments', file);
      });

      const response = await fetch(`${API_URL}/tickets`, {
        method: 'POST',
        headers: {
          // Don't set Content-Type - browser will set it with boundary
          Authorization: `Bearer ${token}`,
        },
        body: formDataToSend,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al crear ticket');
      }

      // Redirect to tickets list or ticket detail
      navigate('/tickets');
    } catch (err: any) {
      setError(err.message || 'Error al crear el ticket');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition mb-4"
          >
            <ArrowLeft className="h-5 w-5" />
            Volver
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Crear Nuevo Ticket
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            ¿Necesitas ayuda? Crea un ticket de soporte y nuestro equipo te ayudará.
          </p>
        </div>

        {/* Related Job Info */}
        {jobId && relatedJobTitle && (
          <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-sky-800 dark:text-sky-200">
                  Ticket relacionado con trabajo:
                </p>
                <p className="text-sky-700 dark:text-sky-300 font-semibold mt-1">
                  {relatedJobTitle}
                </p>
              </div>
              <Link
                to={`/jobs/${jobId}`}
                className="flex items-center gap-1 text-sm text-sky-600 dark:text-sky-400 hover:underline"
              >
                Ver trabajo
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">Error</h3>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Subject */}
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Asunto *
              </label>
              <input
                type="text"
                id="subject"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white"
                placeholder="Describe brevemente tu problema"
              />
            </div>

            {/* Category */}
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Categoría *
              </label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white"
              >
                <option value="support">Soporte General</option>
                <option value="bug">Reportar Error</option>
                <option value="feature">Solicitar Funcionalidad</option>
                <option value="report_user">Reportar Usuario</option>
                <option value="report_contract">Reportar Contrato</option>
                <option value="payment">Problema de Pago</option>
                <option value="other">Otro</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label htmlFor="priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Prioridad *
              </label>
              <select
                id="priority"
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white"
              >
                <option value="low">Baja</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>

            {/* Message */}
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Mensaje *
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                rows={6}
                className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white resize-none"
                placeholder="Describe tu problema o pregunta con el mayor detalle posible..."
              />
            </div>

            {/* Attachments */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Archivos adjuntos (opcional)
              </label>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition">
                    <Paperclip className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Seleccionar archivos</span>
                    <input
                      type="file"
                      multiple
                      accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    JPG, PNG, WebP o PDF (máx. 10MB, hasta 5 archivos)
                  </span>
                </div>

                {/* Attachment list */}
                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded-lg"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Paperclip className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                            {file.name}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                            ({(file.size / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAttachment(index)}
                          className="ml-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition"
                        >
                          <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-medium py-3 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creando...' : 'Crear Ticket'}
              </button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateTicket;
