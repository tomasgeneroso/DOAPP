import { useState, useEffect } from "react";
import useDialog from '@/hooks/useDialog';
import useImageViewer from '@/hooks/useImageViewer';
import { useTranslation } from "react-i18next";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import EtiquetasDeLaPublicacion from "../components/user/EtiquetasDeLaPublicacion";
import { Heart, MessageCircle, Eye, ArrowLeft, Calendar, DollarSign, Tag, ChevronLeft, ChevronRight, Share2, Pencil, Trash2, Loader2 } from "lucide-react";
import ConfirmModal from "../components/ui/ConfirmModal";
import { Helmet } from "react-helmet-async";
import Button from "../components/ui/Button";
import PostComments from "../components/user/PostComments";
import { getImageUrl } from "../utils/imageUrl";
import RetirarPorElEquipo from '../components/user/RetirarPorElEquipo';
import CompartirPorChat from '../components/chat/CompartirPorChat';
import Etiqueta from '../components/Etiqueta';

interface GalleryItem {
  url: string;
  type: 'image' | 'video';
  thumbnail?: string;
  caption?: string;
}

interface Author {
  id?: string;
  name: string;
  avatar?: string;
  bio?: string;
  membershipTier?: string;
  rating?: number;
  completedJobs?: number;
}

interface Post {
  id?: string;
  title: string;
  description: string;
  gallery: GalleryItem[];
  price?: number;
  currency: 'ARS' | 'USD';
  type: 'post' | 'article';
  author: Author;
  likes: string[];
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  tags?: string[];
  contractRatings?: Array<{ contractId: string; workerId: string; name: string; role: 'doer' | 'client'; rating: number; comment?: string }>;
  /** Si viene de un trabajo: no se edita (editarla sería modificar el trabajo), solo se quita del muro. */
  linkedContract?: string | { id?: string } | null;
  /** A quién se etiquetó (solo quien trabajó en el trabajo y lo permite). */
  etiquetados?: Array<{ id: string; name: string; avatar?: string | null }>;
  createdAt: string;
  updatedAt: string;
}

export default function PostDetail() {
  const { t } = useTranslation();
  const { notify, dialog } = useDialog();
  const { openImage, viewer } = useImageViewer();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showComments, setShowComments] = useState(false);
  // Quien publicó la puede editar o eliminar (pedido del dueño, 2026-11-23).
  const [parametros] = useSearchParams();
  const [editando, setEditando] = useState(false);
  const [tituloEditado, setTituloEditado] = useState("");
  const [descripcionEditada, setDescripcionEditada] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [errorDeEdicion, setErrorDeEdicion] = useState<string | null>(null);
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [errorAlBorrar, setErrorAlBorrar] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchPost();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (post && user) {
      setIsLiked(post.likes?.includes(user.id || ''));
      setLikesCount(post.likesCount || 0);
    }
  }, [post, user]);

  const fetchPost = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/posts/${id}`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (data.success) {
        setPost(data.post);
      } else {
        setError(data.message || "Error al cargar la publicación");
      }
    } catch (err: any) {
      setError(err.message || "Error al cargar la publicación");
    } finally {
      setLoading(false);
    }
  };

  const empezarAEditar = () => {
    if (!post) return;
    setTituloEditado(post.title);
    // La descripción puede traer marcas de formato: se edita como texto simple.
    setDescripcionEditada(new DOMParser().parseFromString(post.description || "", "text/html").body.textContent || "");
    setErrorDeEdicion(null);
    setEditando(true);
  };

  const guardarEdicion = async () => {
    if (!tituloEditado.trim() || !descripcionEditada.trim()) {
      setErrorDeEdicion("El título y la descripción no pueden quedar vacíos.");
      return;
    }
    setGuardandoEdicion(true);
    setErrorDeEdicion(null);
    try {
      const r = await fetch(`/api/posts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: tituloEditado.trim(), description: descripcionEditada.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.message || "No se pudo guardar.");
      setEditando(false);
      await fetchPost();
    } catch (e: any) {
      setErrorDeEdicion(e?.message || "No se pudo guardar.");
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const borrarPublicacion = async () => {
    setBorrando(true);
    setErrorAlBorrar(null);
    try {
      const r = await fetch(`/api/posts/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.message || "No se pudo eliminar.");
      navigate(user?.id ? `/profile/${user.id}` : "/");
    } catch (e: any) {
      setErrorAlBorrar(e?.message || "No se pudo eliminar.");
      setBorrando(false);
    }
  };

  // Llega con ?editar=1 desde el botón de la tarjeta: abre la edición solo, una vez, cuando la publicación ya cargó y es de quien mira.
  const [abrioLaEdicion, setAbrioLaEdicion] = useState(false);
  useEffect(() => {
    if (abrioLaEdicion || !post || !user || parametros.get("editar") !== "1") return;
    if (String(post.author?.id) !== String(user.id)) return;
    if (post.linkedContract) return;
    setAbrioLaEdicion(true);
    setTituloEditado(post.title);
    setDescripcionEditada(new DOMParser().parseFromString(post.description || "", "text/html").body.textContent || "");
    setErrorDeEdicion(null);
    setEditando(true);
  }, [post, user, parametros, abrioLaEdicion]);

  const handleLike = async () => {
    if (!user || !post) return;

    try {
      const response = await fetch(`/api/posts/${post.id || post.id}/like`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setIsLiked(data.liked);
        setLikesCount(data.likesCount);
      }
    } catch (err) {
      console.error('Error toggling like:', err);
    }
  };

  const handleShare = async () => {
    if (navigator.share && post) {
      try {
        await navigator.share({
          title: post.title,
          text: `Mirá este ${post.type === 'article' ? 'artículo' : 'post'} de ${post.author.name}`,
          url: window.location.href,
        });
      } catch (err) {
        console.log('Error sharing:', err);
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      notify('Link copiado al portapapeles');
    }
  };

  const nextImage = () => {
    if (post?.gallery && currentImageIndex < post.gallery.length - 1) {
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            Publicación no encontrada
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mb-4">{error}</p>
          <Button onClick={() => navigate(-1)}>Volver</Button>
        </div>
      </div>
    );
  }

  const authorId = post.author?.id || post.author?.id;

  return (
    <>
      <Helmet>
        <title>{post.title} | DOAPP</title>
        <meta name="description" content={post.description?.replace(/<[^>]+>/g, '').substring(0, 160)} />
      </Helmet>

      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
        <div className="max-w-4xl mx-auto px-4">
          {/* Back Button */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 mb-6 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Volver
          </button>

          {/* Main Content Card */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            {/* Gallery */}
            {post.gallery && post.gallery.length > 0 && (
              <div className="relative bg-slate-900">
                {post.gallery[currentImageIndex]?.type === 'video' ? (
                  <video
                    src={getImageUrl(post.gallery[currentImageIndex].url)}
                    controls
                    className="w-full max-h-[500px] object-contain"
                  />
                ) : (
                  <img
                    src={getImageUrl(post.gallery[currentImageIndex]?.url)}
                    alt={post.gallery[currentImageIndex]?.caption || post.title}
                    onClick={() => openImage(getImageUrl(post.gallery[currentImageIndex]?.url), post.gallery[currentImageIndex]?.caption || post.title)}
                    className="w-full max-h-[500px] object-contain cursor-zoom-in"
                  />
                )}

                {/* Image Navigation */}
                {post.gallery.length > 1 && (
                  <>
                    <button
                      onClick={prevImage}
                      disabled={currentImageIndex === 0}
                      className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                    <button
                      onClick={nextImage}
                      disabled={currentImageIndex === post.gallery.length - 1}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </button>

                    {/* Image Counter */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/50 rounded-full text-white text-sm">
                      {currentImageIndex + 1} / {post.gallery.length}
                    </div>
                  </>
                )}

                {/* Caption */}
                {post.gallery[currentImageIndex]?.caption && (
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
                    <p className="text-white text-sm">{post.gallery[currentImageIndex].caption}</p>
                  </div>
                )}
              </div>
            )}

            {/* Content */}
            <div className="p-6 md:p-8">
              {/* Author Info */}
              <div className="flex items-center gap-4 mb-6">
                <Link to={authorId ? `/profile/${authorId}` : '#'}>
                  <img
                    src={getImageUrl(post.author?.avatar || '/default-avatar.png')}
                    alt={post.author?.name}
                    className="w-12 h-12 rounded-full object-cover border-2 border-slate-200 dark:border-slate-600"
                  />
                </Link>
                <div className="flex-1">
                  <Link
                    to={authorId ? `/profile/${authorId}` : '#'}
                    className="font-semibold text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400"
                  >
                    {post.author?.name || 'Usuario'}
                  </Link>
                  <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {new Date(post.createdAt).toLocaleDateString('es-AR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-4 h-4" />
                      {post.viewsCount} vistas
                    </span>
                  </div>
                </div>

                {/* Quien publicó: editar o eliminar */}
                {!!user && !!authorId && String(user.id) === String(authorId) && (
                  <div className="flex items-center gap-1" data-testid="acciones-del-autor">
                    {!post.linkedContract && (
                      <button onClick={empezarAEditar} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" title="Editar la publicación" aria-label="Editar la publicación" data-testid="editar-publicacion">
                        <Pencil className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                      </button>
                    )}
                    <button onClick={() => { setErrorAlBorrar(null); setConfirmarBorrado(true); }} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors" title="Eliminar la publicación" aria-label="Eliminar la publicación" data-testid="eliminar-publicacion">
                      <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </button>
                  </div>
                )}

                {/* El equipo retira una publicación ajena, dejando el motivo */}
                {!!user && !!authorId && String(user.id) !== String(authorId) && ['owner', 'super_admin', 'admin', 'support'].includes(String((user as any).adminRole)) && (
                  <RetirarPorElEquipo postId={String(id)} token={token} alRetirar={() => navigate(`/profile/${authorId}`)} />
                )}

                <CompartirPorChat que={post.type === 'article' ? 'articulo' : 'publicacion'} ruta={`/posts/${id}`} titulo={post.title} />

                {/* Share Button */}
                <button
                  onClick={handleShare}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                  title={t('common.share', 'Share')}
                >
                  <Share2 className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </button>
              </div>

              {/* Edición: título y descripción */}
              {editando && (
                <div className="mb-6 space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700" data-testid="edicion-de-la-publicacion">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Título
                    <input value={tituloEditado} onChange={(e) => setTituloEditado(e.target.value)} maxLength={200} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white" data-testid="titulo-editado" />
                  </label>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Descripción
                    <textarea value={descripcionEditada} onChange={(e) => setDescripcionEditada(e.target.value)} rows={5} className="mt-1 w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-700 dark:text-white" data-testid="descripcion-editada" />
                  </label>
                  {errorDeEdicion && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{errorDeEdicion}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={guardarEdicion} disabled={guardandoEdicion} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50" data-testid="guardar-edicion">
                      {guardandoEdicion && <Loader2 className="h-4 w-4 animate-spin" />}
                      Guardar cambios
                    </button>
                    <button type="button" onClick={() => setEditando(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">Cancelar</button>
                  </div>
                </div>
              )}

              {/* Title */}
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-4">
                {post.title}
              </h1>

              {/* Price (if applicable) */}
              {post.price && post.type === 'post' && (
                <div className="flex items-center gap-2 mb-4 text-green-600 dark:text-green-400">
                  <DollarSign className="w-5 h-5" />
                  <span className="text-xl font-bold">
                    {post.currency === 'ARS' ? '$' : 'USD '}{Number(post.price).toLocaleString('es-AR')}
                  </span>
                </div>
              )}

              {/* Tags */}
              {post.contractRatings && post.contractRatings.length > 0 && (
                <div className="mb-6" data-testid="puntuaciones-del-trabajo">
                  <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Puntuación al terminar el trabajo</h2>
                  <ul className="space-y-2">
                    {post.contractRatings.map((r) => (
                      <li key={r.contractId} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-700/50">
                        <div className="flex items-center justify-between gap-2">
                          <Link to={`/profile/${r.workerId}`} className="text-sm font-medium text-slate-900 hover:underline dark:text-white">
                            {r.name} <span className="font-normal text-slate-500 dark:text-slate-400">({r.role === 'doer' ? 'trabajador' : 'cliente'})</span>
                          </Link>
                          <span className="text-lg text-yellow-400" aria-label={`${r.rating} de 5`}>{'★'.repeat(r.rating)}<span className="text-slate-300 dark:text-slate-600">{'★'.repeat(5 - r.rating)}</span></span>
                        </div>
                        {r.comment && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">«{r.comment}»</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {post.tags.map((tag) => <Etiqueta key={tag} etiqueta={tag} />)}
                </div>
              )}

              {/* A quién se etiquetó; quien publicó puede etiquetar o cambiar las etiquetas después */}
              <EtiquetasDeLaPublicacion postId={String(post.id ?? id)} etiquetados={post.etiquetados} esAutor={!!user && !!authorId && String(user.id) === String(authorId)} token={token} alCambiar={fetchPost} />

              {/* Description/Content */}
              <div
                className="prose prose-slate dark:prose-invert max-w-none mb-6"
                dangerouslySetInnerHTML={{ __html: post.description }}
              />

              {/* Actions */}
              <div className="flex items-center gap-4 pt-6 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={handleLike}
                  disabled={!user}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                    isLiked
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  } ${!user ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
                  <span>{likesCount}</span>
                </button>

                <button
                  onClick={() => setShowComments(!showComments)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span>{post.commentsCount} comentarios</span>
                </button>
              </div>

              {/* Comments Section */}
              {showComments && (
                <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
                  <PostComments postId={post.id || post.id || ''} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <ConfirmModal
        open={confirmarBorrado}
        tone="danger"
        loading={borrando}
        title="Eliminar la publicación"
        confirmLabel="Eliminar"
        message={
          <>
            <p>¿Querés eliminar <strong>{post?.title}</strong>? Se borra de tu perfil y no se puede deshacer. Tu portafolio y el trabajo no se tocan.</p>
            {errorAlBorrar && <p role="alert" className="mt-2 text-red-400">{errorAlBorrar}</p>}
          </>
        }
        onConfirm={borrarPublicacion}
        onClose={() => setConfirmarBorrado(false)}
      />
      {dialog}
      {viewer}
    </>
  );
}
