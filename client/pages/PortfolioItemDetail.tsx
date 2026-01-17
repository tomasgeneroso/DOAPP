import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getImageUrl } from '../utils/imageUrl';
import {
  ArrowLeft,
  Briefcase,
  DollarSign,
  Calendar,
  User,
  Tag,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';

interface PortfolioItem {
  _id: string;
  userId: string | { _id: string; name: string; avatar?: string };
  title: string;
  description: string;
  category: string;
  price?: number;
  images: string[];
  tags?: string[];
  clientName?: string;
  projectDuration?: string;
  linkedJob?: string | { _id: string; title?: string };
  linkedContract?: string | { _id: string };
  createdAt: string;
  updatedAt: string;
}

export default function PortfolioItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [item, setItem] = useState<PortfolioItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    if (id) {
      fetchPortfolioItem();
    }
  }, [id]);

  const fetchPortfolioItem = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/portfolio/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const data = await response.json();

      if (data.success) {
        setItem(data.data || data.item);
      } else {
        setError(data.message || 'No se encontró el item de portfolio');
      }
    } catch (err) {
      console.error('Error fetching portfolio item:', err);
      setError('Error al cargar el portfolio');
    } finally {
      setLoading(false);
    }
  };

  const nextImage = () => {
    if (item && currentImageIndex < item.images.length - 1) {
      setCurrentImageIndex(prev => prev + 1);
    }
  };

  const prevImage = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(prev => prev - 1);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || 'Portfolio no encontrado'}</p>
          <button
            onClick={() => navigate(-1)}
            className="text-sky-600 hover:text-sky-700 font-medium"
          >
            ← Volver
          </button>
        </div>
      </div>
    );
  }

  const linkedJobId = typeof item.linkedJob === 'object' ? item.linkedJob?._id : item.linkedJob;
  const userName = typeof item.userId === 'object' ? item.userId.name : null;
  const userAvatar = typeof item.userId === 'object' ? item.userId.avatar : undefined;
  const userIdStr = typeof item.userId === 'object' ? item.userId._id : item.userId;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
          <span>Volver</span>
        </button>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Image Gallery */}
          {item.images && item.images.length > 0 && (
            <div className="relative bg-slate-100 dark:bg-slate-900">
              <img
                src={getImageUrl(item.images[currentImageIndex])}
                alt={item.title}
                className="w-full h-96 object-contain"
              />

              {/* Navigation arrows */}
              {item.images.length > 1 && (
                <>
                  {currentImageIndex > 0 && (
                    <button
                      onClick={prevImage}
                      className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-800 rounded-full p-2 shadow-lg transition-colors"
                    >
                      <ChevronLeft className="h-6 w-6 text-slate-700 dark:text-slate-200" />
                    </button>
                  )}
                  {currentImageIndex < item.images.length - 1 && (
                    <button
                      onClick={nextImage}
                      className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-800 rounded-full p-2 shadow-lg transition-colors"
                    >
                      <ChevronRight className="h-6 w-6 text-slate-700 dark:text-slate-200" />
                    </button>
                  )}

                  {/* Image counter */}
                  <div className="absolute bottom-4 right-4 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
                    {currentImageIndex + 1} / {item.images.length}
                  </div>

                  {/* Thumbnail dots */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {item.images.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`w-2 h-2 rounded-full transition-all ${
                          index === currentImageIndex
                            ? 'bg-white w-3'
                            : 'bg-white/50 hover:bg-white/70'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Content */}
          <div className="p-6">
            {/* Title & Category */}
            <div className="mb-4">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 mb-2">
                <Briefcase className="h-3 w-3" />
                {item.category}
              </span>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {item.title}
              </h1>
            </div>

            {/* Author */}
            {userName && (
              <Link
                to={`/profile/${userIdStr}`}
                className="flex items-center gap-3 mb-4 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
              >
                <img
                  src={getImageUrl(userAvatar)}
                  alt={userName}
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">{userName}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Ver perfil</p>
                </div>
              </Link>
            )}

            {/* Description */}
            <div className="prose dark:prose-invert max-w-none mb-6">
              <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                {item.description}
              </p>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {item.price && (
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-1">
                    <DollarSign className="h-4 w-4" />
                    Precio
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    ${item.price.toLocaleString('es-AR')} ARS
                  </p>
                </div>
              )}

              {item.clientName && (
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-1">
                    <User className="h-4 w-4" />
                    Cliente
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {item.clientName}
                  </p>
                </div>
              )}

              {item.projectDuration && (
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-1">
                    <Calendar className="h-4 w-4" />
                    Duración
                  </div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {item.projectDuration}
                  </p>
                </div>
              )}

              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-1">
                  <Calendar className="h-4 w-4" />
                  Publicado
                </div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {new Date(item.createdAt).toLocaleDateString('es-AR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
            </div>

            {/* Tags */}
            {item.tags && item.tags.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-2">
                  <Tag className="h-4 w-4" />
                  Etiquetas
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm rounded-full"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Link to Original Job */}
            {linkedJobId && (
              <Link
                to={`/jobs/${linkedJobId}`}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-xl transition-colors"
              >
                <Briefcase className="h-4 w-4" />
                Ver trabajo original
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
