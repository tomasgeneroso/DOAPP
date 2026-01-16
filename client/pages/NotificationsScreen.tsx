import { useState, useEffect, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Loader2,
  FileText,
  Users,
  DollarSign,
  AlertCircle,
  Star,
  MessageSquare,
  Briefcase,
  ArrowLeft,
  Filter,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { useSocket } from '../hooks/useSocket';

interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'alert';
  category: 'ticket' | 'contract' | 'user' | 'payment' | 'system' | 'admin' | 'jobs' | 'chat' | 'proposal';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
  actionText?: string;
  relatedModel?: string;
  relatedId?: string;
  data?: any;
}

interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const getCategoryIcon = (category: string, type: string) => {
  switch (category) {
    case 'contract':
      return <FileText className="h-5 w-5" />;
    case 'payment':
      return <DollarSign className="h-5 w-5" />;
    case 'user':
      return <Users className="h-5 w-5" />;
    case 'jobs':
      return <Briefcase className="h-5 w-5" />;
    case 'proposal':
      return <Star className="h-5 w-5" />;
    case 'ticket':
      return <MessageSquare className="h-5 w-5" />;
    case 'admin':
      return <AlertCircle className="h-5 w-5" />;
    default:
      return <Bell className="h-5 w-5" />;
  }
};

const getCategoryColor = (category: string, type: string) => {
  if (type === 'error') return 'text-red-500 bg-red-100 dark:bg-red-900/30';
  if (type === 'warning') return 'text-amber-500 bg-amber-100 dark:bg-amber-900/30';
  if (type === 'success') return 'text-green-500 bg-green-100 dark:bg-green-900/30';

  switch (category) {
    case 'contract':
      return 'text-blue-500 bg-blue-100 dark:bg-blue-900/30';
    case 'payment':
      return 'text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30';
    case 'user':
      return 'text-purple-500 bg-purple-100 dark:bg-purple-900/30';
    case 'jobs':
      return 'text-sky-500 bg-sky-100 dark:bg-sky-900/30';
    case 'proposal':
      return 'text-amber-500 bg-amber-100 dark:bg-amber-900/30';
    default:
      return 'text-slate-500 bg-slate-100 dark:bg-slate-700';
  }
};

const getCategoryLabel = (category: string) => {
  switch (category) {
    case 'contract':
      return 'Contrato';
    case 'payment':
      return 'Pago';
    case 'user':
      return 'Usuario';
    case 'jobs':
      return 'Trabajo';
    case 'proposal':
      return 'Propuesta';
    case 'ticket':
      return 'Soporte';
    case 'admin':
      return 'Sistema';
    default:
      return 'General';
  }
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Hace un momento';
  if (diffInSeconds < 3600) return `Hace ${Math.floor(diffInSeconds / 60)} minutos`;
  if (diffInSeconds < 86400) return `Hace ${Math.floor(diffInSeconds / 3600)} horas`;
  if (diffInSeconds < 604800) return `Hace ${Math.floor(diffInSeconds / 86400)} días`;

  return date.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Generate navigation URL based on notification data
const getNotificationUrl = (notification: Notification): string | null => {
  // If actionUrl is provided, use it
  if (notification.actionUrl) {
    return notification.actionUrl;
  }

  // Generate URL based on relatedModel and relatedId
  if (notification.relatedModel && notification.relatedId) {
    switch (notification.relatedModel.toLowerCase()) {
      case 'job':
      case 'jobs':
        return `/jobs/${notification.relatedId}`;
      case 'contract':
      case 'contracts':
        return `/contracts/${notification.relatedId}`;
      case 'proposal':
      case 'proposals':
        return `/proposals/${notification.relatedId}`;
      case 'user':
      case 'users':
        return `/profile/${notification.relatedId}`;
      case 'ticket':
      case 'tickets':
        return `/tickets/${notification.relatedId}`;
      case 'dispute':
      case 'disputes':
        return `/disputes/${notification.relatedId}`;
      case 'conversation':
      case 'chat':
        return `/messages/${notification.relatedId}`;
      case 'portfolio':
        return `/portfolio/${notification.relatedId}`;
      default:
        break;
    }
  }

  // Generate URL based on category and data
  if (notification.data) {
    const { jobId, contractId, proposalId, userId, ticketId, disputeId, conversationId } = notification.data;

    if (jobId) return `/jobs/${jobId}`;
    if (contractId) return `/contracts/${contractId}`;
    if (proposalId) return `/proposals/${proposalId}`;
    if (userId) return `/profile/${userId}`;
    if (ticketId) return `/tickets/${ticketId}`;
    if (disputeId) return `/disputes/${disputeId}`;
    if (conversationId) return `/messages/${conversationId}`;
  }

  // Fallback based on category
  switch (notification.category) {
    case 'jobs':
      return '/my-jobs';
    case 'contract':
      return '/contracts';
    case 'proposal':
      return '/proposals';
    case 'ticket':
      return '/tickets';
    case 'payment':
      return '/balance';
    default:
      return null;
  }
};

export default function NotificationsScreen() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [selectedNotifications, setSelectedNotifications] = useState<Set<string>>(new Set());
  const { registerNotificationHandler } = useSocket();

  // Fetch notifications
  const fetchNotifications = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });
      if (filter === 'unread') {
        params.append('unreadOnly', 'true');
      }

      const response = await fetch(`/api/notifications?${params}`, {
        credentials: 'include',
      });
      const data = await response.json();

      if (data.success) {
        setNotifications(data.data || []);
        setPagination(data.pagination);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Register real-time notification handler
  useEffect(() => {
    if (registerNotificationHandler) {
      registerNotificationHandler((notification: any) => {
        setNotifications(prev => [notification, ...prev]);
        setUnreadCount(prev => prev + 1);
      });
    }
  }, [registerNotificationHandler]);

  // Mark single notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'PUT',
        credentials: 'include',
      });
      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications/read-all', {
        method: 'PUT',
        credentials: 'include',
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  // Delete notification
  const deleteNotification = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      const notification = notifications.find(n => n.id === notificationId);
      if (notification && !notification.read) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  // Handle notification click
  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    const url = getNotificationUrl(notification);
    if (url) {
      navigate(url);
    }
  };

  return (
    <>
      <Helmet>
        <title>Notificaciones - DoApp</title>
        <meta name="description" content="Todas tus notificaciones en un solo lugar" />
      </Helmet>

      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="container mx-auto max-w-4xl py-8 px-4">
          {/* Header */}
          <div className="mb-6">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio
            </Link>

            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                  <Bell className="h-7 w-7 text-sky-500" />
                  Notificaciones
                  {unreadCount > 0 && (
                    <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-red-500 px-2 text-sm font-bold text-white">
                      {unreadCount}
                    </span>
                  )}
                </h1>
                <p className="text-slate-600 dark:text-slate-400 mt-1">
                  Mantente al día con todas las actualizaciones
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchNotifications()}
                  className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  title="Actualizar"
                >
                  <RefreshCw className={`h-5 w-5 text-slate-600 dark:text-slate-400 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Filters and Actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilter('unread')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  filter === 'unread'
                    ? 'bg-sky-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                No leídas
                {unreadCount > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                    filter === 'unread' ? 'bg-white/20 text-white' : 'bg-red-500 text-white'
                  }`}>
                    {unreadCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-sky-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                Todas
              </button>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors"
              >
                <CheckCheck className="h-4 w-4" />
                Marcar todas como leídas
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-12 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <Bell className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
                <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">
                  {filter === 'unread' ? 'No tienes notificaciones sin leer' : 'No tienes notificaciones'}
                </h3>
                <p className="text-slate-500 dark:text-slate-400">
                  {filter === 'unread'
                    ? 'Todas tus notificaciones han sido leídas'
                    : 'Las notificaciones aparecerán aquí cuando tengas actividad'}
                </p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`group rounded-xl border transition-all cursor-pointer ${
                    !notification.read
                      ? 'bg-sky-50 dark:bg-sky-900/10 border-sky-200 dark:border-sky-800 shadow-sm'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="p-4">
                    <div className="flex gap-4">
                      {/* Icon */}
                      <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${getCategoryColor(notification.category, notification.type)}`}>
                        {getCategoryIcon(notification.category, notification.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getCategoryColor(notification.category, notification.type)}`}>
                                {getCategoryLabel(notification.category)}
                              </span>
                              {!notification.read && (
                                <span className="w-2 h-2 rounded-full bg-sky-500" />
                              )}
                            </div>
                            <h3 className={`text-base font-semibold ${!notification.read ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                              {notification.title}
                            </h3>
                          </div>
                          <span className="text-xs text-slate-400 whitespace-nowrap">
                            {formatDate(notification.createdAt)}
                          </span>
                        </div>

                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          {notification.message}
                        </p>

                        <div className="flex items-center justify-between mt-3">
                          {getNotificationUrl(notification) ? (
                            <span className="inline-flex items-center gap-1 text-sm text-sky-600 dark:text-sky-400 font-medium">
                              {notification.actionText || 'Ver detalles'}
                              <ExternalLink className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <span />
                          )}

                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!notification.read && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAsRead(notification.id);
                                }}
                                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
                                title="Marcar como leída"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotification(notification.id);
                              }}
                              className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-500 dark:text-slate-400 hover:text-red-500"
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                onClick={() => fetchNotifications(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Anterior
              </button>
              <span className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400">
                Página {pagination.page} de {pagination.pages}
              </span>
              <button
                onClick={() => fetchNotifications(pagination.page + 1)}
                disabled={pagination.page >= pagination.pages}
                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
