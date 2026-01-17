import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  ArrowLeft,
  Image,
  Upload,
  X,
  CheckCircle,
  Trophy,
  Loader2,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

interface JobData {
  id: string;
  title: string;
  description: string;
  price: number;
  category: string;
  location: string;
  tags: string[];
  client?: {
    name: string;
  };
  startDate: string;
  endDate?: string;
}

export default function CreatePortfolioPost() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const jobId = searchParams.get('fromJob');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [publishAsPost, setPublishAsPost] = useState(true); // Auto-post to profile (default on)

  useEffect(() => {
    if (jobId) {
      fetchJobData();
    } else {
      setLoading(false);
    }
  }, [jobId]);

  const fetchJobData = async () => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success && data.job) {
        const job = data.job;
        setJobData(job);

        // Pre-fill form with job data
        setTitle(`Servicio brindado exitosamente: ${job.title}`);
        setDescription(job.description || '');
        setCategory(job.category || '');
        setTags(job.tags?.join(', ') || '');
      } else {
        setError('No se pudo cargar la información del trabajo');
      }
    } catch (err) {
      console.error('Error fetching job:', err);
      setError('Error al cargar el trabajo');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles = Array.from(files);
    const maxImages = 10;

    if (images.length + newFiles.length > maxImages) {
      setError(`Máximo ${maxImages} imágenes permitidas`);
      return;
    }

    setImages(prev => [...prev, ...newFiles]);

    // Create previews
    newFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // First create the portfolio item
      const portfolioData = {
        title,
        description,
        category,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        linkedJob: jobId,
        price: jobData?.price,
        clientName: jobData?.client?.name || 'Cliente DoApp',
        projectDuration: calculateDuration(),
      };

      const response = await fetch('/api/portfolio', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(portfolioData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al crear el portfolio');
      }

      const portfolioId = data.data?._id || data.data?.id;

      // If there are images, upload them
      if (images.length > 0 && portfolioId) {
        const formData = new FormData();
        images.forEach(img => {
          formData.append('images', img);
        });

        await fetch(`/api/portfolio/${portfolioId}/images`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });
      }

      // Also create a post if the option is enabled
      if (publishAsPost) {
        try {
          // First upload images to get URLs for the post
          let galleryItems: Array<{ url: string; type: 'image' }> = [];

          if (images.length > 0) {
            const postFormData = new FormData();
            images.forEach(img => {
              postFormData.append('images', img);
            });

            const uploadResponse = await fetch('/api/posts/upload-images', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
              },
              body: postFormData,
            });

            const uploadData = await uploadResponse.json();
            if (uploadData.success && uploadData.urls) {
              galleryItems = uploadData.urls.map((url: string) => ({
                url,
                type: 'image' as const,
              }));
            }
          }

          // Create the post
          const postData = {
            title,
            description,
            type: 'post',
            gallery: galleryItems,
            tags: tags.split(',').map(t => t.trim()).filter(Boolean),
            linkedJob: jobId,
            price: jobData?.price,
            currency: 'ARS',
          };

          await fetch('/api/posts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(postData),
          });
        } catch (postErr) {
          console.error('Error creating post:', postErr);
          // Don't fail the whole operation if post creation fails
        }
      }

      setSuccess(true);

      // Redirect after 2 seconds
      setTimeout(() => {
        navigate('/portfolio');
      }, 2000);

    } catch (err: any) {
      setError(err.message || 'Error al crear el portfolio');
    } finally {
      setSubmitting(false);
    }
  };

  const calculateDuration = () => {
    if (!jobData?.startDate) return '';

    const start = new Date(jobData.startDate);
    const end = jobData.endDate ? new Date(jobData.endDate) : new Date();
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 7) return `${diffDays} días`;
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)} semanas`;
    return `${Math.ceil(diffDays / 30)} meses`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-sky-500 mx-auto" />
          <p className="mt-4 text-slate-600 dark:text-slate-400">Cargando...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-lg max-w-md">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-12 w-12 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Publicado Exitosamente
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Tu trabajo ha sido compartido en tu portfolio
          </p>
          <p className="text-sm text-slate-500">Redirigiendo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="h-6 w-6 text-slate-600 dark:text-slate-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              Compartir Trabajo Completado
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Muestra tu trabajo en tu portfolio
            </p>
          </div>
        </div>

        {/* Success Banner */}
        {jobData && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6 flex items-center gap-3">
            <Trophy className="h-6 w-6 text-green-500 flex-shrink-0" />
            <div>
              <p className="font-medium text-green-800 dark:text-green-200">
                Trabajo completado exitosamente
              </p>
              <p className="text-sm text-green-600 dark:text-green-400">
                {jobData.title}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Información del Trabajo
            </h2>

            {/* Title */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Título de la publicación *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                placeholder="Ej: Servicio brindado exitosamente: Desarrollo Web"
              />
            </div>

            {/* Description */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Descripción *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={5}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent resize-none"
                placeholder="Describe el trabajo realizado, los resultados obtenidos y cualquier detalle relevante..."
              />
            </div>

            {/* Category */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Categoría *
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              >
                <option value="">Seleccionar categoría</option>
                <option value="desarrollo_web">Desarrollo Web</option>
                <option value="diseno_grafico">Diseño Gráfico</option>
                <option value="marketing">Marketing</option>
                <option value="redaccion">Redacción</option>
                <option value="video">Video y Animación</option>
                <option value="musica">Música y Audio</option>
                <option value="hogar">Hogar y Mantenimiento</option>
                <option value="educacion">Educación</option>
                <option value="salud">Salud y Bienestar</option>
                <option value="transporte">Transporte</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Tags (separados por comas)
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                placeholder="Ej: React, TypeScript, E-commerce"
              />
            </div>
          </div>

          {/* Images Section */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Imágenes del Trabajo
            </h2>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              Agrega capturas de pantalla, fotos del trabajo realizado o cualquier imagen relevante (máx. 10)
            </p>

            {/* Image Previews */}
            {imagePreviews.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative aspect-video rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute top-2 right-2 p-1 bg-red-500 rounded-full text-white hover:bg-red-600 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload Button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-8 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg hover:border-sky-500 dark:hover:border-sky-500 transition-colors flex flex-col items-center gap-2"
            >
              <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-full">
                <Image className="h-6 w-6 text-slate-500" />
              </div>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Subir imágenes
              </span>
              <span className="text-xs text-slate-500">
                JPG, PNG, WebP - Máx 5MB cada una
              </span>
            </button>
          </div>

          {/* Auto-publish as Post Toggle */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Publicar también en mi perfil
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Además del portfolio, se creará un post visible en tu perfil
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPublishAsPost(!publishAsPost)}
                className={`relative w-14 h-8 rounded-full transition-colors ${
                  publishAsPost
                    ? 'bg-green-500'
                    : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-transform ${
                    publishAsPost ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>
            {publishAsPost && (
              <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <p className="text-sm text-green-700 dark:text-green-300">
                  ✓ Tu trabajo aparecerá en tu portfolio y como un post en tu perfil
                </p>
              </div>
            )}
          </div>

          {/* Job Details (read-only) */}
          {jobData && (
            <div className="bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
                Datos del trabajo original
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Precio:</span>
                  <span className="ml-2 font-medium text-slate-900 dark:text-white">
                    ${jobData.price?.toLocaleString('es-AR')} ARS
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Duración:</span>
                  <span className="ml-2 font-medium text-slate-900 dark:text-white">
                    {calculateDuration()}
                  </span>
                </div>
                {jobData.location && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Ubicación:</span>
                    <span className="ml-2 font-medium text-slate-900 dark:text-white">
                      {jobData.location}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="flex-1 py-3 px-6 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 px-6 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Publicando...
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  Publicar en Portfolio
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
