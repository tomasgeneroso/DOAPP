import { useAuth } from "../hooks/useAuth";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { MapPin, Calendar, Clock, Star } from "lucide-react";
import type { Job } from "@/types";

export default function Index() {
  const { user, isLoading } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const response = await fetch('/api/jobs?status=open&limit=6');
        const data = await response.json();
        if (data.success) {
          setJobs(data.jobs);
        }
      } catch (error) {
        console.error('Error al cargar trabajos:', error);
      } finally {
        setJobsLoading(false);
      }
    };

    fetchJobs();
  }, []);

  return (
    <>
      <Helmet>
        <title>Bienvenido a Doers</title>
        <meta
          name="description"
          content="Doers - La plataforma para conectar clientes con profesionales."
        />
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
            {user ? (
              `¡Hola de nuevo, ${user.name}!`
            ) : (
              <>
                Encuentra al{" "}
                <span className="text-sky-600">profesional perfecto</span>
              </>
            )}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600">
            {isLoading
              ? "Cargando..."
              : user
              ? "¿Listo para empezar un nuevo proyecto o buscar oportunidades? Estás en el lugar correcto."
              : "La plataforma que conecta clientes con los mejores profesionales. Publica un trabajo o encuentra tu próximo proyecto. Fácil, rápido y seguro."}
          </p>
          {!user && !isLoading && (
            <div className="mt-10 flex items-center justify-center gap-x-6">
              <Link
                to="/login"
                className="rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
              >
                Regístrate gratis
              </Link>
              <Link
                to="/login"
                className="text-sm font-semibold leading-6 text-gray-900"
              >
                Iniciar sesión <span aria-hidden="true">→</span>
              </Link>
            </div>
          )}
        </div>

        {/* Lista de trabajos disponibles */}
        <div className="mt-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold text-gray-900">
              Trabajos Disponibles
            </h2>
          </div>

          {jobsLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-sky-500 border-t-transparent"></div>
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No hay trabajos disponibles en este momento.</p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {jobs.map((job) => (
                <Link
                  key={job._id}
                  to={`/jobs/${job._id}`}
                  className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:border-sky-300 hover:shadow-lg"
                >
                  {/* Precio */}
                  <div className="absolute right-4 top-4 rounded-full bg-gradient-to-r from-sky-500 to-sky-600 px-3 py-1 text-sm font-bold text-white shadow-lg shadow-sky-500/30">
                    ${job.price.toLocaleString('es-AR')}
                  </div>

                  {/* Título */}
                  <h3 className="mb-2 pr-20 text-lg font-bold text-slate-900 group-hover:text-sky-600">
                    {job.title}
                  </h3>

                  {/* Rating del cliente */}
                  <div className="mb-3 flex items-center gap-1 text-amber-500">
                    <Star className="h-4 w-4 fill-current" />
                    <span className="ml-1 text-xs text-slate-600">
                      {job.client.rating.toFixed(1)} ({job.client.reviewsCount})
                    </span>
                  </div>

                  {/* Resumen */}
                  <p className="mb-4 line-clamp-2 text-sm text-slate-600">
                    {job.summary}
                  </p>

                  {/* Detalles */}
                  <div className="mt-auto space-y-2 border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <MapPin className="h-4 w-4 text-slate-400" />
                      <span>{job.location}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        <span>{new Date(job.startDate).toLocaleDateString('es-AR')}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4 text-slate-400" />
                        <span>{new Date(job.startDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Hover Button */}
                  <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-r from-sky-500 to-sky-600 py-3 text-center text-sm font-semibold text-white transition-transform group-hover:translate-y-0">
                    Ver detalles
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
