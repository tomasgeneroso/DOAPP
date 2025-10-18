import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdvertisements } from "@/hooks/useAdvertisements";
import Advertisement from "@/components/Advertisement";
import AdPlaceholder from "@/components/AdPlaceholder";
import type { Job } from "@/types";

export const JobsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const { ads, recordImpression, recordClick } = useAdvertisements({
    placement: 'jobs_list',
  });

  useEffect(() => {
    fetchJobs();
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
      const response = await fetch("/api/jobs", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      setJobs(data.jobs || []);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Mix jobs and ads together
  const getMixedContent = () => {
    const mixed: Array<{ type: 'job' | 'ad' | 'ad-placeholder'; data: any; adType?: string }> = [];
    let jobIndex = 0;
    let adIndex = 0;

    // Find if we have a model1 ad
    const model1Ads = ads.filter(ad => ad.adType === 'model1');
    const otherAds = ads.filter(ad => ad.adType !== 'model1');

    // Strategy: ALWAYS show a model1 banner
    // If we have 3+ jobs, show it after the first 3 jobs
    // If we have less than 3 jobs, show it after all jobs

    // Add jobs before the banner (max 3, or all if less than 3)
    const jobsBeforeBanner = Math.min(3, jobs.length);
    for (let i = 0; i < jobsBeforeBanner; i++) {
      mixed.push({ type: 'job', data: jobs[jobIndex] });
      jobIndex++;
    }

    // ALWAYS add a model1 banner (ad or placeholder)
    if (model1Ads.length > 0) {
      mixed.push({ type: 'ad', data: model1Ads[0] });
      adIndex++;
    } else {
      // ALWAYS show placeholder if no real ads
      mixed.push({ type: 'ad-placeholder', data: null, adType: 'model1' });
    }

    // Continue with remaining jobs and other ads
    while (jobIndex < jobs.length) {
      // Add 4 more jobs
      for (let i = 0; i < 4 && jobIndex < jobs.length; i++) {
        mixed.push({ type: 'job', data: jobs[jobIndex] });
        jobIndex++;
      }

      // Add other ads if available, or placeholders
      if (adIndex < ads.length) {
        mixed.push({ type: 'ad', data: ads[adIndex] });
        adIndex++;
      } else if (jobIndex < jobs.length) {
        // Show placeholder only if there are more jobs to display
        mixed.push({ type: 'ad-placeholder', data: null, adType: 'model3' });
      }
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
              {user?.name || "Usuario"}!
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
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Trabajos Disponibles
        </h2>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
          </div>
        ) : jobs.length === 0 ? (
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
                    key={`ad-${item.data._id}`}
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
                  key={`job-${job._id}`}
                  onClick={() => navigate(`/jobs/${job._id}`)}
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
