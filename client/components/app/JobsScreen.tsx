import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import { useAdvertisements } from "@/hooks/useAdvertisements";
import { SkeletonJobCard } from "@/components/ui/Skeleton";
import Advertisement from "@/components/Advertisement";
import AdPlaceholder from "@/components/AdPlaceholder";
import UserNameWithBadge from "@/components/user/UserNameWithBadge";
import type { Job } from "@/types";

export const JobsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { registerJobsRefreshHandler, registerJobUpdateHandler } = useSocket();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const { ads, recordImpression, recordClick } = useAdvertisements({
    placement: 'jobs_list',
  });

  useEffect(() => {
    fetchJobs();

    // Register real-time event handlers
    registerJobsRefreshHandler(() => {
      console.log("🔄 Jobs list refreshing due to real-time event...");
      fetchJobs();
    });

    registerJobUpdateHandler((data: any) => {
      console.log("💼 Job update detected:", data);
      fetchJobs();
    });
  }, []);

  // Debug: log ads and mixed content
  useEffect(() => {
    console.log('Advertisements loaded:', ads);
    console.log('Jobs loaded:', jobs);
    if (jobs.length > 0) {
      const mixed = getMixedContent();
      console.log('Mixed content:', mixed);
    }
  }, [ads, jobs]);

  const fetchJobs = async () => {
    try {
      const token = localStorage.getItem("token");
      // Fetch ALL jobs (including user's own jobs in any status)
      const response = await fetch("/api/jobs", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      console.log('📥 Jobs fetched from API:', data.jobs);
      setJobs(data.jobs || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar trabajos del usuario y otros trabajos
  // En Job model, el campo es "client" no "postedBy"
  const myJobs = jobs.filter((job) => {
    // Handle both populated and non-populated client field
    // Support both PostgreSQL (id) and MongoDB (_id) for compatibility
    const clientId = typeof job.client === 'string' ? job.client : (job.client?.id || job.client?._id);
    const userId = user?.id || user?._id;
    const isMyJob = clientId === userId;

    console.log('🔍 Checking job:', {
      jobId: job.id || job._id,
      jobTitle: job.title,
      jobStatus: job.status,
      client: job.client,
      clientId: clientId,
      userId: userId,
      isMyJob
    });

    return isMyJob;
  });

  // Show only "open" status jobs to others (exclude drafts and pending payment)
  const otherJobs = jobs.filter((job) => {
    const clientId = typeof job.client === 'string' ? job.client : (job.client?.id || job.client?._id);
    const userId = user?.id || user?._id;
    const isNotMyJob = clientId !== userId;
    const isOpen = job.status === 'open';
    return isNotMyJob && isOpen;
  });

  console.log('📊 Filter results:', {
    totalJobs: jobs.length,
    myJobs: myJobs.length,
    myJobsDetails: myJobs.map(j => ({ title: j.title, status: j.status })),
    otherJobs: otherJobs.length,
    userId: user?._id
  });

  // Mix jobs and ads together (only for other jobs, not user's jobs)
  // Show one ad every 4 jobs, never consecutive ads
  const getMixedContent = () => {
    const mixed: Array<{ type: 'job' | 'ad' | 'ad-placeholder'; data: any; adType?: string }> = [];
    let jobIndex = 0;
    let adIndex = 0;

    const JOBS_BETWEEN_ADS = 4; // Show ad every 4 jobs minimum

    while (jobIndex < otherJobs.length) {
      // Add at least 2 jobs before any ad
      const minJobsBeforeAd = 2;
      for (let i = 0; i < minJobsBeforeAd && jobIndex < otherJobs.length; i++) {
        mixed.push({ type: 'job', data: otherJobs[jobIndex] });
        jobIndex++;
      }

      // Add ad only if we have enough jobs left (at least 2 more jobs to show after)
      const hasEnoughJobsForAd = otherJobs.length - jobIndex >= 2;

      if (hasEnoughJobsForAd && jobIndex >= JOBS_BETWEEN_ADS * (adIndex + 1)) {
        if (adIndex < ads.length) {
          mixed.push({ type: 'ad', data: ads[adIndex] });
          adIndex++;
        } else {
          // Random ad type for placeholder
          const adTypes: Array<'model1' | 'model2' | 'model3'> = ['model1', 'model2', 'model3'];
          const randomAdType = adTypes[Math.floor(Math.random() * adTypes.length)];
          mixed.push({ type: 'ad-placeholder', data: null, adType: randomAdType });
        }

        // Add at least 2 more jobs after the ad
        for (let i = 0; i < minJobsBeforeAd && jobIndex < otherJobs.length; i++) {
          mixed.push({ type: 'job', data: otherJobs[jobIndex] });
          jobIndex++;
        }
      }
    }

    // Add remaining jobs if any
    while (jobIndex < otherJobs.length) {
      mixed.push({ type: 'job', data: otherJobs[jobIndex] });
      jobIndex++;
    }

    return mixed;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 px-5 pt-16 pb-6 rounded-b-3xl shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <div>
            <p className="text-base text-gray-600 dark:text-gray-400 mb-1">
              ¡Hola de nuevo,
            </p>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {user ? <UserNameWithBadge user={user} badgeSize="lg" /> : "Usuario"}!
            </h1>
          </div>

          <button
            onClick={() => navigate("/profile")}
            className="w-12 h-12 rounded-full border-2 border-orange-500 bg-white dark:bg-gray-700 flex items-center justify-center"
          >
            <span className="text-xl font-bold text-orange-500">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </span>
          </button>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 leading-5 mt-2">
          ¿Listo para empezar un nuevo proyecto o buscar oportunidades?
        </p>
      </header>

      {/* Botón Publicar */}
      <div className="px-5 -mt-6 mb-6">
        <button
          onClick={() => navigate("/create-contract")}
          className="w-full h-14 px-6 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition-all duration-150 active:scale-95"
        >
          Publicar trabajo
        </button>
      </div>

      {/* Contenido */}
      <div className="px-5 pb-24">
        {/* Mis Trabajos Publicados */}
        {!loading && myJobs.length > 0 && (
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Mis Trabajos Publicados
              </h2>
              {myJobs.length > 3 && (
                <button
                  onClick={() => navigate("/my-jobs")}
                  className="text-sm text-orange-500 hover:text-orange-600 font-semibold"
                >
                  Ver todos ({myJobs.length})
                </button>
              )}
            </div>
            <div className="space-y-4">
              {myJobs.slice(0, 3).map((job) => {
                const isDraft = job.status === 'draft' || job.status === 'pending_payment';

                return (
                  <div
                    key={`my-job-${job.id || job._id}`}
                    className="w-full p-5 rounded-2xl bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-2 border-orange-200 dark:border-orange-700 hover:shadow-md transition-all"
                  >
                    <button
                      onClick={() => navigate(`/jobs/${job.id || job._id}`)}
                      className="w-full text-left"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-1 rounded-lg bg-orange-500 text-white text-xs font-bold">
                            TU TRABAJO
                          </span>
                          {isDraft && (
                            <span className="px-2 py-1 rounded-lg bg-yellow-500 text-white text-xs font-bold">
                              BORRADOR
                            </span>
                          )}
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                            {job.title}
                          </h3>
                        </div>
                        <span className="px-3 py-1 rounded-full bg-orange-500 text-white font-bold text-sm whitespace-nowrap">
                          ${job.budget?.toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 line-clamp-2">
                        {job.description}
                      </p>
                      <div className="flex justify-between text-xs">
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">
                            Inicio:{" "}
                          </span>
                          <span className="text-gray-900 dark:text-white font-semibold">
                            {new Date(job.startDate).toLocaleDateString("es-ES")}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600 dark:text-gray-400">
                            Fin:{" "}
                          </span>
                          <span className="text-gray-900 dark:text-white font-semibold">
                            {job.endDate ? new Date(job.endDate).toLocaleDateString("es-ES") : 'Por definir'}
                          </span>
                        </div>
                      </div>
                    </button>

                    {/* Publish button for drafts */}
                    {isDraft && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/jobs/${job.id || job._id}/payment`);
                        }}
                        className="mt-3 w-full px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg transition-all active:scale-95"
                      >
                        📢 Publicar y Pagar
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Trabajos Disponibles */}
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Trabajos Disponibles
        </h2>

        {loading ? (
          <div className="space-y-4">
            {[...Array(6)].map((_, i) => (
              <SkeletonJobCard key={i} />
            ))}
          </div>
        ) : otherJobs.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-full bg-orange-100 dark:bg-orange-900 flex items-center justify-center mx-auto mb-4">
              <span className="text-4xl">📋</span>
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              No hay trabajos disponibles
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              en este momento.
            </p>
            <button
              onClick={() => navigate("/create-contract")}
              className="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-all active:scale-95"
            >
              Publicar el primero
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {getMixedContent().map((item, index) => {
              console.log('Rendering item:', item.type, item.adType);

              if (item.type === 'ad') {
                return (
                  <Advertisement
                    key={`ad-${item.data.id || item.data._id}`}
                    ad={item.data}
                    onImpression={recordImpression}
                    onClick={recordClick}
                  />
                );
              }

              if (item.type === 'ad-placeholder') {
                console.log('Rendering AdPlaceholder with type:', item.adType);
                return <AdPlaceholder key={`ad-placeholder-${index}`} adType={item.adType as any} />;
              }

              const job = item.data;
              return (
                <button
                  key={`job-${job.id || job._id}`}
                  onClick={() => navigate(`/jobs/${job.id || job._id}`)}
                  className="w-full p-5 rounded-2xl text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-sm transition-all active:scale-[0.98]"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white pr-4">
                      {job.title}
                    </h3>
                    <span className="px-3 py-1 rounded-full bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-300 font-bold text-sm whitespace-nowrap">
                      ${job.budget?.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                    {job.description}
                  </p>
                  <div className="flex justify-between text-xs">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">
                        Inicio:{" "}
                      </span>
                      <span className="text-gray-900 dark:text-white font-semibold">
                        {new Date(job.startDate).toLocaleDateString("es-ES")}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">
                        Fin:{" "}
                      </span>
                      <span className="text-gray-900 dark:text-white font-semibold">
                        {new Date(job.endDate).toLocaleDateString("es-ES")}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
