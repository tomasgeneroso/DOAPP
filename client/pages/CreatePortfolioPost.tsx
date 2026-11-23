import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import Transicion from "../components/ui/Transicion";
import { useEditorDeFotos } from "../hooks/useEditorDeFotos";
import AvatarConInicial from "../components/ui/AvatarConInicial";
import { getImageUrl } from "../utils/imageUrl";

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
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { token, user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const jobId = searchParams.get('fromJob');

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [avisoDeEtiquetas, setAvisoDeEtiquetas] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const { editar, editor } = useEditorDeFotos();
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  // La opinión que dejé al terminar el trabajo (puntaje y comentario): se copia sola y se puede sacar o dejar (pedido del dueño, 2026-11-23).
  // Una por contrato: con dos trabajadores se dejaron dos puntuaciones y cada una se muestra o se saca por separado.
  const [opiniones, setOpiniones] = useState<Array<{ contractId: string; name: string; role: 'doer' | 'client'; rating: number; comment: string }>>([]);
  const [eleccion, setEleccion] = useState<Record<string, { puntaje: boolean; comentario: boolean }>>({});
  // El trabajo ya tiene su categoría: es la que se usa; se puede sumar UNA más.
  const [categoriaExtra, setCategoriaExtra] = useState('');
  const [publishAsPost, setPublishAsPost] = useState(true);
  // A quién se puede etiquetar: quienes trabajaron en este trabajo (sin uno mismo). El servidor deja afuera a quien apagó las etiquetas en su configuración.
  const [equipo, setEquipo] = useState<Array<{ id: string; name: string; avatar?: string | null }>>([]);
  const [etiquetados, setEtiquetados] = useState<string[]>([]);

  useEffect(() => {
    if (jobId) {
      fetchJobData();
    } else {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Quiénes participaron en el trabajo (también un trabajador puede etiquetar a sus compañeros y a quien lo contrató) y la opinión que yo dejé al terminar.
  const cargarEquipo = async () => {
    try {
      const respuesta = await fetch(`/api/posts/job/${jobId}/participantes`, { headers: { Authorization: `Bearer ${token}` } });
      const datos = await respuesta.json();
      setEquipo(Array.isArray(datos?.personas) ? datos.personas.filter((p: { permite?: boolean }) => p.permite !== false) : []);
      const r = await fetch(`/api/posts/job/${jobId}/mis-opiniones`, { headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => ({}));
      const lista = Array.isArray(j?.opiniones) ? j.opiniones : [];
      setOpiniones(lista);
      setEleccion(Object.fromEntries(lista.map((o: { contractId: string }) => [o.contractId, { puntaje: true, comentario: true }])));
    } catch {
      setEquipo([]);
    }
  };

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
        setTitle(t('portfolio.serviceTitle', 'Service provided successfully: {{title}}', { title: job.title }));
        setDescription(job.description || '');
        setCategory(job.category || '');
        setTags(job.tags?.join(', ') || '');
        void cargarEquipo();
      } else {
        setError(t('portfolio.loadJobError', 'Could not load job information'));
      }
    } catch (err) {
      console.error('Error fetching job:', err);
      setError(t('portfolio.loadJobError', 'Error loading job'));
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const elegidas = Array.from(files);
    e.target.value = '';
    // Rotar, centrar y recortar cada foto antes de agregarla
    const newFiles = await editar(elegidas, { titulo: 'Editar foto' });
    if (newFiles.length === 0) return;
    const maxImages = 10;

    if (images.length + newFiles.length > maxImages) {
      setError(t('portfolio.maxImages', 'Maximum {{max}} images allowed', { max: maxImages }));
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

    if (!title.trim()) {
      setError(t('portfolio.titleRequired', 'El título es requerido'));
      return;
    }
    if (!description.trim()) {
      setError(t('portfolio.descriptionRequired', 'La descripción es requerida'));
      return;
    }
    if (!category && !(jobId && jobData?.category)) {
      setError(t('portfolio.categoryRequired', 'La categoría es requerida'));
      return;
    }

    setSubmitting(true);

    try {
      // First create the portfolio item
      const portfolioData = {
        title,
        description,
        // La del trabajo (no se escribe de nuevo); la extra, si se agregó, va también como etiqueta.
        category: jobId && jobData?.category ? jobData.category : category,
        tags: Array.from(new Set([...tags.split(',').map(t => t.trim()).filter(Boolean), ...(categoriaExtra ? [categoriaExtra] : [])])),
        linkedJob: jobId,
        price: jobData?.price,
        clientName: jobData?.client?.name || 'Cliente DoApp',
        projectDuration: calculateDuration(),
        // El servidor arma las puntuaciones desde las reseñas reales: acá solo se dice cuáles mostrar y si lleva el comentario.
        ...(opiniones.length > 0 && { incluirPuntuaciones: opiniones.map((o) => ({ contractId: o.contractId, puntaje: eleccion[o.contractId]?.puntaje !== false, comentario: eleccion[o.contractId]?.comentario !== false })) }),
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
        const errorMsg = data.message || data.errors?.[0]?.msg || t('portfolio.createError', 'Error creating portfolio');
        throw new Error(errorMsg);
      }

      const portfolioId = data.data?.id || data.data?.id;

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
          // La publicación lleva las fotos que adjuntaste (campo «gallery»), el trabajo y a quién etiquetás. Antes las fotos iban a una ruta que no existía y la
          // publicación salía sin ellas: solo se veía la del contrato.
          const postFormData = new FormData();
          postFormData.append('title', title);
          postFormData.append('description', description);
          postFormData.append('type', 'post');
          postFormData.append('currency', 'ARS');
          if (jobData?.price) postFormData.append('price', String(jobData.price));
          postFormData.append('tags', JSON.stringify(Array.from(new Set([...tags.split(',').map(t => t.trim()).filter(Boolean), ...(categoriaExtra ? [categoriaExtra] : [])]))));
          if (jobId) postFormData.append('linkedJob', jobId);
          if (etiquetados.length > 0) postFormData.append('taggedUsers', JSON.stringify(etiquetados));
          images.forEach(img => postFormData.append('gallery', img));

          const postResponse = await fetch('/api/posts', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: postFormData,
          });
          const postRespuesta = await postResponse.json().catch(() => ({}));
          if (!postResponse.ok) {
            setError(postRespuesta?.message || t('portfolio.postError', 'Se guardó en tu portafolio, pero no se pudo crear la publicación en tu perfil.'));
          } else if (postRespuesta?.noEtiquetados > 0) {
            setAvisoDeEtiquetas(t('portfolio.noTagged', '{{count}} persona(s) no quedaron etiquetadas porque no permiten que las etiqueten.', { count: postRespuesta.noEtiquetados }));
          }
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
      setError(err.message || t('portfolio.createError', 'Error creating portfolio'));
    } finally {
      setSubmitting(false);
    }
  };

  const calculateDuration = () => {
    if (!jobData?.startDate) return '';

    const start = new Date(jobData.startDate);
    const end = jobData.endDate ? new Date(jobData.endDate) : new Date();
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 7) return t('portfolio.durationDays', '{{count}} days', { count: diffDays });
    if (diffDays < 30) return t('portfolio.durationWeeks', '{{count}} weeks', { count: Math.ceil(diffDays / 7) });
    return t('portfolio.durationMonths', '{{count}} months', { count: Math.ceil(diffDays / 30) });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-sky-500 mx-auto" />
          <p className="mt-4 text-slate-600 dark:text-slate-400">{t('common.loading', 'Loading...')}</p>
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
            {t('portfolio.publishedSuccess', 'Published Successfully')}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            {t('portfolio.sharedInPortfolio', 'Your work has been shared in your portfolio')}
          </p>
          {avisoDeEtiquetas && <p className="mb-3 text-sm text-amber-700 dark:text-amber-300" data-testid="aviso-de-etiquetas">{avisoDeEtiquetas}</p>}
          <p className="text-sm text-slate-500">{t('common.redirecting', 'Redirecting...')}</p>
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
              {t('portfolio.shareCompletedWork', 'Share Completed Work')}
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              {t('portfolio.showInPortfolio', 'Show your work in your portfolio')}
            </p>
          </div>
        </div>

        {/* Success Banner */}
        {jobData && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6 flex items-center gap-3">
            <Trophy className="h-6 w-6 text-green-500 flex-shrink-0" />
            <div>
              <p className="font-medium text-green-800 dark:text-green-200">
                {t('portfolio.workCompletedSuccess', 'Work completed successfully')}
              </p>
              <p className="text-sm text-green-600 dark:text-green-400">
                {jobData.title}
              </p>
            </div>
          </div>
        )}

        <Transicion mostrar={!!error}>
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}
        </Transicion>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              {t('portfolio.workInfo', 'Work Information')}
            </h2>

            {/* Title */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t('portfolio.postTitle', 'Post title')} *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                placeholder={t('portfolio.titlePlaceholder', 'E.g.: Service provided successfully: Web Development')}
              />
            </div>

            {/* Description */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t('portfolio.description', 'Description')} *
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={5}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent resize-none"
                placeholder={t('portfolio.descriptionPlaceholder', 'Describe the work performed, the results obtained, and any relevant details...')}
              />
            </div>

            {/* Category: la del trabajo, más una opcional */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t('portfolio.category', 'Category')} *
              </label>
              {jobId && jobData?.category ? (
                <div className="flex flex-wrap items-center gap-2" data-testid="categoria-del-trabajo">
                  <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-sm font-medium capitalize text-sky-800 dark:bg-sky-900/30 dark:text-sky-200">{jobData.category}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Es la categoría del trabajo. Podés sumar una más:</span>
                  <select
                    value={categoriaExtra}
                    onChange={(e) => setCategoriaExtra(e.target.value)}
                    aria-label="Categoría adicional"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                    data-testid="categoria-adicional"
                  >
                    <option value="">Sin categoría adicional</option>
                    <option value="desarrollo_web">{t('portfolio.categories.webDev', 'Web Development')}</option>
                    <option value="diseno_grafico">{t('portfolio.categories.graphicDesign', 'Graphic Design')}</option>
                    <option value="marketing">{t('portfolio.categories.marketing', 'Marketing')}</option>
                    <option value="redaccion">{t('portfolio.categories.writing', 'Writing')}</option>
                    <option value="video">{t('portfolio.categories.video', 'Video and Animation')}</option>
                    <option value="musica">{t('portfolio.categories.music', 'Music and Audio')}</option>
                    <option value="hogar">{t('portfolio.categories.home', 'Home and Maintenance')}</option>
                    <option value="educacion">{t('portfolio.categories.education', 'Education')}</option>
                    <option value="salud">{t('portfolio.categories.health', 'Health and Wellness')}</option>
                    <option value="transporte">{t('portfolio.categories.transport', 'Transport')}</option>
                    <option value="otro">{t('portfolio.categories.other', 'Other')}</option>
                  </select>
                </div>
              ) : (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                >
                  <option value="">{t('portfolio.selectCategory', 'Select category')}</option>
                  <option value="desarrollo_web">{t('portfolio.categories.webDev', 'Web Development')}</option>
                  <option value="diseno_grafico">{t('portfolio.categories.graphicDesign', 'Graphic Design')}</option>
                  <option value="marketing">{t('portfolio.categories.marketing', 'Marketing')}</option>
                  <option value="redaccion">{t('portfolio.categories.writing', 'Writing')}</option>
                  <option value="video">{t('portfolio.categories.video', 'Video and Animation')}</option>
                  <option value="musica">{t('portfolio.categories.music', 'Music and Audio')}</option>
                  <option value="hogar">{t('portfolio.categories.home', 'Home and Maintenance')}</option>
                  <option value="educacion">{t('portfolio.categories.education', 'Education')}</option>
                  <option value="salud">{t('portfolio.categories.health', 'Health and Wellness')}</option>
                  <option value="transporte">{t('portfolio.categories.transport', 'Transport')}</option>
                  <option value="otro">{t('portfolio.categories.other', 'Other')}</option>
                </select>
              )}
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                {t('portfolio.tags', 'Tags (comma separated)')}
              </label>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                placeholder={t('portfolio.tagsPlaceholder', 'E.g.: React, TypeScript, E-commerce')}
              />
            </div>
          </div>

          {/* Images Section */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              {t('portfolio.workImages', 'Work Images')}
            </h2>

            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              {t('portfolio.imagesHint', 'Add screenshots, photos of the work done, or any relevant images (max. 10)')}
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
                {t('portfolio.uploadImages', 'Upload images')}
              </span>
              <span className="text-xs text-slate-500">
                {t('portfolio.imageFormats', 'JPG, PNG, WebP - Max 5MB each')}
              </span>
            </button>
          </div>

          {/* Opinión del final del trabajo: se copia sola (puntaje y comentario que dejé al terminar) y se puede sacar o dejar. Ya no se escribe de nuevo. */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            {opiniones.length > 0 && (
              <div className="mb-5" data-testid="opinion-del-trabajo">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{opiniones.length > 1 ? 'Tu puntuación a cada persona al terminar el trabajo' : 'Tu puntuación al terminar el trabajo'}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">La copiamos de lo que dejaste al terminar. Elegí qué mostrar en el portafolio.</p>
                <div className="space-y-3">
                  {opiniones.map((o) => {
                    const e = eleccion[o.contractId] ?? { puntaje: true, comentario: true };
                    const cambiar = (parte: Partial<{ puntaje: boolean; comentario: boolean }>) => setEleccion((prev) => ({ ...prev, [o.contractId]: { ...e, ...parte } }));
                    return (
                      <div key={o.contractId} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700" data-testid="puntuacion-a-una-persona">
                        <label className="flex cursor-pointer items-center gap-3">
                          <input type="checkbox" checked={e.puntaje} onChange={(ev) => cambiar({ puntaje: ev.target.checked })} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" data-testid="incluir-puntaje" />
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{o.name} <span className="font-normal text-slate-500">({o.role === 'doer' ? 'trabajador' : 'cliente'})</span></span>
                          <span className="ml-auto text-lg text-yellow-400" aria-label={`${o.rating} de 5`}>{'★'.repeat(o.rating)}<span className="text-slate-300 dark:text-slate-600">{'★'.repeat(5 - o.rating)}</span></span>
                        </label>
                        {o.comment.trim() && (
                          <label className={`mt-2 flex cursor-pointer items-start gap-3 ${e.puntaje ? '' : 'opacity-50'}`}>
                            <input type="checkbox" checked={e.puntaje && e.comentario} disabled={!e.puntaje} onChange={(ev) => cambiar({ comentario: ev.target.checked })} className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" data-testid="incluir-comentario" />
                            <span className="text-sm text-slate-600 dark:text-slate-400">Mostrar mi comentario: «{o.comment}»</span>
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Etiquetar a los trabajadores: solo a quienes trabajaron en este trabajo y permiten que los etiqueten (Configuración). */}
            {equipo.length > 0 && (
              <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700" data-testid="etiquetar-trabajadores">
                <p className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{t('portfolio.tagWorkers', 'Etiquetar a los participantes en la publicación')}</p>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                  {t('portfolio.tagWorkersHint', 'Les llega un aviso y aparecen en la publicación. Solo quedan etiquetados quienes lo permiten en su configuración.')}
                </p>
                <div className="space-y-2">
                  {equipo.map((p) => {
                    const marcado = etiquetados.includes(p.id);
                    return (
                      <label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors ${marcado ? 'border-sky-400 bg-sky-50 dark:border-sky-500 dark:bg-sky-900/20' : 'border-slate-200 dark:border-slate-700'}`}>
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => setEtiquetados((prev) => (marcado ? prev.filter((id) => id !== p.id) : [...prev, p.id]))}
                          className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          data-testid="etiquetar-a"
                        />
                        <AvatarConInicial src={p.avatar ? getImageUrl(p.avatar) : null} nombre={p.name} className="h-8 w-8 shrink-0 rounded-full" />
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{p.name}</span>
                      </label>
                    );
                  })}
                </div>
                {!publishAsPost && etiquetados.length > 0 && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t('portfolio.tagNeedsPost', 'Las etiquetas van en la publicación de tu perfil: activá «Publicar también en mi perfil».')}</p>
                )}
              </div>
            )}
          </div>

          {/* Auto-publish as Post Toggle */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {t('portfolio.alsoPublishProfile', 'Also publish on my profile')}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {t('portfolio.alsoPublishDesc', 'In addition to the portfolio, a post visible on your profile will be created')}
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
                  {t('portfolio.publishConfirmation', 'Your work will appear in your portfolio and as a post on your profile')}
                </p>
              </div>
            )}
          </div>

          {/* Job Details (read-only) */}
          {jobData && (
            <div className="bg-slate-100 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">
                {t('portfolio.originalJobData', 'Original job data')}
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">{t('portfolio.price', 'Price')}:</span>
                  <span className="ml-2 font-medium text-slate-900 dark:text-white">
                    ${jobData.price?.toLocaleString('es-AR')} ARS
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">{t('portfolio.duration', 'Duration')}:</span>
                  <span className="ml-2 font-medium text-slate-900 dark:text-white">
                    {calculateDuration()}
                  </span>
                </div>
                {jobData.location && (
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">{t('portfolio.location', 'Location')}:</span>
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
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-3 px-6 rounded-lg bg-green-500 hover:bg-green-600 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {t('portfolio.publishing', 'Publishing...')}
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  {t('portfolio.publishToPortfolio', 'Publish to Portfolio')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
      {editor}
    </div>
  );
}
