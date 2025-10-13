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
} from "lucide-react";
import type { Job } from "@/types";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
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

  const handleApply = async () => {
    if (!user) {
      navigate("/login", { state: { from: `/jobs/${id}` } });
      return;
    }

    if (!job) return;

    setApplying(true);
    setError(null);

    try {
      // Create or get conversation with job owner
      const response = await fetch(`/api/jobs/${id}/start-conversation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        // Redirect to chat with the conversation ID
        navigate(`/chat/${data.conversationId}`);
      } else {
        setError(data.message || "No se pudo iniciar la conversación");
      }
    } catch (err: any) {
      setError(err.message || "Error al iniciar conversación");
    } finally {
      setApplying(false);
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

  const isOwnJob = user && job.client._id === user.id;
  const hasDoer = !!job.doer;

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
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex-1">
                  <h1 className="mb-2 text-2xl font-bold text-slate-900 sm:text-3xl">
                    {job.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
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

              <div className="my-4 h-px bg-slate-200"></div>

              {/* Time Info */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Fecha de inicio
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">
                      {new Date(job.startDate).toLocaleDateString("es-AR")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Hora de inicio
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">
                      {new Date(job.startDate).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Fecha de fin
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">
                      {new Date(job.endDate).toLocaleDateString("es-AR")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      Hora de fin
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">
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
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-bold text-slate-900">
                Descripción del trabajo
              </h2>
              <p className="whitespace-pre-line leading-relaxed text-slate-600">
                {job.description}
              </p>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Client Info */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-900">
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
                  <p className="font-semibold text-slate-900">
                    {job.client.name}
                  </p>
                  <div className="flex items-center gap-1 text-sm text-slate-600">
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                    <span>
                      {job.client.rating.toFixed(1)} ({job.client.reviewsCount}{" "}
                      reviews)
                    </span>
                  </div>
                </div>
              </div>
              <div className="my-4 h-px bg-slate-200"></div>
              <div className="space-y-2 text-sm text-slate-600">
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
                  onClick={handleApply}
                  disabled={applying}
                  className="mt-4 w-full gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <MessageSquare className="inline h-4 w-4 mr-2" />
                  Enviar mensaje
                </button>
              )}
            </div>

            {/* Action Buttons */}
            {!isOwnJob && (
              <div className="space-y-3">
                {hasDoer ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
                    <p className="text-sm font-medium text-amber-900">
                      Este trabajo ya tiene un profesional asignado
                    </p>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={handleApply}
                      disabled={applying}
                      className="w-full gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-6 py-3 text-lg font-semibold text-white shadow-lg shadow-sky-500/30 transition-all hover:from-sky-600 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {applying ? (
                        <>
                          <Loader2 className="inline h-5 w-5 mr-2 animate-spin" />
                          Iniciando chat...
                        </>
                      ) : user ? (
                        "Aplicar y enviar propuesta"
                      ) : (
                        "Inicia sesión para aplicar"
                      )}
                    </button>
                    {error && (
                      <p className="text-sm text-red-600 text-center">{error}</p>
                    )}
                  </>
                )}
              </div>
            )}

            {isOwnJob && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <p className="text-sm font-medium text-sky-900">
                  Este es tu trabajo publicado
                </p>
              </div>
            )}

            {/* Tips */}
            <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
              <h3 className="mb-2 font-semibold text-sky-900">💡 Consejo</h3>
              <p className="text-sm text-sky-800">
                Lee bien la descripción y asegúrate de tener las herramientas
                necesarias antes de aplicar.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
