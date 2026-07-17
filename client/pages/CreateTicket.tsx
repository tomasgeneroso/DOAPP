import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { ArrowLeft, AlertCircle, Paperclip, X, ExternalLink, Briefcase, CheckCircle, LogIn, Mail } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

interface UserContract {
  id: string;
  status: string;
  price: number;
  job?: { id: string; title: string };
  client?: { id: string; name: string };
  doer?: { id: string; name: string };
  createdAt: string;
}

interface CreatedTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  category: string;
}

const CreateTicket: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const { hasPermission, PERMISSIONS } = usePermissions();

  const isGuest = !token || !user;

  const jobId = searchParams.get('jobId');
  const ticketType = searchParams.get('type');
  const contractId = searchParams.get('contractId');

  const [guestEmail, setGuestEmail] = useState('');
  const [formData, setFormData] = useState({
    subject: '',
    category: 'support',
    priority: 'medium',
    message: '',
  });
  const [relatedJobTitle, setRelatedJobTitle] = useState<string | null>(null);

  const [userContracts, setUserContracts] = useState<UserContract[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>(contractId || '');
  const [loadingContracts, setLoadingContracts] = useState(false);
  const [userJobs, setUserJobs] = useState<Array<{ id: string; title: string; status: string; price: number }>>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>(jobId || '');
  const [loadingJobs, setLoadingJobs] = useState(false);

  const [attachments, setAttachments] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreatedTicket | null>(null);

  // For authenticated users only: redirect if missing permission
  useEffect(() => {
    if (!isGuest && !hasPermission(PERMISSIONS.TICKET_CREATE)) {
      navigate('/dashboard', {
        replace: true,
        state: { error: 'No tienes permiso para crear tickets' },
      });
    }
  }, [isGuest, hasPermission, navigate, PERMISSIONS]);

  // Fetch contracts and jobs for authenticated users
  useEffect(() => {
    if (isGuest) return;
    const fetchContracts = async () => {
      setLoadingContracts(true);
      try {
        const response = await fetch(`${API_URL}/contracts?limit=50`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (data.success) setUserContracts(data.contracts || data.data || []);
      } catch {
        // ignore
      } finally {
        setLoadingContracts(false);
      }
    };
    const fetchJobs = async () => {
      setLoadingJobs(true);
      try {
        const response = await fetch(`${API_URL}/jobs/my-jobs`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (data.success) setUserJobs(data.jobs || data.data || []);
      } catch {
        // ignore
      } finally {
        setLoadingJobs(false);
      }
    };
    fetchContracts();
    fetchJobs();
  }, [isGuest, token]);

  // Pre-fill from jobId query param (authenticated only)
  useEffect(() => {
    if (isGuest || !jobId) return;
    const fetchJobInfo = async () => {
      try {
        const response = await fetch(`${API_URL}/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (data.success && data.job) {
          setRelatedJobTitle(data.job.title);
          if (ticketType === 'support') {
            setFormData(prev => ({ ...prev, subject: `Problema con trabajo: ${data.job.title}`, category: 'support', message: `Referencia: Trabajo ID ${jobId}\nTítulo: ${data.job.title}\n\nDescribe tu problema:\n` }));
          } else if (ticketType === 'report_contract') {
            setFormData(prev => ({ ...prev, subject: `Reporte de contrato - ${data.job.title}`, category: 'report_contract', message: `Referencia: Trabajo ID ${jobId}\nTítulo: ${data.job.title}\n${contractId ? `Contrato ID: ${contractId}\n` : ''}\nDescribe el problema:\n` }));
          } else if (ticketType === 'payment') {
            setFormData(prev => ({ ...prev, subject: `Problema de pago - ${data.job.title}`, category: 'payment', message: `Referencia: Trabajo ID ${jobId}\nTítulo: ${data.job.title}\n\nDescribe el problema de pago:\n` }));
          }
        }
      } catch {
        // ignore
      }
    };
    fetchJobInfo();
  }, [isGuest, jobId, ticketType, contractId, token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (files.some(f => !validTypes.includes(f.type))) { setError('Solo se permiten archivos JPG, PNG, WebP y PDF'); return; }
    if (files.some(f => f.size > 10 * 1024 * 1024)) { setError('Los archivos no pueden superar los 10MB'); return; }
    if (attachments.length + files.length > 5) { setError('Máximo 5 archivos adjuntos'); return; }
    setAttachments([...attachments, ...files]);
    setError('');
  };

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isGuest && !guestEmail.trim()) {
      setError('El email es requerido');
      return;
    }

    setLoading(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('subject', formData.subject);
      formDataToSend.append('category', formData.category);
      formDataToSend.append('priority', formData.priority);
      formDataToSend.append('message', formData.message);

      if (isGuest) {
        formDataToSend.append('email', guestEmail.trim());
      } else {
        const finalJobId = selectedJobId || jobId;
        if (finalJobId) formDataToSend.append('relatedJobId', finalJobId);
        const finalContractId = selectedContractId || contractId;
        if (finalContractId) formDataToSend.append('relatedContractId', finalContractId);
      }

      attachments.forEach(file => formDataToSend.append('attachments', file));

      const endpoint = isGuest ? `${API_URL}/tickets/guest` : `${API_URL}/tickets`;
      const headers: Record<string, string> = {};
      if (!isGuest) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(endpoint, { method: 'POST', headers, body: formDataToSend });
      const data = await response.json();

      if (!response.ok) throw new Error(data.message || 'Error al crear ticket');

      if (isGuest) {
        setCreated(data.ticket);
      } else {
        navigate('/tickets');
      }
    } catch (err: any) {
      setError(err.message || 'Error al crear el ticket');
    } finally {
      setLoading(false);
    }
  };

  // Success screen for guests
  if (created) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-green-100 dark:bg-green-900/30 p-4 rounded-full">
              <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            ¡Ticket creado!
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Te enviamos una confirmación a tu email. Guardá el número de ticket para hacer seguimiento.
          </p>
          <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-4 mb-6">
            <p className="text-xs text-sky-600 dark:text-sky-400 uppercase tracking-wide font-medium mb-1">{t('tickets.ticketNumber', 'Número de ticket')}</p>
            <p className="text-2xl font-mono font-bold text-sky-700 dark:text-sky-300">{created.ticketNumber}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{created.subject}</p>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Para responder a este ticket o ver su estado, necesitás iniciar sesión.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 w-full bg-sky-600 hover:bg-sky-700 text-white font-medium py-2.5 px-6 rounded-lg transition"
            >
              <LogIn className="h-4 w-4" />
              Iniciar sesión para ver mis tickets
            </Link>
            <Link
              to="/help"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition"
            >
              Volver al Centro de Ayuda
            </Link>
          </div>
        </div>
      </div>
    );
  }

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
            {t('common.back')}
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t('tickets.title')}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {t('tickets.subtitle')}
          </p>
        </div>

        {/* Guest banner — show login option */}
        {isGuest && (
          <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-4 mb-6 flex items-start gap-3">
            <LogIn className="h-5 w-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-sky-800 dark:text-sky-200">
                ¿Ya tenés cuenta?{' '}
                <Link to={`/login?redirect=/tickets/new`} className="underline hover:no-underline">
                  Iniciá sesión
                </Link>{' '}
                para ver todos tus tickets y vincular el ticket a un trabajo o contrato.
              </p>
            </div>
          </div>
        )}

        {/* Related Job Info (authenticated only) */}
        {!isGuest && jobId && relatedJobTitle && (
          <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-sky-800 dark:text-sky-200">Ticket relacionado con trabajo:</p>
                <p className="text-sky-700 dark:text-sky-300 font-semibold mt-1">{relatedJobTitle}</p>
              </div>
              <Link to={`/jobs/${jobId}`} className="flex items-center gap-1 text-sm text-sky-600 dark:text-sky-400 hover:underline">
                Ver trabajo <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200">{t('common.error', 'Error')}</h3>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Form */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
          <form onSubmit={handleSubmit} className="space-y-6">

            {/* Guest email field */}
            {isGuest && (
              <div>
                <label htmlFor="guestEmail" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <Mail className="h-4 w-4 inline mr-1" />
                  Tu email registrado *
                </label>
                <input
                  type="email"
                  id="guestEmail"
                  value={guestEmail}
                  onChange={e => setGuestEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white"
                  placeholder={t('tickets.emailPlaceholder', 'tu@email.com')}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Debe ser el email con el que te registraste en DOAPP.
                </p>
              </div>
            )}

            {/* Subject */}
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('tickets.subject')} *
              </label>
              <input
                type="text"
                id="subject"
                name="subject"
                value={formData.subject}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white"
                placeholder={t('tickets.subjectPlaceholder')}
              />
            </div>

            {/* Category */}
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('tickets.category')} *
              </label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white"
              >
                <option value="support">{t('tickets.categories.support')}</option>
                <option value="bug">{t('tickets.categories.bug')}</option>
                <option value="feature">{t('tickets.categories.feature')}</option>
                {!isGuest && <option value="report_user">{t('tickets.categories.report_user')}</option>}
                {!isGuest && <option value="report_contract">{t('tickets.categories.report_contract')}</option>}
                <option value="payment">{t('tickets.categories.payment')}</option>
                <option value="other">{t('tickets.categories.other')}</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label htmlFor="priority" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('tickets.priority')} *
              </label>
              <select
                id="priority"
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white"
              >
                <option value="low">{t('tickets.priorities.low')}</option>
                <option value="medium">{t('tickets.priorities.medium')}</option>
                <option value="high">{t('tickets.priorities.high')}</option>
                <option value="urgent">{t('tickets.priorities.urgent')}</option>
              </select>
            </div>

            {/* Job & Contract selectors — authenticated only */}
            {!isGuest && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="relatedJob" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Briefcase className="h-4 w-4 inline mr-1" />
                    {t('tickets.linkedJob')}
                  </label>
                  <select
                    id="relatedJob"
                    value={selectedJobId}
                    onChange={e => {
                      setSelectedJobId(e.target.value);
                      if (e.target.value) {
                        const j = userJobs.find(j => j.id === e.target.value);
                        if (j?.title && !formData.subject) setFormData(prev => ({ ...prev, subject: `Problema con trabajo: ${j.title}` }));
                      }
                    }}
                    className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">{t('common.none')}</option>
                    {loadingJobs ? <option disabled>Cargando...</option> : userJobs.map(j => (
                      <option key={j.id} value={j.id}>{j.title} — {j.status === 'open' ? 'Abierto' : j.status === 'in_progress' ? 'En progreso' : j.status === 'completed' ? 'Completado' : j.status}</option>
                    ))}
                  </select>
                  {selectedJobId && (
                    <Link to={`/jobs/${selectedJobId}`} className="inline-flex items-center gap-1 mt-1 text-xs text-sky-600 dark:text-sky-400 hover:underline">
                      Ver trabajo <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
                <div>
                  <label htmlFor="relatedContract" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('tickets.linkedContract')}
                  </label>
                  <select
                    id="relatedContract"
                    value={selectedContractId}
                    onChange={e => {
                      setSelectedContractId(e.target.value);
                      if (e.target.value) {
                        const c = userContracts.find(c => c.id === e.target.value);
                        if (c?.job?.title && !formData.subject) setFormData(prev => ({ ...prev, subject: `Problema con contrato - ${c.job?.title}` }));
                      }
                    }}
                    className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white text-sm"
                  >
                    <option value="">{t('common.none')}</option>
                    {loadingContracts ? <option disabled>Cargando...</option> : userContracts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.job?.title || 'Contrato'} — ${Number(c.price).toLocaleString('es-AR')} — {c.status === 'completed' ? 'Completado' : c.status === 'in_progress' ? 'En progreso' : c.status === 'pending' ? 'Pendiente' : c.status === 'ready' ? 'Listo' : c.status === 'accepted' ? 'Aceptado' : c.status}
                      </option>
                    ))}
                  </select>
                  {selectedContractId && (
                    <Link to={`/contracts/${selectedContractId}`} className="inline-flex items-center gap-1 mt-1 text-xs text-sky-600 dark:text-sky-400 hover:underline">
                      Ver contrato <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Message */}
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('chat.message')} *
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                rows={6}
                className="w-full px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white resize-none"
                placeholder={t('tickets.messagePlaceholder')}
              />
            </div>

            {/* Attachments */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('tickets.attachments')}
              </label>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition">
                    <Paperclip className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{t('tickets.selectFiles')}</span>
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
                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((file, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700 px-3 py-2 rounded-lg">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Paperclip className="h-4 w-4 text-gray-400 shrink-0" />
                          <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{file.name}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">({(file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                        <button type="button" onClick={() => removeAttachment(index)} className="ml-2 p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition">
                          <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Submit */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-sky-600 hover:bg-sky-700 text-white font-medium py-3 px-6 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('tickets.creating') : t('tickets.createTicket')}
              </button>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
              >
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateTicket;
