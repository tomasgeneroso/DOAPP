import { useAuth } from "../hooks/useAuth";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { MapPin, Calendar, Clock, Star } from "lucide-react";
import type { Job } from "@/types";
import SearchBar, { SearchFilters } from "../components/SearchBar";
import { useAdvertisements } from "../hooks/useAdvertisements";
import Advertisement from "../components/Advertisement";
import AdPlaceholder from "../components/AdPlaceholder";

export default function Index() {
  const { user, isLoading } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const { ads, recordImpression, recordClick } = useAdvertisements({
    placement: "jobs_list",
  });

  const fetchMyJobs = async () => {
    if (!user?.id) {
      console.log('❌ No user ID available for fetchMyJobs');
      return;
    }

    try {
      console.log('🔍 Fetching my jobs for user:', user.id);
      const response = await fetch(`/api/jobs`);
      const data = await response.json();

      if (data.success) {
        console.log('📥 All jobs from API:', data.jobs.length);

        // Filter my jobs (all statuses)
        const myJobsList = data.jobs.filter((job: Job) => {
          const clientId = typeof job.client === 'string' ? job.client : job.client?.id;
          const isMyJob = clientId === user.id;

          if (isMyJob) {
            console.log('✅ Found my job:', job.title, 'status:', job.status);
          }

          return isMyJob;
        });

        console.log('📊 My jobs filtered:', myJobsList.length);
        setMyJobs(myJobsList);
      }
    } catch (error) {
      console.error("Error al cargar mis trabajos:", error);
    }
  };

  const fetchJobs = async (filters?: SearchFilters) => {
    try {
      setJobsLoading(true);
      const params = new URLSearchParams({
        status: "open",
        limit: "20",
      });

      if (filters) {
        if (filters.query) params.append("query", filters.query);
        if (filters.location) params.append("location", filters.location);
        if (filters.category) params.append("category", filters.category);
        if (filters.tags.length > 0)
          params.append("tags", filters.tags.join(","));
        if (filters.minBudget)
          params.append("minPrice", filters.minBudget.toString());
        if (filters.maxBudget)
          params.append("maxPrice", filters.maxBudget.toString());
        if (filters.sortBy) params.append("sortBy", filters.sortBy);
      }

      const response = await fetch(`/api/jobs?${params.toString()}`);
      const data = await response.json();
      if (data.success) {
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error("Error al cargar trabajos:", error);
    } finally {
      setJobsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // Fetch my jobs only when user is loaded
  useEffect(() => {
    if (user && !isLoading) {
      fetchMyJobs();
    }
  }, [user, isLoading]);

  const handleSearch = (filters: SearchFilters) => {
    fetchJobs(filters);
  };

  // Real-time search
  const handleSearchChange = (filters: SearchFilters) => {
    fetchJobs(filters);
  };

  // Mix jobs and ads together - one ad every 2 rows (6 jobs), never consecutive ads
  const getMixedContent = () => {
    const mixed: Array<{
      type: "job" | "ad" | "ad-placeholder";
      data: any;
      adType?: string;
    }> = [];
    let jobIndex = 0;
    let adIndex = 0;

    const JOBS_PER_ROW = 3; // Grid has 3 columns on desktop
    const ROWS_BETWEEN_ADS = 2; // Show ad every 2 rows
    const JOBS_BETWEEN_ADS = JOBS_PER_ROW * ROWS_BETWEEN_ADS; // 6 jobs minimum between ads

    while (jobIndex < jobs.length) {
      // Add at least 3 jobs before any ad
      const minJobsBeforeAd = 3;
      for (let i = 0; i < minJobsBeforeAd && jobIndex < jobs.length; i++) {
        mixed.push({ type: "job", data: jobs[jobIndex] });
        jobIndex++;
      }

      // Add ad only if we have enough jobs left (at least 3 more jobs to show after)
      const hasEnoughJobsForAd = jobs.length - jobIndex >= 3;

      if (hasEnoughJobsForAd && jobIndex >= JOBS_BETWEEN_ADS * (adIndex + 1)) {
        if (adIndex < ads.length) {
          mixed.push({ type: "ad", data: ads[adIndex] });
          adIndex++;
        } else {
          // Random ad type for placeholder
          const adTypes: Array<'model1' | 'model2' | 'model3'> = ['model1', 'model2', 'model3'];
          const randomAdType = adTypes[Math.floor(Math.random() * adTypes.length)];
          mixed.push({ type: "ad-placeholder", data: null, adType: randomAdType });
        }

        // Add at least 3 more jobs after the ad
        for (let i = 0; i < minJobsBeforeAd && jobIndex < jobs.length; i++) {
          mixed.push({ type: "job", data: jobs[jobIndex] });
          jobIndex++;
        }
      }
    }

    // Add remaining jobs if any
    while (jobIndex < jobs.length) {
      mixed.push({ type: "job", data: jobs[jobIndex] });
      jobIndex++;
    }

    return mixed;
  };

  return (
    <>
      <Helmet>
        <title>Doers - La forma segura de contratar y trabajar</title>
        <meta
          name="description"
          content="Do – La forma segura de contratar y trabajar. La plataforma argentina que asegura que cada acuerdo se cumpla con garantía de dinero."
        />
      </Helmet>
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-5xl md:text-6xl">
            {user ? (
              `¡Hola de nuevo, ${user.name}!`
            ) : (
              <>
                Encontrá al{" "}
                <span className="text-sky-600">profesional perfecto.</span>
              </>
            )}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600 dark:text-slate-400">
            {isLoading
              ? "Cargando..."
              : user
              ? "¿Listo para empezar un nuevo proyecto o buscar oportunidades? Estás en el lugar correcto."
              : "En Doers, conectamos personas que necesitan servicios con quienes saben hacerlos. \n Garantizamos que el trabajo se complete o te devolvemos el dinero. Rápido, fácil y 100% seguro."}
          </p>
          {!user && !isLoading && (
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-gray-500 dark:text-slate-500">
              La plataforma argentina que asegura que cada acuerdo se cumpla.
              Publicá un trabajo, negociá directamente con el profesional y pagá
              solo cuando todo esté verificado.
            </p>
          )}
          {!user && !isLoading && (
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/register"
                className="w-full sm:w-auto rounded-lg bg-sky-600 px-6 py-3 text-base font-semibold text-white shadow-lg hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 transition-all"
              >
                Registrate gratis
              </Link>
              <Link
                to="/login"
                className="w-full sm:w-auto rounded-lg bg-orange-500 px-6 py-3 text-base font-semibold text-white shadow-lg hover:bg-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 transition-all"
              >
                Publicá tu primer trabajo
              </Link>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div className="mt-12 max-w-4xl mx-auto">
          <SearchBar
            onSearch={handleSearch}
            onSearchChange={handleSearchChange}
          />

          {/* Texto de apoyo - Visible siempre */}
          {!isLoading && (
            <div className="mt-8 text-center">
              <div className="inline-flex items-center justify-center gap-2 px-6 py-4 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg">
                <svg
                  className="w-6 h-6 text-sky-600 dark:text-sky-400 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
                <div className="text-left">
                  <p className="text-sm font-semibold text-sky-900 dark:text-sky-300">
                    En Doers, cada contrato queda protegido:
                  </p>
                  <p className="text-xs text-sky-700 dark:text-sky-400 mt-1">
                    el dinero se mantiene en garantía hasta que ambas partes
                    confirman que el trabajo fue entregado. Así, vos y el
                    profesional están seguros en todo momento.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mis Trabajos Publicados */}
        {user && myJobs.length > 0 && (
          <div className="mt-16">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                Mis Trabajos Publicados
              </h2>
              <Link
                to="/contracts"
                className="text-sm text-sky-600 hover:text-sky-700 font-semibold"
              >
                Ver todos ({myJobs.length})
              </Link>
            </div>
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {myJobs.slice(0, 3).map((job) => (
                <Link
                  key={`my-job-${job.id}`}
                  to={`/jobs/${job.id}`}
                  className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 border-orange-400 dark:border-orange-500 bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 p-6 shadow-md transition-all hover:shadow-xl"
                >
                  {/* Badge de estado */}
                  <div className="absolute top-4 left-4 z-10">
                    <span className="px-3 py-1 text-xs font-bold bg-orange-500 text-white rounded-full">
                      TU TRABAJO
                    </span>
                  </div>

                  {/* Precio */}
                  <div className="absolute right-4 top-4 rounded-full bg-gradient-to-r from-orange-500 to-orange-600 px-3 py-1 text-sm font-bold text-white shadow-lg">
                    ${job.price.toLocaleString("es-AR")}
                  </div>

                  {/* Título */}
                  <h3 className="mb-2 mt-8 pr-20 text-lg font-bold text-orange-900 dark:text-orange-100 group-hover:text-orange-700">
                    {job.title}
                  </h3>

                  {/* Resumen */}
                  <p className="mb-4 line-clamp-2 text-sm text-orange-800 dark:text-orange-200">
                    {job.summary}
                  </p>

                  {/* Estado */}
                  <div className="mt-auto pt-4 border-t border-orange-200 dark:border-orange-700">
                    <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${
                      job.status === 'open' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                      job.status === 'draft' ? 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' :
                      job.status === 'pending_payment' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' :
                      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                    }`}>
                      {job.status === 'open' ? '✓ Publicado' :
                       job.status === 'draft' ? '📝 Borrador' :
                       job.status === 'pending_payment' ? '⏳ Pendiente de pago' :
                       job.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Lista de trabajos disponibles */}
        <div className="mt-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
              Trabajos Disponibles
            </h2>
          </div>

          {jobsLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-sky-500 border-t-transparent"></div>
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">
                No hay trabajos disponibles en este momento.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 auto-rows-[minmax(200px,auto)] grid-flow-dense">
              {getMixedContent().map((item, index) => {
                if (item.type === "ad") {
                  return (
                    <Advertisement
                      key={`ad-${item.data.id}`}
                      ad={item.data}
                      onImpression={recordImpression}
                      onClick={recordClick}
                    />
                  );
                }

                if (item.type === "ad-placeholder") {
                  return (
                    <AdPlaceholder
                      key={`ad-placeholder-${index}`}
                      adType={item.adType as any}
                    />
                  );
                }

                const job = item.data;
                return (
                  <Link
                    key={`job-${job.id}`}
                    to={`/jobs/${job.id}`}
                    className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm transition-all hover:border-sky-300 hover:shadow-lg"
                  >
                    {/* Precio */}
                    <div className="absolute right-4 top-4 rounded-full bg-gradient-to-r from-sky-500 to-sky-600 px-3 py-1 text-sm font-bold text-white shadow-lg shadow-sky-500/30">
                      ${job.price.toLocaleString("es-AR")}
                    </div>

                    {/* Título */}
                    <h3 className="mb-2 pr-20 text-lg font-bold text-slate-900 dark:text-white group-hover:text-sky-600">
                      {job.title}
                    </h3>

                    {/* Rating del cliente */}
                    {job.client && (
                      <div className="mb-3 flex items-center gap-1 text-amber-500">
                        <Star className="h-4 w-4 fill-current" />
                        <span className="ml-1 text-xs text-slate-600 dark:text-slate-400">
                          {job.client.rating.toFixed(1)} (
                          {job.client.reviewsCount})
                        </span>
                      </div>
                    )}

                    {/* Resumen */}
                    <p className="mb-4 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                      {job.summary}
                    </p>

                    {/* Detalles */}
                    <div className="mt-auto space-y-2 border-t border-slate-100 dark:border-slate-700 pt-4">
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <MapPin className="h-4 w-4 text-slate-400" />
                        <span>{job.location}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-4 w-4 text-slate-400" />
                          <span>
                            {new Date(job.startDate).toLocaleDateString(
                              "es-AR",
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4 text-slate-400" />
                          <span>
                            {new Date(job.startDate).toLocaleTimeString(
                              "es-AR",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Hover Button */}
                    <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-r from-sky-500 to-sky-600 py-3 text-center text-sm font-semibold text-white transition-transform group-hover:translate-y-0">
                      Ver detalles
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
