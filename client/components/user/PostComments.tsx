import { getImageUrl } from '../../utils/imageUrl';
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Heart, Trash2, Send } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import Button from "../ui/Button";

interface Author {
  _id: string;
  name: string;
  username?: string;
  avatar?: string;
  membershipTier?: string;
  hasMembership?: boolean;
  isPremiumVerified?: boolean;
}

interface Comment {
  _id: string;
  author: Author;
  content: string;
  likes: string[];
  likesCount: number;
  isEdited: boolean;
  createdAt: string;
}

interface PostCommentsProps {
  postId: string;
}

export default function PostComments({ postId }: PostCommentsProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchComments = useCallback(async () => {
    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        setComments(data.comments);
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newComment.trim()) return;

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ content: newComment }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al agregar comentario");
      }

      setComments([data.comment, ...comments]);
      setNewComment("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!user) return;

    try {
      const response = await fetch(`/api/posts/${postId}/comments/${commentId}/like`, {
        method: "POST",
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        setComments(
          comments.map((comment) =>
            comment._id === commentId
              ? {
                  ...comment,
                  likesCount: data.likesCount,
                  likes: data.liked
                    ? [...comment.likes, user._id || user.id || '']
                    : comment.likes.filter((id) => id !== user._id && id !== user.id),
                }
              : comment
          )
        );
      }
    } catch (error) {
      console.error("Error liking comment:", error);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("¿Estás seguro de eliminar este comentario?")) return;

    try {
      const response = await fetch(`/api/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        setComments(comments.filter((comment) => comment._id !== commentId));
      }
    } catch (error) {
      console.error("Error deleting comment:", error);
    }
  };

  const formatDate = (date: string) => {
    const now = new Date();
    const commentDate = new Date(date);
    const diffInHours = Math.floor((now.getTime() - commentDate.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 24) {
      if (diffInHours < 1) {
        const diffInMinutes = Math.floor((now.getTime() - commentDate.getTime()) / (1000 * 60));
        return `Hace ${diffInMinutes} min`;
      }
      return `Hace ${diffInHours}h`;
    } else if (diffInHours < 48) {
      return "Hace 1 día";
    } else {
      return commentDate.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 text-center text-slate-500 dark:text-slate-400">
        Cargando comentarios...
      </div>
    );
  }

  return (
    <div className="border-t border-slate-200 dark:border-slate-700">
      {/* Add Comment Form */}
      {user && (
        <form onSubmit={handleSubmitComment} className="p-4 border-b border-slate-200 dark:border-slate-700">
          {error && (
            <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}
          <div className="flex gap-3">
            <img
              src={getImageUrl(user.avatar)}
              alt={user.name}
              className="w-10 h-10 rounded-full object-cover"
            />
            <div className="flex-1">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Escribe un comentario..."
                rows={2}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 resize-none"
                maxLength={2000}
              />
              <div className="mt-2 flex justify-end">
                <Button
                  type="submit"
                  disabled={!newComment.trim() || isSubmitting}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {isSubmitting ? "Enviando..." : "Comentar"}
                </Button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Comments List */}
      <div className="p-4 space-y-4">
        {comments.length === 0 ? (
          <p className="text-center text-slate-500 dark:text-slate-400 py-8">
            No hay comentarios aún. ¡Sé el primero en comentar!
          </p>
        ) : (
          comments.map((comment) => {
            const isLiked = user
              ? comment.likes.includes(user._id || user.id || '')
              : false;
            const isAuthor = user?._id === comment.author._id || user?.id === comment.author._id;

            // Generate profile link - prefer username over id
            const profileLink = comment.author.username
              ? `/u/${comment.author.username}`
              : `/profile/${comment.author._id}`;

            return (
              <div key={comment._id} className="flex gap-3">
                <Link to={profileLink}>
                  <img
                    src={getImageUrl(comment.author.avatar)}
                    alt={comment.author.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                </Link>
                <div className="flex-1">
                  <div className="bg-slate-100 dark:bg-slate-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        to={profileLink}
                        className="font-semibold text-slate-900 dark:text-white hover:underline"
                      >
                        {comment.author.name}
                      </Link>
                      {comment.author.membershipTier === "pro" && comment.author.hasMembership && (
                        <span className="px-1.5 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold rounded">
                          PRO
                        </span>
                      )}
                      {comment.author.isPremiumVerified && (
                        <span className="text-blue-500 text-xs" title="Verificado">
                          ✓
                        </span>
                      )}
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                      {comment.content}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 mt-2 px-3">
                    <button
                      onClick={() => handleLikeComment(comment._id)}
                      disabled={!user}
                      className={`flex items-center gap-1 text-sm ${
                        isLiked
                          ? "text-red-500"
                          : "text-slate-500 dark:text-slate-400 hover:text-red-500"
                      } ${!user ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      <Heart
                        className={`h-4 w-4 ${isLiked ? "fill-current" : ""}`}
                      />
                      {comment.likesCount > 0 && <span>{comment.likesCount}</span>}
                    </button>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(comment.createdAt)}
                    </span>
                    {isAuthor && (
                      <button
                        onClick={() => handleDeleteComment(comment._id)}
                        className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
