import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import {
  Users,
  Plus,
  Search,
  Calendar,
  Check,
  X,
  Trash2,
  Edit2,
  Copy,
  AlertCircle,
  Clock,
  UserCheck,
  Gift
} from 'lucide-react';

interface FamilyCode {
  id: string;
  firstName: string;
  lastName: string;
  code: string;
  notes?: string;
  isActive: boolean;
  expiresAt?: string;
  usedById?: string;
  usedAt?: string;
  usedBy?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  createdAt: string;
}

interface Stats {
  total: number;
  active: number;
  used: number;
  expired: number;
  inactive: number;
}

export default function FamilyCodes() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [codes, setCodes] = useState<FamilyCode[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCode, setSelectedCode] = useState<FamilyCode | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    notes: '',
    expiresAt: '',
  });

  useEffect(() => {
    fetchCodes();
    fetchStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  const fetchCodes = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const response = await fetch(`/api/admin/family-codes?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setCodes(data.data);
      }
    } catch (error) {
      console.error('Error fetching family codes:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/family-codes/stats', {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/admin/family-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          notes: formData.notes || undefined,
          expiresAt: formData.expiresAt || undefined,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setShowCreateModal(false);
        setFormData({ firstName: '', lastName: '', notes: '', expiresAt: '' });
        fetchCodes();
        fetchStats();
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error('Error creating family code:', error);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCode) return;

    try {
      const response = await fetch(`/api/admin/family-codes/${selectedCode.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          notes: formData.notes || undefined,
          expiresAt: formData.expiresAt || null,
          isActive: selectedCode.isActive,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setShowEditModal(false);
        setSelectedCode(null);
        setFormData({ firstName: '', lastName: '', notes: '', expiresAt: '' });
        fetchCodes();
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error('Error updating family code:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('admin.familyCodes.confirmDelete', 'Are you sure you want to delete this code? If already used, the user will lose the family plan.'))) return;

    try {
      const response = await fetch(`/api/admin/family-codes/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        fetchCodes();
        fetchStats();
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error('Error deleting family code:', error);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm(t('admin.familyCodes.confirmRevoke', 'Are you sure you want to revoke this code? The user will lose the family plan.'))) return;

    try {
      const response = await fetch(`/api/admin/family-codes/${id}/revoke`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        fetchCodes();
        fetchStats();
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error('Error revoking family code:', error);
    }
  };

  const handleToggleActive = async (code: FamilyCode) => {
    try {
      const response = await fetch(`/api/admin/family-codes/${code.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !code.isActive }),
      });
      const data = await response.json();
      if (data.success) {
        fetchCodes();
        fetchStats();
      }
    } catch (error) {
      console.error('Error toggling family code:', error);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const openEditModal = (code: FamilyCode) => {
    setSelectedCode(code);
    setFormData({
      firstName: code.firstName,
      lastName: code.lastName,
      notes: code.notes || '',
      expiresAt: code.expiresAt ? new Date(code.expiresAt).toISOString().split('T')[0] : '',
    });
    setShowEditModal(true);
  };

  const getCodeStatus = (code: FamilyCode) => {
    if (code.usedById) return 'used';
    if (!code.isActive) return 'inactive';
    if (code.expiresAt && new Date(code.expiresAt) < new Date()) return 'expired';
    return 'active';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">{t('admin.familyCodes.available', 'Available')}</span>;
      case 'used':
        return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-full">{t('admin.familyCodes.inUse', 'In use')}</span>;
      case 'expired':
        return <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded-full">{t('admin.familyCodes.expired', 'Expired')}</span>;
      case 'inactive':
        return <span className="px-2 py-1 text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-400 rounded-full">{t('admin.familyCodes.inactive', 'Inactive')}</span>;
      default:
        return null;
    }
  };

  // Check if user is owner
  if (user?.adminRole !== 'owner') {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-red-700 dark:text-red-400 mb-2">{t('admin.familyCodes.accessDenied', 'Access Denied')}</h2>
          <p className="text-red-600 dark:text-red-300">{t('admin.familyCodes.ownerOnly', 'Only the owner can access this section.')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Gift className="h-7 w-7 text-purple-500" />
            {t('admin.familyCodes.title', 'Family Codes')}
          </h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            {t('admin.familyCodes.subtitle', 'Manage special codes for family and friends (0% commission)')}
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors"
        >
          <Plus className="h-5 w-5" />
          {t('admin.familyCodes.createCode', 'Create Code')}
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">Total</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-green-200 dark:border-green-800">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.active}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{t('admin.familyCodes.available', 'Available')}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.used}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{t('admin.familyCodes.inUse', 'In use')}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-orange-200 dark:border-orange-800">
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.expired}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{t('admin.familyCodes.expired', 'Expired')}</p>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <p className="text-2xl font-bold text-slate-600 dark:text-slate-400">{stats.inactive}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">{t('admin.familyCodes.inactive', 'Inactive')}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="text"
            placeholder={t('admin.familyCodes.searchPlaceholder', 'Search by name or code...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
        >
          <option value="all">{t('admin.familyCodes.allStatuses', 'All statuses')}</option>
          <option value="active">{t('admin.familyCodes.available', 'Available')}</option>
          <option value="used">{t('admin.familyCodes.inUse', 'In use')}</option>
          <option value="expired">{t('admin.familyCodes.expired', 'Expired')}</option>
          <option value="inactive">{t('admin.familyCodes.inactive', 'Inactive')}</option>
        </select>
      </div>

      {/* Codes List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-500 border-t-transparent"></div>
        </div>
      ) : codes.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-12 text-center border border-slate-200 dark:border-slate-700">
          <Users className="h-16 w-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400">{t('admin.familyCodes.noCodes', 'No family codes created')}</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 text-purple-500 hover:text-purple-600 font-medium"
          >
            {t('admin.familyCodes.createFirst', 'Create the first one')}
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-700/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.familyCodes.beneficiary', 'Beneficiary')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.familyCodes.code', 'Code')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('common.status.label', 'Status')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('common.user', 'User')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('admin.familyCodes.dates', 'Dates')}</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">{t('common.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {codes.map((code) => {
                  const status = getCodeStatus(code);
                  return (
                    <tr key={code.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-4">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">
                            {code.firstName} {code.lastName}
                          </p>
                          {code.notes && (
                            <p className="text-sm text-slate-500 dark:text-slate-400 truncate max-w-xs">{code.notes}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <code className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded font-mono text-sm">
                            {code.code}
                          </code>
                          <button
                            onClick={() => copyToClipboard(code.code)}
                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                            title={t('admin.familyCodes.copyCode', 'Copy code')}
                          >
                            {copiedCode === code.code ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4 text-slate-400" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {getStatusBadge(status)}
                      </td>
                      <td className="px-4 py-4">
                        {code.usedBy ? (
                          <div className="flex items-center gap-2">
                            <img
                              src={code.usedBy.avatar || '/default-avatar.png'}
                              alt={code.usedBy.name}
                              className="h-8 w-8 rounded-full object-cover"
                            />
                            <div>
                              <p className="text-sm font-medium text-slate-900 dark:text-white">{code.usedBy.name}</p>
                              <p className="text-xs text-slate-500">{code.usedBy.email}</p>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm">
                        <div className="space-y-1">
                          <p className="text-slate-600 dark:text-slate-400">
                            <Calendar className="h-3 w-3 inline mr-1" />
                            {t('admin.familyCodes.created', 'Created')}: {new Date(code.createdAt).toLocaleDateString('es-AR')} {new Date(code.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {code.expiresAt && (
                            <p className={`${new Date(code.expiresAt) < new Date() ? 'text-red-500' : 'text-slate-600 dark:text-slate-400'}`}>
                              <Clock className="h-3 w-3 inline mr-1" />
                              {t('admin.familyCodes.expires', 'Expires')}: {new Date(code.expiresAt).toLocaleDateString('es-AR')}
                            </p>
                          )}
                          {code.usedAt && (
                            <p className="text-blue-600 dark:text-blue-400">
                              <UserCheck className="h-3 w-3 inline mr-1" />
                              {t('admin.familyCodes.activated', 'Activated')}: {new Date(code.usedAt).toLocaleDateString('es-AR')}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEditModal(code)}
                            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                            title={t('common.edit', 'Edit')}
                          >
                            <Edit2 className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                          </button>
                          {code.usedById ? (
                            <button
                              onClick={() => handleRevoke(code.id)}
                              className="p-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg"
                              title={t('admin.familyCodes.revokePlan', 'Revoke plan')}
                            >
                              <X className="h-4 w-4 text-orange-600" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleActive(code)}
                              className={`p-2 rounded-lg ${code.isActive ? 'hover:bg-orange-100 dark:hover:bg-orange-900/30' : 'hover:bg-green-100 dark:hover:bg-green-900/30'}`}
                              title={code.isActive ? t('common.deactivate', 'Deactivate') : t('common.activate', 'Activate')}
                            >
                              {code.isActive ? (
                                <X className="h-4 w-4 text-orange-600" />
                              ) : (
                                <Check className="h-4 w-4 text-green-600" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(code.id)}
                            className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg"
                            title={t('common.delete', 'Delete')}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              {t('admin.familyCodes.createFamilyCode', 'Create Family Code')}
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('admin.familyCodes.firstName', 'First Name')} *
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('admin.familyCodes.lastName', 'Last Name')} *
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('admin.familyCodes.expirationDate', 'Expiration date (optional)')}
                </label>
                <input
                  type="date"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <p className="text-xs text-slate-500 mt-1">{t('admin.familyCodes.leaveEmptyNoExpiry', 'Leave empty for no expiration date')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('admin.familyCodes.notes', 'Notes (optional)')}
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  rows={3}
                  placeholder={t('admin.familyCodes.notesPlaceholder', 'E.g.: Cousin from Buenos Aires...')}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormData({ firstName: '', lastName: '', notes: '', expiresAt: '' });
                  }}
                  className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600"
                >
                  {t('admin.familyCodes.createCode', 'Create Code')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedCode && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">
              {t('admin.familyCodes.editFamilyCode', 'Edit Family Code')}
            </h2>
            <form onSubmit={handleUpdate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('admin.familyCodes.firstName', 'First Name')} *
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('admin.familyCodes.lastName', 'Last Name')} *
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('admin.familyCodes.expirationDate', 'Expiration date (optional)')}
                </label>
                <input
                  type="date"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <p className="text-xs text-slate-500 mt-1">{t('admin.familyCodes.leaveEmptyNoExpiry', 'Leave empty for no expiration date')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t('admin.familyCodes.notesLabel', 'Notes')}
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedCode(null);
                    setFormData({ firstName: '', lastName: '', notes: '', expiresAt: '' });
                  }}
                  className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600"
                >
                  {t('common.saveChanges', 'Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
