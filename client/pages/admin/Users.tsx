import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from 'react-i18next';
import { Helmet } from "react-helmet-async";
import IdBadge from "../../components/admin/IdBadge";
import { useNavigate, useSearchParams } from "react-router-dom";
import { adminApi } from "@/lib/adminApi";
import { getImageUrl } from "@/utils/imageUrl";
import { useSocket } from "@/hooks/useSocket";
import { useAuth } from "@/hooks/useAuth";
import type { AdminUser } from "@/types/admin";
import { Search, Ban, CheckCircle, Eye, Wifi, WifiOff, UserPlus, Crown, X, ShieldCheck, ShieldOff, Loader2, FileText, Briefcase, FileCheck, Award, AlertCircle, Trash2 } from "lucide-react";

export default function AdminUsers() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { user: currentUser, token } = useAuth();
  const { isConnected, registerAdminUserCreatedHandler, registerAdminUserUpdatedHandler } = useSocket();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') || "");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [realtimeAlert, setRealtimeAlert] = useState<string | null>(null);
  const [verifiedFilter, setVerifiedFilter] = useState<'all' | 'verified' | 'unverified'>('all');

  // Membership modal
  const [membershipModal, setMembershipModal] = useState<{ userId: string; userName: string; currentTier?: string } | null>(null);
  const [membershipTier, setMembershipTier] = useState<'free' | 'pro' | 'super_pro'>('pro');
  const [membershipDays, setMembershipDays] = useState("30");
  const [membershipLoading, setMembershipLoading] = useState(false);

  // Delete profile modal (owner only)
  const [deleteModal, setDeleteModal] = useState<AdminUser | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Verification modal
  const [verifyModal, setVerifyModal] = useState<AdminUser | null>(null);
  const [verifyDetail, setVerifyDetail] = useState<any>(null);
  const [verifyDetailLoading, setVerifyDetailLoading] = useState(false);
  const [verifyDetailError, setVerifyDetailError] = useState<string | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  // License modal
  const [licenseModal, setLicenseModal] = useState<AdminUser | null>(null);
  const [licenseDetail, setLicenseDetail] = useState<any>(null);
  const [licenseDetailLoading, setLicenseDetailLoading] = useState(false);
  const [licenseActionLoading, setLicenseActionLoading] = useState(false);
  const [licenseRejectReason, setLicenseRejectReason] = useState("");

  // Inline chat inside verify modal
  const [verifyChatOpen, setVerifyChatOpen] = useState(false);
  const [verifyChatConvId, setVerifyChatConvId] = useState<string | null>(null);
  const [verifyChatMessages, setVerifyChatMessages] = useState<any[]>([]);
  const [verifyChatLoading, setVerifyChatLoading] = useState(false);
  const [verifyChatSending, setVerifyChatSending] = useState(false);
  const [verifyChatInput, setVerifyChatInput] = useState('');
  const [verifyChatError, setVerifyChatError] = useState<string | null>(null);
  const verifyChatEndRef = useRef<HTMLDivElement>(null);

  const DNI_REQUEST_TEMPLATE = `Hola! Para verificar tu identidad necesitamos las fotos de tu DNI (frente y dorso). Podés subirlas desde acá: ${typeof window !== 'undefined' ? window.location.origin : ''}/complete-registration — o adjuntarlas directamente en este chat. Aceptamos imágenes o PDF. Gracias!`;

  const isOwner = currentUser?.adminRole === 'owner';

  // Real-time handlers
  const handleNewUser = useCallback((data: any) => {
    console.log('🔔 New user registered:', data);
    setRealtimeAlert(`Nuevo usuario registrado: ${data.user?.name || data.user?.email}`);
    // Add to beginning of list if on first page
    if (page === 1) {
      setUsers(prev => [data.user, ...prev.slice(0, 19)]);
    }
    setTimeout(() => setRealtimeAlert(null), 5000);
  }, [page]);

  const handleUserUpdated = useCallback((data: any) => {
    console.log('🔔 User updated:', data);
    setRealtimeAlert(`Usuario actualizado: ${data.user?.name || data.user?.email}`);
    setUsers(prev =>
      prev.map(u => (u.id === data.user?.id || u._id === data.user?._id) ? { ...u, ...data.user } : u)
    );
    setTimeout(() => setRealtimeAlert(null), 5000);
  }, []);

  useEffect(() => {
    registerAdminUserCreatedHandler(handleNewUser);
    registerAdminUserUpdatedHandler(handleUserUpdated);
  }, [registerAdminUserCreatedHandler, registerAdminUserUpdatedHandler, handleNewUser, handleUserUpdated]);

  useEffect(() => {
    loadUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, verifiedFilter]);

  const loadUsers = async () => {
    try {
      const params: Record<string, string> = {
        page: page.toString(),
        limit: "20",
      };
      if (search) params.search = search;
      if (verifiedFilter === 'verified') params.dniVerified = 'true';
      if (verifiedFilter === 'unverified') params.dniVerified = 'false';

      const res = await adminApi.users.list(params);
      if (res.success && res.data) {
        setUsers(res.data);
        if (res.pagination) {
          setTotalPages(res.pagination.pages);
        }
      }
    } catch (error) {
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBan = async (userId: string, userName: string) => {
    const reason = prompt(`¿Por qué quieres banear a ${userName}?`);
    if (!reason) return;

    try {
      await adminApi.users.ban(userId, reason);
      alert("Usuario baneado correctamente");
      loadUsers();
    } catch (error) {
      alert("Error al banear usuario");
    }
  };

  const handleUnban = async (userId: string) => {
    try {
      await adminApi.users.unban(userId);
      alert("Usuario desbaneado correctamente");
      loadUsers();
    } catch (error) {
      alert("Error al desbanear usuario");
    }
  };

  const openDeleteModal = (user: AdminUser) => {
    setDeleteModal(user);
    setDeletePassword("");
    setDeleteReason(user.banReason || "");
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    if (!deletePassword.trim()) {
      setDeleteError("Ingresá tu contraseña de owner para confirmar.");
      return;
    }
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      const res = await adminApi.users.delete(
        deleteModal.id || deleteModal._id!,
        deletePassword,
        deleteReason.trim() || undefined,
      );
      if (res.success) {
        setDeleteModal(null);
        setDeletePassword("");
        setDeleteReason("");
        loadUsers();
      } else {
        setDeleteError(res.message || "No se pudo eliminar el usuario.");
      }
    } catch (error: any) {
      setDeleteError(error?.message || "Error al eliminar el usuario.");
    } finally {
      setDeleteLoading(false);
    }
  };

  const openVerifyModal = async (user: AdminUser) => {
    setVerifyModal(user);
    setVerifyDetail(null);
    setVerifyDetailError(null);
    setVerifyDetailLoading(true);
    setVerifyChatOpen(false);
    setVerifyChatConvId(null);
    setVerifyChatMessages([]);
    setVerifyChatInput('');
    try {
      const res = await fetch(`/api/admin/users/${user.id || user._id}/profile-detail`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setVerifyDetail(data.data);
      else setVerifyDetailError(data.message || `Error ${res.status}: no se pudo cargar el perfil`);
    } catch (e: any) {
      setVerifyDetailError(e?.message || 'Error de red al cargar el perfil');
    }
    setVerifyDetailLoading(false);
  };

  const openLicenseModal = async (user: AdminUser) => {
    setLicenseModal(user);
    setLicenseDetail(null);
    setVerifyDetailError(null);
    setLicenseDetailLoading(true);
    setLicenseRejectReason('');
    try {
      const res = await fetch(`/api/admin/users/${user.id || user._id}/profile-detail`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setLicenseDetail(data.data.user);
      else setVerifyDetailError(data.message || `Error ${res.status}: no se pudo cargar el perfil`);
    } catch (e: any) {
      setVerifyDetailError(e?.message || 'Error de red al cargar el perfil');
    }
    setLicenseDetailLoading(false);
  };

  const handleLicenseApprove = async () => {
    if (!licenseModal) return;
    setLicenseActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${licenseModal.id || licenseModal._id}/approve-license`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setLicenseDetail((prev: any) => prev ? { ...prev, licenseVerificationStatus: 'approved', licenseVerified: true } : prev);
        setUsers(prev => prev.map(u =>
          (u.id === (licenseModal.id || licenseModal._id) || u._id === (licenseModal.id || licenseModal._id))
            ? { ...u, licenseVerificationStatus: 'approved' } as any
            : u
        ));
      }
    } catch {}
    setLicenseActionLoading(false);
  };

  const handleLicenseReject = async () => {
    if (!licenseModal || !licenseRejectReason.trim()) return;
    setLicenseActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${licenseModal.id || licenseModal._id}/reject-license`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: licenseRejectReason.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setLicenseDetail((prev: any) => prev ? { ...prev, licenseVerificationStatus: 'rejected', licenseRejectedReason: licenseRejectReason.trim() } : prev);
        setLicenseRejectReason('');
        setUsers(prev => prev.map(u =>
          (u.id === (licenseModal.id || licenseModal._id) || u._id === (licenseModal.id || licenseModal._id))
            ? { ...u, licenseVerificationStatus: 'rejected' } as any
            : u
        ));
      }
    } catch {}
    setLicenseActionLoading(false);
  };

  const openVerifyChat = async () => {
    if (!verifyModal) return;
    setVerifyChatOpen(true);
    setVerifyChatLoading(true);
    setVerifyChatMessages([]);
    setVerifyChatError(null);
    setVerifyChatConvId(null);
    try {
      const userId = verifyModal.id || verifyModal._id;
      // Find or create conversation with this user
      const res = await fetch('/api/chat/conversations/find-or-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ participantId: userId }),
      });
      const data = await res.json();
      // Backend returns the conversation under `conversation` (fallback to `data`)
      const conv = data.conversation || data.data;
      if (data.success && conv) {
        const convId = conv.id || conv._id;
        setVerifyChatConvId(convId);
        // Load messages
        const msgRes = await fetch(`/api/chat/conversations/${convId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const msgData = await msgRes.json();
        if (msgData.success) {
          setVerifyChatMessages(msgData.data || []);
          setTimeout(() => verifyChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      } else {
        setVerifyChatError(data.message || `No se pudo iniciar la conversación (error ${res.status})`);
      }
    } catch (e: any) {
      setVerifyChatError(e?.message || 'Error de red al iniciar la conversación');
    }
    setVerifyChatLoading(false);
  };

  const sendVerifyMessage = async (text: string) => {
    if (!text.trim() || verifyChatSending) return;
    if (!verifyChatConvId) {
      setVerifyChatError('La conversación no se inició. Cerrá y volvé a abrir el chat.');
      return;
    }
    setVerifyChatSending(true);
    setVerifyChatError(null);
    try {
      const res = await fetch(`/api/chat/conversations/${verifyChatConvId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: text.trim(), type: 'text' }),
      });
      const data = await res.json();
      // Backend returns the created message under `message` (fallback to `data`)
      const newMsg = data.data || data.message;
      if (data.success && newMsg && typeof newMsg === 'object') {
        setVerifyChatMessages(prev => [...prev, newMsg]);
        setVerifyChatInput('');
        setTimeout(() => verifyChatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      } else {
        setVerifyChatError((typeof data.message === 'string' && data.message) || `No se pudo enviar el mensaje (error ${res.status})`);
      }
    } catch (e: any) {
      setVerifyChatError(e?.message || 'Error de red al enviar el mensaje');
    }
    setVerifyChatSending(false);
  };

  const handleVerifyUser = async (verified: boolean) => {
    if (!verifyModal) return;
    setVerifyLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${verifyModal.id || verifyModal._id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ verified }),
      });
      const data = await res.json();
      if (data.success) {
        setUsers(prev => prev.map(u =>
          (u.id === (verifyModal.id || verifyModal._id) || u._id === (verifyModal.id || verifyModal._id))
            ? { ...u, dniVerified: verified, verificationLevel: verified ? 'document' : 'email' }
            : u
        ));
        // Update verifyDetail to reflect change in modal
        if (verifyDetail) {
          setVerifyDetail((prev: any) => ({ ...prev, user: { ...prev.user, ...data.data } }));
        }
        setVerifyModal(null);
        setVerifyDetail(null);
      } else {
        alert(data.message || 'Error al verificar usuario');
      }
    } catch { alert('Error de conexión'); }
    setVerifyLoading(false);
  };

  const handleAssignMembership = async () => {
    if (!membershipModal) return;
    setMembershipLoading(true);
    try {
      const days = membershipTier === 'free' ? undefined : Number(membershipDays);
      const res = await adminApi.users.assignMembership(membershipModal.userId, membershipTier, days);
      if (res.success) {
        setUsers(prev => prev.map(u =>
          (u.id === membershipModal.userId || u._id === membershipModal.userId)
            ? { ...u, membershipTier, membershipExpiresAt: (res.data as any)?.membershipExpiresAt }
            : u
        ));
        setMembershipModal(null);
      } else {
        alert(res.message || 'Error al asignar membresía');
      }
    } catch {
      alert('Error al asignar membresía');
    } finally {
      setMembershipLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  return (
    <div>
      <Helmet>
        <title>Gestión de Usuarios - Admin | DoApp</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      {/* Real-time Alert */}
      {realtimeAlert && (
        <div className="mb-4 p-4 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3 animate-pulse">
          <UserPlus className="h-5 w-5 text-green-600 dark:text-green-400" />
          <span className="text-green-800 dark:text-green-200 font-medium">{realtimeAlert}</span>
        </div>
      )}

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Gestión de Usuarios</h1>
          <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            isConnected
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
          }`}>
            {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isConnected ? 'Live' : 'Offline'}
          </span>
        </div>
        <p className="text-gray-600 dark:text-gray-400">Administra y modera usuarios de la plataforma</p>
      </div>

      {/* Search + Filters */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400"
          />
        </div>
        {/* Verification filter */}
        <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-sm font-medium">
          {([
            { key: 'all', label: 'Todos' },
            { key: 'verified', label: '✓ Verificados' },
            { key: 'unverified', label: '? Sin verificar' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setVerifiedFilter(key); setPage(1); }}
              className={`px-3 py-2 transition-colors ${
                verifiedFilter === key
                  ? key === 'verified'
                    ? 'bg-emerald-500 text-white'
                    : key === 'unverified'
                    ? 'bg-amber-500 text-white'
                    : 'bg-sky-500 text-white'
                  : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Usuario
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Rol
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Trust Score
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Estado
              </th>
              {verifiedFilter === 'unverified' && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Verificación
                </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Fecha Registro
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Membresía
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {users.map((user) => (
              <tr
                key={user.id || user._id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/profile/${user.id || user._id}`)}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="h-10 w-10 flex-shrink-0">
                      {user.avatar ? (
                        <img className="h-10 w-10 rounded-full object-cover" src={getImageUrl(user.avatar)} alt="" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center">
                          <span className="text-white font-semibold text-sm">
                            {user.name.substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="ml-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400">{user.name}</span>
                        {(user as any).dniVerified && (
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" title="Identidad verificada" />
                        )}
                      </div>
                      {user.adminRole && (
                        <div className="text-xs text-sky-600 dark:text-sky-400">{user.adminRole}</div>
                      )}
                      <IdBadge id={user.id} />
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {user.email}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-wrap gap-1">
                    {(user.role === 'client' || user.role === 'both') && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
                        Cliente
                      </span>
                    )}
                    {(user.role === 'doer' || user.role === 'both') && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                        Trabajador
                      </span>
                    )}
                    {user.role === 'both' && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                        Ambos
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900 dark:text-white">{user.trustScore}/100</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{user.infractions} infracciones</div>
                </td>
                <td className="px-6 py-4">
                  {user.isBanned ? (
                    <div>
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                        Baneado
                      </span>
                      {user.banReason && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 max-w-xs">
                          <span className="font-medium">Razón:</span> {user.banReason}
                        </p>
                      )}
                      {user.banningAdmin && (
                        <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                          <span className="font-medium">Por:</span> {user.banningAdmin.name}
                        </p>
                      )}
                      {user.bannedAt && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {new Date(user.bannedAt).toLocaleDateString('es-AR')} {new Date(user.bannedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      Activo
                    </span>
                  )}
                </td>
                {verifiedFilter === 'unverified' && (
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      {(['dniPhotoFront', 'dniPhotoBack'] as const).map((f, i) => {
                        const url = (user as any)[f] as string | undefined;
                        const label = i === 0 ? 'Frente' : 'Dorso';
                        return url ? (
                          <button key={f} onClick={() => openVerifyModal(user)} title={`DNI ${label}`} className="block">
                            {url.endsWith('.pdf') ? (
                              <span className="flex h-10 w-14 items-center justify-center rounded border border-gray-200 dark:border-gray-600 text-sky-500">
                                <FileText className="h-4 w-4" />
                              </span>
                            ) : (
                              <img src={getImageUrl(url)} alt={label} className="h-10 w-14 rounded object-cover border border-gray-200 dark:border-gray-600 hover:opacity-80" />
                            )}
                          </button>
                        ) : (
                          <span key={f} className="flex h-10 w-14 items-center justify-center rounded border border-dashed border-gray-300 dark:border-gray-600 text-[10px] text-gray-400">
                            {label}
                          </span>
                        );
                      })}
                      <div className="text-xs">
                        {(user as any).dniNumber ? (
                          <div className="text-gray-700 dark:text-gray-300">DNI {(user as any).dniNumber}</div>
                        ) : (
                          <div className="text-amber-500">Sin DNI</div>
                        )}
                        <button
                          onClick={() => openVerifyModal(user)}
                          className="mt-0.5 inline-flex items-center gap-1 font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" /> Verificar
                        </button>
                      </div>
                    </div>
                  </td>
                )}
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {user.createdAt ? (
                    <>
                      <div>{new Date(user.createdAt).toLocaleDateString('es-AR')}</div>
                      <div className="text-xs">{new Date(user.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>
                    </>
                  ) : '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {(user as any).membershipTier && (user as any).membershipTier !== 'free' ? (
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      (user as any).membershipTier === 'super_pro'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                        : 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300'
                    }`}>
                      {(user as any).membershipTier === 'super_pro' ? 'SUPER PRO' : 'PRO'}
                    </span>
                  ) : (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                      FREE
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex gap-2">
                    {/* Verify button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); openVerifyModal(user); }}
                      className={(user as any).dniVerified
                        ? "text-emerald-600 hover:text-emerald-800 dark:text-emerald-400"
                        : "text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"}
                      title={(user as any).dniVerified ? "Verificado — ver detalles" : "Verificar identidad"}
                    >
                      <ShieldCheck className="h-5 w-5" />
                    </button>
                    {/* License button — only if user has a license */}
                    {(user as any).licenseDocumentUrl && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openLicenseModal(user); }}
                        className={
                          (user as any).licenseVerificationStatus === 'approved'
                            ? "text-green-600 hover:text-green-800 dark:text-green-400"
                            : (user as any).licenseVerificationStatus === 'rejected'
                              ? "text-red-500 hover:text-red-700 dark:text-red-400"
                              : "text-amber-500 hover:text-amber-700 dark:text-amber-400"
                        }
                        title="Revisar matrícula profesional"
                      >
                        <Award className="h-5 w-5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/profile/${user.id || user._id}`);
                      }}
                      className="text-sky-600 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300"
                      title="Ver perfil"
                    >
                      <Eye className="h-5 w-5" />
                    </button>
                    {isOwner && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMembershipTier(((user as any).membershipTier as any) || 'pro');
                          setMembershipDays("30");
                          setMembershipModal({ userId: user.id || user._id!, userName: user.name, currentTier: (user as any).membershipTier });
                        }}
                        className="text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
                        title="Asignar membresía"
                      >
                        <Crown className="h-5 w-5" />
                      </button>
                    )}
                    {user.isBanned ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnban(user.id || user._id!);
                        }}
                        className="text-green-600 hover:text-green-900"
                        title="Desbanear"
                      >
                        <CheckCircle className="h-5 w-5" />
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBan(user.id || user._id!, user.name);
                        }}
                        className="text-red-600 hover:text-red-900"
                        title="Banear"
                      >
                        <Ban className="h-5 w-5" />
                      </button>
                    )}
                    {isOwner && user.adminRole !== 'owner' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeleteModal(user);
                        }}
                        className="text-red-700 hover:text-red-900 dark:text-red-500 dark:hover:text-red-300"
                        title="Eliminar perfil permanentemente"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={verifiedFilter === 'unverified' ? 9 : 8}
                  className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  {verifiedFilter === 'verified'
                    ? 'No hay usuarios verificados todavía.'
                    : verifiedFilter === 'unverified'
                    ? 'No hay usuarios pendientes de verificación.'
                    : search
                    ? 'No se encontraron usuarios para esa búsqueda.'
                    : 'No hay usuarios para mostrar.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Membership Modal */}
      {membershipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-amber-500" />
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Asignar Membresía</h2>
              </div>
              <button onClick={() => setMembershipModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Usuario: <span className="font-semibold text-gray-900 dark:text-white">{membershipModal.userName}</span>
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Plan</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['free', 'pro', 'super_pro'] as const).map(tier => (
                    <button
                      key={tier}
                      onClick={() => setMembershipTier(tier)}
                      className={`py-2 px-3 rounded-lg text-sm font-medium border-2 transition-colors ${
                        membershipTier === tier
                          ? tier === 'super_pro'
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300'
                            : tier === 'pro'
                              ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300'
                              : 'border-gray-400 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                          : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      {tier === 'super_pro' ? 'SUPER PRO' : tier.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              {membershipTier !== 'free' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Duración (días)</label>
                  <input
                    type="number"
                    value={membershipDays}
                    onChange={(e) => setMembershipDays(e.target.value)}
                    min="1"
                    max="365"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Expira: {new Date(Date.now() + Number(membershipDays) * 86400000).toLocaleDateString('es-AR')}
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setMembershipModal(null)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                onClick={handleAssignMembership}
                disabled={membershipLoading}
                className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {membershipLoading ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Profile Modal (owner only) */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                <Trash2 className="h-5 w-5" /> Eliminar perfil
              </h2>
              <button onClick={() => setDeleteModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
              Vas a eliminar <strong>permanentemente</strong> el perfil de{" "}
              <strong>{deleteModal.name}</strong> ({deleteModal.email}). Esta acción no se puede deshacer.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              El email y DNI quedan registrados en el historial de identidades baneadas para impedir nuevos registros.
            </p>

            {(deleteModal.infractions ?? 0) < 2 && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  Este usuario tiene {deleteModal.infractions ?? 0} infracción(es). Se requieren al menos 2 para poder
                  eliminarlo permanentemente. Banealo primero si corresponde.
                </span>
              </div>
            )}

            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Motivo (opcional)
            </label>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              rows={2}
              placeholder="Motivo de la eliminación"
              className="w-full mb-4 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            />

            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Tu contraseña de owner
            </label>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Contraseña de owner"
              autoComplete="off"
              className="w-full mb-3 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            />

            {deleteError && (
              <div className="mb-3 text-xs text-red-600 dark:text-red-400">{deleteError}</div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setDeleteModal(null)}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading || (deleteModal.infractions ?? 0) < 2}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleteLoading ? 'Eliminando...' : 'Eliminar permanentemente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verification Modal */}
      {verifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl my-4 max-h-[calc(100vh-2rem)] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                  <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Verificación de Identidad</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{verifyModal.name} · {verifyModal.email}</p>
                </div>
              </div>
              <button onClick={() => { setVerifyModal(null); setVerifyDetail(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            {verifyDetailLoading ? (
              <div className="flex justify-center items-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
              </div>
            ) : verifyDetail ? (
              <div className="p-5 space-y-5 flex-1 min-h-0 overflow-y-auto">
                {/* Current status */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                  verifyDetail.user.dniVerified
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                }`}>
                  {verifyDetail.user.dniVerified ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
                  {verifyDetail.user.dniVerified ? 'Identidad verificada' : 'Pendiente de verificación'}
                  <span className="ml-auto text-xs opacity-70">Nivel: {verifyDetail.user.verificationLevel || 'none'}</span>
                </div>

                {/* Who verified */}
                {verifyDetail.user.dniVerified && verifyDetail.user.legalInfo?.adminVerifiedByName && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-xs text-gray-600 dark:text-gray-400">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                    <span>Verificado por <strong className="text-gray-900 dark:text-white">{verifyDetail.user.legalInfo.adminVerifiedByName}</strong></span>
                    {verifyDetail.user.legalInfo.adminVerifiedAt && (
                      <span className="ml-auto">
                        {new Date(verifyDetail.user.legalInfo.adminVerifiedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )}

                {/* Role + DNI number */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Rol en plataforma</h3>
                    <div className="flex flex-wrap gap-1">
                      {(verifyDetail.user.role === 'client' || verifyDetail.user.role === 'both') && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">Cliente</span>
                      )}
                      {(verifyDetail.user.role === 'doer' || verifyDetail.user.role === 'both') && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">Trabajador</span>
                      )}
                      {(verifyDetail.user.role === 'user' || !verifyDetail.user.role) && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">Usuario</span>
                      )}
                      {verifyDetail.user.adminRole && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">{verifyDetail.user.adminRole}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">DNI</h3>
                    <p className="text-sm text-gray-900 dark:text-white font-mono">
                      {verifyDetail.user.dni || <span className="text-gray-400 italic">No proporcionado</span>}
                    </p>
                  </div>
                </div>

                {/* DNI Photos */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Fotos del DNI</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {['dniPhotoFront', 'dniPhotoBack'].map((field, i) => {
                      const url = verifyDetail.user[field];
                      const label = i === 0 ? 'Frente' : 'Dorso';
                      return (
                        <div key={field} className="rounded-xl border-2 border-gray-200 dark:border-gray-600 overflow-hidden">
                          <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400">{label}</div>
                          {url ? (
                            url.endsWith('.pdf') ? (
                              <a href={getImageUrl(url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-3 text-sm text-sky-600 dark:text-sky-400 hover:underline">
                                <FileText className="h-5 w-5" /> Ver PDF
                              </a>
                            ) : (
                              <a href={getImageUrl(url)} target="_blank" rel="noopener noreferrer">
                                <img src={getImageUrl(url)} alt={label} className="w-full h-36 object-cover hover:opacity-90 transition-opacity" />
                              </a>
                            )
                          ) : (
                            <div className="h-36 flex items-center justify-center text-xs text-gray-400">No subido</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Trabajos', value: verifyDetail.jobs.length, icon: Briefcase, color: 'sky' },
                    { label: 'Contratos', value: verifyDetail.contracts.length, icon: FileCheck, color: 'emerald' },
                    { label: 'Rating', value: `${Number(verifyDetail.user.rating || 0).toFixed(1)} ⭐`, icon: ShieldCheck, color: 'amber' },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className={`rounded-xl p-3 bg-${color}-50 dark:bg-${color}-900/20 border border-${color}-200 dark:border-${color}-700`}>
                      <p className={`text-xs text-${color}-600 dark:text-${color}-400 font-medium`}>{label}</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Recent jobs */}
                {verifyDetail.jobs.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Últimos trabajos publicados</h3>
                    <div className="space-y-1.5">
                      {verifyDetail.jobs.slice(0, 5).map((job: any) => (
                        <div key={job.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                          <span className="text-gray-900 dark:text-white truncate flex-1">{job.title}</span>
                          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                            job.status === 'completed' ? 'bg-green-100 text-green-700' :
                            job.status === 'open' ? 'bg-sky-100 text-sky-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{job.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-gray-400">
                No se pudo cargar el perfil
                {verifyDetailError && <div className="mt-2 text-xs text-red-400 break-words">{verifyDetailError}</div>}
              </div>
            )}

            {/* Inline chat with user */}
            <div className="border-t border-gray-200 dark:border-gray-700">
              {!verifyChatOpen ? (
                <div className="px-5 py-3">
                  <button
                    onClick={openVerifyChat}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-sky-300 dark:border-sky-600 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 text-sm font-medium transition-colors"
                  >
                    <FileText className="h-4 w-4" />
                    Abrir chat con el usuario (solicitar documentos)
                  </button>
                </div>
              ) : (
                <div className="flex flex-col" style={{ height: 280 }}>
                  {/* Chat header */}
                  <div className="flex items-center justify-between px-4 py-2 bg-sky-50 dark:bg-sky-900/20 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300">
                      <FileText className="h-4 w-4" />
                      Chat con {verifyModal?.name}
                    </div>
                    <button onClick={() => setVerifyChatOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50 dark:bg-gray-900/40">
                    {verifyChatLoading ? (
                      <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-sky-500" /></div>
                    ) : verifyChatMessages.length === 0 ? (
                      <p className="text-center text-xs text-gray-400 py-4">Sin mensajes aún. Usá el botón para solicitar los documentos.</p>
                    ) : (
                      verifyChatMessages.map((msg: any, i: number) => {
                        const isMe = (msg.sender?.id || msg.sender?._id) === currentUser?.id;
                        const text = msg.message || msg.content || '';
                        return (
                          <div key={msg.id || msg._id || i} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${
                              isMe ? 'bg-sky-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-600'
                            }`}>
                              <p className="font-medium opacity-70 mb-0.5">{msg.sender?.name || 'Admin'}</p>
                              <p>{text}</p>
                              <p className={`text-[10px] mt-1 ${isMe ? 'text-sky-200' : 'text-gray-400'}`}>
                                {new Date(msg.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                    {verifyChatError && (
                      <div className="mt-2 text-center text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded p-2 break-words">{verifyChatError}</div>
                    )}
                    <div ref={verifyChatEndRef} />
                  </div>

                  {/* Suggested message */}
                  {verifyChatMessages.length === 0 && !verifyChatLoading && (
                    <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-700">
                      <button
                        onClick={() => sendVerifyMessage(DNI_REQUEST_TEMPLATE)}
                        disabled={verifyChatSending}
                        className="w-full text-left text-xs text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
                      >
                        💡 Clic para enviar: &ldquo;<em>{DNI_REQUEST_TEMPLATE.slice(0, 80)}…</em>&rdquo;
                      </button>
                    </div>
                  )}

                  {/* Input */}
                  <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex gap-2">
                    <input
                      type="text"
                      value={verifyChatInput}
                      onChange={e => setVerifyChatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendVerifyMessage(verifyChatInput); } }}
                      placeholder="Escribí un mensaje..."
                      className="flex-1 text-xs px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-sky-500 focus:border-transparent"
                    />
                    <button
                      onClick={() => sendVerifyMessage(verifyChatInput)}
                      disabled={verifyChatSending || !verifyChatInput.trim()}
                      className="px-3 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg transition-colors flex-shrink-0"
                    >
                      {verifyChatSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCheck className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 p-5 border-t border-gray-200 dark:border-gray-700 shrink-0">
              <button onClick={() => { setVerifyModal(null); setVerifyDetail(null); }} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                Cerrar
              </button>
              {verifyDetail?.user.dniVerified ? (
                <button
                  onClick={() => handleVerifyUser(false)}
                  disabled={verifyLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  {verifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
                  Revocar verificación
                </button>
              ) : (
                <button
                  onClick={() => handleVerifyUser(true)}
                  disabled={verifyLoading || !verifyDetail?.user.dni}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  {verifyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {!verifyDetail?.user.dni ? 'Sin DNI (no verificable)' : 'Verificar identidad'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* License Modal */}
      {licenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[calc(100vh-2rem)] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/30">
                  <Award className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">Matrícula Profesional</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{licenseModal.name} · {licenseModal.email}</p>
                </div>
              </div>
              <button onClick={() => setLicenseModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="h-5 w-5" />
              </button>
            </div>

            {licenseDetailLoading ? (
              <div className="flex justify-center items-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
              </div>
            ) : licenseDetail ? (
              <div className="p-5 space-y-4 flex-1 min-h-0 overflow-y-auto">
                {/* Status badge */}
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                  licenseDetail.licenseVerificationStatus === 'approved'
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                    : licenseDetail.licenseVerificationStatus === 'rejected'
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                      : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                }`}>
                  {licenseDetail.licenseVerificationStatus === 'approved'
                    ? <ShieldCheck className="h-4 w-4" />
                    : licenseDetail.licenseVerificationStatus === 'rejected'
                      ? <AlertCircle className="h-4 w-4" />
                      : <Award className="h-4 w-4" />}
                  {licenseDetail.licenseVerificationStatus === 'approved' ? 'Aprobada'
                    : licenseDetail.licenseVerificationStatus === 'rejected' ? 'Rechazada'
                    : 'Pendiente de revisión'}
                </div>

                {/* License info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Profesión</p>
                    <p className="text-gray-900 dark:text-white">{licenseDetail.profession || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">N° Matrícula</p>
                    <p className="text-gray-900 dark:text-white font-mono">{licenseDetail.licenseNumber || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Categoría</p>
                    <p className="text-gray-900 dark:text-white">{licenseDetail.licenseCategory || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">N° Certificado</p>
                    <p className="text-gray-900 dark:text-white font-mono">{licenseDetail.licenseCertNumber || '—'}</p>
                  </div>
                </div>

                {/* Document preview */}
                {licenseDetail.licenseDocumentUrl && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Documento</p>
                    {licenseDetail.licenseDocumentUrl.endsWith('.pdf') ? (
                      <a href={getImageUrl(licenseDetail.licenseDocumentUrl)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-3 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors">
                        <FileText className="h-5 w-5" /> Ver PDF
                      </a>
                    ) : (
                      <a href={getImageUrl(licenseDetail.licenseDocumentUrl)} target="_blank" rel="noopener noreferrer">
                        <img src={getImageUrl(licenseDetail.licenseDocumentUrl)} alt="Documento matrícula"
                          className="w-full max-h-52 object-contain rounded-xl border border-gray-200 dark:border-gray-600 hover:opacity-90 transition-opacity bg-gray-50 dark:bg-gray-700" />
                      </a>
                    )}
                  </div>
                )}

                {/* Reject reason input */}
                {licenseDetail.licenseVerificationStatus !== 'approved' && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                      Motivo de rechazo <span className="text-red-400 normal-case font-normal">(requerido para rechazar)</span>
                    </label>
                    <textarea
                      value={licenseRejectReason}
                      onChange={e => setLicenseRejectReason(e.target.value)}
                      rows={2}
                      placeholder="Ej: El documento está vencido, la foto es ilegible..."
                      className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 resize-none"
                    />
                  </div>
                )}

                {/* Previous rejection reason */}
                {licenseDetail.licenseVerificationStatus === 'rejected' && licenseDetail.licenseRejectedReason && (
                  <div className="px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700">
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium">Motivo anterior: {licenseDetail.licenseRejectedReason}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-gray-400">
                No se pudo cargar el perfil
                {verifyDetailError && <div className="mt-2 text-xs text-red-400 break-words">{verifyDetailError}</div>}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 p-5 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setLicenseModal(null)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                Cerrar
              </button>
              {licenseDetail && licenseDetail.licenseVerificationStatus !== 'approved' && (
                <button
                  onClick={handleLicenseReject}
                  disabled={licenseActionLoading || !licenseRejectReason.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  {licenseActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertCircle className="h-4 w-4" />}
                  Rechazar
                </button>
              )}
              {licenseDetail && licenseDetail.licenseVerificationStatus !== 'approved' && (
                <button
                  onClick={handleLicenseApprove}
                  disabled={licenseActionLoading || !licenseDetail?.licenseDocumentUrl}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
                >
                  {licenseActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  Aprobar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 text-gray-900 dark:text-white"
          >
            Anterior
          </button>
          <span className="px-4 py-2 text-gray-900 dark:text-white">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-50 text-gray-900 dark:text-white"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
