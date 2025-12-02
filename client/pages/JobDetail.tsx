import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  MessageSquare,
  Star,
  User,
  DollarSign,
  Loader2,
  Pause,
  Play,
  XCircle,
  Edit,
  Trash2,
  Users,
  CheckCircle,
  ExternalLink,
  AlertTriangle,
  Bell,
} from "lucide-react";
import type { Job } from "@/types";
import MultipleRatings from "../components/user/MultipleRatings";
import LocationCircleMap from "../components/map/LocationCircleMap";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [proposals, setProposals] = useState<any[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [selectingWorker, setSelectingWorker] = useState<string | null>(null);
  const [showSelectConfirmModal, setShowSelectConfirmModal] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<any>(null);
  const [newProposalAlert, setNewProposalAlert] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");

  const { registerNewProposalHandler, registerJobUpdateHandler } = useSocket();

  // Handle new proposal notification
  const handleNewProposal = useCallback((data: any) => {
    if (data.proposal?.jobId === id || data.proposal?.job?.id === id) {
      console.log("🆕 New proposal received for this job:", data);
      setNewProposalAlert(`Nueva postulación de ${data.proposal?.freelancer?.name || 'un usuario'}`);
      // Add to proposals list
      setProposals(prev => {
        if (prev.some(p => p.id === data.proposal.id)) return prev;
        return [data.proposal, ...prev];
      });
      // Auto-hide after 5 seconds
      setTimeout(() => setNewProposalAlert(null), 5000);
    }
  }, [id]);

  // Handle job updates
  const handleJobUpdate = useCallback((data: any) => {
    if (data.jobId === id || data.job?.id === id) {
      console.log("📝 Job updated:", data);
      if (data.job) {
        setJob(data.job);
      }
    }
  }, [id]);

  // Register socket handlers
  useEffect(() => {
    registerNewProposalHandler(handleNewProposal);
    registerJobUpdateHandler(handleJobUpdate);
  }, [registerNewProposalHandler, registerJobUpdateHandler, handleNewProposal, handleJobUpdate]);

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const response = await fetch(`/api/jobs/${id}`);
        const data = await response.json();
        if (data.success) {
          setJob(data.job);
        } else {
          setError(data.message || "No se pudo cargar el trabajo");
        }
      } catch (err) {
        setError("Error al cargar el trabajo");
        console.error("Error fetching job:", err);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchJob();
    }
  }, [id]);

  // Fetch proposals if user is the job owner
  useEffect(() => {
    const fetchProposals = async () => {
      if (!job || !user || !token) return;

      // Check if user is the job owner
      const clientId = typeof job.client === 'string' ? job.client : (job.client?.id || job.client?._id);
      const userId = user?.id || user?._id;

      if (clientId !== userId) return;
      if (job.status !== 'open') return;

      setLoadingProposals(true);
      try {
        const response = await fetch(`/api/proposals/job/${job.id || job._id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (data.success) {
          setProposals(data.proposals || []);
        }
      } catch (err) {
        console.error("Error fetching proposals:", err);
      } finally {
        setLoadingProposals(false);
      }
    };

    fetchProposals();
  }, [job, user, token]);

  const handleApply = () => {
    if (!user) {
      navigate("/login", { state: { from: `/jobs/${id}` } });
      return;
    }

    // Redirect to application summary page
    navigate(`/jobs/${id}/apply`);
  };

  const handleSendMessage = async () => {
    if (!user || !job) {
      navigate("/login", { state: { from: `/jobs/${id}` } });
      return;
    }

    setSendingMessage(true);
    setError(null);

    try {
      // Create or find conversation
      const response = await fetch('/api/proposals/start-negotiation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jobId: job.id || job._id,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Navigate to chat without job context (normal chat)
        navigate(`/chat/${data.conversationId}`);
      } else {
        setError(data.message || 'No se pudo iniciar la conversación');
      }
    } catch (err: any) {
      setError(err.message || 'Error al iniciar conversación');
    } finally {
      setSendingMessage(false);
    }
  };

  const handlePauseJob = async () => {
    if (!job || !token) return;

    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${job.id}/pause`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        // Refresh job data
        const jobResponse = await fetch(`/api/jobs/${id}`);
        const jobData = await jobResponse.json();
        if (jobData.success) {
          setJob(jobData.job);
        }
      } else {
        setError(data.message || 'Error al pausar la publicación');
      }
    } catch (err: any) {
      setError(err.message || 'Error al pausar la publicación');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResumeJob = async () => {
    if (!job || !token) return;

    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${job.id}/resume`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        // Refresh job data
        const jobResponse = await fetch(`/api/jobs/${id}`);
        const jobData = await jobResponse.json();
        if (jobData.success) {
          setJob(jobData.job);
        }
      } else {
        setError(data.message || 'Error al reanudar la publicación');
      }
    } catch (err: any) {
      setError(err.message || 'Error al reanudar la publicación');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelJob = async () => {
    if (!job || !token) return;

    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${job.id}/cancel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          reason: cancellationReason.trim() || null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setShowCancelModal(false);
        setCancellationReason("");
        // Redirect to dashboard
        navigate('/dashboard');
      } else {
        setError(data.message || 'Error al cancelar la publicación');
        setShowCancelModal(false);
      }
    } catch (err: any) {
      setError(err.message || 'Error al cancelar la publicación');
      setShowCancelModal(false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditJob = () => {
    if (!job) return;
    // Navigate to edit page
    navigate(`/jobs/${job.id || job._id}/edit`);
  };

  const handleDeleteJob = async () => {
    if (!job || !token) return;

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${job.id || job._id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        setShowDeleteModal(false);
        // Redirect to dashboard
        navigate('/dashboard');
      } else {
        setError(data.message || 'Error al eliminar el trabajo');
        setShowDeleteModal(false);
      }
    } catch (err: any) {
      setError(err.message || 'Error al eliminar el trabajo');
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleSelectWorker = async (proposal: any) => {
    if (!job || !token) return;

    setSelectingWorker(proposal.id);
    setError(null);

    try {
      const response = await fetch(`/api/proposals/${proposal.id}/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        setShowSelectConfirmModal(false);
        setSelectedProposal(null);
        // Refresh job data
        const jobResponse = await fetch(`/api/jobs/${id}`);
        const jobData = await jobResponse.json();
        if (jobData.success) {
          setJob(jobData.job);
          setProposals([]);
        }
      } else {
        setError(data.message || 'Error al seleccionar trabajador');
      }
    } catch (err: any) {
      setError(err.message || 'Error al seleccionar trabajador');
    } finally {
      setSelectingWorker(null);
    }
  };

  const openSelectConfirmModal = (proposal: any) => {
    setSelectedProposal(proposal);
    setShowSelectConfirmModal(true);
  };

  // Calculate time until auto-selection
  const getTimeUntilAutoSelect = () => {
    if (!job?.startDate) return null;
    const startDate = new Date(job.startDate);
    const autoSelectDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000); // 24h before
    const now = new Date();
    const diff = autoSelectDate.getTime() - now.getTime();

    if (diff <= 0) return 'Ya pasó el límite';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} día${days > 1 ? 's' : ''} restantes`;
    }
    return `${hours}h ${minutes}m restantes`;
  };

  // Check if cancellation is allowed (more than 24h before start, or pending_approval)
  const canCancelJob = () => {
    if (!job) return false;
    // Siempre se puede cancelar durante pending_approval (reembolso total)
    if (job.status === 'pending_approval') return true;
    if (!job.startDate) return false;
    const startDate = new Date(job.startDate);
    const now = new Date();
    const hoursUntilStart = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilStart > 24;
  };

  // Check if pause is allowed (more than 24h before start)
  const canPauseJob = () => {
    if (!job?.startDate) return false;
    const startDate = new Date(job.startDate);
    const now = new Date();
    const hoursUntilStart = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilStart > 24;
  };

  // Get time remaining for cancellation
  const getTimeUntilCancelDeadline = () => {
    if (!job?.startDate) return null;
    const startDate = new Date(job.startDate);
    const cancelDeadline = new Date(startDate.getTime() - 24 * 60 * 60 * 1000); // 24h before start
    const now = new Date();
    const diff = cancelDeadline.getTime() - now.getTime();

    if (diff <= 0) return null;

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} día${days > 1 ? 's' : ''} para cancelar`;
    }
    return `${hours}h ${minutes}m para cancelar`;
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || "Trabajo no encontrado"}</p>
          <Link
            to="/"
            className="text-sky-600 hover:text-sky-700 font-medium"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  // Support both PostgreSQL (id) and MongoDB (_id)
  const clientId = typeof job.client === 'string' ? job.client : (job.client?.id || job.client?._id);
  const userId = user?.id || user?._id;
  const isOwnJob = user && clientId === userId;
  const isDraft = job.status === 'draft' || job.status === 'pending_payment';

  return (
    <>
      <Helmet>
        <title>{job.title} - Doers</title>
        <meta name="description" content={job.summary} />
      </Helmet>
      <div className="container mx-auto px-4 py-8">
        {/* Back Button - Only visible on mobile */}
        <div className="mb-6 md:hidden">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a trabajos
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="space-y-6 lg:col-span-2">
            {/* Header Card */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex-1">
                  <h1 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
                    {job.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      <span>{job.location}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                      {job.client.rating.toFixed(1)}
                    </span>
                  </div>
                </div>
                <div className="rounded-full bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-2 text-xl font-bold text-white shadow-lg shadow-sky-500/30">
                  ${job.price.toLocaleString("es-AR")}
                </div>
              </div>

              <div className="my-4 h-px bg-slate-200 dark:bg-slate-700"></div>

              {/* Time Info */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-600">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Fecha de inicio
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {new Date(job.startDate).toLocaleDateString("es-AR")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-600">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Hora de inicio
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {new Date(job.startDate).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-600">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Fecha de fin
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {new Date(job.endDate).toLocaleDateString("es-AR")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-600">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Hora de fin
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {new Date(job.endDate).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">
                Descripción del trabajo
              </h2>
              <p className="whitespace-pre-line leading-relaxed text-slate-600 dark:text-slate-300">
                {job.description}
              </p>
            </div>

            {/* Location Map */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <LocationCircleMap location={job.location} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Client Info */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">
                Publicado por
              </h2>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-full bg-sky-100">
                  <img
                    src={
                      job.client.avatar ||
                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${job.client.name}`
                    }
                    alt={job.client.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {job.client.name}
                  </p>
                  <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                    <span>
                      {job.client.rating.toFixed(1)} ({job.client.reviewsCount}{" "}
                      reviews)
                    </span>
                  </div>
                </div>
              </div>
              <div className="my-4 h-px bg-slate-200 dark:bg-slate-700"></div>

              {/* Multiple Ratings Display */}
              <div className="mb-4">
                <MultipleRatings user={job.client} size="sm" />
              </div>

              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>Miembro desde 2023</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  <span>{job.client.completedJobs} trabajos completados</span>
                </div>
              </div>
              {user && !isOwnJob && (
                <button
                  onClick={handleSendMessage}
                  disabled={sendingMessage}
                  className="mt-4 w-full gap-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-white transition-colors hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingMessage ? (
                    <>
                      <Loader2 className="inline h-4 w-4 mr-2 animate-spin" />
                      Abriendo chat...
                    </>
                  ) : (
                    <>
                      <MessageSquare className="inline h-4 w-4 mr-2" />
                      Enviar mensaje
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Action Buttons */}
            {!isOwnJob && job.status === 'open' && (
              <div className="space-y-3">
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="w-full gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-6 py-3 text-lg font-semibold text-white shadow-lg shadow-sky-500/30 transition-all hover:from-sky-600 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {applying ? (
                    <>
                      <Loader2 className="inline h-5 w-5 mr-2 animate-spin" />
                      Aplicando...
                    </>
                  ) : user ? (
                    "Aplicar al trabajo"
                  ) : (
                    "Inicia sesión para aplicar"
                  )}
                </button>
                {error && (
                  <p className="text-sm text-red-600 text-center">{error}</p>
                )}
              </div>
            )}

            {!isOwnJob && job.status === 'pending_approval' && (
              <div className="rounded-2xl border border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/30 p-4">
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                  ⏳ Este trabajo está pendiente de aprobación
                </p>
              </div>
            )}

            {isOwnJob && job.status === 'pending_approval' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/30 p-4">
                  <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300 mb-2">
                    ⏳ Tu trabajo está pendiente de aprobación por un administrador
                  </p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    Puedes cancelar ahora y recibir un reembolso total (precio + comisión).
                  </p>
                </div>

                <button
                  onClick={() => setShowCancelModal(true)}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {actionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      Cancelar y recibir reembolso total
                    </>
                  )}
                </button>

                {error && (
                  <div className="rounded-2xl border border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30 p-4">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
                  </div>
                )}
              </div>
            )}

            {!isOwnJob && job.status === 'in_progress' && (
              <div className="rounded-2xl border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 p-4">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  🔧 Este trabajo ya tiene un profesional asignado
                </p>
              </div>
            )}

            {!isOwnJob && (job.status === 'completed' || job.status === 'cancelled' || job.status === 'paused') && (
              <div className={`rounded-2xl border p-4 ${
                job.status === 'cancelled'
                  ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30'
                  : job.status === 'paused'
                  ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30'
                  : 'border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/30'
              }`}>
                <p className={`text-sm font-medium ${
                  job.status === 'cancelled' ? 'text-red-700 dark:text-red-300' :
                  job.status === 'paused' ? 'text-amber-700 dark:text-amber-300' :
                  'text-green-700 dark:text-green-300'
                }`}>
                  {job.status === 'cancelled' && '❌ Esta publicacion fue cancelada'}
                  {job.status === 'completed' && '✅ Este trabajo fue completado'}
                  {job.status === 'paused' && '⏸️ Este trabajo esta pausado'}
                </p>
                {job.status === 'cancelled' && job.cancellationReason && (
                  <div className="mt-3 p-3 bg-red-100 dark:bg-red-950/50 rounded-lg border border-red-200 dark:border-red-800">
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Razón de cancelación:</p>
                    <p className="text-sm text-red-700 dark:text-red-200">{job.cancellationReason}</p>
                  </div>
                )}
                {job.status === 'cancelled' && job.cancelledAt && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    Cancelado el {new Date(job.cancelledAt).toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                )}
              </div>
            )}

            {isOwnJob && isDraft && (
              <div className="space-y-3">
                <button
                  onClick={() => navigate(`/jobs/${job.id || job._id}/payment`)}
                  className="w-full gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 text-lg font-semibold text-white shadow-lg shadow-orange-500/30 transition-all hover:from-orange-600 hover:to-orange-700"
                >
                  📢 Pagar y Publicar
                </button>
                <div className="rounded-2xl border border-yellow-600 bg-yellow-900/30 p-4">
                  <p className="text-sm font-medium text-yellow-300">
                    Este trabajo está en borrador. Completa el pago para publicarlo.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleEditJob}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-sky-600 bg-transparent px-4 py-2 text-sm font-semibold text-sky-400 transition-colors hover:bg-sky-900/30"
                  >
                    <Edit className="h-4 w-4" />
                    Editar
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-red-600 bg-transparent px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-900/30"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                </div>
              </div>
            )}

            {isOwnJob && !isDraft && job.status === 'open' && (
              <div className="space-y-4">
                {/* New proposal real-time alert */}
                {newProposalAlert && (
                  <div className="bg-green-900/30 border border-green-600 rounded-xl p-4 flex items-center gap-3 animate-pulse">
                    <Bell className="h-5 w-5 text-green-400" />
                    <span className="text-green-300 font-medium">{newProposalAlert}</span>
                    <button
                      onClick={() => setNewProposalAlert(null)}
                      className="ml-auto text-green-400 hover:text-green-200"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Postulados Section */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <Users className="h-5 w-5 text-sky-500 dark:text-sky-400" />
                      Postulados ({proposals.length})
                    </h3>
                    {proposals.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        <span>{getTimeUntilAutoSelect()}</span>
                      </div>
                    )}
                  </div>

                  {loadingProposals ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-sky-500 dark:text-sky-400" />
                    </div>
                  ) : proposals.length === 0 ? (
                    <div className="text-center py-6">
                      <Users className="h-10 w-10 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
                      <p className="text-slate-500 dark:text-slate-400 text-sm">Aún no hay postulados</p>
                      <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
                        Los profesionales interesados aparecerán aquí
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Auto-selection warning */}
                      <div className="rounded-lg border border-amber-300 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-900/20 p-3">
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="inline h-3 w-3 mr-1" />
                          Si no seleccionas un trabajador 24h antes del inicio, se asignará automáticamente al primer postulado.
                        </p>
                      </div>

                      {proposals.map((proposal: any) => (
                        <div
                          key={proposal.id}
                          className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-4 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            {/* Avatar - Clickeable */}
                            <Link
                              to={`/profile/${proposal.freelancer?.id || proposal.freelancerId}`}
                              className="shrink-0"
                            >
                              <div className="h-12 w-12 overflow-hidden rounded-full bg-sky-100 ring-2 ring-slate-300 dark:ring-slate-600 hover:ring-sky-500 transition-colors">
                                <img
                                  src={
                                    proposal.freelancer?.avatar ||
                                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${proposal.freelancer?.name || 'user'}`
                                  }
                                  alt={proposal.freelancer?.name}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            </Link>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <Link
                                  to={`/profile/${proposal.freelancer?.id || proposal.freelancerId}`}
                                  className="font-semibold text-slate-900 dark:text-white hover:text-sky-500 dark:hover:text-sky-400 transition-colors"
                                >
                                  {proposal.freelancer?.name || 'Usuario'}
                                </Link>
                                <ExternalLink className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                              </div>
                              <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 mt-1">
                                <span className="flex items-center gap-1">
                                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                                  {proposal.freelancer?.rating?.toFixed(1) || '0.0'}
                                </span>
                                <span>•</span>
                                <span>{proposal.freelancer?.completedJobs || 0} trabajos</span>
                              </div>

                              {/* Propuesta */}
                              {proposal.isCounterOffer && (
                                <div className="mt-2 px-2 py-1 bg-sky-100 dark:bg-sky-900/30 rounded text-xs text-sky-700 dark:text-sky-300 inline-block">
                                  Contraoferta: ${proposal.proposedPrice?.toLocaleString('es-AR')} ARS
                                </div>
                              )}
                            </div>

                            {/* Select Button */}
                            <button
                              onClick={() => openSelectConfirmModal(proposal)}
                              disabled={selectingWorker === proposal.id}
                              className="shrink-0 flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                            >
                              {selectingWorker === proposal.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4" />
                                  Seleccionar
                                </>
                              )}
                            </button>
                          </div>

                          {/* Cover Letter Preview */}
                          {proposal.coverLetter && (
                            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                              "{proposal.coverLetter}"
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <button
                      onClick={handlePauseJob}
                      disabled={actionLoading || !canPauseJob()}
                      title={!canPauseJob() ? "No puedes pausar con menos de 24h de anticipación" : ""}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Pause className="h-4 w-4" />
                          Pausar
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowCancelModal(true)}
                      disabled={actionLoading || !canCancelJob()}
                      title={!canCancelJob() ? "No puedes cancelar con menos de 24h de anticipación" : ""}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <XCircle className="h-4 w-4" />
                      Cancelar
                    </button>
                  </div>

                  {/* Cancellation deadline warning */}
                  {!canCancelJob() ? (
                    <div className="rounded-xl border border-red-300 dark:border-red-600/50 bg-red-50 dark:bg-red-900/20 p-3">
                      <p className="text-xs text-red-700 dark:text-red-300">
                        <AlertTriangle className="inline h-3 w-3 mr-1" />
                        Ya no puedes cancelar este trabajo (menos de 24h para el inicio). Contacta a soporte si necesitas ayuda.
                      </p>
                    </div>
                  ) : getTimeUntilCancelDeadline() && (
                    <div className="rounded-xl border border-amber-300 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-900/20 p-3">
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        <Clock className="inline h-3 w-3 mr-1" />
                        Tiempo restante para cancelar: <span className="font-semibold">{getTimeUntilCancelDeadline()}</span>
                      </p>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-600 bg-red-900/30 p-4">
                    <p className="text-sm font-medium text-red-300">{error}</p>
                  </div>
                )}

                <div className="rounded-2xl border border-sky-300 dark:border-sky-600 bg-white dark:bg-sky-900/30 p-4">
                  <p className="text-sm font-medium text-sky-700 dark:text-sky-300">
                    ✅ Este trabajo está publicado y recibiendo propuestas
                  </p>
                </div>
              </div>
            )}

            {isOwnJob && !isDraft && job.status === 'paused' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 p-4">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-3">
                    ⏸️ Esta publicación está pausada
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Si no la reanuadas o cancelas, se reanudará automáticamente.
                  </p>
                </div>

                {/* Action Buttons for paused */}
                <div className="flex gap-2">
                  <button
                    onClick={handleResumeJob}
                    disabled={actionLoading}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-600 hover:bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                  >
                    {actionLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Reanudar
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowCancelModal(true)}
                    disabled={actionLoading || !canCancelJob()}
                    title={!canCancelJob() ? "No puedes cancelar con menos de 24h de anticipación" : ""}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <XCircle className="h-4 w-4" />
                    Cancelar
                  </button>
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30 p-4">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
                  </div>
                )}
              </div>
            )}

            {isOwnJob && !isDraft && job.status === 'cancelled' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-red-600 bg-red-900/30 p-4">
                  <p className="text-sm font-medium text-red-300 mb-2">
                    ❌ Esta publicación fue cancelada
                  </p>
                  {(job.cancellationReason || job.rejectedReason) && (
                    <div className="mt-3 p-3 bg-red-950/50 rounded-lg border border-red-800">
                      <p className="text-xs text-red-400 font-medium mb-1">Razón:</p>
                      <p className="text-sm text-red-200">{job.cancellationReason || job.rejectedReason}</p>
                    </div>
                  )}
                  {job.cancelledAt && (
                    <p className="text-xs text-red-400 mt-2">
                      Cancelado el {new Date(job.cancelledAt).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  )}
                </div>

                {/* Buttons to edit and delete */}
                <div className="flex gap-3">
                  <button
                    onClick={handleEditJob}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-sky-700"
                  >
                    <Edit className="h-4 w-4" />
                    Editar y Resubir
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-red-600 bg-transparent px-4 py-3 font-semibold text-red-400 transition-colors hover:bg-red-900/30"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                </div>
              </div>
            )}

            {/* Tips */}
            <div className="rounded-2xl border border-sky-300 dark:border-sky-600 bg-sky-50 dark:bg-sky-900/30 p-4">
              <h3 className="mb-2 font-semibold text-sky-700 dark:text-sky-300">💡 Consejo</h3>
              <p className="text-sm text-sky-600 dark:text-sky-200">
                Lee bien la descripción y asegúrate de tener las herramientas
                necesarias antes de aplicar.
              </p>
            </div>
          </div>
        </div>

        {/* Cancel Confirmation Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-red-600 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
                  <XCircle className="h-6 w-6 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  Cancelar Publicación
                </h3>
              </div>

              <div className="mb-6 space-y-4">
                <p className="text-slate-300">
                  ¿Estás seguro de que deseas cancelar esta publicación?
                </p>

                {/* Time remaining info */}
                {getTimeUntilCancelDeadline() && (
                  <div className="rounded-xl border border-amber-600/50 bg-amber-900/20 p-3">
                    <p className="text-sm text-amber-300">
                      <Clock className="inline h-4 w-4 mr-1" />
                      Recuerda: Solo puedes cancelar hasta 24 horas antes del inicio del trabajo.
                      <br />
                      <span className="text-xs text-amber-400 mt-1 block">
                        Tiempo restante: <strong>{getTimeUntilCancelDeadline()}</strong>
                      </span>
                    </p>
                  </div>
                )}

                {/* Reason textarea */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Razón de cancelación (opcional)
                  </label>
                  <textarea
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    placeholder="Ej: Ya no necesito el servicio, encontré otra solución..."
                    rows={3}
                    maxLength={500}
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
                  />
                  <p className="mt-1 text-xs text-slate-500 text-right">
                    {cancellationReason.length}/500
                  </p>
                </div>

                {job.publicationAmount && (
                  <div className="rounded-xl border border-red-600 bg-red-900/30 p-4">
                    <p className="text-sm font-bold text-red-300 mb-2">
                      ⚠️ Advertencia importante:
                    </p>
                    <p className="text-sm text-red-200">
                      Al cancelar la publicación <span className="font-bold">perderás el dinero de la comisión pagada</span>{" "}
                      (${job.publicationAmount?.toLocaleString("es-AR")} ARS). Esta acción no se puede deshacer.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                    setCancellationReason("");
                  }}
                  disabled={actionLoading}
                  className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600 disabled:opacity-50"
                >
                  No, mantener publicado
                </button>
                <button
                  onClick={handleCancelJob}
                  disabled={actionLoading}
                  className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? (
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  ) : (
                    "Sí, cancelar"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-red-600 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
                  <Trash2 className="h-6 w-6 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  Eliminar Trabajo
                </h3>
              </div>

              <div className="mb-6 space-y-4">
                <p className="text-slate-300">
                  ¿Estás seguro de que deseas eliminar este trabajo permanentemente?
                </p>

                <div className="rounded-xl border border-red-600 bg-red-900/30 p-4">
                  <p className="text-sm font-bold text-red-300 mb-2">
                    ⚠️ Advertencia:
                  </p>
                  <p className="text-sm text-red-200">
                    Esta acción eliminará el trabajo permanentemente y no se puede deshacer.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteJob}
                  disabled={deleting}
                  className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? (
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  ) : (
                    "Sí, eliminar"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Select Worker Confirmation Modal */}
        {showSelectConfirmModal && selectedProposal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-green-600 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
                  <CheckCircle className="h-6 w-6 text-green-500" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  Confirmar Selección
                </h3>
              </div>

              <div className="mb-6 space-y-4">
                {/* Selected Worker Preview */}
                <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-800 border border-slate-700">
                  <div className="h-14 w-14 overflow-hidden rounded-full bg-sky-100 ring-2 ring-green-500">
                    <img
                      src={
                        selectedProposal.freelancer?.avatar ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedProposal.freelancer?.name || 'user'}`
                      }
                      alt={selectedProposal.freelancer?.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-white text-lg">
                      {selectedProposal.freelancer?.name || 'Usuario'}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-slate-400">
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                        {selectedProposal.freelancer?.rating?.toFixed(1) || '0.0'}
                      </span>
                      <span>•</span>
                      <span>{selectedProposal.freelancer?.completedJobs || 0} trabajos</span>
                    </div>
                  </div>
                </div>

                <p className="text-slate-300">
                  ¿Estás seguro de que deseas seleccionar a <span className="font-semibold text-white">{selectedProposal.freelancer?.name}</span> para este trabajo?
                </p>

                {selectedProposal.isCounterOffer && (
                  <div className="rounded-xl border border-sky-600 bg-sky-900/30 p-4">
                    <p className="text-sm text-sky-300">
                      <strong>Nota:</strong> Este trabajador propuso una contraoferta de{' '}
                      <span className="font-bold">${selectedProposal.proposedPrice?.toLocaleString('es-AR')} ARS</span>
                    </p>
                  </div>
                )}

                <div className="rounded-xl border border-green-600 bg-green-900/30 p-4">
                  <p className="text-sm text-green-300">
                    <strong>Al confirmar:</strong>
                  </p>
                  <ul className="text-sm text-green-200 mt-2 space-y-1">
                    <li>• Se creará el contrato con el trabajador</li>
                    <li>• El trabajador recibirá una notificación</li>
                    <li>• Las demás postulaciones serán rechazadas</li>
                  </ul>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowSelectConfirmModal(false);
                    setSelectedProposal(null);
                  }}
                  disabled={selectingWorker !== null}
                  className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleSelectWorker(selectedProposal)}
                  disabled={selectingWorker !== null}
                  className="flex-1 rounded-xl bg-gradient-to-r from-green-500 to-green-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selectingWorker !== null ? (
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  ) : (
                    "Confirmar Selección"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
