import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../hooks/useAuth";
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
  XCircle,
} from "lucide-react";
import type { Job } from "@/types";
import MultipleRatings from "../components/user/MultipleRatings";

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
  const [actionLoading, setActionLoading] = useState(false);

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
      });

      const data = await response.json();

      if (data.success) {
        setShowCancelModal(false);
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
        {/* Back Button */}
        <div className="mb-6">
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
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex-1">
                  <h1 className="mb-2 text-2xl font-bold text-white sm:text-3xl">
                    {job.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      <span>{job.location}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                      {job.client.rating.toFixed(1)}
                    </span>
                  </div>
                </div>
                <div className="rounded-full bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-2 text-xl font-bold text-white shadow-lg shadow-sky-500/30">
                  ${job.price.toLocaleString("es-AR")}
                </div>
              </div>

              <div className="my-4 h-px bg-slate-700"></div>

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
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-800 p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-bold text-white">
                Descripción del trabajo
              </h2>
              <p className="whitespace-pre-line leading-relaxed text-slate-300">
                {job.description}
              </p>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Client Info */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-800 p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-white">
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
                  <p className="font-semibold text-white">
                    {job.client.name}
                  </p>
                  <div className="flex items-center gap-1 text-sm text-slate-300">
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                    <span>
                      {job.client.rating.toFixed(1)} ({job.client.reviewsCount}{" "}
                      reviews)
                    </span>
                  </div>
                </div>
              </div>
              <div className="my-4 h-px bg-slate-700"></div>

              {/* Multiple Ratings Display */}
              <div className="mb-4">
                <MultipleRatings user={job.client} size="sm" />
              </div>

              <div className="space-y-2 text-sm text-slate-300">
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
                  className="mt-4 w-full gap-2 rounded-xl border border-slate-600 bg-slate-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
            {!isOwnJob && (
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
              </div>
            )}

            {isOwnJob && !isDraft && job.status === 'open' && (
              <div className="space-y-3">
                <button
                  onClick={handlePauseJob}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-3 text-lg font-semibold text-white shadow-lg shadow-amber-500/30 transition-all hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Pause className="h-5 w-5" />
                      Pausar Publicación
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowCancelModal(true)}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-6 py-3 text-lg font-semibold text-white shadow-lg shadow-red-500/30 transition-all hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <XCircle className="h-5 w-5" />
                  Cancelar Publicación
                </button>
                {error && (
                  <div className="rounded-2xl border border-red-600 bg-red-900/30 p-4">
                    <p className="text-sm font-medium text-red-300">{error}</p>
                  </div>
                )}
                <div className="rounded-2xl border border-sky-600 bg-sky-900/30 p-4">
                  <p className="text-sm font-medium text-sky-300">
                    ✅ Este trabajo está publicado y recibiendo propuestas
                  </p>
                </div>
              </div>
            )}

            {isOwnJob && !isDraft && job.status === 'paused' && (
              <div className="rounded-2xl border border-amber-600 bg-amber-900/30 p-4">
                <p className="text-sm font-medium text-amber-300">
                  ⏸️ Esta publicación está pausada
                </p>
              </div>
            )}

            {isOwnJob && !isDraft && job.status === 'cancelled' && (
              <div className="rounded-2xl border border-red-600 bg-red-900/30 p-4">
                <p className="text-sm font-medium text-red-300">
                  ❌ Esta publicación fue cancelada
                </p>
              </div>
            )}

            {/* Tips */}
            <div className="rounded-2xl border border-sky-600 bg-sky-900/30 p-4">
              <h3 className="mb-2 font-semibold text-sky-300">💡 Consejo</h3>
              <p className="text-sm text-sky-200">
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
                  onClick={() => setShowCancelModal(false)}
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
      </div>
    </>
  );
}
