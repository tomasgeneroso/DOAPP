import { useAuth } from "../hooks/useAuth";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, Calendar, Clock, Star, Briefcase, CheckCircle } from "lucide-react";
import type { Job, User as UserType } from "@/types";
import SearchBar, { SearchFilters } from "../components/SearchBar";
import { useAdvertisements } from "../hooks/useAdvertisements";
import Advertisement from "../components/Advertisement";
import AdPlaceholder from "../components/AdPlaceholder";
import { useSocket } from "../hooks/useSocket";
import { getImageUrl } from "../utils/imageUrl";
import WorkInProgress from "../components/jobs/WorkInProgress";
import { fetchWithAuth } from "../utils/fetchWithAuth";

export default function Index() {
  const { user, isLoading } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [users, setUsers] = useState<UserType[]>([]);
  const [myJobs, setMyJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [searchType, setSearchType] = useState<'jobs' | 'users'>('jobs');
  const { ads, recordImpression, recordClick } = useAdvertisements({
    placement: "jobs_list",
  });
  const { registerJobsRefreshHandler } = useSocket();

  // Handle real-time jobs refresh
  const handleJobsRefresh = useCallback((data?: any) => {
    console.log("🔄 Real-time: Refreshing jobs list", data);
    // Re-fetch jobs without any filters to get latest list
    (async () => {
      try {
        const params = new URLSearchParams({
          status: "open",
          limit: "20",
        });
        const response = await fetch(`/api/jobs?${params.toString()}`);
        const responseData = await response.json();
        if (responseData.success) {
          setJobs(responseData.jobs);
          console.log("✅ Jobs list refreshed:", responseData.jobs.length, "jobs");
        }
      } catch (error) {
        console.error("Error refreshing jobs:", error);
      }
    })();
  }, []);

  // Register socket handler for jobs refresh
  useEffect(() => {
    registerJobsRefreshHandler(handleJobsRefresh);
    return () => {
      // Clear handler on unmount
      registerJobsRefreshHandler(() => {});
    };
  }, [registerJobsRefreshHandler, handleJobsRefresh]);

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

  const fetchUsers = async (query: string) => {
    try {
      setJobsLoading(true);
      const params = new URLSearchParams({
        q: query,
        limit: "20",
      });

      const response = await fetch(`/api/users/search?${params.toString()}`);
      const data = await response.json();
      if (data.success) {
        setUsers(data.users);
      }
    } catch (error) {
      console.error("Error al buscar usuarios:", error);
    } finally {
      setJobsLoading(false);
    }
  };

  const fetchJobs = async (filters?: SearchFilters) => {
    try {
      // Si el tipo de búsqueda es usuarios, buscar usuarios en su lugar
      if (filters?.searchType === 'users') {
        setSearchType('users');
        if (filters.query) {
          await fetchUsers(filters.query);
        } else {
          setUsers([]);
          setJobsLoading(false);
        }
        return;
      }

      setSearchType('jobs');
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

  // Track if we've already checked for expired jobs this session
  const expiredJobsChecked = useRef(false);

  // Check for expired jobs when user loads the page (only once per session)
  useEffect(() => {
    const checkExpiredJobs = async () => {
      if (!user || isLoading || expiredJobsChecked.current) return;

      expiredJobsChecked.current = true;
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetchWithAuth('/api/jobs/check-expired', {
          method: 'POST',
        });
        const data = await response.json();

        if (data.success && data.expiredJobsProcessed > 0) {
          console.log(`⚠️ Processed ${data.expiredJobsProcessed} expired jobs`);
          // Refresh my jobs list to show updated statuses
          fetchMyJobs();
        }
      } catch (error) {
        console.error('Error checking expired jobs:', error);
      }
    };

    checkExpiredJobs();
  }, [user, isLoading]);

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
        <title>DoApp - Plataforma Freelance Argentina | Pagos Seguros con Escrow</title>
        <meta
          name="description"
          content="DoApp es la plataforma freelance argentina donde publicás trabajos o encontrás oportunidades. Pagos seguros con escrow, tu dinero protegido hasta confirmar el trabajo. Comisiones desde 2%. Registrate gratis."
        />
        <meta property="og:url" content="https://doapparg.site/" />
        <meta property="og:image" content="https://doapparg.site/og-image.png" />
        <meta name="twitter:image" content="https://doapparg.site/og-image.png" />
      </Helmet>
      <div className="w-full max-w-[100vw] mx-auto px-3 sm:px-4 py-8 sm:py-12 overflow-x-hidden">
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 dark:text-white px-2">
            {user ? (
              `¡Hola de nuevo, ${user.name}!`
            ) : (
              <>
                Plataforma Freelance Argentina con{" "}
                <span className="text-sky-600">Pagos Seguros</span>
              </>
            )}
          </h1>
          <p className="mx-auto mt-4 sm:mt-6 max-w-2xl text-base sm:text-lg leading-7 sm:leading-8 text-gray-600 dark:text-slate-400 px-2">
            {isLoading
              ? "Cargando..."
              : user
              ? "¿Listo para empezar un nuevo proyecto o buscar oportunidades? Estás en el lugar correcto."
              : "Publicá trabajos y contratá profesionales con garantía de pago. El dinero queda protegido en escrow hasta que confirmés el trabajo completado. Sin riesgos, sin estafas."}
          </p>
          {!user && !isLoading && (
            <p className="mx-auto mt-3 sm:mt-4 max-w-2xl text-sm sm:text-base leading-6 sm:leading-7 text-gray-500 dark:text-slate-500 px-2">
              Nos aseguramos que cada acuerdo se cumpla por ambas partes.
              Publicá un trabajo, negociá directamente con la persona y pagá
              automáticamente solo cuando todo esté verificado.
            </p>
          )}
          {!user && !isLoading && (
            <div className="mt-6 sm:mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 px-4">
              <Link
                to="/register"
                className="w-full max-w-xs sm:w-auto rounded-lg bg-sky-600 px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-semibold text-white shadow-lg hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 transition-all"
              >
                Registrate gratis
              </Link>
              <Link
                to="/login"
                className="w-full max-w-xs sm:w-auto rounded-lg bg-orange-500 px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-semibold text-white shadow-lg hover:bg-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 transition-all"
              >
                Publicá tu primer trabajo
              </Link>
            </div>
          )}
        </div>

        {/* How it works - Para Clientes */}
        <div className="mt-8 sm:mt-12 max-w-6xl mx-auto px-2">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 sm:p-8 border border-slate-200 dark:border-slate-700">
            <h2 className="text-xl sm:text-2xl font-bold text-center text-gray-900 dark:text-white mb-2">
              ¿Necesitás un servicio?
            </h2>
            <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
              Publicá tu trabajo y encontrá profesionales
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-4 overflow-visible pt-4">
              {/* Step 1 */}
              <div className="flex flex-col items-center text-center relative overflow-visible">
                <div className="w-16 h-16 bg-gradient-to-br from-sky-500 to-sky-600 rounded-full flex items-center justify-center shadow-lg mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div className="absolute -top-2 -left-2 w-8 h-8 bg-sky-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md z-10">
                  1
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Publicá
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Publicá tu servicio con los detalles que necesitás
                </p>
                <div className="hidden md:block absolute top-8 -right-4 text-sky-400">
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13.025 1l-2.847 2.828 6.176 6.176h-16.354v3.992h16.354l-6.176 6.176 2.847 2.828 10.975-11z" />
                  </svg>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col items-center text-center relative overflow-visible">
                <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center shadow-lg mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <div className="absolute -top-2 -left-2 w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md z-10">
                  2
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Elegí
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Recibí propuestas y elegí al mejor perfil
                </p>
                <div className="hidden md:block absolute top-8 -right-4 text-orange-400">
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13.025 1l-2.847 2.828 6.176 6.176h-16.354v3.992h16.354l-6.176 6.176 2.847 2.828 10.975-11z" />
                  </svg>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col items-center text-center relative overflow-visible">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div className="absolute -top-2 -left-2 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md z-10">
                  3
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Pagá Seguro
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Tu dinero queda en garantía hasta que el trabajo se complete
                </p>
                <div className="hidden md:block absolute top-8 -right-4 text-purple-400">
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13.025 1l-2.847 2.828 6.176 6.176h-16.354v3.992h16.354l-6.176 6.176 2.847 2.828 10.975-11z" />
                  </svg>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex flex-col items-center text-center relative overflow-visible">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-lg mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="absolute -top-2 -left-2 w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md z-10">
                  4
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  ¡Listo!
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Confirmá el servicio prestado y el pago se libera automáticamente
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* How it works - Para Trabajadores */}
        <div className="mt-6 sm:mt-8 max-w-6xl mx-auto px-2">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-6 sm:p-8 border border-slate-200 dark:border-slate-700">
            <h2 className="text-xl sm:text-2xl font-bold text-center text-gray-900 dark:text-white mb-2">
              ¿Ofrecés servicios?
            </h2>
            <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
              Encontrá trabajos, mostrá tu portfolio y empezá a ganar
            </p>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-4 overflow-visible pt-4">
              {/* Step 1 */}
              <div className="flex flex-col items-center text-center relative overflow-visible">
                <div className="w-16 h-16 bg-gradient-to-br from-sky-500 to-sky-600 rounded-full flex items-center justify-center shadow-lg mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <div className="absolute -top-2 -left-2 w-8 h-8 bg-sky-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md z-10">
                  1
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Buscá
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Explorá trabajos que se ajusten a tus habilidades
                </p>
                <div className="hidden md:block absolute top-8 -right-4 text-sky-400">
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13.025 1l-2.847 2.828 6.176 6.176h-16.354v3.992h16.354l-6.176 6.176 2.847 2.828 10.975-11z" />
                  </svg>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col items-center text-center relative overflow-visible">
                <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center shadow-lg mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div className="absolute -top-2 -left-2 w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md z-10">
                  2
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Aplicá
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Enviá tu propuesta con tu mejor oferta
                </p>
                <div className="hidden md:block absolute top-8 -right-4 text-orange-400">
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13.025 1l-2.847 2.828 6.176 6.176h-16.354v3.992h16.354l-6.176 6.176 2.847 2.828 10.975-11z" />
                  </svg>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col items-center text-center relative overflow-visible">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="absolute -top-2 -left-2 w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md z-10">
                  3
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Trabajá
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Realizá el trabajo con tranquilidad
                </p>
                <div className="hidden md:block absolute top-8 -right-4 text-purple-400">
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13.025 1l-2.847 2.828 6.176 6.176h-16.354v3.992h16.354l-6.176 6.176 2.847 2.828 10.975-11z" />
                  </svg>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex flex-col items-center text-center relative overflow-visible">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-lg mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="absolute -top-2 -left-2 w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md z-10">
                  4
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Cobrá
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Recibí tu pago de forma segura y garantizada
                </p>
              </div>
            </div>

            {/* Payment Methods */}
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
              <div className="flex flex-col items-center justify-center gap-4">
                <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                  Pagos procesados de forma segura:
                </span>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <div className="bg-white px-5 py-3 rounded-lg border-2 border-sky-200 dark:border-sky-800 shadow-md">
                    <img
                      src="/MP_RGB_HANDSHAKE_color_horizontal.svg"
                      alt="MercadoPago - Pagos Seguros"
                      className="h-7 sm:h-9 w-auto"
                    />
                  </div>
                  <div className="bg-white dark:bg-slate-700 px-4 py-3 rounded-lg border-2 border-orange-200 dark:border-orange-800 shadow-md flex items-center gap-2">
                    <svg className="w-6 h-6 text-orange-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23.638 14.904c-1.602 6.43-8.113 10.34-14.542 8.736C2.67 22.05-1.244 15.525.362 9.105 1.962 2.67 8.475-1.243 14.9.358c6.43 1.605 10.342 8.115 8.738 14.546zm-6.35-4.613c.24-1.59-.974-2.45-2.64-3.03l.54-2.153-1.315-.33-.525 2.107c-.345-.087-.705-.167-1.064-.25l.526-2.127-1.32-.33-.54 2.165c-.285-.067-.565-.132-.84-.2l-1.815-.45-.35 1.407s.975.225.955.238c.535.136.63.486.615.766l-1.477 5.92c-.075.166-.24.406-.614.314.015.02-.96-.24-.96-.24l-.66 1.51 1.71.426.93.242-.54 2.19 1.32.327.54-2.17c.36.1.705.19 1.05.273l-.51 2.154 1.32.33.545-2.19c2.24.427 3.93.257 4.64-1.774.57-1.637-.03-2.58-1.217-3.196.854-.193 1.5-.76 1.68-1.93h.01zm-3.01 4.22c-.404 1.64-3.157.75-4.05.53l.72-2.9c.896.23 3.757.67 3.33 2.37zm.41-4.24c-.37 1.49-2.662.735-3.405.55l.654-2.64c.744.18 3.137.52 2.75 2.084v.006z"/>
                    </svg>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Cripto</span>
                  </div>
                  <div className="bg-white dark:bg-slate-700 px-4 py-3 rounded-lg border-2 border-green-200 dark:border-green-800 shadow-md flex items-center gap-2">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Transferencia</span>
                  </div>
                </div>

                {/* Payment Benefits */}
                <div className="mt-4 text-center max-w-xl">
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-semibold text-sky-600 dark:text-sky-400">Pagos rápidos:</span> Al usar Mercado Pago, los pagos de los trabajos se acreditarán dentro de las 48 horas posteriores a la finalización del trabajo, sin comisiones bancarias.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-8 sm:mt-12 max-w-4xl mx-auto px-2" data-onboarding="search">
          <SearchBar
            onSearch={handleSearch}
            onSearchChange={handleSearchChange}
          />

          {/* Texto de apoyo - Visible siempre */}
          {!isLoading && (
            <div className="mt-6 sm:mt-8 text-center px-2">
              <div className="inline-flex items-start sm:items-center justify-center gap-2 px-4 sm:px-6 py-3 sm:py-4 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg max-w-full">
                <svg
                  className="w-5 h-5 sm:w-6 sm:h-6 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5 sm:mt-0"
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
                  <p className="text-xs sm:text-sm font-semibold text-sky-900 dark:text-sky-300">
                    En DoApp, cada contrato queda protegido:
                  </p>
                  <p className="text-[11px] sm:text-xs text-sky-700 dark:text-sky-400 mt-1">
                    el dinero se mantiene en garantía hasta que ambas partes
                    confirman que el trabajo fue entregado. Así, vos y el
                    profesional están seguros en todo momento.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Trabajo en Proceso - Only show for authenticated users */}
        {user && <WorkInProgress />}

        {/* Mis Trabajos Publicados */}
        {user && myJobs.length > 0 && (
          <div className="mt-10 sm:mt-16 px-2">
            <div className="flex items-center justify-between mb-6 sm:mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                Mis Trabajos Publicados
              </h2>
              <Link
                to="/my-jobs"
                className="text-xs sm:text-sm text-sky-600 hover:text-sky-700 font-semibold whitespace-nowrap"
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

        {/* Lista de usuarios (cuando se busca usuarios) */}
        {searchType === 'users' && (
          <div className="mt-10 sm:mt-16 px-2">
            <div className="flex items-center justify-between mb-6 sm:mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                Usuarios
              </h2>
            </div>

            {jobsLoading ? (
              <div className="flex justify-center py-12">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-solid border-sky-500 border-t-transparent"></div>
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-slate-400">
                  Escribí un nombre o @usuario para buscar.
                </p>
              </div>
            ) : (
              <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {users.map((userResult) => (
                  <Link
                    key={`user-${userResult.id}`}
                    to={userResult.username ? `/u/${userResult.username}` : `/profile/${userResult.id}`}
                    className="group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm transition-all hover:border-sky-300 hover:shadow-lg"
                  >
                    {/* Avatar y nombre */}
                    <div className="flex items-center gap-4">
                      <img
                        src={getImageUrl(userResult.avatar)}
                        alt={userResult.name}
                        className="w-16 h-16 rounded-full object-cover border-2 border-slate-200 dark:border-slate-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-sky-600 truncate">
                            {userResult.name}
                          </h3>
                          {userResult.membershipTier === "pro" && userResult.hasMembership && (
                            <span className="px-1.5 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded flex-shrink-0">
                              PRO
                            </span>
                          )}
                          {userResult.isPremiumVerified && (
                            <CheckCircle className="h-4 w-4 text-blue-500 flex-shrink-0" />
                          )}
                        </div>
                        {userResult.username && (
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            @{userResult.username}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Bio */}
                    {userResult.bio && (
                      <p className="mt-4 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                        {userResult.bio}
                      </p>
                    )}

                    {/* Stats */}
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center gap-4">
                      <div className="flex items-center gap-1 text-amber-500">
                        <Star className="h-4 w-4 fill-current" />
                        <span className="text-sm font-medium">{(typeof userResult.rating === 'number' ? userResult.rating : parseFloat(userResult.rating) || 0).toFixed(1)}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          ({userResult.reviewsCount || 0})
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        <Briefcase className="h-4 w-4" />
                        <span className="text-sm">{userResult.completedJobs || 0} trabajos</span>
                      </div>
                    </div>

                    {/* Hover Button */}
                    <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-r from-sky-500 to-sky-600 py-3 text-center text-sm font-semibold text-white transition-transform group-hover:translate-y-0">
                      Ver perfil
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Lista de trabajos disponibles */}
        {searchType === 'jobs' && (
          <div className="mt-10 sm:mt-16 px-2" data-onboarding="jobs-list">
            <div className="flex items-center justify-between mb-6 sm:mb-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
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
                            {(typeof job.client.rating === 'number' ? job.client.rating : parseFloat(job.client.rating) || 0).toFixed(1)} (
                            {job.client.reviewsCount || 0})
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
        )}
      </div>
    </>
  );
}
