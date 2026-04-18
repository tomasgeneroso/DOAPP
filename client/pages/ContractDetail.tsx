import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useSocket } from "@/hooks/useSocket";
import { api } from "@/lib/api";
import { paymentApi, Payment } from "@/lib/paymentApi";
import { PaymentModal } from "@/components/payments/PaymentModal";
import ContractExtensionRequest from "@/components/contracts/ContractExtensionRequest";
import ContractExtensionApproval from "@/components/contracts/ContractExtensionApproval";
import TaskClaimModal from "@/components/contracts/TaskClaimModal";
import TaskClaimResponse from "@/components/contracts/TaskClaimResponse";
import TaskEvidenceUploadModal from "@/components/contracts/TaskEvidenceUploadModal";
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  User,
  Users,
  Clock,
  CheckCircle,
  AlertCircle,
  MessageCircle,
  Flag,
  Key,
  Copy,
  Wifi,
  WifiOff,
  ClipboardList,
  Camera,
  Briefcase,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isConnected, registerContractUpdateHandler } = useSocket();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const [contract, setContract] = useState<any>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [loadingPairing, setLoadingPairing] = useState(false);
  const [pairingMessage, setPairingMessage] = useState("");
  const [showExtensionForm, setShowExtensionForm] = useState(false);
  const [showTaskClaimModal, setShowTaskClaimModal] = useState(false);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [allContracts, setAllContracts] = useState<any[]>([]);
  const [loadingAllContracts, setLoadingAllContracts] = useState(false);

  const loadContract = useCallback(async () => {
    try {
      const response = await api.get(`/contracts/${id}`);
      // API returns { success: true, contract: {...} }
      setContract(response.contract || response);
    } catch (error) {
      console.error("Error loading contract:", error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadPayments = useCallback(async () => {
    try {
      const result = await paymentApi.getContractPayments(id!);
      setPayments(result);
    } catch (error) {
      console.error("Error loading payments:", error);
    }
  }, [id]);

  // Load all contracts for multi-worker jobs
  const loadAllContracts = useCallback(async (jobId: string) => {
    if (!jobId) return;
    setLoadingAllContracts(true);
    try {
      const response = await api.get(`/contracts/all-by-job/${jobId}`);
      // API returns { success: true, contracts: [...] } directly (not response.data)
      if (response.success && response.contracts) {
        setAllContracts(response.contracts);
      }
    } catch (error) {
      console.error("Error loading all contracts:", error);
    } finally {
      setLoadingAllContracts(false);
    }
  }, []);

  useEffect(() => {
    if (id) {
      loadContract();
      loadPayments();
    }
  }, [id, loadContract, loadPayments]);

  // Load all contracts when contract is loaded (for multi-worker jobs)
  useEffect(() => {
    if (contract?.jobId || contract?.job) {
      // Handle both Sequelize (job relation) and raw ID formats
      const jobId = contract.job?.id || (typeof contract.jobId === 'object' ? contract.jobId._id || contract.jobId.id : contract.jobId);
      if (jobId) {
        loadAllContracts(jobId);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract?.jobId, loadAllContracts]);

  // Register socket handler for real-time contract updates
  useEffect(() => {
    const handler = (data: any) => {
      console.log("📝 ContractDetail: Contract updated via socket:", data);
      // Only reload if this is the same contract
      if (data.contractId === id) {
        console.log("🔄 ContractDetail: Reloading contract data...");
        loadContract();
        loadPayments();
      }
    };
    registerContractUpdateHandler(handler);
  }, [id, loadContract, loadPayments, registerContractUpdateHandler]);

  const handleReleaseEscrow = async (paymentId: string) => {
    if (!confirm(t('contracts.confirmReleaseEscrow', 'Are you sure you want to release the escrow payment?'))) return;

    try {
      await paymentApi.releaseEscrow(paymentId);
      alert(t('contracts.paymentReleasedSuccess', 'Payment released successfully'));
      loadPayments();
      loadContract();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleOpenChat = async () => {
    if (!id || loadingChat) return;

    setLoadingChat(true);
    try {
      const response = await api.get(`/chat/conversations/by-contract/${id}`);
      if (response.data.success && response.data.conversation) {
        // Navigate to chat with conversation ID
        navigate(`/chat/${response.data.conversation._id}`);
      }
    } catch (error) {
      console.error("Error opening chat:", error);
      alert(t('contracts.errorOpeningChat', 'Error opening chat. Please try again.'));
    } finally {
      setLoadingChat(false);
    }
  };

  const handleGeneratePairingCode = async () => {
    if (!id) return;

    setLoadingPairing(true);
    setPairingMessage("");
    try {
      const response = await api.post(`/contracts/${id}/generate-pairing`);
      if (response.data.success) {
        setPairingMessage(t('contracts.pairingCodeGenerated', 'Code generated successfully'));
        loadContract(); // Reload to get the new code
      }
    } catch (error: any) {
      setPairingMessage(error.response?.data?.message || t('contracts.errorGeneratingCode', 'Error generating code'));
    } finally {
      setLoadingPairing(false);
    }
  };

  const handleConfirmPairing = async () => {
    if (!id || !pairingCode) return;

    setLoadingPairing(true);
    setPairingMessage("");
    try {
      const response = await api.post(`/contracts/${id}/confirm-pairing`, {
        code: pairingCode.toUpperCase()
      });
      if (response.data.success) {
        setPairingMessage(t('contracts.pairingCodeConfirmed', 'Code confirmed successfully!'));
        setPairingCode("");
        loadContract();
      }
    } catch (error: any) {
      setPairingMessage(error.response?.data?.message || t('contracts.errorConfirmingCode', 'Error confirming code'));
    } finally {
      setLoadingPairing(false);
    }
  };

  const handleCopyCode = () => {
    if (contract?.pairingCode) {
      navigator.clipboard.writeText(contract.pairingCode);
      setPairingMessage(t('contracts.codeCopied', 'Code copied to clipboard'));
      setTimeout(() => setPairingMessage(""), 3000);
    }
  };

  // Handle work confirmation
  const [confirmingWork, setConfirmingWork] = useState(false);
  const [showConfirmationSuccessModal, setShowConfirmationSuccessModal] = useState(false);
  // Confirmation hour proposal state
  const [showHoursForm, setShowHoursForm] = useState(false);
  const [proposedStart, setProposedStart] = useState('');
  const [proposedEnd, setProposedEnd] = useState('');
  const [confirmationNotes, setConfirmationNotes] = useState('');
  // Rejection state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleProposeHours = async () => {
    if (!id || !proposedStart || !proposedEnd) {
      alert(t('contracts.mustIndicateStartEnd', 'You must indicate start and end times'));
      return;
    }
    if (new Date(proposedEnd) <= new Date(proposedStart)) {
      alert(t('contracts.endMustBeAfterStart', 'End time must be after start time'));
      return;
    }

    setConfirmingWork(true);
    try {
      const response = await api.post(`/contracts/${id}/confirm`, {
        proposedStartTime: proposedStart,
        proposedEndTime: proposedEnd,
        notes: confirmationNotes || undefined,
      });
      if (response.success) {
        setShowHoursForm(false);
        setShowConfirmationSuccessModal(true);
        loadContract();
      }
    } catch (error: any) {
      alert(error.response?.data?.message || t('contracts.errorConfirming', 'Error confirming'));
    } finally {
      setConfirmingWork(false);
    }
  };

  const handleConfirmCompletion = async () => {
    if (!id) return;
    if (!confirm(t('contracts.confirmHoursCorrect', 'Do you confirm that the reported hours are correct and the work was completed?'))) return;

    setConfirmingWork(true);
    try {
      const response = await api.post(`/contracts/${id}/confirm`);
      if (response.success) {
        setShowConfirmationSuccessModal(true);
        loadContract();
        if (contract?.job?.id || contract?.jobId) {
          const jobId = contract.job?.id || contract.jobId;
          if (jobId) loadAllContracts(jobId);
        }
      }
    } catch (error: any) {
      alert(error.response?.data?.message || t('contracts.errorConfirmingCompletion', 'Error confirming work completion'));
    } finally {
      setConfirmingWork(false);
    }
  };

  const handleRejectConfirmation = async () => {
    if (!id || !rejectionReason.trim()) {
      alert(t('contracts.mustProvideRejectionReason', 'You must provide a rejection reason'));
      return;
    }

    setConfirmingWork(true);
    try {
      const response = await api.post(`/contracts/${id}/reject-confirmation`, {
        reason: rejectionReason.trim(),
      });
      if (response.success) {
        setShowRejectModal(false);
        alert(t('contracts.confirmationRejectedDisputeCreated', 'Confirmation rejected. A dispute has been created automatically.'));
        loadContract();
      }
    } catch (error: any) {
      alert(error.response?.data?.message || t('contracts.errorRejecting', 'Error rejecting'));
    } finally {
      setConfirmingWork(false);
    }
  };

  const getTimeUntilStart = () => {
    if (!contract?.startDate) return null;
    const now = new Date();
    const startDate = new Date(contract.startDate);
    const hoursUntilStart = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilStart;
  };

  const canGeneratePairingCode = () => {
    if (!contract) return false;
    const hoursUntilStart = getTimeUntilStart();
    return (
      contract.status === 'accepted' &&
      contract.termsAcceptedByClient &&
      contract.termsAcceptedByDoer &&
      hoursUntilStart !== null &&
      hoursUntilStart <= 24 &&
      hoursUntilStart > 0 &&
      !contract.pairingCode
    );
  };

  const shouldShowPairingSection = () => {
    if (!contract) return false;

    // Show if both parties accepted and:
    // 1. We're within 24 hours before start (for generation)
    // 2. OR a code has been generated (show until contract ends)
    const hoursUntilStart = getTimeUntilStart();
    const bothAccepted = contract.termsAcceptedByClient && contract.termsAcceptedByDoer;

    if (!bothAccepted) return false;

    // If code already exists, show it until contract is completed/cancelled
    if (contract.pairingCode) {
      return ['accepted', 'in_progress'].includes(contract.status);
    }

    // If no code yet, only show if within 24 hours before start
    return (
      contract.status === 'accepted' &&
      hoursUntilStart !== null &&
      hoursUntilStart <= 24 &&
      hoursUntilStart > 0
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "in_progress":
        return "bg-blue-100 text-blue-800";
      case "accepted":
        return "bg-sky-100 text-sky-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "cancelled":
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-800";
      case "escrow":
      case "held_escrow":
        return "bg-yellow-100 text-yellow-800";
      case "pending":
        return "bg-blue-100 text-blue-800";
      case "pending_payout":
      case "released": // Legacy - treat as pending_payout
        return "bg-orange-100 text-orange-800";
      case "refunded":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPaymentStatusLabel = (status: string) => {
    const labels: Record<string, { key: string; fallback: string }> = {
      pending: { key: 'contracts.paymentStatus.pending', fallback: 'Pending' },
      held_escrow: { key: 'contracts.paymentStatus.heldEscrow', fallback: 'In Escrow' },
      escrow: { key: 'contracts.paymentStatus.escrow', fallback: 'In Escrow' },
      pending_payout: { key: 'contracts.paymentStatus.pendingPayout', fallback: 'Payment in progress' },
      released: { key: 'contracts.paymentStatus.released', fallback: 'Payment in progress' },
      completed: { key: 'contracts.paymentStatus.completed', fallback: 'Completed' },
      refunded: { key: 'contracts.paymentStatus.refunded', fallback: 'Refunded' },
    };
    const entry = labels[status];
    return entry ? t(entry.key, entry.fallback) : status;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">{t('contracts.notFound', 'Contract not found')}</h2>
          <button
            onClick={() => navigate("/")}
            className="mt-4 text-sky-600 hover:text-sky-700"
          >
            {t('common.backToHome', 'Back to home')}
          </button>
        </div>
      </div>
    );
  }

  // Handle both Sequelize (client/doer relations) and raw ID formats
  const isClient = (contract.client?.id || contract.clientId) === (user?.id || user?._id);
  const isDoer = (contract.doer?.id || contract.doerId) === (user?.id || user?._id);
  const escrowPayment = payments.find((p) => p.status === "held_escrow");
  const canPayContract =
    isClient &&
    contract.status === "accepted" &&
    contract.paymentStatus === "pending";

  // Debug log to help troubleshoot
  console.log('📊 Contract Data:', {
    status: contract.status,
    endDate: contract.endDate,
    hasClient: !!contract.client,
    hasDoer: !!contract.doer,
    clientName: contract.client?.name,
    doerName: contract.doer?.name,
    price: contract.price,
    isClient,
    isDoer,
    clientConfirmed: contract.clientConfirmed,
    doerConfirmed: contract.doerConfirmed,
  });

  return (
    <>
      <Helmet>
        <title>{t('contracts.titlePage', 'Contract')} - {contract.title || t('contracts.detail', 'Detail')} - Do</title>
      </Helmet>

      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back Button - Only visible on mobile */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
            {t('common.back', 'Back')}
          </button>

          {/* Header */}
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  {contract.job?.title || contract.jobId?.title || t('contracts.contract', 'Contract')}
                </h1>
                <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                  <span
                    className={`px-3 py-1 rounded-full font-medium ${getStatusColor(
                      contract.status
                    )}`}
                  >
                    {contract.status}
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full font-medium ${getPaymentStatusColor(
                      contract.paymentStatus
                    )}`}
                  >
                    {t('contracts.payment', 'Payment')}: {getPaymentStatusLabel(contract.paymentStatus)}
                  </span>
                  {isConnected ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <Wifi className="h-4 w-4" />
                      <span className="text-xs">{t('contracts.realtime', 'Real-time')}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-gray-400">
                      <WifiOff className="h-4 w-4" />
                      <span className="text-xs">{t('contracts.offline', 'Offline')}</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <Link
                  to={`/jobs/${contract.job?.id || contract.job?._id || contract.jobId?.id || contract.jobId?._id || contract.jobId}`}
                  className="flex items-center gap-2 px-6 py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-700 dark:bg-sky-700 dark:hover:bg-sky-600 transition font-semibold shadow-sm"
                  title={t('contracts.viewAssociatedJob', 'View the job associated with this contract')}
                >
                  <Briefcase className="h-5 w-5" />
                  {t('contracts.viewJob', 'View Job')}
                </Link>
                <button
                  onClick={handleOpenChat}
                  disabled={loadingChat}
                  className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-sky-600 text-sky-600 rounded-lg hover:bg-sky-50 transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  title={t('contracts.openChatTooltip', 'Open chat to communicate with the other party of the contract')}
                >
                  <MessageCircle className="h-5 w-5" />
                  {loadingChat ? t('common.loading', 'Loading...') : t('contracts.chat', 'Chat')}
                </button>
                {hasPermission(PERMISSIONS.DISPUTE_CREATE) && ['in_progress', 'completed', 'awaiting_confirmation'].includes(contract?.status || '') && (
                  <button
                    onClick={() => navigate(`/disputes/new?contractId=${id}`)}
                    className="flex items-center gap-2 px-6 py-3 bg-white border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition font-semibold"
                    title={t('contracts.reportProblemTooltip', 'Report issues related to this contract (work not delivered, quality, etc.)')}
                  >
                    <Flag className="h-5 w-5" />
                    {t('contracts.reportProblem', 'Report Problem')}
                  </button>
                )}
                {canPayContract && (
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    className="px-6 py-3 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition font-semibold"
                  >
                    {t('contracts.makePayment', 'Make Payment')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Contract Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 border-2 border-green-500">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                {t('contracts.contractParties', 'Contract Parties')}
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('contracts.client', 'Client')}</p>
                  {contract.client?.id ? (
                    <Link
                      to={`/profile/${contract.client.id}`}
                      className="font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:underline"
                    >
                      {contract.client.name}
                    </Link>
                  ) : (
                    <p className="font-medium text-gray-900 dark:text-white">
                      {contract.client?.name || "N/A"}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('contracts.provider', 'Provider')}</p>
                  {contract.doer?.id ? (
                    <Link
                      to={`/profile/${contract.doer.id}`}
                      className="font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:underline"
                    >
                      {contract.doer.name}
                    </Link>
                  ) : (
                    <p className="font-medium text-gray-900 dark:text-white">
                      {contract.doer?.name || "N/A"}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 border-2 border-green-500">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                {t('contracts.paymentDetails', 'Payment Details')}
              </h2>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{t('contracts.price', 'Price')}:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">${Number(contract.price || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{t('contracts.commission', 'Commission')}:</span>
                  <span className="font-semibold text-gray-900 dark:text-white">${Number(contract.commission || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between border-t dark:border-gray-700 pt-2">
                  <span className="font-semibold text-gray-900 dark:text-white">{t('contracts.total', 'Total')}:</span>
                  <span className="font-bold text-sky-600 dark:text-sky-400">
                    ${Number(contract.totalPrice || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {contract.escrowEnabled && (
                  <div className="bg-blue-50 dark:bg-blue-900/30 rounded p-2 text-sm text-blue-800 dark:text-blue-300">
                    {t('contracts.protectedWithEscrow', 'Protected with Escrow')}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 border-2 border-green-500">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                {t('contracts.dates', 'Dates')}
              </h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('contracts.startDate', 'Start')}:</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {new Date(contract.startDate).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{t('contracts.endDate', 'End')}:</p>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {new Date(contract.endDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 border-2 border-green-500">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                {t('contracts.contractStatus', 'Contract Status')}
              </h2>
              <div className="space-y-4">
                {/* Estado general del contrato */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('contracts.statusLabel', 'Status')}:</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      contract.status === 'completed' ? 'bg-green-100 text-green-800' :
                      contract.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                      contract.status === 'awaiting_confirmation' ? 'bg-yellow-100 text-yellow-800' :
                      contract.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {contract.status === 'completed' ? t('contracts.statusCompleted', 'COMPLETED') :
                       contract.status === 'in_progress' ? t('contracts.statusInProgress', 'IN PROGRESS') :
                       contract.status === 'awaiting_confirmation' ? t('contracts.statusAwaitingConfirmation', 'AWAITING CONFIRMATION') :
                       contract.status === 'cancelled' ? t('contracts.statusCancelled', 'CANCELLED') :
                       contract.status === 'accepted' ? t('contracts.statusAccepted', 'ACCEPTED') :
                       contract.status === 'pending' ? t('contracts.statusPending', 'PENDING') :
                       contract.status?.toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Aceptación de términos */}
                <div className="border-t pt-3">
                  <p className="text-xs text-gray-500 mb-2 font-medium">{t('contracts.termsAcceptance', 'Terms Acceptance')}</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {contract.termsAcceptedByClient ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-yellow-600" />
                      )}
                      <span className="text-sm">{t('contracts.client', 'Client')}: {contract.termsAcceptedByClient ? t('contracts.accepted', 'Accepted') : t('contracts.pending', 'Pending')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {contract.termsAcceptedByDoer ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-yellow-600" />
                      )}
                      <span className="text-sm">{t('contracts.worker', 'Worker')}: {contract.termsAcceptedByDoer ? t('contracts.accepted', 'Accepted') : t('contracts.pending', 'Pending')}</span>
                    </div>
                  </div>
                </div>

                {/* Verificación de Trabajo */}
                {['in_progress', 'awaiting_confirmation', 'completed'].includes(contract.status) && (
                  <div className="border-t pt-3">
                    <p className="text-xs text-gray-500 mb-2 font-medium">{t('contracts.workVerification', 'Work Verification')}</p>

                    {/* Siempre mostrar horario original */}
                    <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3 mb-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">{t('contracts.originalSchedule', 'Original contract schedule')}</p>
                      <div className="flex gap-4 text-sm">
                        <span>{t('contracts.start', 'Start')}: {new Date(contract.startDate).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        <span>{t('contracts.end', 'End')}: {new Date(contract.endDate).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    {/* Horas propuestas (si existen) */}
                    {contract.proposedStartTime && (
                      <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-3 mb-3">
                        <p className="text-xs text-sky-600 dark:text-sky-400 mb-1 font-medium">
                          {t('contracts.hoursReportedBy', 'Hours reported by')} {contract.confirmationProposedBy === contract.clientId ? (contract.client?.name || t('contracts.client', 'Client')) : (contract.doer?.name || t('contracts.worker', 'Worker'))}
                        </p>
                        <div className="flex gap-4 text-sm">
                          <span>{t('contracts.start', 'Start')}: {new Date(contract.proposedStartTime).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                          <span>{t('contracts.end', 'End')}: {new Date(contract.proposedEndTime!).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        {contract.confirmationNotes && (
                          <p className="text-xs text-gray-500 mt-1">{t('contracts.notes', 'Notes')}: {contract.confirmationNotes}</p>
                        )}
                      </div>
                    )}

                    {/* Estado: Ambos confirmaron */}
                    {contract.clientConfirmed && contract.doerConfirmed && (
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                        <p className="text-sm text-green-700 dark:text-green-300 font-medium flex items-center gap-2">
                          <CheckCircle className="h-4 w-4" />
                          {t('contracts.bothPartiesConfirmed', 'Both parties have confirmed. Contract completed.')}
                        </p>
                      </div>
                    )}

                    {/* Estado: in_progress — nadie confirmó aún */}
                    {contract.status === 'in_progress' && !contract.clientConfirmed && !contract.doerConfirmed && (
                      <>
                        {/* Verificar si el doer puede confirmar (30% del tiempo) */}
                        {isDoer && (() => {
                          const totalDuration = new Date(contract.endDate).getTime() - new Date(contract.startDate).getTime();
                          const elapsed = Date.now() - new Date(contract.startDate).getTime();
                          return elapsed < totalDuration * 0.3;
                        })() && (
                          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 mb-3">
                            <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              {t('contracts.canConfirmAfter', 'You can confirm hours after')} {new Date(new Date(contract.startDate).getTime() + (new Date(contract.endDate).getTime() - new Date(contract.startDate).getTime()) * 0.3).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} {t('contracts.thirtyPercentTime', '(30% of time)')}
                            </p>
                          </div>
                        )}

                        {/* Formulario de propuesta de horas */}
                        {!showHoursForm ? (
                          <button
                            onClick={() => {
                              setProposedStart(contract.startDate?.slice(0, 16) || '');
                              setProposedEnd(contract.endDate?.slice(0, 16) || '');
                              setShowHoursForm(true);
                            }}
                            disabled={isDoer && (() => {
                              const totalDuration = new Date(contract.endDate).getTime() - new Date(contract.startDate).getTime();
                              const elapsed = Date.now() - new Date(contract.startDate).getTime();
                              return elapsed < totalDuration * 0.3;
                            })()}
                            className="w-full bg-sky-600 hover:bg-sky-700 disabled:bg-gray-400 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                          >
                            <Clock className="h-5 w-5" />
                            {t('contracts.confirmChangeHours', 'Confirm / Change Hours Worked')}
                          </button>
                        ) : (
                          <div className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg p-4 space-y-3">
                            <p className="text-sm font-medium">{t('contracts.indicateActualHours', 'Indicate actual hours worked')}</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">{t('contracts.actualStart', 'Actual start')}</label>
                                <input type="datetime-local" value={proposedStart} onChange={(e) => setProposedStart(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 text-sm" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">{t('contracts.actualEnd', 'Actual end')}</label>
                                <input type="datetime-local" value={proposedEnd} onChange={(e) => setProposedEnd(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 text-sm" />
                              </div>
                            </div>
                            <textarea placeholder={t('contracts.additionalNotesOptional', 'Additional notes (optional)')} value={confirmationNotes} onChange={(e) => setConfirmationNotes(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-800 text-sm resize-none" rows={2} />
                            <div className="flex gap-2">
                              <button onClick={handleProposeHours} disabled={confirmingWork} className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                                {confirmingWork ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                                {t('contracts.confirmHours', 'Confirm Hours')}
                              </button>
                              <button onClick={() => setShowHoursForm(false)} className="px-4 py-2.5 bg-slate-200 dark:bg-slate-600 rounded-lg text-sm">{t('common.cancel', 'Cancel')}</button>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Estado: awaiting_confirmation — una parte propuso, la otra debe revisar */}
                    {contract.status === 'awaiting_confirmation' && (
                      <>
                        {/* Soy quien propuso → esperando revisión */}
                        {contract.confirmationProposedBy === user?.id && (
                          <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-3">
                            <p className="text-sm text-sky-700 dark:text-sky-300 text-center">
                              {t('contracts.waitingOtherPartyConfirm', 'You have confirmed your hours. Waiting for the other party to review and confirm. (Auto-confirmation in 5 hours)')}
                            </p>
                          </div>
                        )}

                        {/* Soy quien debe revisar → botones confirmar/rechazar */}
                        {contract.confirmationProposedBy !== user?.id && (isClient || isDoer) && (
                          <div className="space-y-2">
                            <button onClick={handleConfirmCompletion} disabled={confirmingWork} className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                              {confirmingWork ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle className="h-5 w-5" />}
                              {t('contracts.confirmAndRelease', 'Confirm and Release Payment')}
                            </button>
                            <button onClick={() => setShowRejectModal(true)} disabled={confirmingWork} className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                              <AlertCircle className="h-5 w-5" />
                              {t('contracts.rejectAndOpenDispute', 'Reject and Open Dispute')}
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {/* Modal de rechazo */}
                    {showRejectModal && (
                      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
                          <h3 className="text-lg font-semibold">{t('contracts.rejectConfirmation', 'Reject Confirmation')}</h3>
                          <p className="text-sm text-gray-500">{t('contracts.rejectConfirmationDesc', 'By rejecting, a dispute will be automatically created for an administrator to resolve.')}</p>
                          <textarea placeholder={t('contracts.rejectionReasonRequired', 'Rejection reason (required)')} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 text-sm resize-none" rows={3} />
                          <div className="flex gap-2">
                            <button onClick={handleRejectConfirmation} disabled={confirmingWork || !rejectionReason.trim()} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-2.5 rounded-lg">
                              {confirmingWork ? t('common.processing', 'Processing...') : t('contracts.rejectAndCreateDispute', 'Reject and Create Dispute')}
                            </button>
                            <button onClick={() => setShowRejectModal(false)} className="px-4 py-2.5 bg-slate-200 dark:bg-slate-600 rounded-lg text-sm">{t('common.cancel', 'Cancel')}</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Multi-worker Participants Section */}
          {allContracts.length > 1 && isClient && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-sky-600" />
                {t('contracts.projectWorkers', 'Project Workers')} ({allContracts.length})
              </h2>
              <div className="space-y-3">
                {allContracts.map((c, index) => (
                  <div
                    key={c.id || c._id || `contract-${index}`}
                    className={`p-4 rounded-lg border-2 ${
                      c.clientConfirmed && c.doerConfirmed
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                        : c.status === 'cancelled'
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                        : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {c.doerAvatar ? (
                          <img
                            src={c.doerAvatar}
                            alt={c.doerName}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
                            <User className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {c.doerName || t('contracts.worker', 'Worker')}
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            c.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                            c.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                            c.status === 'awaiting_confirmation' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                            c.status === 'cancelled' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                            'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                          }`}>
                            {c.status === 'completed' ? t('common.status.completed', 'Completed') :
                             c.status === 'in_progress' ? t('common.status.inProgress', 'In progress') :
                             c.status === 'awaiting_confirmation' ? t('common.status.awaitingConfirmation', 'Awaiting confirmation') :
                             c.status === 'cancelled' ? t('common.status.cancelled', 'Cancelled') :
                             c.status === 'accepted' ? t('common.status.accepted', 'Accepted') :
                             c.status}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-sm">
                            {c.doerConfirmed ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-yellow-500" />
                            )}
                            <span className="text-gray-600 dark:text-gray-400">{t('contracts.worker', 'Worker')}</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm mt-1">
                            {c.clientConfirmed ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-yellow-500" />
                            )}
                            <span className="text-gray-600 dark:text-gray-400">{t('contracts.clientYou', 'Client (you)')}</span>
                          </div>
                        </div>
                        {c.id !== id && (
                          <button
                            onClick={() => navigate(`/contracts/${c.id}`)}
                            className="text-sky-600 hover:text-sky-700 text-sm font-medium"
                          >
                            {t('common.view', 'View')} →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Resumen */}
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    {t('contracts.confirmedByWorkers', 'Confirmed by workers')}:
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {allContracts.filter(c => c.doerConfirmed).length} / {allContracts.length}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-600 dark:text-gray-400">
                    {t('contracts.confirmedByYouClient', 'Confirmed by you (client)')}:
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {allContracts.filter(c => c.clientConfirmed).length} / {allContracts.length}
                  </span>
                </div>
                {allContracts.every(c => c.clientConfirmed && c.doerConfirmed) && (
                  <div className="mt-3 bg-green-100 dark:bg-green-900/30 rounded-lg p-3 text-center">
                    <p className="text-green-700 dark:text-green-300 font-medium">
                      {t('contracts.allContractsCompleted', 'All contracts have been completed')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Admin Details Panel */}
          {user?.adminRole && (
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 p-4 mb-6">
              <details>
                <summary className="cursor-pointer text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  Admin Details
                </summary>
                <div className="mt-3 space-y-3 text-xs">
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
                    <p className="font-semibold text-amber-800 dark:text-amber-300 mb-2">Contract</p>
                    <div className="grid grid-cols-2 gap-1 text-slate-600 dark:text-slate-400">
                      <span>ID:</span><span className="font-mono text-[10px]">{contract.id || (contract as any)._id}</span>
                      <span>Status:</span><span className="font-semibold">{contract.status}</span>
                      <span>Payment Status:</span><span>{contract.paymentStatus || '-'}</span>
                      <span>Escrow:</span><span>{contract.escrowStatus || '-'}</span>
                      <span>Price:</span><span>${Number(contract.price).toLocaleString('es-AR')}</span>
                      <span>Commission:</span><span>{contract.commission || '-'}</span>
                      <span>Pairing Code:</span><span className="font-mono">{contract.pairingCode || '-'}</span>
                      <span>Client Confirmed:</span><span>{contract.clientConfirmed ? 'Yes' : 'No'}</span>
                      <span>Worker Confirmed:</span><span>{contract.doerConfirmed ? 'Yes' : 'No'}</span>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
                    <p className="font-semibold text-amber-800 dark:text-amber-300 mb-2">Client: {contract.client?.name}</p>
                    <div className="grid grid-cols-2 gap-1 text-slate-600 dark:text-slate-400">
                      <span>ID:</span><span className="font-mono text-[10px]">{contract.client?.id || contract.client?._id}</span>
                      <span>Email:</span><span>{(contract.client as any)?.email || '-'}</span>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-800 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
                    <p className="font-semibold text-amber-800 dark:text-amber-300 mb-2">Worker: {contract.doer?.name}</p>
                    <div className="grid grid-cols-2 gap-1 text-slate-600 dark:text-slate-400">
                      <span>ID:</span><span className="font-mono text-[10px]">{contract.doer?.id || contract.doer?._id}</span>
                      <span>Email:</span><span>{(contract.doer as any)?.email || '-'}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <a href={`/admin/contracts`} className="flex-1 text-center py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition-colors">Admin Contracts</a>
                    <a href={`/admin/users`} className="flex-1 text-center py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition-colors">Admin Users</a>
                  </div>
                </div>
              </details>
            </div>
          )}

          {/* Pairing Code Section */}
          {shouldShowPairingSection() && (
            <div className="bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 rounded-lg shadow-lg p-6 mb-6 border-2 border-sky-200 dark:border-sky-800">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-sky-600 p-3 rounded-lg">
                  <Key className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {t('contracts.pairingCode', 'Pairing Code')}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('contracts.pairingCodeDesc', 'Both parties must confirm the code to start the contract')}
                  </p>
                </div>
              </div>

              {pairingMessage && (
                <div className={`mb-4 p-3 rounded-lg ${
                  pairingMessage.includes("Error") || pairingMessage.includes("incorrecto")
                    ? "bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200"
                    : "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200"
                }`}>
                  {pairingMessage}
                </div>
              )}

              {!contract.pairingCode && canGeneratePairingCode() && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4">
                  <p className="text-gray-700 dark:text-gray-300 mb-3">
                    {t('contracts.contractStartsIn24h', 'The contract starts in less than 24 hours. Generate the pairing code to confirm the start.')}
                  </p>
                  <button
                    onClick={handleGeneratePairingCode}
                    disabled={loadingPairing}
                    className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loadingPairing ? t('contracts.generating', 'Generating...') : t('contracts.generateCode', 'Generate Code')}
                  </button>
                </div>
              )}

              {contract.pairingCode && (
                <>
                  {/* Display Code */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                      {t('contracts.pairingCode', 'Pairing Code')}:
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                        <p className="text-3xl font-mono font-bold text-sky-600 dark:text-sky-400 text-center tracking-widest">
                          {contract.pairingCode}
                        </p>
                      </div>
                      <button
                        onClick={handleCopyCode}
                        className="p-3 bg-sky-100 dark:bg-sky-900/30 hover:bg-sky-200 dark:hover:bg-sky-900/50 rounded-lg transition"
                        title={t('contracts.copyCode', 'Copy code')}
                      >
                        <Copy className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                      </button>
                    </div>
                    {contract.pairingExpiry && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
                        {t('contracts.expires', 'Expires')}: {new Date(contract.pairingExpiry).toLocaleString()}
                      </p>
                    )}
                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-xs text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                        <span className="text-base">📝</span>
                        <strong>{t('jobs.detail.tip', 'Tip')}:</strong> {t('contracts.pairing.tipWriteDown')}
                      </p>
                    </div>
                  </div>

                  {/* Confirmation Status */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className={`p-4 rounded-lg border-2 ${
                      contract.clientConfirmedPairing
                        ? "bg-green-50 dark:bg-green-900/20 border-green-500"
                        : "bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                    }`}>
                      <div className="flex items-center gap-3">
                        {contract.clientConfirmedPairing ? (
                          <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                        ) : (
                          <AlertCircle className="h-6 w-6 text-gray-400" />
                        )}
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {contract.client?.name || t('contracts.client', 'Client')}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {contract.clientConfirmedPairing ? t('contracts.confirmed', 'Confirmed') : t('contracts.pending', 'Pending')}
                          </p>
                          {contract.clientPairingConfirmedAt && (
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(contract.clientPairingConfirmedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className={`p-4 rounded-lg border-2 ${
                      contract.doerConfirmedPairing
                        ? "bg-green-50 dark:bg-green-900/20 border-green-500"
                        : "bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                    }`}>
                      <div className="flex items-center gap-3">
                        {contract.doerConfirmedPairing ? (
                          <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                        ) : (
                          <AlertCircle className="h-6 w-6 text-gray-400" />
                        )}
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white">
                            {contract.doer?.name || t('contracts.provider', 'Provider')}
                          </p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {contract.doerConfirmedPairing ? t('contracts.confirmed', 'Confirmed') : t('contracts.pending', 'Pending')}
                          </p>
                          {contract.doerPairingConfirmedAt && (
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(contract.doerPairingConfirmedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Input Code (if current user hasn't confirmed yet) */}
                  {((isClient && !contract.clientConfirmedPairing) || (isDoer && !contract.doerConfirmedPairing)) && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        {t('contracts.enterCodeToConfirm', 'Enter the code to confirm')}:
                      </p>
                      <div className="flex gap-3">
                        <input
                          type="text"
                          value={pairingCode}
                          onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                          placeholder={t('contracts.enterCode', 'Enter the code')}
                          maxLength={4}
                          className="flex-1 px-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent text-gray-900 dark:text-white font-mono text-lg"
                        />
                        <button
                          onClick={handleConfirmPairing}
                          disabled={loadingPairing || !pairingCode || pairingCode.length !== 4}
                          className="px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {loadingPairing ? t('contracts.confirming', 'Confirming...') : t('common.confirm', 'Confirm')}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Success Message */}
                  {contract.clientConfirmedPairing && contract.doerConfirmedPairing && (
                    <div className="bg-green-100 dark:bg-green-900/20 border-2 border-green-500 rounded-lg p-4">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <div>
                          <p className="font-semibold text-green-800 dark:text-green-200">
                            {t('contracts.bothPartiesConfirmedPairing', 'Both parties have confirmed!')}
                          </p>
                          <p className="text-sm text-green-700 dark:text-green-300">
                            {t('contracts.contractStartedCanWork', 'The contract has started. You can begin working.')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Contract Extension Section */}
          {(contract.status === 'accepted' || contract.status === 'in_progress') && (
            <>
              {/* Show extension approval if there's a pending request */}
              {contract.extensionRequestedBy && !contract.extensionApprovedBy && (
                <div className="mb-6">
                  <ContractExtensionApproval
                    contract={contract}
                    onSuccess={() => {
                      loadContract();
                      setShowExtensionForm(false);
                    }}
                  />
                </div>
              )}

              {/* Show extension request button if no extension exists and no pending request */}
              {!contract.hasBeenExtended && !contract.extensionRequestedBy && !showExtensionForm && (
                <div className="mb-6">
                  <button
                    onClick={() => setShowExtensionForm(true)}
                    className="w-full bg-blue-50 dark:bg-blue-900/20 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg p-4 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors flex items-center justify-center gap-2"
                    title={t('contracts.requestExtensionTooltip', 'Request more time to complete the contract (maximum 1 extension allowed)')}
                  >
                    <Clock className="h-5 w-5" />
                    {t('contracts.requestExtension', 'Request Contract Extension')}
                  </button>
                </div>
              )}

              {/* Show extension request form */}
              {showExtensionForm && !contract.hasBeenExtended && (
                <div className="mb-6">
                  <ContractExtensionRequest
                    contract={contract}
                    onSuccess={() => {
                      loadContract();
                      setShowExtensionForm(false);
                    }}
                    onCancel={() => setShowExtensionForm(false)}
                  />
                </div>
              )}

              {/* Show extension info if already extended */}
              {contract.hasBeenExtended && (
                <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-green-900 dark:text-green-100 mb-1">
                        {t('contracts.contractExtended', 'Contract Extended')}
                      </h3>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        {t('contracts.extendedByDays', 'Extended by')} {contract.extensionDays} {t('contracts.days', 'days')}
                        {contract.extensionAmount && contract.extensionAmount > 0 && (
                          <> {t('contracts.withAdditionalAmount', 'with an additional amount of')} ${contract.extensionAmount.toLocaleString('es-AR')} ARS</>
                        )}
                      </p>
                      {contract.originalEndDate && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                          {t('contracts.originalDate', 'Original date')}: {new Date(contract.originalEndDate).toLocaleDateString('es-AR')} →
                          {t('contracts.newDate', 'New date')}: {new Date(contract.endDate).toLocaleDateString('es-AR')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Task Claim Section */}
          {/* Show response UI for doer if there's a pending claim */}
          {contract.hasPendingTaskClaim && isDoer && (
            <div className="mb-6">
              <TaskClaimResponse
                contract={contract}
                onSuccess={() => {
                  loadContract();
                }}
              />
            </div>
          )}

          {/* Show claim button for client when contract is awaiting confirmation */}
          {isClient && contract.status === 'awaiting_confirmation' && !contract.hasPendingTaskClaim && (
            <div className="mb-6">
              <button
                onClick={() => setShowTaskClaimModal(true)}
                className="w-full bg-amber-50 dark:bg-amber-900/20 border-2 border-dashed border-amber-300 dark:border-amber-700 rounded-lg p-4 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors flex items-center justify-center gap-2"
              >
                <ClipboardList className="h-5 w-5" />
                {t('contracts.claimIncompleteTasks', 'Claim Incomplete Tasks')}
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                {t('contracts.claimIncompleteTasksDesc', 'If any task was not completed, you can claim it before confirming')}
              </p>
            </div>
          )}

          {/* Show pending claim info for client */}
          {isClient && contract.hasPendingTaskClaim && (
            <div className="mb-6 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <ClipboardList className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                    {t('contracts.pendingClaim', 'Pending Claim')}
                  </h3>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {t('contracts.claimedTasks', 'You have claimed')} {contract.claimedTaskIds?.length || 0} {t('contracts.tasks', 'task(s)')}.
                    {t('contracts.waitingWorkerResponse', 'Waiting for worker response.')}
                  </p>
                  {contract.taskClaimNewEndDate && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      {t('contracts.proposedNewDate', 'Proposed new date')}: {new Date(contract.taskClaimNewEndDate).toLocaleDateString('es-AR')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Evidence Upload Section for Workers */}
          {isDoer && contract.status === 'in_progress' && (
            <div className="mb-6">
              <button
                onClick={() => setShowEvidenceModal(true)}
                className="w-full bg-sky-50 dark:bg-sky-900/20 border-2 border-dashed border-sky-300 dark:border-sky-700 rounded-lg p-4 text-sky-600 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors flex items-center justify-center gap-2"
              >
                <Camera className="h-5 w-5" />
                {t('contracts.uploadEvidencePhotos', 'Upload Evidence Photos')}
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                {t('contracts.uploadEvidenceDesc', 'Document the work done to protect yourself in case of disputes')}
              </p>
            </div>
          )}

          {/* Payments Section */}
          {payments.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {t('contracts.paymentHistory', 'Payment History')}
              </h2>
              <div className="space-y-3">
                {payments.map((payment, index) => (
                  <div
                    key={payment._id || payment.id || `payment-${index}`}
                    className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          ${Number(payment.amount || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {payment.currency}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {payment.description || payment.paymentType}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {new Date(payment.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <span
                          className={`text-xs px-2 py-1 rounded-full font-medium ${getPaymentStatusColor(
                            payment.status
                          )}`}
                        >
                          {payment.status}
                        </span>
                        {payment.isEscrow &&
                          payment.status === "held_escrow" &&
                          isClient && (
                            <button
                              onClick={() => handleReleaseEscrow(payment._id)}
                              className="mt-2 text-sm text-sky-600 hover:text-sky-700 font-medium"
                            >
                              {t('contracts.releasePayment', 'Release Payment')}
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          contractId={contract.id || contract._id}
          contractTitle={contract.job?.title || contract.jobId?.title || t('contracts.contract', 'Contract')}
          amount={contract.price}
          recipientName={contract.doer?.name || t('contracts.provider', 'Provider')}
          escrowEnabled={contract.escrowEnabled}
          onSuccess={() => {
            loadPayments();
            loadContract();
          }}
        />
      )}

      {/* Task Claim Modal */}
      <TaskClaimModal
        contract={contract}
        isOpen={showTaskClaimModal}
        onClose={() => setShowTaskClaimModal(false)}
        onSuccess={() => {
          loadContract();
          setShowTaskClaimModal(false);
        }}
      />

      {/* Evidence Upload Modal for Workers */}
      {(contract.jobId || contract.job) && (
        <TaskEvidenceUploadModal
          jobId={contract.job?.id || (typeof contract.jobId === 'object' ? contract.jobId._id || contract.jobId.id : contract.jobId)}
          isOpen={showEvidenceModal}
          onClose={() => setShowEvidenceModal(false)}
          onSuccess={() => {
            loadContract();
            setShowEvidenceModal(false);
          }}
        />
      )}
    </>
  );
}
