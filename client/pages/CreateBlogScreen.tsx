import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import CreatePost from "../components/user/CreatePost";
import { useAuth } from "../hooks/useAuth";
import { ArrowLeft } from "lucide-react";

export default function CreateBlogScreen() {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login?redirect=/blog/create");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <Helmet>
        <title>{t('profile.writeArticle')} - {t('profile.articles')} | DOAPP</title>
        <meta name="description" content={t('profile.writeArticle')} />
      </Helmet>

      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={() => navigate("/blog")}
              className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-4"
            >
              <ArrowLeft className="w-5 h-5" />
              {t('common.back')}
            </button>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              {t('profile.writeArticle')}
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-2">
              {t('profile.writeArticle')}
            </p>
          </div>

          {/* Create Post Form as full page (not modal) */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <CreatePost
              initialType="article"
              onClose={() => navigate("/blog")}
              onSuccess={() => {
                navigate("/blog");
              }}
              embedded={true}
            />
          </div>
        </div>
      </div>
    </>
  );
}
