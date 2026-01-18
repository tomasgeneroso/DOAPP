import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  CheckCheck,
  X,
  Loader2,
  FileText,
  Users,
  DollarSign,
  AlertCircle,
  Heart,
  Star,
  MessageSquare,
  Briefcase,
  Clock,
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

const getCategoryIcon = (category: string, type: string) => {
  switch (category) {
    case 'contract':
      return <FileText className="h-4 w-4" />;
    case 'payment':
      return <DollarSign className="h-4 w-4" />;
    case 'user':
      return <Users className="h-4 w-4" />;
    case 'jobs':
      return <Briefcase className="h-4 w-4" />;
    case 'proposal':
      return <Star className="h-4 w-4" />;
    case 'ticket':
      return <MessageSquare className="h-4 w-4" />;
    case 'admin':
      return <AlertCircle className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
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

const formatTimeAgo = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Ahora';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d`;
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

// Generate navigation URL based on notification data
const getNotificationUrl = (notification: Notification): string | null => {
  // If actionUrl is provided, use it
  if (notification.actionUrl) {
    return notification.actionUrl;
  }

  // Special case: Banking info required notification
  if (notification.data?.requiresBankingInfo) {
    return '/settings?tab=banking';
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

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { registerNotificationHandler } = useSocket();
  const navigate = useNavigate();

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/notifications?limit=5', {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setNotifications(data.data || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch unread count only
  const fetchUnreadCount = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications?limit=1&unreadOnly=true', {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchUnreadCount();
  }, [fetchUnreadCount]);

  // Fetch full list when dropdown opens
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Register real-time notification handler
  useEffect(() => {
    if (registerNotificationHandler) {
      registerNotificationHandler((notification: any) => {
        console.log('New notification received:', notification);
        setUnreadCount(prev => prev + 1);
        if (isOpen) {
          setNotifications(prev => [notification, ...prev.slice(0, 4)]);
        }
      });
    }
  }, [registerNotificationHandler, isOpen]);

  // Close dropdown when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Mark single notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
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
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
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
  }, []);

  const toggleDropdown = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={toggleDropdown}
        className="relative flex items-center justify-center w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : "Notificaciones"}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <Bell className="h-5 w-5 text-slate-600 dark:text-slate-300" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white animate-pulse"
            aria-hidden="true"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-80 sm:w-96 origin-top-right rounded-xl bg-white dark:bg-slate-800 shadow-xl ring-1 ring-black ring-opacity-5 z-[100] overflow-hidden"
          role="menu"
          aria-orientation="vertical"
          aria-label="Notificaciones"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Notificaciones
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 flex items-center gap-1"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todas como leídas
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-500 dark:text-slate-400">
                <Bell className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No tienes notificaciones</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-b-0 ${
                    !notification.read ? 'bg-sky-50/50 dark:bg-sky-900/10' : ''
                  }`}
                  onClick={() => {
                    if (!notification.read) {
                      markAsRead(notification.id);
                    }
                    const url = getNotificationUrl(notification);
                    if (url) {
                      setIsOpen(false);
                      navigate(url);
                    }
                  }}
                >
                  <div className="flex gap-3">
                    {/* Icon */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${getCategoryColor(notification.category, notification.type)}`}>
                      {getCategoryIcon(notification.category, notification.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium ${!notification.read ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                          {notification.title}
                        </p>
                        <span className="text-xs text-slate-400 flex-shrink-0">
                          {formatTimeAgo(notification.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {notification.message}
                      </p>
                      {getNotificationUrl(notification) && (
                        <span className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 mt-1">
                          {notification.data?.requiresBankingInfo
                            ? 'Configurar datos bancarios'
                            : (notification.actionText || 'Ver detalles')}
                          <ExternalLink className="h-3 w-3" />
                        </span>
                      )}
                    </div>

                    {/* Unread indicator */}
                    {!notification.read && (
                      <div className="flex-shrink-0 w-2 h-2 rounded-full bg-sky-500 mt-1.5" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 dark:border-slate-700">
            <Link
              to="/notifications"
              onClick={closeDropdown}
              className="block w-full text-center px-4 py-3 text-sm font-medium text-sky-600 dark:text-sky-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              Ver todas las notificaciones
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
