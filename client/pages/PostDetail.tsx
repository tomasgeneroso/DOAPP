import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { Heart, MessageCircle, Eye, ArrowLeft, Calendar, DollarSign, Tag, ChevronLeft, ChevronRight, Share2 } from "lucide-react";
import { Helmet } from "react-helmet-async";
import Button from "../components/ui/Button";
import PostComments from "../components/user/PostComments";

interface GalleryItem {
  url: string;
  type: 'image' | 'video';
  thumbnail?: string;
  caption?: string;
}

interface Author {
  _id: string;
  id?: string;
  name: string;
  avatar?: string;
  bio?: string;
  membershipTier?: string;
  rating?: number;
  completedJobs?: number;
}

interface Post {
  _id: string;
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
  createdAt: string;
  updatedAt: string;
}

export default function PostDetail() {
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

  useEffect(() => {
    if (id) {
      fetchPost();
    }
  }, [id]);

  useEffect(() => {
    if (post && user) {
      setIsLiked(post.likes?.includes(user.id || user._id || ''));
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

  const handleLike = async () => {
    if (!user || !post) return;

    try {
      const response = await fetch(`/api/posts/${post._id || post.id}/like`, {
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
      alert('Link copiado al portapapeles');
    }
  };

  const getImageUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return url.startsWith('/') ? url : `/${url}`;
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

  const authorId = post.author?._id || post.author?.id;

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
                    className="w-full max-h-[500px] object-contain"
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

                {/* Share Button */}
                <button
                  onClick={handleShare}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                  title="Compartir"
                >
                  <Share2 className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </button>
              </div>

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
              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {post.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="flex items-center gap-1 px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full text-sm"
                    >
                      <Tag className="w-3 h-3" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}

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
                  <PostComments postId={post._id || post.id || ''} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
