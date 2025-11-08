import { getImageUrl } from '../../utils/imageUrl';
import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, MessageCircle, Eye, DollarSign, Image as ImageIcon, Video } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";

interface Author {
  _id: string;
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
}

interface Post {
  _id: string;
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
}

interface PostCardProps {
  post: Post;
  onLike?: (postId: string) => void;
  onComment?: (postId: string) => void;
}

export default function PostCard({ post, onLike, onComment }: PostCardProps) {
  const { user } = useAuth();
  const [isLiked, setIsLiked] = useState(
    user ? post.likes.includes(user._id || user.id || '') : false
  );
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [isLiking, setIsLiking] = useState(false);

  const handleLike = async () => {
    if (!user || isLiking) return;

    setIsLiking(true);
    try {
      const response = await fetch(`/api/posts/${post._id}/like`, {
        method: "POST",
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        setIsLiked(data.liked);
        setLikesCount(data.likesCount);
        onLike?.(post._id);
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

  const mainMedia = post.gallery[0];

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-md transition-shadow">
      {/* Author Header */}
      <div className="p-4 flex items-center gap-3">
        <Link to={`/profile/${post.author._id}`}>
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
      </div>

      {/* Post Content */}
      <div className="px-4 pb-3">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
          {post.title}
        </h3>
        <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap line-clamp-3">
          {post.description}
        </p>

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

      {/* Gallery */}
      {mainMedia && (
        <div className="relative bg-slate-100 dark:bg-slate-900">
          {mainMedia.type === "image" ? (
            <div className="relative">
              <img
                src={getImageUrl(mainMedia.url)}
                alt={mainMedia.caption || post.title}
                className="w-full h-96 object-cover"
              />
              {mainMedia.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                  <p className="text-white text-sm">{mainMedia.caption}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="relative">
              <video
                src={getImageUrl(mainMedia.url)}
                className="w-full h-96 object-cover"
                controls
              />
              {mainMedia.caption && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 pointer-events-none">
                  <p className="text-white text-sm">{mainMedia.caption}</p>
                </div>
              )}
            </div>
          )}
          {post.gallery.length > 1 && (
            <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-full text-sm flex items-center gap-1">
              {post.gallery.filter((g) => g.type === "image").length > 0 && (
                <ImageIcon className="h-4 w-4" />
              )}
              {post.gallery.filter((g) => g.type === "video").length > 0 && (
                <Video className="h-4 w-4" />
              )}
              <span>{post.gallery.length}</span>
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
            onClick={() => onComment?.(post._id)}
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
