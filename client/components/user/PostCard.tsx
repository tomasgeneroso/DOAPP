import { getImageUrl } from '../../utils/imageUrl';
import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Heart, MessageCircle, Eye, DollarSign, ChevronLeft, ChevronRight, Image as ImageIcon, Play, Briefcase, Users } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";

interface Author {
  id?: string;
  _id?: string;
  name: string;
  avatar?: string;
  membershipTier?: string;
  hasMembership?: boolean;
  isPremiumVerified?: boolean;
}

interface GalleryItem {
  url: string;
  type: 'image' | 'video';
  thumbnail?: string;
  caption?: string;
}

interface Post {
  id?: string;
  _id?: string;
  author: Author;
  title: string;
  description: string;
  gallery: GalleryItem[];
  price?: number;
  currency?: string;
  type: 'post' | 'article';
  likes: string[];
  likesCount: number;
  commentsCount: number;
  viewsCount: number;
  tags?: string[];
  createdAt: string;
  // Portfolio-related fields
  linkedJob?: string | { id?: string; _id?: string; title?: string };
  linkedContract?: string | { id?: string; _id?: string };
}

interface PostCardProps {
  post: Post;
  onLike?: (postId: string) => void;
  onComment?: (postId: string) => void;
}

export default function PostCard({ post, onLike, onComment }: PostCardProps) {
  const { user } = useAuth();
  // Handle both id and _id (Sequelize vs MongoDB style)
  const postId = post.id || post._id || '';
  const authorId = post.author.id || post.author._id || '';
  const [isLiked, setIsLiked] = useState(
    user ? post.likes.includes(user._id || user.id || '') : false
  );
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [isLiking, setIsLiking] = useState(false);

  // Carousel state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  const hasMultipleMedia = post.gallery.length > 1;
  const totalMedia = post.gallery.length;

  // Swipe handlers
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentIndex < totalMedia - 1) {
      setCurrentIndex(prev => prev + 1);
    }
    if (isRightSwipe && currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < totalMedia - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const goToPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const goToSlide = (index: number) => {
    setCurrentIndex(index);
  };

  const handleLike = async () => {
    if (!user || isLiking) return;

    setIsLiking(true);
    try {
      const response = await fetch(`/api/posts/${postId}/like`, {
        method: "POST",
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        setIsLiked(data.liked);
        setLikesCount(data.likesCount);
        onLike?.(postId);
      }
    } catch (error) {
      console.error("Error liking post:", error);
    } finally {
      setIsLiking(false);
    }
  };

  const formatDate = (date: string) => {
    const now = new Date();
    const postDate = new Date(date);
    const diffInHours = Math.floor((now.getTime() - postDate.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 24) {
      if (diffInHours < 1) {
        const diffInMinutes = Math.floor((now.getTime() - postDate.getTime()) / (1000 * 60));
        return `Hace ${diffInMinutes} min`;
      }
      return `Hace ${diffInHours}h`;
    } else if (diffInHours < 48) {
      return "Hace 1 día";
    } else {
      return postDate.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-md transition-shadow">
      {/* Author Header */}
      <div className="p-4 flex items-center gap-3">
        <Link to={`/profile/${authorId}`}>
          <img
            src={getImageUrl(post.author.avatar)}
            alt={post.author.name}
            className="w-10 h-10 rounded-full object-cover"
          />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Link
              to={`/profile/${post.author._id}`}
              className="font-semibold text-slate-900 dark:text-white hover:underline"
            >
              {post.author.name}
            </Link>
            {post.author.membershipTier === "pro" && post.author.hasMembership && (
              <span className="px-2 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded">
                PRO
              </span>
            )}
            {post.author.isPremiumVerified && (
              <span className="text-blue-500" title="Verificado">
                ✓
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {formatDate(post.createdAt)}
          </p>
        </div>
        {post.type === "article" && (
          <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium rounded-full">
            Artículo
          </span>
        )}
        {/* Badge de rol - trabajo realizado o contratado */}
        {post.linkedJob && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
            <Briefcase className="h-3 w-3" />
            Trabajo realizado
          </span>
        )}
        {post.linkedContract && !post.linkedJob && (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
            <Users className="h-3 w-3" />
            Trabajo contratado
          </span>
        )}
      </div>

      {/* Post Content */}
      <div className="px-4 pb-3">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
          {post.title}
        </h3>
        <div
          className="text-slate-700 dark:text-slate-300 line-clamp-3 [&_p]:my-1 [&_strong]:font-bold [&_em]:italic [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-bold [&_h3]:text-base [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_a]:text-blue-500 [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: post.description }}
        />

        {post.price && (
          <div className="mt-3 flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold">
            <DollarSign className="h-5 w-5" />
            <span>
              {post.currency === "USD" ? "$" : "ARS $"}
              {post.price.toLocaleString("es-AR")}
            </span>
          </div>
        )}
      </div>

      {/* Gallery - Instagram Style Carousel */}
      {post.gallery.length > 0 && (
        <div
          ref={carouselRef}
          className="relative bg-slate-100 dark:bg-slate-900 overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Media Container with transition */}
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${currentIndex * 100}%)` }}
          >
            {post.gallery.map((media, index) => (
              <div
                key={index}
                className="w-full flex-shrink-0 relative"
              >
                {media.type === "image" ? (
                  <img
                    src={getImageUrl(media.url)}
                    alt={media.caption || `${post.title} - ${index + 1}`}
                    className="w-full h-96 object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="relative">
                    <video
                      src={getImageUrl(media.url)}
                      className="w-full h-96 object-cover"
                      controls
                      poster={media.thumbnail ? getImageUrl(media.thumbnail) : undefined}
                    />
                    {/* Play icon overlay when not playing */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="bg-black/40 rounded-full p-3">
                        <Play className="h-8 w-8 text-white fill-white" />
                      </div>
                    </div>
                  </div>
                )}
                {media.caption && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pointer-events-none">
                    <p className="text-white text-sm">{media.caption}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Navigation Arrows - Only show if multiple media */}
          {hasMultipleMedia && (
            <>
              {/* Previous Arrow */}
              {currentIndex > 0 && (
                <button
                  onClick={goToPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-800 rounded-full p-1.5 shadow-lg transition-all opacity-0 group-hover:opacity-100 hover:scale-110"
                  style={{ opacity: 1 }}
                >
                  <ChevronLeft className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                </button>
              )}
              {/* Next Arrow */}
              {currentIndex < totalMedia - 1 && (
                <button
                  onClick={goToNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 dark:bg-slate-800/90 hover:bg-white dark:hover:bg-slate-800 rounded-full p-1.5 shadow-lg transition-all opacity-0 group-hover:opacity-100 hover:scale-110"
                  style={{ opacity: 1 }}
                >
                  <ChevronRight className="h-5 w-5 text-slate-700 dark:text-slate-200" />
                </button>
              )}
            </>
          )}

          {/* Position Indicator - Instagram style "1/4" */}
          {hasMultipleMedia && (
            <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm font-medium">
              {currentIndex + 1}/{totalMedia}
            </div>
          )}

          {/* Dot Indicators - Instagram style */}
          {hasMultipleMedia && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
              {post.gallery.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    index === currentIndex
                      ? "bg-white w-2.5 h-2.5"
                      : "bg-white/50 hover:bg-white/70"
                  }`}
                />
              ))}
            </div>
          )}

          {/* Media type indicators - small icons showing what types are in gallery */}
          {hasMultipleMedia && (
            <div className="absolute top-3 left-3 flex items-center gap-1.5">
              {post.gallery.some(g => g.type === "image") && (
                <div className="bg-black/60 backdrop-blur-sm text-white p-1.5 rounded-full">
                  <ImageIcon className="h-3.5 w-3.5" />
                </div>
              )}
              {post.gallery.some(g => g.type === "video") && (
                <div className="bg-black/60 backdrop-blur-sm text-white p-1.5 rounded-full">
                  <Play className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="p-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-4">
          <button
            onClick={handleLike}
            disabled={!user || isLiking}
            className={`flex items-center gap-2 transition-colors ${
              isLiked
                ? "text-red-500"
                : "text-slate-600 dark:text-slate-400 hover:text-red-500"
            } ${!user ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <Heart
              className={`h-5 w-5 ${isLiked ? "fill-current" : ""}`}
            />
            <span className="text-sm font-medium">{likesCount}</span>
          </button>

          <button
            onClick={() => onComment?.(postId)}
            className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-blue-500 transition-colors"
          >
            <MessageCircle className="h-5 w-5" />
            <span className="text-sm font-medium">{post.commentsCount}</span>
          </button>

          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <Eye className="h-5 w-5" />
            <span className="text-sm">{post.viewsCount}</span>
          </div>
        </div>

        {post.tags && post.tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {post.tags.slice(0, 3).map((tag, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded-full"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
