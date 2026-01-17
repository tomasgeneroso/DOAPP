import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { User } from '../types';
import { getImageUrl } from '../utils/imageUrl';
import MultipleRatings from '../components/user/MultipleRatings';
import PostCard from '../components/user/PostCard';
import CreatePost from '../components/user/CreatePost';
import PostComments from '../components/user/PostComments';
import ReportProfileModal from '../components/user/ReportProfileModal';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/ui/Button';
import {
  MapPin,
  Calendar,
  Briefcase,
  Star,
  Award,
  CheckCircle,
  Mail,
  Phone,
  Plus,
  FileText,
  Grid,
  MessageCircle,
  Flag,
  Camera,
  Upload,
  Gift,
  Copy,
  Check,
  Users,
  Share2,
  Link2,
  Send,
  X
} from 'lucide-react';

export default function ProfilePage() {
  const { userId, username } = useParams<{ userId?: string; username?: string }>();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [createPostType, setCreatePostType] = useState<'post' | 'article'>('post');
  const [selectedPostForComments, setSelectedPostForComments] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'posts' | 'articles'>('posts');
  const [completedJobs, setCompletedJobs] = useState<any[]>([]);
  const [completedByCategory, setCompletedByCategory] = useState<Array<{
    id: string;
    label: string;
    icon: string;
    count: number;
    averageRating: number | null;
  }>>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showAvatarUpload, setShowAvatarUpload] = useState(false);
  const [showCoverUpload, setShowCoverUpload] = useState(false);
  const [referralStats, setReferralStats] = useState<any>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copiedProfileLink, setCopiedProfileLink] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareSearchQuery, setShareSearchQuery] = useState('');
  const [shareSearchResults, setShareSearchResults] = useState<User[]>([]);
  const [shareSearchLoading, setShareSearchLoading] = useState(false);
  const [shareSending, setShareSending] = useState(false);

  // Determine which identifier to use
  const profileIdentifier = username || userId;
  const isUsernameRoute = !!username;

  useEffect(() => {
    fetchUserProfile();
    fetchReferralStats();
  }, [profileIdentifier, currentUser]);

  useEffect(() => {
    if (user?._id || user?.id) {
      fetchPosts();
    }
  }, [user?._id, user?.id, viewMode]);

  const fetchPosts = async () => {
    const userIdForPosts = user?._id || user?.id;
    if (!userIdForPosts) return;

    try {
      setPostsLoading(true);
      const response = await fetch(`/api/posts?userId=${userIdForPosts}&type=${viewMode === 'articles' ? 'article' : 'post'}`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (data.success) {
        setPosts(data.posts);
      }
    } catch (err: any) {
      console.error('Error fetching posts:', err);
    } finally {
      setPostsLoading(false);
    }
  };

  const fetchUserProfile = async () => {
    if (!profileIdentifier) return;

    try {
      setLoading(true);
      // Use different API endpoint based on route type
      const endpoint = isUsernameRoute
        ? `/api/users/u/${profileIdentifier}`
        : `/api/users/${profileIdentifier}`;

      const response = await fetch(endpoint, {
        credentials: 'include',
      });
      const data = await response.json();

      if (data.success) {
        setUser(data.user);

        // If accessed by old ID route and user has username, redirect to username route
        if (!isUsernameRoute && data.user.username) {
          navigate(`/u/${data.user.username}`, { replace: true });
          return;
        }

        // Fetch completed jobs using the user's ID
        fetchCompletedJobs(data.user.id || data.user._id);
      } else {
        setError(data.message || 'Error al cargar el perfil');
      }
    } catch (err: any) {
      setError('Error al cargar el perfil del usuario');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompletedJobs = async (userIdToFetch?: string) => {
    const idToUse = userIdToFetch || userId;
    if (!idToUse) return;

    try {
      // Fetch completed jobs by category (new endpoint)
      const categoryResponse = await fetch(`/api/users/${idToUse}/completed-by-category`, {
        credentials: 'include',
      });
      const categoryData = await categoryResponse.json();

      if (categoryData.success) {
        setCompletedByCategory(categoryData.categories || []);
      }

      // Also fetch individual contracts for legacy compatibility
      const response = await fetch(`/api/contracts?doer=${idToUse}&status=completed&limit=10`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (data.success) {
        setCompletedJobs(data.contracts || []);
      }
    } catch (err: any) {
      console.error('Error fetching completed jobs:', err);
    }
  };

  const fetchReferralStats = async () => {
    // Solo cargar si es el perfil propio
    if (!currentUser || (currentUser._id !== userId && currentUser.id !== userId)) return;

    try {
      const response = await fetch('/api/referrals/stats', {
        credentials: 'include',
      });
      const data = await response.json();

      if (data.success) {
        setReferralStats(data.stats);
      }
    } catch (err: any) {
      console.error('Error fetching referral stats:', err);
    }
  };

  const copyReferralCode = () => {
    if (referralStats?.referralCode) {
      navigator.clipboard.writeText(referralStats.referralCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // Generate profile URL
  const getProfileUrl = () => {
    const baseUrl = window.location.origin;
    if (user?.username) {
      return `${baseUrl}/u/${user.username}`;
    }
    return `${baseUrl}/profile/${user?.id || user?._id}`;
  };

  // Copy profile link
  const copyProfileLink = async () => {
    const url = getProfileUrl();
    await navigator.clipboard.writeText(url);
    setCopiedProfileLink(true);
    setTimeout(() => setCopiedProfileLink(false), 2000);
    setShowShareMenu(false);

    // Track share event
    if (user?.id || user?._id) {
      try {
        await fetch(`/api/users/${user.id || user._id}/track-share`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ type: 'copy_link' }),
        });
      } catch (err) {
        console.error('Error tracking share:', err);
      }
    }
  };

  // Search users to share with
  const searchUsersToShare = async (query: string) => {
    if (!query || query.length < 2) {
      setShareSearchResults([]);
      return;
    }

    try {
      setShareSearchLoading(true);
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&limit=10`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        // Filter out the profile owner and current user
        const filtered = data.users.filter((u: User) =>
          u.id !== user?.id &&
          u.id !== currentUser?.id &&
          u._id !== user?._id &&
          u._id !== currentUser?._id
        );
        setShareSearchResults(filtered);
      }
    } catch (err) {
      console.error('Error searching users:', err);
    } finally {
      setShareSearchLoading(false);
    }
  };

  // Share profile via private message
  const shareProfileToUser = async (targetUser: User) => {
    if (!user) return;

    try {
      setShareSending(true);

      // Create or get conversation with target user
      const convResponse = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          participants: [targetUser.id || targetUser._id],
        }),
      });
      const convData = await convResponse.json();

      if (!convData.success) {
        throw new Error('No se pudo crear la conversación');
      }

      // Send message with profile link
      const profileUrl = getProfileUrl();
      const message = `Te comparto el perfil de ${user.name}: ${profileUrl}`;

      await fetch(`/api/chat/conversations/${convData.conversation._id || convData.conversation.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          content: message,
          type: 'profile_share',
          metadata: {
            sharedUserId: user.id || user._id,
            sharedUserName: user.name,
            sharedUserAvatar: user.avatar,
            sharedUserUsername: user.username,
          },
        }),
      });

      // Track share event
      await fetch(`/api/users/${user.id || user._id}/track-share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type: 'private_message', targetUserId: targetUser.id || targetUser._id }),
      });

      setShowShareModal(false);
      setShareSearchQuery('');
      setShareSearchResults([]);

      // Show success notification
      alert(`Perfil compartido con ${targetUser.name}`);
    } catch (err) {
      console.error('Error sharing profile:', err);
      alert('Error al compartir el perfil');
    } finally {
      setShareSending(false);
    }
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchUsersToShare(shareSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [shareSearchQuery]);

  const handleStartChat = async () => {
    if (!userId || !user) return;

    try {
      const response = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          participants: [userId],
        }),
      });

      const data = await response.json();

      if (data.success) {
        window.location.href = `/messages?conversation=${data.conversation._id}`;
      }
    } catch (err: any) {
      console.error('Error starting chat:', err);
    }
  };

  const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const response = await fetch('/api/auth/upload-avatar', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setUser({ ...user!, avatar: data.avatar });
        setShowAvatarUpload(false);
      }
    } catch (err: any) {
      console.error('Error uploading avatar:', err);
    }
  };

  const handleUploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('cover', file);

    try {
      const response = await fetch('/api/auth/upload-cover', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const data = await response.json();

      if (data.success) {
        setUser({ ...user!, coverImage: data.coverImage });
        setShowCoverUpload(false);
      }
    } catch (err: any) {
      console.error('Error uploading cover:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-400">Cargando perfil...</p>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400">{error || 'Usuario no encontrado'}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{user.name} - Perfil | DOAPP</title>
        <meta name="description" content={`Perfil de ${user.name} en DOAPP`} />
      </Helmet>

      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          {/* Header Section */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden mb-8">
            {/* Cover Image */}
            <div
              className="h-48 bg-gradient-to-r from-sky-500 to-blue-600 relative bg-cover bg-center"
              style={{ backgroundImage: user.coverImage ? `url(${getImageUrl(user.coverImage)})` : undefined }}
            >
              {/* Upload Cover Button (own profile only) */}
              {currentUser && (currentUser._id === userId || currentUser.id === userId) && (
                <div className="absolute top-4 left-4">
                  <input
                    type="file"
                    id="cover-upload"
                    accept="image/*"
                    onChange={handleUploadCover}
                    className="hidden"
                  />
                  <label
                    htmlFor="cover-upload"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black/50 hover:bg-black/70 text-white text-sm font-medium cursor-pointer transition-colors backdrop-blur-sm"
                  >
                    <Camera className="w-4 h-4" />
                    Cambiar Portada
                  </label>
                </div>
              )}

              {/* Badges de membresía */}
              <div className="absolute top-4 right-4 flex flex-col gap-2">
                {user.membershipTier === 'pro' && user.hasMembership && (
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-bold shadow-lg">
                    <Star className="w-4 h-4 fill-current" />
                    MIEMBRO PRO
                  </span>
                )}
                {user.hasFamilyPlan && (
                  <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 text-white text-sm font-bold shadow-lg">
                    <Users className="w-4 h-4" />
                    PLAN FAMILIA
                  </span>
                )}
              </div>
            </div>

            {/* Profile Info */}
            <div className="px-8 pb-8">
              <div className="flex flex-col md:flex-row gap-6 items-start">
                {/* Avatar */}
                <div className="relative -mt-16 mb-4 md:mb-0 group">
                  <img
                    src={getImageUrl(user.avatar)}
                    alt={user.name}
                    className="w-32 h-32 rounded-2xl object-cover border-4 border-white dark:border-slate-800 shadow-lg"
                  />
                  {user.isVerified && (
                    <div className="absolute -bottom-2 -right-2 bg-green-500 rounded-full p-2 border-4 border-white dark:border-slate-800">
                      <CheckCircle className="w-5 h-5 text-white" />
                    </div>
                  )}

                  {/* Upload Avatar Button (own profile only) */}
                  {currentUser && (currentUser._id === userId || currentUser.id === userId) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity">
                      <input
                        type="file"
                        id="avatar-upload"
                        accept="image/*"
                        onChange={handleUploadAvatar}
                        className="hidden"
                      />
                      <label
                        htmlFor="avatar-upload"
                        className="p-3 bg-white dark:bg-slate-800 rounded-full cursor-pointer hover:scale-110 transition-transform"
                      >
                        <Camera className="w-5 h-5 text-slate-900 dark:text-white" />
                      </label>
                    </div>
                  )}
                </div>

                {/* User Info */}
                <div className="flex-1 pt-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
                    <div>
                      <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                        {user.name}
                      </h1>
                      {user.bio && (
                        <p className="text-slate-600 dark:text-slate-400 max-w-2xl">
                          {user.bio}
                        </p>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 flex-wrap">
                      {/* Share Button - Always visible */}
                      <div className="relative">
                        <button
                          onClick={() => setShowShareMenu(!showShareMenu)}
                          className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
                        >
                          {copiedProfileLink ? (
                            <>
                              <Check className="w-4 h-4 text-green-500" />
                              <span className="text-green-500">Copiado</span>
                            </>
                          ) : (
                            <>
                              <Share2 className="w-4 h-4" />
                              <span>Compartir</span>
                            </>
                          )}
                        </button>

                        {/* Share Menu Dropdown */}
                        {showShareMenu && (
                          <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
                            <button
                              onClick={copyProfileLink}
                              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left"
                            >
                              <Link2 className="w-5 h-5 text-slate-500" />
                              <div>
                                <p className="font-medium text-slate-900 dark:text-white">Copiar enlace</p>
                                <p className="text-xs text-slate-500">Copia el link del perfil</p>
                              </div>
                            </button>
                            {currentUser && (
                              <button
                                onClick={() => {
                                  setShowShareMenu(false);
                                  setShowShareModal(true);
                                }}
                                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left border-t border-slate-100 dark:border-slate-700"
                              >
                                <Send className="w-5 h-5 text-slate-500" />
                                <div>
                                  <p className="font-medium text-slate-900 dark:text-white">Enviar por mensaje</p>
                                  <p className="text-xs text-slate-500">Compartir con otro usuario</p>
                                </div>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Chat & Report Buttons (if not own profile) */}
                      {currentUser && currentUser._id !== userId && currentUser.id !== userId && (
                        <>
                          <Button
                            onClick={handleStartChat}
                            variant="primary"
                            className="flex items-center gap-2"
                          >
                            <MessageCircle className="w-4 h-4" />
                            <span>Chatear</span>
                          </Button>
                          <button
                            onClick={() => setShowReportModal(true)}
                            className="px-4 py-2 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2"
                          >
                            <Flag className="w-4 h-4" />
                            Denunciar
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="flex flex-wrap gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-slate-400" />
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {user.completedJobs}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400">
                        Trabajos Completados
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-amber-500 fill-current" />
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {user.rating ? Number(user.rating).toFixed(1) : '0.0'}
                      </span>
                      <span className="text-slate-600 dark:text-slate-400">
                        ({user.reviewsCount || 0} reseñas)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-600 dark:text-slate-400">
                        Miembro desde 2023
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Grid Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column - Ratings and Info */}
            <div className="lg:col-span-1 space-y-6">
              {/* Ratings Card */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                  Puntuaciones
                </h2>
                <MultipleRatings user={user} showAll={true} />
              </div>

              {/* Referral Code Card - Only show on own profile */}
              {currentUser && (currentUser._id === userId || currentUser.id === userId) && referralStats && (
                <div className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl shadow-sm p-6 text-white">
                  <div className="flex items-center gap-3 mb-4">
                    <Gift className="h-6 w-6" />
                    <h2 className="text-xl font-bold">
                      Código de Invitación
                    </h2>
                  </div>

                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 mb-4">
                    <p className="text-sm text-white/80 mb-2">Tu código:</p>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-2xl font-bold tracking-wider">
                        {referralStats.referralCode}
                      </p>
                      <button
                        onClick={copyReferralCode}
                        className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                        title="Copiar código"
                      >
                        {copiedCode ? (
                          <Check className="h-5 w-5" />
                        ) : (
                          <Copy className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Users className="h-4 w-4" />
                        <p className="text-sm text-white/80">Total referidos</p>
                      </div>
                      <p className="text-2xl font-bold">{referralStats.totalReferrals || 0}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Gift className="h-4 w-4" />
                        <p className="text-sm text-white/80">Contratos gratis</p>
                      </div>
                      <p className="text-2xl font-bold">{referralStats.freeContractsRemaining || 0}</p>
                    </div>
                  </div>

                  <div className="mt-4 text-center">
                    <a
                      href="/referrals"
                      className="text-sm text-white/90 hover:text-white underline"
                    >
                      Ver detalles completos →
                    </a>
                  </div>
                </div>
              )}

              {/* Completed Jobs by Category Section */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
                  Trabajos Completados por Categoría
                </h2>
                {completedByCategory.length === 0 ? (
                  <p className="text-center text-slate-500 dark:text-slate-400 py-8">
                    No hay trabajos completados aún.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {completedByCategory.map((category) => (
                      <div
                        key={category.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{category.icon}</span>
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {category.label}
                            </span>
                            <span className="ml-2 text-sm text-sky-600 dark:text-sky-400 font-medium">
                              ({category.count})
                            </span>
                          </div>
                        </div>
                        {category.averageRating !== null && (
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`w-4 h-4 ${
                                  star <= Math.round(category.averageRating!)
                                    ? 'text-amber-400 fill-current'
                                    : 'text-slate-300 dark:text-slate-600'
                                }`}
                              />
                            ))}
                            <span className="ml-1 text-sm text-slate-600 dark:text-slate-400">
                              {category.averageRating.toFixed(1)}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Mis Trabajos Publicados - solo en perfil propio */}
              {currentUser && (currentUser._id === userId || currentUser.id === userId) && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-sky-500" />
                    Mis Trabajos Publicados
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                    Trabajos que has publicado como cliente
                  </p>
                  <Link
                    to="/my-jobs"
                    className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 text-sm font-medium"
                  >
                    Ver todos mis trabajos →
                  </Link>
                </div>
              )}

              {/* Mis Contrataciones - solo en perfil propio */}
              {currentUser && (currentUser._id === userId || currentUser.id === userId) && (
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
                  <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Trabajos que Realicé
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                    Contratos donde trabajaste como profesional
                  </p>
                  <Link
                    to="/contracts?role=doer"
                    className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 text-sm font-medium"
                  >
                    Ver mis trabajos realizados →
                  </Link>
                </div>
              )}
            </div>

            {/* Right Column - Posts, Portfolio, Activity */}
            <div className="lg:col-span-2 space-y-6">
              {/* Posts Section */}
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                      Publicaciones
                    </h2>

                    {/* Create Buttons (own profile only) */}
                    {currentUser && (currentUser._id === userId || currentUser.id === userId) && (
                      <div className="flex gap-3">
                        <Button
                          onClick={() => {
                            setCreatePostType('post');
                            setShowCreatePost(true);
                          }}
                          variant="primary"
                        >
                          <Grid className="w-4 h-4 mr-2" />
                          Crear Post
                        </Button>
                        <Button
                          onClick={() => {
                            setCreatePostType('article');
                            setShowCreatePost(true);
                          }}
                          variant="secondary"
                        >
                          <FileText className="w-4 h-4 mr-2" />
                          Crear Artículo
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* View Mode Toggle */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setViewMode('posts')}
                      className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                        viewMode === 'posts'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      <Grid className="w-4 h-4 inline mr-2" />
                      Posts
                    </button>
                    <button
                      onClick={() => setViewMode('articles')}
                      className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                        viewMode === 'articles'
                          ? 'bg-purple-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                      }`}
                    >
                      <FileText className="w-4 h-4 inline mr-2" />
                      Artículos
                    </button>
                  </div>
                </div>

                {/* Posts List */}
                <div className="p-6">
                  {postsLoading ? (
                    <div className="text-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500 mx-auto"></div>
                      <p className="mt-4 text-slate-600 dark:text-slate-400">Cargando...</p>
                    </div>
                  ) : posts.length === 0 ? (
                    <div className="text-center py-12">
                      <Award className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                        {viewMode === 'posts' ? 'No hay publicaciones' : 'No hay artículos'}
                      </h3>
                      <p className="text-slate-600 dark:text-slate-400">
                        {currentUser && (currentUser._id === userId || currentUser.id === userId)
                          ? 'Crea tu primera publicación para compartir tu trabajo.'
                          : 'Este usuario aún no ha publicado contenido.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {posts.map((post) => (
                        <div key={post._id}>
                          <PostCard
                            post={post}
                            onComment={(postId) => setSelectedPostForComments(
                              selectedPostForComments === postId ? null : postId
                            )}
                          />
                          {selectedPostForComments === post._id && (
                            <div className="mt-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                              <PostComments postId={post._id} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Create Post Modal */}
        {showCreatePost && (
          <CreatePost
            initialType={createPostType}
            onClose={() => setShowCreatePost(false)}
            onSuccess={() => {
              setShowCreatePost(false);
              fetchPosts();
            }}
          />
        )}

        {/* Report Profile Modal */}
        {showReportModal && user && (
          <ReportProfileModal
            userId={user._id || user.id || ''}
            userName={user.name}
            onClose={() => setShowReportModal(false)}
            onSuccess={() => {
              alert('Denuncia enviada exitosamente. El equipo de soporte la revisará.');
              setShowReportModal(false);
            }}
          />
        )}

        {/* Share Profile Modal */}
        {showShareModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Compartir perfil
                </h3>
                <button
                  onClick={() => {
                    setShowShareModal(false);
                    setShareSearchQuery('');
                    setShareSearchResults([]);
                  }}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {/* Search Input */}
              <div className="p-4">
                <div className="relative">
                  <input
                    type="text"
                    value={shareSearchQuery}
                    onChange={(e) => setShareSearchQuery(e.target.value)}
                    placeholder="Buscar usuario por nombre o @usuario..."
                    className="w-full px-4 py-3 pl-10 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                </div>
              </div>

              {/* Results */}
              <div className="max-h-[300px] overflow-y-auto">
                {shareSearchLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                  </div>
                ) : shareSearchResults.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    {shareSearchQuery.length < 2
                      ? 'Escribí al menos 2 caracteres para buscar'
                      : 'No se encontraron usuarios'}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-700">
                    {shareSearchResults.map((targetUser) => (
                      <button
                        key={targetUser.id || targetUser._id}
                        onClick={() => shareProfileToUser(targetUser)}
                        disabled={shareSending}
                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left disabled:opacity-50"
                      >
                        <img
                          src={getImageUrl(targetUser.avatar)}
                          alt={targetUser.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 dark:text-white truncate">
                            {targetUser.name}
                          </p>
                          {targetUser.username && (
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              @{targetUser.username}
                            </p>
                          )}
                        </div>
                        <Send className="w-5 h-5 text-sky-500" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Profile Preview */}
              {user && (
                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Se compartirá:</p>
                  <div className="flex items-center gap-3">
                    <img
                      src={getImageUrl(user.avatar)}
                      alt={user.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{user.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {getProfileUrl()}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Click outside to close share menu */}
        {showShareMenu && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowShareMenu(false)}
          />
        )}
      </div>
    </>
  );
}
