import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../hooks/useAuth";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Star,
  User,
  DollarSign,
  Loader2,
  CheckCircle,
  MessageCircle,
  AlertCircle,
} from "lucide-react";
import type { Job } from "@/types";
import { getClientInfo } from "@/lib/utils";

export default function JobApplicationSummary() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      navigate("/login", { state: { from: `/jobs/${id}/apply` } });
    }
  }, [loading, user, navigate, id]);

  const handleAccept = async () => {
    if (!user || !job) return;

    setAccepting(true);
    setError(null);

    try {
      const response = await fetch(`/api/proposals/apply-and-accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jobId: job.id || job._id, // Use id for PostgreSQL, fallback to _id for backward compatibility
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Redirect to chat with job context (accepted)
        navigate(`/chat/${data.conversationId}`, {
          state: {
            jobContext: {
              jobId: job.id || job._id,
              title: job.title,
              description: job.description,
              budget: job.price,
              category: job.category,
              accepted: true, // Indicar que ya aceptó las condiciones
            }
          }
        });
      } else {
        setError(data.message || "No se pudo aceptar el trabajo");
      }
    } catch (err: any) {
      setError(err.message || "Error al procesar la solicitud");
    } finally {
      setAccepting(false);
    }
  };

  const handleNegotiate = async () => {
    if (!user || !job) return;

    setAccepting(true);
    setError(null);

    try {
      // Create conversation for negotiation
      const response = await fetch(`/api/proposals/start-negotiation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jobId: job.id || job._id,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Redirect to chat with job context for counter-offer
        navigate(`/chat/${data.conversationId}`, {
          state: {
            jobContext: {
              jobId: job.id || job._id,
              title: job.title,
              description: job.description,
              budget: job.price,
              category: job.category,
              alreadyApplied: data.alreadyApplied || false,
              jobStatus: data.jobStatus || job.status,
            }
          }
        });
      } else {
        setError(data.message || "No se pudo iniciar la negociación");
      }
    } catch (err: any) {
      setError(err.message || "Error al procesar la solicitud");
    } finally {
      setAccepting(false);
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
        <div className="max-w-2xl mx-auto">
          <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-900/20 p-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-600 dark:text-red-400 mx-auto mb-4" />
            <p className="text-red-600 dark:text-red-400 mb-4 text-lg font-medium">
              {error || "Trabajo no encontrado"}
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const clientInfo = getClientInfo(job.client);
  const isOwnJob = user && clientInfo && clientInfo.id === user.id;

  if (isOwnJob) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
            <AlertCircle className="h-12 w-12 text-amber-600 mx-auto mb-4" />
            <p className="text-amber-900 mb-4 text-lg">
              No puedes aplicar a tu propio trabajo
            </p>
            <Link
              to={`/jobs/${job.id || job._id}`}
              className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al trabajo
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Verificar que el trabajo esté abierto para aplicaciones
  if (job.status !== 'open') {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 p-8 text-center">
            <AlertCircle className="h-12 w-12 text-slate-500 dark:text-slate-400 mx-auto mb-4" />
            <p className="text-slate-700 dark:text-slate-300 mb-4 text-lg">
              {job.status === 'pending_approval' && 'Este trabajo está pendiente de aprobación'}
              {job.status === 'in_progress' && 'Este trabajo ya tiene un profesional asignado'}
              {job.status === 'completed' && 'Este trabajo ya fue completado'}
              {job.status === 'cancelled' && 'Este trabajo fue cancelado'}
              {job.status === 'paused' && 'Este trabajo está pausado'}
              {!['pending_approval', 'in_progress', 'completed', 'cancelled', 'paused'].includes(job.status) && 'Este trabajo no está disponible para aplicaciones'}
            </p>
            <Link
              to={`/jobs/${job.id || job._id}`}
              className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al trabajo
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Aplicar a {job.title} - Doers</title>
        <meta name="description" content={`Resumen de aplicación para ${job.title}`} />
      </Helmet>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
        <div className="container mx-auto px-4">
          {/* Back Button - Only visible on mobile */}
          <div className="mb-6 md:hidden">
            <Link
              to={`/jobs/${job.id || job._id}`}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al trabajo
            </Link>
          </div>

          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/30 mb-4">
                <CheckCircle className="h-8 w-8 text-sky-600 dark:text-sky-400" />
              </div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                Resumen de Aplicación
              </h1>
              <p className="text-slate-600 dark:text-slate-400">
                Revisa los detalles antes de confirmar tu aplicación
              </p>
            </div>

            {/* Job Summary Card */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 shadow-lg mb-6">
              {/* Title and Price */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                    {job.title}
                  </h2>
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                    <MapPin className="h-4 w-4" />
                    <span>{job.location}</span>
                  </div>
                </div>
                <div className="rounded-2xl bg-gradient-to-r from-sky-500 to-sky-600 px-6 py-3 text-center">
                  <div className="text-sm text-sky-100">Pago</div>
                  <div className="text-2xl font-bold text-white">
                    ${job.price.toLocaleString("es-AR")}
                  </div>
                </div>
              </div>

              {/* Dates Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-600">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Inicio
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {new Date(job.startDate).toLocaleDateString("es-AR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(job.startDate).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-600">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Fin estimado
                    </p>
                    {job.endDate ? (
                      <>
                        <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                          {new Date(job.endDate).toLocaleDateString("es-AR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(job.endDate).toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </>
                    ) : (
                      <p className="mt-0.5 text-sm font-semibold text-amber-600 dark:text-amber-400">
                        Por definir
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
                  Descripción
                </h3>
                <p className="text-slate-600 dark:text-slate-400 whitespace-pre-line leading-relaxed">
                  {job.description}
                </p>
              </div>

              {/* Client Info */}
              {clientInfo && (
                <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                    Cliente
                  </h3>
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-full bg-sky-100">
                      <img
                        src={
                          clientInfo.avatar ||
                          `https://api.dicebear.com/7.x/avataaars/svg?seed=${clientInfo.name}`
                        }
                        alt={clientInfo.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {clientInfo.name}
                      </p>
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                          <span>{(Number(clientInfo.rating) || 0).toFixed(1)}</span>
                        </div>
                        <span>•</span>
                        <span>{clientInfo.completedJobs || 0} trabajos completados</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Info Banner */}
            <div className="rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-6 mb-6">
              <h3 className="text-lg font-semibold text-sky-900 dark:text-sky-400 mb-3">
                📋 Próximos pasos
              </h3>
              <div className="space-y-2 text-sm text-sky-800 dark:text-sky-300">
                <p>
                  <strong>Aceptar:</strong> Confirmas tu interés en el trabajo con las
                  condiciones actuales. Se creará una conversación automáticamente.
                </p>
                <p>
                  <strong>Chatear/Contraofertar:</strong> Inicia una conversación con el
                  cliente para negociar términos, precio o detalles adicionales.
                </p>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 p-4 mb-6">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-sky-500/30 transition-all hover:from-sky-600 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {accepting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5" />
                    Aceptar Trabajo
                  </>
                )}
              </button>

              <button
                onClick={handleNegotiate}
                disabled={accepting}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-sky-500 bg-white dark:bg-slate-800 px-8 py-4 text-lg font-semibold text-sky-600 dark:text-sky-400 transition-all hover:bg-sky-50 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {accepting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <MessageCircle className="h-5 w-5" />
                    Chatear / Contraofertar
                  </>
                )}
              </button>
            </div>

            {/* Additional Info */}
            <div className="mt-8 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Al aceptar, confirmas que has leído y entendido los términos del trabajo.
                <br />
                Ambas partes recibirán una notificación por email.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
