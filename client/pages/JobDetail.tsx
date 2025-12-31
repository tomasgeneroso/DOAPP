import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  MessageSquare,
  Star,
  User,
  DollarSign,
  Loader2,
  Pause,
  Play,
  XCircle,
  Edit,
  Trash2,
  Users,
  CheckCircle,
  ExternalLink,
  AlertTriangle,
  Bell,
  Key,
  Copy,
  Check,
  ChevronDown,
  Briefcase,
} from "lucide-react";
import type { Job } from "@/types";
import { getClientInfo } from "@/lib/utils";
import MultipleRatings from "../components/user/MultipleRatings";
import LocationCircleMap from "../components/map/LocationCircleMap";
import JobTasks from "../components/jobs/JobTasks";

// Helper para parsear números en formato argentino (punto = miles, coma = decimal)
// Ej: "40.000" -> 40000, "40.000,50" -> 40000.50
const parseArgentineNumber = (value: string): number => {
  if (!value) return 0;
  // Remover espacios
  let cleaned = value.trim();
  // Si tiene coma, es decimal argentino: reemplazar puntos por nada y coma por punto
  if (cleaned.includes(',')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // Si solo tiene puntos, asumimos que son separadores de miles
    cleaned = cleaned.replace(/\./g, '');
  }
  return parseFloat(cleaned) || 0;
};

// Helper para formatear número para mostrar en input (sin separadores)
const formatBudgetInput = (value: string): string => {
  // Solo permitir números, puntos y comas
  return value.replace(/[^0-9.,]/g, '');
};

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const lastPathRef = useRef(location.pathname);
  const [applying, setApplying] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [proposals, setProposals] = useState<any[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [selectingWorker, setSelectingWorker] = useState<string | null>(null);
  const [messagingProposal, setMessagingProposal] = useState<string | null>(null);
  const [showSelectConfirmModal, setShowSelectConfirmModal] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<any>(null);
  const [newProposalAlert, setNewProposalAlert] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [newBudget, setNewBudget] = useState("");
  const [budgetReason, setBudgetReason] = useState("");
  const [changingBudget, setChangingBudget] = useState(false);
  const [showClientMenu, setShowClientMenu] = useState(false);

  // Modal de confirmación de pago por aumento de presupuesto
  const [showPaymentConfirmModal, setShowPaymentConfirmModal] = useState(false);
  const [paymentBreakdown, setPaymentBreakdown] = useState<{
    message: string;
    oldPrice: number;
    newPrice: number;
    priceDifference: number;
    commission: number;
    commissionRate: number;
    total: number;
    amountRequired: number;
  } | null>(null);

  // Modal de redirección a contrato
  const [showContractRedirectModal, setShowContractRedirectModal] = useState(false);
  const [contractRedirectUrl, setContractRedirectUrl] = useState<string>("");
  const [contractRedirectMessage, setContractRedirectMessage] = useState<string>("");

  // Contract data for pairing code and confirmation (for worker view)
  const [contractData, setContractData] = useState<{
    id: string;
    pairingCode?: string;
    pairingExpiry?: string;
    doerId?: string;
    clientId?: string;
    status?: string;
    clientConfirmed?: boolean;
    doerConfirmed?: boolean;
  } | null>(null);

  // All contracts for team jobs (to check if all workers confirmed)
  const [allContractsData, setAllContractsData] = useState<{
    contracts: Array<{
      id: string;
      doerId: string;
      doerName: string;
      doerAvatar?: string;
      clientConfirmed: boolean;
      doerConfirmed: boolean;
      status: string;
    }>;
    totalContracts: number;
    allClientConfirmed: boolean;
    allDoerConfirmed: boolean;
    allCompleted: boolean;
  } | null>(null);

  const [confirmingWork, setConfirmingWork] = useState(false);
  const [showConfirmationSuccessModal, setShowConfirmationSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedPairingCode, setCopiedPairingCode] = useState(false);
  const [copiedJobCode, setCopiedJobCode] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [checkingApplication, setCheckingApplication] = useState(false);

  const { registerNewProposalHandler, registerJobUpdateHandler, registerJobsRefreshHandler, registerContractUpdateHandler } = useSocket();

  // Handle contract updates (for real-time confirmation updates)
  const handleContractUpdate = useCallback((data: any) => {
    if (contractData && (data.contractId === contractData.id || data.contract?.id === contractData.id || data.contract?.jobId === id)) {
      console.log("📋 Contract updated:", data);
      if (data.contract) {
        setContractData(prev => prev ? {
          ...prev,
          clientConfirmed: data.contract.clientConfirmed ?? prev.clientConfirmed,
          doerConfirmed: data.contract.doerConfirmed ?? prev.doerConfirmed,
          status: data.contract.status ?? prev.status,
        } : null);
      }
      // Also refresh job data if contract status changed
      if (data.contract?.status === 'completed' || data.action === 'confirmed') {
        setRefreshKey(prev => prev + 1);
      }
    }
  }, [contractData, id]);

  // Handle new proposal notification
  const handleNewProposal = useCallback((data: any) => {
    if (data.proposal?.jobId === id || data.proposal?.job?.id === id) {
      console.log("🆕 New proposal received for this job:", data);
      setNewProposalAlert(`Nueva postulación de ${data.proposal?.freelancer?.name || 'un usuario'}`);
      // Add to proposals list
      setProposals(prev => {
        if (prev.some(p => p.id === data.proposal.id)) return prev;
        return [data.proposal, ...prev];
      });
      // Auto-hide after 5 seconds
      setTimeout(() => setNewProposalAlert(null), 5000);
    }
  }, [id]);

  // Handle job updates
  const handleJobUpdate = useCallback((data: any) => {
    if (data.jobId === id || data.job?.id === id) {
      console.log("📝 Job updated:", data);
      if (data.job && typeof data.job === 'object') {
        // Merge with existing job to preserve all fields
        setJob(prev => prev ? { ...prev, ...data.job } : data.job);
      }
    }
  }, [id]);

  // Handle jobs refresh (general refresh signal)
  const handleJobsRefresh = useCallback((data?: any) => {
    // If the refresh is for this specific job or a general refresh, refetch
    if (!data || data.jobId === id || data.job?.id === id || data.action === 'updated') {
      console.log("🔄 Jobs refresh signal received, refetching job:", id);
      setRefreshKey(prev => prev + 1);
    }
  }, [id]);

  // Register socket handlers
  useEffect(() => {
    registerNewProposalHandler(handleNewProposal);
    registerJobUpdateHandler(handleJobUpdate);
    registerJobsRefreshHandler(handleJobsRefresh);
    registerContractUpdateHandler(handleContractUpdate);
  }, [registerNewProposalHandler, registerJobUpdateHandler, registerJobsRefreshHandler, registerContractUpdateHandler, handleNewProposal, handleJobUpdate, handleJobsRefresh, handleContractUpdate]);

  // Fetch job data
  const fetchJob = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/jobs/${id}`);
      const data = await response.json();
      if (data.success) {
        setJob(data.job);
      } else {
        setError(data.message || "No se pudo cargar el trabajo");
      }
    } catch (err) {
      setError("Error al cargar el trabajo");
      console.error("Error fetching job:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob, refreshKey]);

  // Refetch when navigating back from edit page
  useEffect(() => {
    // Check if we navigated back from edit page
    const currentPath = location.pathname;
    const wasOnEditPage = lastPathRef.current?.includes('/edit');
    const isNowOnDetailPage = currentPath === `/jobs/${id}`;

    if (wasOnEditPage && isNowOnDetailPage) {
      // Force a refetch
      setRefreshKey(prev => prev + 1);
    }

    lastPathRef.current = currentPath;
  }, [location.pathname, id]);

  // Fetch proposals if user is the job owner
  useEffect(() => {
    const fetchProposals = async () => {
      if (!job || !user || !token) return;

      // Check if user is the job owner
      const clientId = typeof job.client === 'string' ? job.client : (job.client?.id || job.client?._id);
      const userId = user?.id || user?._id;

      if (clientId !== userId) return;
      // Cargar propuestas si el trabajo está abierto, o si está in_progress pero sin doer asignado (estado inconsistente)
      if (job.status !== 'open' && !(job.status === 'in_progress' && !job.doerId)) return;

      setLoadingProposals(true);
      try {
        const response = await fetch(`/api/proposals/job/${job.id || job._id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (data.success) {
          setProposals(data.proposals || []);
        }
      } catch (err) {
        console.error("Error fetching proposals:", err);
      } finally {
        setLoadingProposals(false);
      }
    };

    fetchProposals();
  }, [job, user, token]);

  // Check if current user has already applied to this job
  useEffect(() => {
    const checkIfApplied = async () => {
      if (!job || !user || !token) return;

      // Only check for non-owners
      const clientId = typeof job.client === 'string' ? job.client : (job.client?.id || job.client?._id);
      const userId = user?.id || user?._id;
      if (clientId === userId) return;

      setCheckingApplication(true);
      try {
        const response = await fetch(`/api/proposals/check/${job.id || job._id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (data.success) {
          setHasApplied(data.hasApplied || false);
        }
      } catch (err) {
        console.error("Error checking application status:", err);
      } finally {
        setCheckingApplication(false);
      }
    };

    checkIfApplied();
  }, [job, user, token]);

  // Fetch contract data for selected worker OR client (to show pairing code and confirmation)
  useEffect(() => {
    const fetchContractData = async () => {
      if (!job || !user || !token) return;
      const jobDoerId = job.doerId || (typeof job.doer === 'object' ? job.doer?.id : job.doer);
      const jobClientId = typeof job.client === 'object' ? (job.client?.id || job.client?._id) : job.client;
      const userId = user?.id || user?._id;

      // Fetch if current user is either the selected worker OR the client
      const isDoer = jobDoerId && jobDoerId === userId;
      const isClient = jobClientId && jobClientId === userId;
      const isSelectedWorker = job.selectedWorkers?.includes(userId as string);

      if (!isDoer && !isClient && !isSelectedWorker) return;

      try {
        // Fetch contract by job ID
        const response = await fetch(`/api/contracts/by-job/${job.id || job._id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (data.success && data.contract) {
          setContractData({
            id: data.contract.id || data.contract._id,
            pairingCode: data.contract.pairingCode,
            pairingExpiry: data.contract.pairingExpiry,
            doerId: data.contract.doerId,
            clientId: data.contract.clientId,
            status: data.contract.status,
            clientConfirmed: data.contract.clientConfirmed,
            doerConfirmed: data.contract.doerConfirmed,
          });
        }
      } catch (err) {
        console.error("Error fetching contract data:", err);
      }
    };

    // Fetch all contracts for team jobs
    const fetchAllContracts = async () => {
      if (!job || !token) return;
      // Only fetch for team jobs
      if (!job.maxWorkers || job.maxWorkers <= 1) return;

      try {
        const response = await fetch(`/api/contracts/all-by-job/${job.id || job._id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (data.success) {
          setAllContractsData({
            contracts: data.contracts,
            totalContracts: data.totalContracts,
            allClientConfirmed: data.allClientConfirmed,
            allDoerConfirmed: data.allDoerConfirmed,
            allCompleted: data.allCompleted,
          });
        }
      } catch (err) {
        console.error("Error fetching all contracts:", err);
      }
    };

    fetchContractData();
    fetchAllContracts();
  }, [job, user, token]);

  const handleCopyPairingCode = () => {
    if (contractData?.pairingCode) {
      navigator.clipboard.writeText(contractData.pairingCode);
      setCopiedPairingCode(true);
      setTimeout(() => setCopiedPairingCode(false), 3000);
    }
  };

  // Get job code (first 8 chars of UUID in uppercase)
  const getJobCode = (jobId: string) => {
    return jobId?.substring(0, 8).toUpperCase() || '';
  };

  const handleCopyJobCode = () => {
    if (job?.id) {
      const code = getJobCode(job.id);
      navigator.clipboard.writeText(code);
      setCopiedJobCode(true);
      setTimeout(() => setCopiedJobCode(false), 3000);
    }
  };

  // Handle confirming work completion
  const handleConfirmWork = async () => {
    if (!contractData?.id || !token) return;

    setConfirmingWork(true);
    try {
      const response = await fetch(`/api/contracts/${contractData.id}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        // Update local contract data
        setContractData(prev => prev ? {
          ...prev,
          clientConfirmed: data.contract?.clientConfirmed ?? prev.clientConfirmed,
          doerConfirmed: data.contract?.doerConfirmed ?? prev.doerConfirmed,
          status: data.contract?.status ?? prev.status,
        } : null);
        // Refresh all contracts data for team jobs
        if (job?.maxWorkers && job.maxWorkers > 1) {
          fetchAllContracts();
        }
        // Show success modal instead of navigating
        setShowConfirmationSuccessModal(true);
      } else {
        setErrorMessage(data.message || 'Error al confirmar el trabajo');
        setShowErrorModal(true);
      }
    } catch (err) {
      console.error('Error confirming work:', err);
      setErrorMessage('Error al confirmar el trabajo');
      setShowErrorModal(true);
    } finally {
      setConfirmingWork(false);
    }
  };

  const handleApply = () => {
    if (!user) {
      navigate("/login", { state: { from: `/jobs/${id}` } });
      return;
    }

    // Redirect to application summary page
    navigate(`/jobs/${id}/apply`);
  };

  const handleSendMessage = async () => {
    if (!user || !job) {
      navigate("/login", { state: { from: `/jobs/${id}` } });
      return;
    }

    setSendingMessage(true);
    setError(null);

    try {
      // Create or find conversation
      const response = await fetch('/api/proposals/start-negotiation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jobId: job.id || job._id,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Navigate to chat without job context (normal chat)
        navigate(`/chat/${data.conversationId}`);
      } else {
        setError(data.message || 'No se pudo iniciar la conversación');
      }
    } catch (err: any) {
      setError(err.message || 'Error al iniciar conversación');
    } finally {
      setSendingMessage(false);
    }
  };

  // Send message to a specific proposal's freelancer
  const handleMessageProposal = async (proposal: any) => {
    if (!user || !job || !token) {
      navigate("/login", { state: { from: `/jobs/${id}` } });
      return;
    }

    const freelancerId = proposal.freelancer?.id || proposal.freelancerId;
    if (!freelancerId) {
      setError('No se pudo identificar al freelancer');
      return;
    }

    setMessagingProposal(proposal.id);
    setError(null);

    try {
      // Create or find conversation with the freelancer, linked to this job
      const response = await fetch('/api/chat/conversations/find-or-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          participantId: freelancerId,
          jobId: job.id || job._id,
          proposalId: proposal.id,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Navigate to chat with job context
        navigate(`/chat/${data.conversation.id}?jobId=${job.id || job._id}`);
      } else {
        setError(data.message || 'No se pudo iniciar la conversación');
      }
    } catch (err: any) {
      setError(err.message || 'Error al iniciar conversación');
    } finally {
      setMessagingProposal(null);
    }
  };

  const handlePauseJob = async () => {
    if (!job || !token) return;

    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${job.id}/pause`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        // Refresh job data
        const jobResponse = await fetch(`/api/jobs/${id}`);
        const jobData = await jobResponse.json();
        if (jobData.success) {
          setJob(jobData.job);
        }
      } else {
        setError(data.message || 'Error al pausar la publicación');
      }
    } catch (err: any) {
      setError(err.message || 'Error al pausar la publicación');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResumeJob = async () => {
    if (!job || !token) return;

    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${job.id}/resume`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        // Refresh job data
        const jobResponse = await fetch(`/api/jobs/${id}`);
        const jobData = await jobResponse.json();
        if (jobData.success) {
          setJob(jobData.job);
        }
      } else {
        setError(data.message || 'Error al reanudar la publicación');
      }
    } catch (err: any) {
      setError(err.message || 'Error al reanudar la publicación');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelJob = async () => {
    if (!job || !token) return;

    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${job.id}/cancel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          reason: cancellationReason.trim() || null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setShowCancelModal(false);
        setCancellationReason("");
        // Redirect to dashboard
        navigate('/dashboard');
      } else {
        setError(data.message || 'Error al cancelar la publicación');
        setShowCancelModal(false);
      }
    } catch (err: any) {
      setError(err.message || 'Error al cancelar la publicación');
      setShowCancelModal(false);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditJob = () => {
    if (!job) return;
    // Navigate to edit page
    navigate(`/jobs/${job.id || job._id}/edit`);
  };

  const handleDeleteJob = async () => {
    if (!job || !token) return;

    setDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${job.id || job._id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        setShowDeleteModal(false);
        // Redirect to dashboard
        navigate('/dashboard');
      } else {
        setError(data.message || 'Error al eliminar el trabajo');
        setShowDeleteModal(false);
      }
    } catch (err: any) {
      setError(err.message || 'Error al eliminar el trabajo');
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleChangeBudget = async () => {
    if (!job || !token) return;

    // Parsear el número en formato argentino
    const parsedBudget = parseArgentineNumber(newBudget);

    // Validaciones
    if (!newBudget || parsedBudget <= 0) {
      setError('El presupuesto debe ser mayor a 0');
      return;
    }

    if (!budgetReason || budgetReason.trim().length < 10) {
      setError('La razón debe tener al menos 10 caracteres');
      return;
    }

    setChangingBudget(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${job.id || job._id}/budget`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          newPrice: parsedBudget,
          reason: budgetReason.trim(),
        }),
      });

      const data = await response.json();

      // Si requiere pago (status 402), mostrar modal de confirmación
      if (response.status === 402 && data.requiresPayment) {
        const { amountRequired, breakdown } = data;

        // Mostrar modal con detalles del pago requerido
        setPaymentBreakdown({
          message: data.message,
          oldPrice: breakdown.oldPrice,
          newPrice: breakdown.newPrice,
          priceDifference: breakdown.priceDifference,
          commission: breakdown.commission,
          commissionRate: breakdown.commissionRate,
          total: breakdown.total,
          amountRequired,
        });
        setShowPaymentConfirmModal(true);
        setShowBudgetModal(false);
        return;
      }

      // Si el trabajo tiene contrato en progreso, mostrar modal de redirección
      if (response.status === 400 && data.redirectTo && data.redirectTo.includes('contracts')) {
        setContractRedirectMessage(data.message);
        setContractRedirectUrl(data.redirectTo);
        setShowContractRedirectModal(true);
        setShowBudgetModal(false);
        return;
      }

      if (data.success) {
        setShowBudgetModal(false);
        setNewBudget('');
        setBudgetReason('');
        // Refresh job data
        const jobResponse = await fetch(`/api/jobs/${id}`);
        const jobData = await jobResponse.json();
        if (jobData.success) {
          setJob(jobData.job);
        }
      } else {
        setError(data.message || 'Error al cambiar el presupuesto');
      }
    } catch (err: any) {
      setError(err.message || 'Error al cambiar el presupuesto');
    } finally {
      setChangingBudget(false);
    }
  };

  const handleSelectWorker = async (proposal: any) => {
    if (!job || !token) return;

    setSelectingWorker(proposal.id);
    setError(null);

    try {
      const response = await fetch(`/api/proposals/${proposal.id}/approve`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        setShowSelectConfirmModal(false);
        setSelectedProposal(null);
        // Refresh job data
        const jobResponse = await fetch(`/api/jobs/${id}`);
        const jobData = await jobResponse.json();
        if (jobData.success) {
          setJob(jobData.job);
          setProposals([]);
        }
      } else {
        setError(data.message || 'Error al seleccionar trabajador');
      }
    } catch (err: any) {
      setError(err.message || 'Error al seleccionar trabajador');
    } finally {
      setSelectingWorker(null);
    }
  };

  const openSelectConfirmModal = (proposal: any) => {
    setSelectedProposal(proposal);
    setShowSelectConfirmModal(true);
  };

  // Calculate time until auto-selection
  const getTimeUntilAutoSelect = () => {
    if (!job?.startDate) return null;
    const startDate = new Date(job.startDate);
    const autoSelectDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000); // 24h before
    const now = new Date();
    const diff = autoSelectDate.getTime() - now.getTime();

    if (diff <= 0) return 'Ya pasó el límite';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} día${days > 1 ? 's' : ''} restantes`;
    }
    return `${hours}h ${minutes}m restantes`;
  };

  // Check if cancellation is allowed (more than 24h before start, or pending_approval)
  const canCancelJob = () => {
    if (!job) return false;
    // Siempre se puede cancelar durante pending_approval (reembolso total)
    if (job.status === 'pending_approval') return true;
    if (!job.startDate) return false;
    const startDate = new Date(job.startDate);
    const now = new Date();
    const hoursUntilStart = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilStart > 24;
  };

  // Check if pause is allowed (more than 24h before start)
  const canPauseJob = () => {
    if (!job?.startDate) return false;
    const startDate = new Date(job.startDate);
    const now = new Date();
    const hoursUntilStart = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilStart > 24;
  };

  // Get time remaining for cancellation
  const getTimeUntilCancelDeadline = () => {
    if (!job?.startDate) return null;
    const startDate = new Date(job.startDate);
    const cancelDeadline = new Date(startDate.getTime() - 24 * 60 * 60 * 1000); // 24h before start
    const now = new Date();
    const diff = cancelDeadline.getTime() - now.getTime();

    if (diff <= 0) return null;

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days} día${days > 1 ? 's' : ''} para cancelar`;
    }
    return `${hours}h ${minutes}m para cancelar`;
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || "Trabajo no encontrado"}</p>
          <Link
            to="/"
            className="text-sky-600 hover:text-sky-700 font-medium"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  // Support both PostgreSQL (id) and MongoDB (_id)
  const clientInfo = getClientInfo(job.client);
  const clientId = clientInfo?.id;
  const userId = user?.id || user?._id;
  const isOwnJob = user && clientId === userId;
  const isDraft = job.status === 'draft' || job.status === 'pending_payment';

  // Check if current user is a worker on this job
  const isWorkerOnJob = user && userId && (
    job.doerId === userId ||
    (job.selectedWorkers && job.selectedWorkers.includes(userId))
  );

  return (
    <>
      <Helmet>
        <title>{job.title} - Doers</title>
        <meta name="description" content={job.summary} />
      </Helmet>
      <div className="container mx-auto px-4 py-8">
        {/* Back Button - Only visible on mobile */}
        <div className="mb-6 md:hidden">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a trabajos
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="space-y-6 lg:col-span-2">
            {/* Header Card */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex-1">
                  <h1 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
                    {job.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                    {/* Job Code - Prominent */}
                    <button
                      onClick={handleCopyJobCode}
                      className="inline-flex items-center gap-2 rounded-lg bg-sky-100 dark:bg-sky-900/40 px-3 py-1.5 text-sm font-mono font-bold text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900/60 transition-colors border border-sky-200 dark:border-sky-700"
                      title="Copiar código del trabajo"
                    >
                      <Key className="h-4 w-4" />
                      #{getJobCode(job.id || job._id)}
                      {copiedJobCode ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4 opacity-60" />
                      )}
                    </button>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      <span>{job.location}{job.neighborhood ? `, ${job.neighborhood}` : ''}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                      {(clientInfo?.rating || 0).toFixed(1)}
                    </span>
                  </div>
                </div>
                <div className="rounded-full bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-2 text-xl font-bold text-white shadow-lg shadow-sky-500/30">
                  ${job.price.toLocaleString("es-AR")}
                </div>
              </div>

              <div className="my-4 h-px bg-slate-200 dark:bg-slate-700"></div>

              {/* Time Info */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-600">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Fecha de inicio
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {new Date(job.startDate).toLocaleDateString("es-AR")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-600">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Hora de inicio
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {new Date(job.startDate).toLocaleTimeString("es-AR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
                {job?.endDateFlexible ? (
                  <div className="col-span-2 flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        Fecha de fin
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
                        Por definir
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        El cliente aún no ha definido la fecha de finalización
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-600">
                        <Calendar className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Fecha de fin
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                          {job.endDate ? new Date(job.endDate).toLocaleDateString("es-AR") : 'Por definir'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-600">
                        <Clock className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          Hora de fin
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                          {job.endDate ? new Date(job.endDate).toLocaleTimeString("es-AR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          }) : '--:--'}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Workers Required Info */}
              {(job.maxWorkers || 1) > 1 && (
                <div className="mt-4 rounded-xl border border-purple-200 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      <span className="font-medium text-purple-800 dark:text-purple-300">
                        Trabajo en equipo
                      </span>
                    </div>
                    <span className="text-sm text-purple-600 dark:text-purple-400">
                      {(job.selectedWorkers?.length || 0)} / {job.maxWorkers} trabajadores
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="h-2 bg-purple-200 dark:bg-purple-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-600 dark:bg-purple-400 rounded-full transition-all duration-300"
                        style={{ width: `${((job.selectedWorkers?.length || 0) / (job.maxWorkers || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                  {(job.selectedWorkers?.length || 0) < (job.maxWorkers || 1) && (
                    <p className="mt-2 text-sm text-purple-600 dark:text-purple-400">
                      Faltan {(job.maxWorkers || 1) - (job.selectedWorkers?.length || 0)} trabajador{(job.maxWorkers || 1) - (job.selectedWorkers?.length || 0) !== 1 ? 'es' : ''} por seleccionar
                    </p>
                  )}
                  {(job.selectedWorkers?.length || 0) >= (job.maxWorkers || 1) && (
                    <p className="mt-2 text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" />
                      Equipo completo
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">
                Descripción del trabajo
              </h2>
              <p className="whitespace-pre-line leading-relaxed text-slate-600 dark:text-slate-300">
                {job.description}
              </p>
            </div>

            {/* Job Tasks - visible to owner and workers */}
            {(isOwnJob || isWorkerOnJob) && job.status !== 'cancelled' && job.status !== 'draft' && (
              <JobTasks
                jobId={job.id || job._id}
                isOwner={!!isOwnJob}
                isWorker={!!isWorkerOnJob}
                jobStatus={job.status}
                clientConfirmed={contractData?.clientConfirmed || (allContractsData?.allClientConfirmed ?? false)}
              />
            )}

            {/* Location Map */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <LocationCircleMap location={job.location} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Client Info */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">
                Publicado por
              </h2>
              <div className="relative">
                <button
                  onClick={() => setShowClientMenu(!showClientMenu)}
                  className="flex items-center gap-3 w-full text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl p-2 -m-2 transition-colors"
                >
                  <div className="h-12 w-12 overflow-hidden rounded-full bg-sky-100">
                    <img
                      src={
                        clientInfo?.avatar ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${clientInfo?.name || 'user'}`
                      }
                      alt={clientInfo?.name || 'Usuario'}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {clientInfo?.name || 'Usuario'}
                    </p>
                    <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                      <span>
                        {(clientInfo?.rating || 0).toFixed(1)} ({clientInfo?.reviewsCount || 0}{" "}
                        reviews)
                      </span>
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showClientMenu ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {showClientMenu && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-10 overflow-hidden">
                    <Link
                      to={`/profile/${clientInfo?.id || clientInfo?._id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                      onClick={() => setShowClientMenu(false)}
                    >
                      <User className="h-4 w-4 text-slate-500" />
                      <span className="text-sm text-slate-700 dark:text-slate-200">Ver perfil</span>
                    </Link>
                    <Link
                      to={`/profile/${clientInfo?.id || clientInfo?._id}?tab=jobs`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors border-t border-slate-100 dark:border-slate-700"
                      onClick={() => setShowClientMenu(false)}
                    >
                      <Briefcase className="h-4 w-4 text-slate-500" />
                      <span className="text-sm text-slate-700 dark:text-slate-200">Ver trabajos publicados</span>
                    </Link>
                  </div>
                )}
              </div>
              <div className="my-4 h-px bg-slate-200 dark:bg-slate-700"></div>

              {/* Multiple Ratings Display */}
              {job.client && typeof job.client !== 'string' && (
                <div className="mb-4">
                  <MultipleRatings user={job.client as any} />
                </div>
              )}

              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>Miembro desde 2023</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  <span>{clientInfo?.completedJobs || 0} trabajos completados</span>
                </div>
              </div>
              {user && !isOwnJob && (
                <button
                  onClick={handleSendMessage}
                  disabled={sendingMessage}
                  className="mt-4 w-full gap-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-white transition-colors hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingMessage ? (
                    <>
                      <Loader2 className="inline h-4 w-4 mr-2 animate-spin" />
                      Abriendo chat...
                    </>
                  ) : (
                    <>
                      <MessageSquare className="inline h-4 w-4 mr-2" />
                      Enviar mensaje
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Action Buttons - Only show if positions still available */}
            {!isOwnJob && job.status === 'open' && job.doerId !== userId && (
              // For team jobs: show if there are still positions available and user is not already selected
              // For single worker jobs: show if no worker assigned yet
              (job.maxWorkers && job.maxWorkers > 1)
                ? (job.selectedWorkers?.length || 0) < job.maxWorkers && !job.selectedWorkers?.includes(userId || '')
                : !job.doerId
            ) && (
              <div className="space-y-3">
                {hasApplied ? (
                  <div className="w-full rounded-xl bg-gradient-to-r from-green-500 to-green-600 px-6 py-3 text-center shadow-lg shadow-green-500/30">
                    <div className="flex items-center justify-center gap-2 text-lg font-semibold text-white">
                      <CheckCircle className="h-5 w-5" />
                      <span>¡Ya aplicaste a este trabajo!</span>
                    </div>
                    <p className="text-sm text-green-100 mt-1">
                      El cliente revisará tu propuesta pronto
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={handleApply}
                    disabled={applying || checkingApplication}
                    className="w-full gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-6 py-3 text-lg font-semibold text-white shadow-lg shadow-sky-500/30 transition-all hover:from-sky-600 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {applying || checkingApplication ? (
                      <>
                        <Loader2 className="inline h-5 w-5 mr-2 animate-spin" />
                        {checkingApplication ? "Verificando..." : "Aplicando..."}
                      </>
                    ) : user ? (
                      "Aplicar al trabajo"
                    ) : (
                      "Inicia sesión para aplicar"
                    )}
                  </button>
                )}
                {error && (
                  <p className="text-sm text-red-600 text-center">{error}</p>
                )}
              </div>
            )}

            {!isOwnJob && job.status === 'pending_approval' && (
              <div className="rounded-2xl border border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/30 p-4">
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                  ⏳ Este trabajo está pendiente de aprobación
                </p>
              </div>
            )}

            {isOwnJob && job.status === 'pending_approval' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/30 p-4">
                  <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300 mb-2">
                    ⏳ Tu trabajo está pendiente de aprobación por un administrador
                  </p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    Puedes cancelar ahora y recibir un reembolso del precio (sin comisión).
                  </p>
                </div>

                <button
                  onClick={() => setShowCancelModal(true)}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                >
                  {actionLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      Cancelar y recibir reembolso
                    </>
                  )}
                </button>

                {error && (
                  <div className="rounded-2xl border border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30 p-4">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* Trabajador asignado - verificar si ya inició, terminó o no */}
            {!isOwnJob && job.status === 'open' && (job.doerId || (job.selectedWorkers && job.selectedWorkers.length > 0)) && (
              <div className="space-y-4">
                {/* Check if current user is the selected worker */}
                {job.doerId === userId || contractData?.doerId === userId || (userId && job.selectedWorkers?.includes(userId)) ? (
                  // Check if end date has passed (job finished)
                  job.endDate && new Date(job.endDate) <= new Date() ? (
                    // Job has finished - show celebration message and confirm button
                    <div className="rounded-2xl border-2 border-emerald-400 dark:border-emerald-500 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/30 p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-emerald-100 dark:bg-emerald-800/50 rounded-full">
                          <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                            ¡Felicitaciones! Trabajo terminado
                          </p>
                          <p className="text-sm text-emerald-600 dark:text-emerald-400">
                            El trabajo finalizó el {new Date(job.endDate).toLocaleDateString('es-AR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                        Ahora solo resta confirmar que el trabajo fue finalizado correctamente para proceder con los pagos.
                      </p>

                      {/* Confirmation status - Team jobs show all workers */}
                      {allContractsData && allContractsData.totalContracts > 1 ? (
                        <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 mb-4">
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                            Estado de confirmaciones ({allContractsData.contracts.filter(c => c.doerConfirmed).length}/{allContractsData.totalContracts} trabajadores):
                          </p>
                          <div className="space-y-2">
                            {allContractsData.contracts.map((c) => (
                              <div key={c.id} className="flex items-center gap-2 text-sm">
                                <span className={`flex items-center gap-1 ${c.doerConfirmed ? 'text-green-600' : 'text-slate-400'}`}>
                                  {c.doerConfirmed ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                                  {c.doerName}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : contractData && (
                        <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 mb-4">
                          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Estado de confirmaciones:</p>
                          <div className="flex items-center gap-4 text-sm">
                            <span className={`flex items-center gap-1 ${contractData.doerConfirmed ? 'text-green-600' : 'text-slate-400'}`}>
                              {contractData.doerConfirmed ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                              Tu confirmación
                            </span>
                            <span className={`flex items-center gap-1 ${contractData.clientConfirmed ? 'text-green-600' : 'text-slate-400'}`}>
                              {contractData.clientConfirmed ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                              Confirmación del cliente
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-3">
                        {contractData && !contractData.doerConfirmed && (
                          <button
                            onClick={handleConfirmWork}
                            disabled={confirmingWork}
                            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-200 dark:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {confirmingWork ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Confirmando...
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-4 w-4" />
                                Confirmar mi trabajo
                              </>
                            )}
                          </button>
                        )}
                        {contractData?.doerConfirmed && !(allContractsData?.allCompleted ?? (contractData?.clientConfirmed)) && (
                          <div className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-xl text-sm">
                            {allContractsData && allContractsData.totalContracts > 1
                              ? `Esperando confirmaciones (${allContractsData.contracts.filter(c => c.doerConfirmed && c.clientConfirmed).length}/${allContractsData.totalContracts} completos)...`
                              : 'Esperando confirmación del cliente...'}
                          </div>
                        )}
                        {(allContractsData?.allCompleted ?? (contractData?.doerConfirmed && contractData?.clientConfirmed)) && (
                          <div className="px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl text-sm font-medium">
                            ✅ Todos confirmaron - Los pagos serán liberados a los trabajadores
                          </div>
                        )}
                      </div>
                    </div>
                  ) : new Date(job.startDate) <= new Date() ? (
                    // Job has started but not finished - show "in progress" message
                    <div className="rounded-2xl border border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/30 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                        <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                          Trabajo en progreso
                        </p>
                      </div>
                      {job.endDate && (
                        <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                          El trabajo terminará el {new Date(job.endDate).toLocaleDateString('es-AR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 mt-3">
                        <Link
                          to="/my-jobs?tab=applied&view=calendar"
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300 text-sm font-medium rounded-lg hover:bg-green-200 dark:hover:bg-green-700/50 transition-colors"
                        >
                          <Calendar className="h-4 w-4" />
                          Ver en Calendario
                        </Link>
                      </div>
                    </div>
                  ) : (
                    // Job hasn't started yet - show "selected" message
                    <div className="rounded-2xl border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                          ¡Fuiste seleccionado para este trabajo!
                        </p>
                      </div>
                      <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                        El trabajo iniciará el {new Date(job.startDate).toLocaleDateString('es-AR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-3">
                        <Link
                          to="/my-jobs?tab=applied&view=calendar"
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 text-sm font-medium rounded-lg hover:bg-blue-200 dark:hover:bg-blue-700/50 transition-colors"
                        >
                          <Calendar className="h-4 w-4" />
                          Ver en Calendario
                        </Link>
                      </div>
                    </div>
                  )
                ) : (job.selectedWorkers?.length || 0) >= (job.maxWorkers || 1) ? (
                  // Solo mostrar "ya tiene profesional" si TODOS los puestos están ocupados
                  <div className="rounded-2xl border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 p-4">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      👥 Este trabajo ya tiene {job.maxWorkers === 1 ? 'un profesional asignado' : `los ${job.maxWorkers} profesionales asignados`}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      Iniciará el {new Date(job.startDate).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'long'
                      })}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {!isOwnJob && job.status === 'in_progress' && (job.doerId || (job.selectedWorkers && job.selectedWorkers.length > 0)) && (
              <div className="space-y-4">
                {/* Check if current user is one of the selected workers */}
                {contractData?.doerId === userId || job.doerId === userId || (userId && job.selectedWorkers?.includes(userId)) ? (
                  <>
                    {/* Check if job has finished (endDate passed) */}
                    {job.endDate && new Date(job.endDate) <= new Date() ? (
                      // Job has finished - show celebration message and confirm button
                      <div className="rounded-2xl border-2 border-emerald-400 dark:border-emerald-500 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/30 p-5">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2 bg-emerald-100 dark:bg-emerald-800/50 rounded-full">
                            <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div>
                            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                              ¡Felicitaciones! Trabajo terminado
                            </p>
                            <p className="text-sm text-emerald-600 dark:text-emerald-400">
                              El trabajo finalizó el {new Date(job.endDate).toLocaleDateString('es-AR', {
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric'
                              })}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                          Ahora solo resta confirmar que el trabajo fue finalizado correctamente para proceder con los pagos.
                        </p>

                        {/* Confirmation status - Team jobs show all workers */}
                        {allContractsData && allContractsData.totalContracts > 1 ? (
                          <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 mb-4">
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                              Estado de confirmaciones ({allContractsData.contracts.filter(c => c.doerConfirmed).length}/{allContractsData.totalContracts} trabajadores):
                            </p>
                            <div className="space-y-2">
                              {allContractsData.contracts.map((c) => (
                                <div key={c.id} className="flex items-center gap-2 text-sm">
                                  <span className={`flex items-center gap-1 ${c.doerConfirmed ? 'text-green-600' : 'text-slate-400'}`}>
                                    {c.doerConfirmed ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                                    {c.doerName}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : contractData && (
                          <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 mb-4">
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Estado de confirmaciones:</p>
                            <div className="flex items-center gap-4 text-sm">
                              <span className={`flex items-center gap-1 ${contractData.doerConfirmed ? 'text-green-600' : 'text-slate-400'}`}>
                                {contractData.doerConfirmed ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                                Tu confirmación
                              </span>
                              <span className={`flex items-center gap-1 ${contractData.clientConfirmed ? 'text-green-600' : 'text-slate-400'}`}>
                                {contractData.clientConfirmed ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                                Confirmación del cliente
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-3">
                          {contractData && !contractData.doerConfirmed && (
                            <button
                              onClick={handleConfirmWork}
                              disabled={confirmingWork}
                              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-200 dark:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {confirmingWork ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Confirmando...
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4" />
                                  Confirmar mi trabajo
                                </>
                              )}
                            </button>
                          )}
                          {contractData?.doerConfirmed && !(allContractsData?.allCompleted ?? (contractData?.clientConfirmed)) && (
                            <div className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-xl text-sm">
                              {allContractsData && allContractsData.totalContracts > 1
                                ? `Esperando confirmaciones (${allContractsData.contracts.filter(c => c.doerConfirmed && c.clientConfirmed).length}/${allContractsData.totalContracts} completos)...`
                                : 'Esperando confirmación del cliente...'}
                            </div>
                          )}
                          {(allContractsData?.allCompleted ?? (contractData?.doerConfirmed && contractData?.clientConfirmed)) && (
                            <div className="px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl text-sm font-medium">
                              ✅ Todos confirmaron - Los pagos serán liberados a los trabajadores
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      // Job is still in progress
                      <div className="rounded-2xl border border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/30 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                          <p className="text-sm font-semibold text-green-700 dark:text-green-300">
                            Trabajo en progreso
                          </p>
                        </div>
                        {job.endDate && (
                          <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                            El trabajo terminará el {new Date(job.endDate).toLocaleDateString('es-AR', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                          <Link
                            to="/my-jobs?tab=applied&view=calendar"
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300 text-sm font-medium rounded-lg hover:bg-green-200 dark:hover:bg-green-700/50 transition-colors"
                          >
                            <Calendar className="h-4 w-4" />
                            Ver en Calendario
                          </Link>
                        </div>
                      </div>
                    )}

                    {/* Pairing Code Display for Worker - only show if job not finished */}
                    {contractData?.pairingCode && !(job.endDate && new Date(job.endDate) <= new Date()) && (
                      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-2xl p-5 border-2 border-purple-200 dark:border-purple-700 shadow-md">
                        <div className="flex items-start gap-4">
                          <div className="p-3 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                            <Key className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-purple-900 dark:text-purple-100 text-lg mb-1">
                              Código de Pareamiento
                            </h4>
                            <p className="text-sm text-purple-700 dark:text-purple-300 mb-3">
                              Muestra este código al cliente cuando llegues al lugar de trabajo
                            </p>
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-white dark:bg-slate-800 rounded-lg p-3 border-2 border-purple-300 dark:border-purple-600">
                                <p className="text-2xl font-mono font-bold text-purple-700 dark:text-purple-300 text-center tracking-widest">
                                  {contractData?.pairingCode}
                                </p>
                              </div>
                              <button
                                onClick={handleCopyPairingCode}
                                className="p-3 bg-purple-100 dark:bg-purple-900/50 hover:bg-purple-200 dark:hover:bg-purple-800/50 rounded-lg transition-colors"
                                title="Copiar código"
                              >
                                {copiedPairingCode ? (
                                  <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                                ) : (
                                  <Copy className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                )}
                              </button>
                            </div>
                            {copiedPairingCode && (
                              <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                                ¡Código copiado!
                              </p>
                            )}
                            {contractData?.pairingExpiry && (
                              <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                                Expira: {new Date(contractData?.pairingExpiry).toLocaleString('es-AR')}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (job.selectedWorkers?.length || 0) >= (job.maxWorkers || 1) ? (
                  // Solo mostrar mensaje si todos los puestos están ocupados
                  <div className="rounded-2xl border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 p-4">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                      🔧 Este trabajo ya tiene {job.maxWorkers === 1 ? 'un profesional asignado' : `los ${job.maxWorkers} profesionales asignados`}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {!isOwnJob && (job.status === 'completed' || job.status === 'cancelled' || job.status === 'paused' || job.status === 'suspended') && (
              <div className={`rounded-2xl border p-4 ${
                job.status === 'cancelled'
                  ? 'border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30'
                  : job.status === 'paused'
                  ? (job.pendingNewPrice ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30' : 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30')
                  : job.status === 'suspended'
                  ? 'border-orange-300 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/30'
                  : 'border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/30'
              }`}>
                <p className={`text-sm font-medium ${
                  job.status === 'cancelled' ? 'text-red-700 dark:text-red-300' :
                  job.status === 'paused' ? (job.pendingNewPrice ? 'text-blue-700 dark:text-blue-300' : 'text-amber-700 dark:text-amber-300') :
                  job.status === 'suspended' ? 'text-orange-700 dark:text-orange-300' :
                  'text-green-700 dark:text-green-300'
                }`}>
                  {job.status === 'cancelled' && '❌ Esta publicacion fue cancelada'}
                  {job.status === 'completed' && '✅ Este trabajo fue completado'}
                  {job.status === 'paused' && (job.pendingNewPrice ? '⏳ Este trabajo está actualizando su presupuesto' : '⏸️ Este trabajo esta pausado')}
                  {job.status === 'suspended' && '⏸️ Este trabajo está suspendido por falta de fecha de finalización'}
                </p>
                {job.status === 'cancelled' && job.cancellationReason && (
                  <div className="mt-3 p-3 bg-red-100 dark:bg-red-950/50 rounded-lg border border-red-200 dark:border-red-800">
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">Razón de cancelación:</p>
                    <p className="text-sm text-red-700 dark:text-red-200">{job.cancellationReason}</p>
                  </div>
                )}
                {job.status === 'cancelled' && job.cancelledAt && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    Cancelado el {new Date(job.cancelledAt).toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                )}
              </div>
            )}

            {isOwnJob && isDraft && (
              <div className="space-y-3">
                <button
                  onClick={() => navigate(`/jobs/${job.id || job._id}/payment`)}
                  className="w-full gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 text-lg font-semibold text-white shadow-lg shadow-orange-500/30 transition-all hover:from-orange-600 hover:to-orange-700"
                >
                  📢 Pagar y Publicar
                </button>
                <div className="rounded-2xl border border-yellow-600 bg-yellow-900/30 p-4">
                  <p className="text-sm font-medium text-yellow-300">
                    Este trabajo está en borrador. Completa el pago para publicarlo.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleEditJob}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-sky-600 bg-transparent px-4 py-2 text-sm font-semibold text-sky-400 transition-colors hover:bg-sky-900/30"
                  >
                    <Edit className="h-4 w-4" />
                    Editar
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-red-600 bg-transparent px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-900/30"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </button>
                </div>
              </div>
            )}

            {isOwnJob && !isDraft && (job.status === 'open' || (job.status === 'in_progress' && !job.doerId)) && (
              <div className="space-y-4">
                {/* New proposal real-time alert */}
                {newProposalAlert && (
                  <div className="bg-green-900/30 border border-green-600 rounded-xl p-4 flex items-center gap-3 animate-pulse">
                    <Bell className="h-5 w-5 text-green-400" />
                    <span className="text-green-300 font-medium">{newProposalAlert}</span>
                    <button
                      onClick={() => setNewProposalAlert(null)}
                      className="ml-auto text-green-400 hover:text-green-200"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Postulados Section */}
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <Users className="h-5 w-5 text-sky-500 dark:text-sky-400" />
                      Postulados ({proposals.length})
                    </h3>
                    {proposals.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-4 w-4" />
                        <span>{getTimeUntilAutoSelect()}</span>
                      </div>
                    )}
                  </div>

                  {loadingProposals ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-sky-500 dark:text-sky-400" />
                    </div>
                  ) : proposals.length === 0 ? (
                    <div className="text-center py-6">
                      <Users className="h-10 w-10 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
                      <p className="text-slate-500 dark:text-slate-400 text-sm">Aún no hay postulados</p>
                      <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
                        Los profesionales interesados aparecerán aquí
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Auto-selection warning */}
                      <div className="rounded-lg border border-amber-300 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-900/20 p-3">
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          <AlertTriangle className="inline h-3 w-3 mr-1" />
                          Si no seleccionas un trabajador 24h antes del inicio, se asignará automáticamente al primer postulado.
                        </p>
                      </div>

                      {proposals.map((proposal: any) => (
                        <div
                          key={proposal.id}
                          className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-4 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            {/* Avatar - Clickeable */}
                            <Link
                              to={`/profile/${proposal.freelancer?.id || proposal.freelancerId}`}
                              className="shrink-0"
                            >
                              <div className="h-12 w-12 overflow-hidden rounded-full bg-sky-100 ring-2 ring-slate-300 dark:ring-slate-600 hover:ring-sky-500 transition-colors">
                                <img
                                  src={
                                    proposal.freelancer?.avatar ||
                                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${proposal.freelancer?.name || 'user'}`
                                  }
                                  alt={proposal.freelancer?.name}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            </Link>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Link
                                  to={`/profile/${proposal.freelancer?.id || proposal.freelancerId}`}
                                  className="font-semibold text-slate-900 dark:text-white hover:text-sky-500 dark:hover:text-sky-400 transition-colors"
                                >
                                  {proposal.freelancer?.name || 'Usuario'}
                                </Link>
                                <ExternalLink className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                                {/* Job Code Badge */}
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-900/40 text-xs font-mono font-bold text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-700">
                                  <Key className="h-3 w-3" />
                                  #{getJobCode(job.id || job._id)}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 mt-1">
                                <span className="flex items-center gap-1">
                                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                                  {Number(proposal.freelancer?.rating || 0).toFixed(1)}
                                </span>
                                <span>•</span>
                                <span>{proposal.freelancer?.completedJobs || 0} trabajos</span>
                              </div>

                              {/* Monto propuesto */}
                              <div className="mt-2 flex items-center gap-2">
                                <div className={`px-2.5 py-1 rounded-lg text-sm font-medium ${
                                  proposal.isCounterOffer
                                    ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-600'
                                    : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-600'
                                }`}>
                                  <DollarSign className="inline h-3.5 w-3.5 mr-0.5" />
                                  {(proposal.proposedPrice || job.price)?.toLocaleString('es-AR')} ARS
                                </div>
                                {proposal.isCounterOffer && (
                                  <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                                    (Contraoferta)
                                  </span>
                                )}
                                {!proposal.isCounterOffer && proposal.proposedPrice === job.price && (
                                  <span className="text-xs text-green-600 dark:text-green-400">
                                    Aceptó el precio original
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="shrink-0 flex items-center gap-2">
                              {/* Message Button */}
                              <button
                                onClick={() => handleMessageProposal(proposal)}
                                disabled={messagingProposal === proposal.id}
                                className="flex items-center gap-1 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                                title="Enviar mensaje"
                              >
                                {messagingProposal === proposal.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <MessageSquare className="h-4 w-4" />
                                )}
                              </button>

                              {/* Select Button or Status Badge */}
                              {proposal.status === 'pending' ? (
                                <button
                                  onClick={() => openSelectConfirmModal(proposal)}
                                  disabled={selectingWorker === proposal.id}
                                  className="flex items-center gap-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {selectingWorker === proposal.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <CheckCircle className="h-4 w-4" />
                                      Seleccionar
                                    </>
                                  )}
                                </button>
                              ) : proposal.status === 'approved' ? (
                                <span className="flex items-center gap-1 px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm font-medium rounded-lg border border-green-300 dark:border-green-600">
                                  <CheckCircle className="h-4 w-4" />
                                  Seleccionado
                                </span>
                              ) : proposal.status === 'rejected' ? (
                                <span className="flex items-center gap-1 px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm font-medium rounded-lg border border-red-300 dark:border-red-600">
                                  Rechazado
                                </span>
                              ) : null}
                            </div>
                          </div>

                          {/* Cover Letter Preview */}
                          {proposal.coverLetter && (
                            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                              "{proposal.coverLetter}"
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={() => setShowBudgetModal(true)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                  >
                    <DollarSign className="h-4 w-4" />
                    Cambiar presupuesto
                  </button>

                  <div className="flex gap-2">
                    <button
                      onClick={handlePauseJob}
                      disabled={actionLoading || !canPauseJob()}
                      title={!canPauseJob() ? "No puedes pausar con menos de 24h de anticipación" : ""}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Pause className="h-4 w-4" />
                          Pausar
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowCancelModal(true)}
                      disabled={actionLoading || !canCancelJob()}
                      title={!canCancelJob() ? "No puedes cancelar con menos de 24h de anticipación" : ""}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <XCircle className="h-4 w-4" />
                      Cancelar
                    </button>
                  </div>

                  {/* Cancellation deadline warning */}
                  {!canCancelJob() ? (
                    <div className="rounded-xl border border-red-300 dark:border-red-600/50 bg-red-50 dark:bg-red-900/20 p-3">
                      <p className="text-xs text-red-700 dark:text-red-300">
                        <AlertTriangle className="inline h-3 w-3 mr-1" />
                        Ya no puedes cancelar este trabajo (menos de 24h para el inicio). Contacta a soporte si necesitas ayuda.
                      </p>
                    </div>
                  ) : getTimeUntilCancelDeadline() && (
                    <div className="rounded-xl border border-amber-300 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-900/20 p-3">
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        <Clock className="inline h-3 w-3 mr-1" />
                        Tiempo restante para cancelar: <span className="font-semibold">{getTimeUntilCancelDeadline()}</span>
                      </p>
                    </div>
                  )}
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-600 bg-red-900/30 p-4">
                    <p className="text-sm font-medium text-red-300">{error}</p>
                  </div>
                )}

                <div className="rounded-2xl border border-sky-300 dark:border-sky-600 bg-white dark:bg-sky-900/30 p-4">
                  <p className="text-sm font-medium text-sky-700 dark:text-sky-300">
                    ✅ Este trabajo está publicado y recibiendo propuestas
                  </p>
                </div>
              </div>
            )}

            {isOwnJob && !isDraft && job.status === 'paused' && (
              <div className="space-y-4">
                {/* Check if paused due to pending budget increase payment */}
                {job.pendingNewPrice ? (
                  <div className="rounded-2xl border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 p-4">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-3">
                      <span className="inline-block animate-pulse">⏳</span> Esperando verificación de pago
                    </p>
                    <div className="space-y-2 text-xs text-blue-600 dark:text-blue-400">
                      <p>
                        Tu comprobante de pago para el aumento de presupuesto está siendo verificado por nuestro equipo.
                      </p>
                      <div className="mt-3 p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                        <p className="font-medium">Precio actual: ${Number(job.price).toLocaleString('es-AR')} ARS</p>
                        <p className="font-medium">Nuevo precio pendiente: ${Number(job.pendingNewPrice).toLocaleString('es-AR')} ARS</p>
                      </div>
                      <p className="mt-2">
                        Una vez aprobado, el presupuesto se actualizará automáticamente y tu trabajo se reactivará.
                      </p>
                      <p className="text-blue-500 dark:text-blue-300">
                        Tiempo estimado: 24-48hs hábiles (transferencia) o 5-15 minutos (Binance)
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 p-4">
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-3">
                        ⏸️ Esta publicación está pausada
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Si no la reanuadas o cancelas, se reanudará automáticamente.
                      </p>
                    </div>

                    {/* Action Buttons for paused */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleResumeJob}
                        disabled={actionLoading}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-green-600 hover:bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
                      >
                        {actionLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Play className="h-4 w-4" />
                            Reanudar
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setShowCancelModal(true)}
                        disabled={actionLoading || !canCancelJob()}
                        title={!canCancelJob() ? "No puedes cancelar con menos de 24h de anticipación" : ""}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <XCircle className="h-4 w-4" />
                        Cancelar
                      </button>
                    </div>
                  </>
                )}

                {error && (
                  <div className="rounded-2xl border border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30 p-4">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
                  </div>
                )}
              </div>
            )}

            {/* Client view - Job finished, needs confirmation */}
            {isOwnJob && !isDraft && (job.doerId || (job.selectedWorkers && job.selectedWorkers.length > 0)) && job.endDate && new Date(job.endDate) <= new Date() &&
              (job.status === 'open' || job.status === 'in_progress') && contractData && !contractData.clientConfirmed && (
              <div className="rounded-2xl border-2 border-emerald-400 dark:border-emerald-500 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/30 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-800/50 rounded-full">
                    <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                      ¡Trabajo terminado!
                    </p>
                    <p className="text-sm text-emerald-600 dark:text-emerald-400">
                      El trabajo finalizó el {new Date(job.endDate).toLocaleDateString('es-AR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                  Confirma que el trabajo fue realizado correctamente para proceder con los pagos al trabajador.
                </p>

                {/* Confirmation status */}
                <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 mb-4">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Estado de confirmaciones:</p>
                  <div className="flex items-center gap-4 text-sm">
                    <span className={`flex items-center gap-1 ${contractData.clientConfirmed ? 'text-green-600' : 'text-slate-400'}`}>
                      {contractData.clientConfirmed ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                      Tu confirmación
                    </span>
                    <span className={`flex items-center gap-1 ${contractData.doerConfirmed ? 'text-green-600' : 'text-slate-400'}`}>
                      {contractData.doerConfirmed ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                      Confirmación del trabajador
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleConfirmWork}
                    disabled={confirmingWork}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-200 dark:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {confirmingWork ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Confirmando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        Confirmar trabajo realizado
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Client view - Waiting for worker confirmation */}
            {isOwnJob && !isDraft && (job.doerId || (job.selectedWorkers && job.selectedWorkers.length > 0)) && job.endDate && new Date(job.endDate) <= new Date() &&
              (job.status === 'open' || job.status === 'in_progress') && contractData && contractData.clientConfirmed &&
              !(allContractsData?.allCompleted ?? contractData.doerConfirmed) && (
              <div className="rounded-2xl border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-amber-100 dark:bg-amber-800/50 rounded-full">
                    <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-amber-700 dark:text-amber-300">
                      {allContractsData && allContractsData.totalContracts > 1
                        ? `Esperando confirmaciones (${allContractsData.contracts.filter(c => c.doerConfirmed && c.clientConfirmed).length}/${allContractsData.totalContracts})`
                        : 'Esperando confirmación del trabajador'}
                    </p>
                  </div>
                </div>
                {allContractsData && allContractsData.totalContracts > 1 ? (
                  <div className="space-y-2 mb-3">
                    {allContractsData.contracts.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-sm">
                        <span className={`flex items-center gap-1 ${c.doerConfirmed ? 'text-green-600' : 'text-amber-600'}`}>
                          {c.doerConfirmed ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                          {c.doerName}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Ya confirmaste que el trabajo fue realizado. Estamos esperando que el trabajador también confirme para proceder con los pagos.
                  </p>
                )}
              </div>
            )}

            {/* Client view - All confirmed */}
            {isOwnJob && !isDraft && (job.doerId || (job.selectedWorkers && job.selectedWorkers.length > 0)) && job.endDate && new Date(job.endDate) <= new Date() &&
              (job.status === 'open' || job.status === 'in_progress') && (allContractsData?.allCompleted ?? (contractData && contractData.clientConfirmed && contractData.doerConfirmed)) && (
              <div className="rounded-2xl border-2 border-green-400 dark:border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-green-100 dark:bg-green-800/50 rounded-full">
                    <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-green-700 dark:text-green-300">
                      ¡Trabajo completado!
                    </p>
                  </div>
                </div>
                <p className="text-sm text-green-700 dark:text-green-300">
                  ✅ {allContractsData && allContractsData.totalContracts > 1
                    ? `Todos los ${allContractsData.totalContracts} trabajadores y el cliente confirmaron - Los pagos serán liberados`
                    : 'Ambos confirmaron - El pago será liberado al trabajador'}
                </p>
              </div>
            )}

            {isOwnJob && !isDraft && job.status === 'cancelled' && (
              <div className="space-y-4">
                {/* Check if cancelled due to no applicants */}
                {job.cancellationReason?.includes('Ningún trabajador se postuló') ? (
                  <div className="rounded-2xl border border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 p-5">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-800">
                        <Users className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-blue-800 dark:text-blue-200">
                          Lo sentimos, ningún trabajador se postuló
                        </h3>
                        <p className="text-sm text-blue-600 dark:text-blue-300 mt-1">
                          Tu trabajo expiró antes de recibir postulaciones.
                        </p>
                      </div>
                    </div>

                    <div className="bg-blue-100 dark:bg-blue-950/50 rounded-lg p-4 mb-4">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                        ¿Te gustaría reprogramarlo?
                      </p>
                      <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                        <li>• Actualiza las fechas a una más conveniente</li>
                        <li>• Considera ajustar el presupuesto</li>
                        <li>• Agrega más detalles a la descripción</li>
                      </ul>
                    </div>

                    {job.cancelledAt && (
                      <p className="text-xs text-blue-500 dark:text-blue-400 mb-4">
                        Expirado el {new Date(job.cancelledAt).toLocaleDateString('es-AR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleEditJob}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-blue-700"
                      >
                        <Calendar className="h-4 w-4" />
                        Reprogramar
                      </button>
                      <button
                        onClick={() => setShowDeleteModal(true)}
                        className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-4 py-3 font-semibold text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Trash2 className="h-4 w-4" />
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-red-600 bg-red-900/30 p-4">
                      <p className="text-sm font-medium text-red-300 mb-2">
                        ❌ Esta publicación fue cancelada
                      </p>
                      {(job.cancellationReason || job.rejectedReason) && (
                        <div className="mt-3 p-3 bg-red-950/50 rounded-lg border border-red-800">
                          <p className="text-xs text-red-400 font-medium mb-1">Razón:</p>
                          <p className="text-sm text-red-200">{job.cancellationReason || job.rejectedReason}</p>
                        </div>
                      )}
                      {job.cancelledAt && (
                        <p className="text-xs text-red-400 mt-2">
                          Cancelado el {new Date(job.cancelledAt).toLocaleDateString('es-AR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      )}
                    </div>

                    {/* Buttons to edit and delete */}
                    <div className="flex gap-3">
                      <button
                        onClick={handleEditJob}
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-sky-700"
                      >
                        <Edit className="h-4 w-4" />
                        Editar y Resubir
                      </button>
                      <button
                        onClick={() => setShowDeleteModal(true)}
                        className="flex items-center justify-center gap-2 rounded-xl border border-red-600 bg-transparent px-4 py-3 font-semibold text-red-400 transition-colors hover:bg-red-900/30"
                      >
                        <Trash2 className="h-4 w-4" />
                        Eliminar
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Suspended job - needs end date */}
            {isOwnJob && job.status === 'suspended' && (
              <div className="rounded-2xl border-2 border-orange-400 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/30 p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-800">
                    <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-300" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-orange-800 dark:text-orange-200">
                      Trabajo suspendido
                    </h3>
                    <p className="text-sm text-orange-600 dark:text-orange-300 mt-1">
                      Tu trabajo está suspendido porque no definiste una fecha de finalización antes de las 24 horas previas al inicio.
                    </p>
                  </div>
                </div>

                <div className="bg-orange-100 dark:bg-orange-950/50 rounded-lg p-4 mb-4">
                  <p className="text-sm font-medium text-orange-800 dark:text-orange-200 mb-2">
                    Para reactivar tu trabajo:
                  </p>
                  <ul className="text-sm text-orange-700 dark:text-orange-300 space-y-1">
                    <li>• Edita el trabajo y define una fecha de finalización</li>
                    <li>• El trabajo se reactivará automáticamente</li>
                  </ul>
                </div>

                <button
                  onClick={handleEditJob}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-orange-700"
                >
                  <Edit className="h-4 w-4" />
                  Editar y definir fecha de fin
                </button>
              </div>
            )}

            {/* Tips */}
            <div className="rounded-2xl border border-sky-300 dark:border-sky-600 bg-sky-50 dark:bg-sky-900/30 p-4">
              <h3 className="mb-2 font-semibold text-sky-700 dark:text-sky-300">💡 Consejo</h3>
              <p className="text-sm text-sky-600 dark:text-sky-200">
                Lee bien la descripción y asegúrate de tener las herramientas
                necesarias antes de aplicar.
              </p>
            </div>
          </div>
        </div>

        {/* Cancel Confirmation Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-red-600 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
                  <XCircle className="h-6 w-6 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  Cancelar Publicación
                </h3>
              </div>

              <div className="mb-6 space-y-4">
                <p className="text-slate-300">
                  ¿Estás seguro de que deseas cancelar esta publicación?
                </p>

                {/* Time remaining info */}
                {getTimeUntilCancelDeadline() && (
                  <div className="rounded-xl border border-amber-600/50 bg-amber-900/20 p-3">
                    <p className="text-sm text-amber-300">
                      <Clock className="inline h-4 w-4 mr-1" />
                      Recuerda: Solo puedes cancelar hasta 24 horas antes del inicio del trabajo.
                      <br />
                      <span className="text-xs text-amber-400 mt-1 block">
                        Tiempo restante: <strong>{getTimeUntilCancelDeadline()}</strong>
                      </span>
                    </p>
                  </div>
                )}

                {/* Reason textarea */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Razón de cancelación (opcional)
                  </label>
                  <textarea
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    placeholder="Ej: Ya no necesito el servicio, encontré otra solución..."
                    rows={3}
                    maxLength={500}
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
                  />
                  <p className="mt-1 text-xs text-slate-500 text-right">
                    {cancellationReason.length}/500
                  </p>
                </div>

                {job.publicationAmount && (
                  <div className="rounded-xl border border-red-600 bg-red-900/30 p-4">
                    <p className="text-sm font-bold text-red-300 mb-2">
                      ⚠️ Advertencia importante:
                    </p>
                    <p className="text-sm text-red-200">
                      Al cancelar la publicación <span className="font-bold">perderás el dinero de la comisión pagada</span>{" "}
                      (${job.publicationAmount?.toLocaleString("es-AR")} ARS). Esta acción no se puede deshacer.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                    setCancellationReason("");
                  }}
                  disabled={actionLoading}
                  className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600 disabled:opacity-50"
                >
                  No, mantener publicado
                </button>
                <button
                  onClick={handleCancelJob}
                  disabled={actionLoading}
                  className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? (
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  ) : (
                    "Sí, cancelar"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-red-600 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/20">
                  <Trash2 className="h-6 w-6 text-red-500" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  Eliminar Trabajo
                </h3>
              </div>

              <div className="mb-6 space-y-4">
                <p className="text-slate-300">
                  ¿Estás seguro de que deseas eliminar este trabajo permanentemente?
                </p>

                <div className="rounded-xl border border-red-600 bg-red-900/30 p-4">
                  <p className="text-sm font-bold text-red-300 mb-2">
                    ⚠️ Advertencia:
                  </p>
                  <p className="text-sm text-red-200">
                    Esta acción eliminará el trabajo permanentemente y no se puede deshacer.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteJob}
                  disabled={deleting}
                  className="flex-1 rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-red-600 hover:to-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? (
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  ) : (
                    "Sí, eliminar"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Budget Change Modal */}
        {showBudgetModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-sky-600 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/20">
                  <DollarSign className="h-6 w-6 text-sky-500" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  Cambiar Presupuesto
                </h3>
              </div>

              <div className="mb-6 space-y-4">
                <div className="rounded-xl border border-blue-600/50 bg-blue-900/20 p-3">
                  <p className="text-sm text-blue-300">
                    Presupuesto actual: <span className="font-bold">${job.price.toLocaleString('es-AR')} ARS</span>
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Nuevo presupuesto (ARS) *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={newBudget}
                    onChange={(e) => setNewBudget(formatBudgetInput(e.target.value))}
                    placeholder="Ej: 25000 o 25.000"
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  {newBudget && (
                    <p className="mt-1 text-xs text-slate-400">
                      Valor: ${parseArgentineNumber(newBudget).toLocaleString('es-AR')} ARS
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Razón del cambio * (mínimo 10 caracteres)
                  </label>
                  <textarea
                    value={budgetReason}
                    onChange={(e) => setBudgetReason(e.target.value)}
                    placeholder="Ej: Se agregaron tareas adicionales, cambió el alcance del trabajo..."
                    rows={4}
                    maxLength={500}
                    className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
                  />
                  <p className="mt-1 text-xs text-slate-500 text-right">
                    {budgetReason.length}/500 (mínimo 10)
                  </p>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-600 bg-red-900/30 p-4">
                    <p className="text-sm font-medium text-red-300">{error}</p>
                  </div>
                )}

                <div className="rounded-xl border border-amber-600/50 bg-amber-900/20 p-3">
                  <p className="text-sm text-amber-300">
                    <strong>Nota:</strong> Solo puedes cambiar el presupuesto de trabajos que no estén en progreso o completados.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowBudgetModal(false);
                    setNewBudget('');
                    setBudgetReason('');
                    setError(null);
                  }}
                  disabled={changingBudget}
                  className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleChangeBudget}
                  disabled={changingBudget || !newBudget || !budgetReason || budgetReason.length < 10}
                  className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-sky-600 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {changingBudget ? (
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  ) : (
                    "Confirmar cambio"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Select Worker Confirmation Modal */}
        {showSelectConfirmModal && selectedProposal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-green-600 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20">
                  <CheckCircle className="h-6 w-6 text-green-500" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  Confirmar Selección
                </h3>
              </div>

              <div className="mb-6 space-y-4">
                {/* Selected Worker Preview */}
                <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-800 border border-slate-700">
                  <div className="h-14 w-14 overflow-hidden rounded-full bg-sky-100 ring-2 ring-green-500">
                    <img
                      src={
                        selectedProposal.freelancer?.avatar ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedProposal.freelancer?.name || 'user'}`
                      }
                      alt={selectedProposal.freelancer?.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-white text-lg">
                      {selectedProposal.freelancer?.name || 'Usuario'}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-slate-400">
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                        {Number(selectedProposal.freelancer?.rating || 0).toFixed(1)}
                      </span>
                      <span>•</span>
                      <span>{selectedProposal.freelancer?.completedJobs || 0} trabajos</span>
                    </div>
                  </div>
                </div>

                <p className="text-slate-300">
                  ¿Estás seguro de que deseas seleccionar a <span className="font-semibold text-white">{selectedProposal.freelancer?.name}</span> para este trabajo?
                </p>

                {/* Monto acordado */}
                <div className={`rounded-xl border p-4 ${
                  selectedProposal.isCounterOffer
                    ? 'border-amber-600 bg-amber-900/30'
                    : 'border-sky-600 bg-sky-900/30'
                }`}>
                  <p className={`text-sm ${selectedProposal.isCounterOffer ? 'text-amber-300' : 'text-sky-300'}`}>
                    <strong>Monto acordado:</strong>{' '}
                    <span className="font-bold text-lg">
                      ${(selectedProposal.proposedPrice || job.price)?.toLocaleString('es-AR')} ARS
                    </span>
                    {selectedProposal.isCounterOffer && (
                      <span className="block text-xs mt-1 text-amber-400">
                        (Contraoferta - diferente al precio original de ${job.price?.toLocaleString('es-AR')} ARS)
                      </span>
                    )}
                  </p>
                </div>

                <div className="rounded-xl border border-green-600 bg-green-900/30 p-4">
                  <p className="text-sm text-green-300">
                    <strong>Al confirmar:</strong>
                  </p>
                  <ul className="text-sm text-green-200 mt-2 space-y-1">
                    <li>• Se creará el contrato con el trabajador</li>
                    <li>• El trabajador recibirá una notificación</li>
                    {(job.maxWorkers || 1) > 1 ? (
                      (job.selectedWorkers?.length || 0) + 1 >= (job.maxWorkers || 1) ? (
                        <li>• Las demás postulaciones serán rechazadas (se completan los {job.maxWorkers} puestos)</li>
                      ) : (
                        <li>• Las demás postulaciones seguirán pendientes ({(job.maxWorkers || 1) - (job.selectedWorkers?.length || 0) - 1} puesto{(job.maxWorkers || 1) - (job.selectedWorkers?.length || 0) - 1 !== 1 ? 's' : ''} restante{(job.maxWorkers || 1) - (job.selectedWorkers?.length || 0) - 1 !== 1 ? 's' : ''})</li>
                      )
                    ) : (
                      <li>• Las demás postulaciones serán rechazadas</li>
                    )}
                  </ul>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowSelectConfirmModal(false);
                    setSelectedProposal(null);
                  }}
                  disabled={selectingWorker !== null}
                  className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleSelectWorker(selectedProposal)}
                  disabled={selectingWorker !== null}
                  className="flex-1 rounded-xl bg-gradient-to-r from-green-500 to-green-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {selectingWorker !== null ? (
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  ) : (
                    "Confirmar Selección"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Payment Confirmation Modal - Budget Increase */}
        {showPaymentConfirmModal && paymentBreakdown && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-sky-600 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-500/20">
                  <DollarSign className="h-6 w-6 text-sky-500" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  Pago Requerido
                </h3>
              </div>

              <div className="mb-6 space-y-4">
                <p className="text-slate-300">
                  {paymentBreakdown.message}
                </p>

                {/* Payment Breakdown */}
                <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 space-y-3">
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>Presupuesto anterior</span>
                    <span>${paymentBreakdown.oldPrice.toLocaleString('es-AR')} ARS</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>Nuevo presupuesto</span>
                    <span>${paymentBreakdown.newPrice.toLocaleString('es-AR')} ARS</span>
                  </div>
                  <div className="border-t border-slate-700 pt-3 flex justify-between text-slate-200">
                    <span>Diferencia</span>
                    <span className="text-orange-400 font-medium">
                      +${paymentBreakdown.priceDifference.toLocaleString('es-AR')} ARS
                    </span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>Comisión ({paymentBreakdown.commissionRate}%)</span>
                    <span>+${paymentBreakdown.commission.toLocaleString('es-AR')} ARS</span>
                  </div>
                  <div className="border-t border-slate-600 pt-3 flex justify-between text-white font-bold text-lg">
                    <span>Total a pagar</span>
                    <span className="text-sky-400">${paymentBreakdown.total.toLocaleString('es-AR')} ARS</span>
                  </div>
                </div>

                <div className="rounded-xl border border-yellow-600 bg-yellow-900/30 p-4">
                  <p className="text-sm text-yellow-300">
                    <strong>Nota:</strong> El trabajo permanecerá pausado hasta que completes el pago.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowPaymentConfirmModal(false);
                    setPaymentBreakdown(null);
                  }}
                  className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (job && paymentBreakdown) {
                      window.location.href = `/jobs/${job.id || (job as any)._id}/payment?amount=${paymentBreakdown.amountRequired}&reason=budget_increase&oldPrice=${paymentBreakdown.oldPrice}&newPrice=${paymentBreakdown.newPrice}`;
                    }
                  }}
                  className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-sky-600 hover:to-sky-700"
                >
                  Ir al Pago
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Contract Redirect Modal */}
        {showContractRedirectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-purple-600 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/20">
                  <ExternalLink className="h-6 w-6 text-purple-500" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  Redirigir al Contrato
                </h3>
              </div>

              <div className="mb-6 space-y-4">
                <p className="text-slate-300">
                  {contractRedirectMessage}
                </p>

                <div className="rounded-xl border border-purple-600 bg-purple-900/30 p-4">
                  <p className="text-sm text-purple-300">
                    <strong>Nota:</strong> Para cambiar el presupuesto de un trabajo en progreso, debes hacerlo desde el contrato activo.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowContractRedirectModal(false);
                    setContractRedirectUrl("");
                    setContractRedirectMessage("");
                  }}
                  className="flex-1 rounded-xl border border-slate-600 bg-slate-700 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-600"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => {
                    if (contractRedirectUrl) {
                      window.location.href = contractRedirectUrl;
                    }
                  }}
                  className="flex-1 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 px-4 py-3 font-semibold text-white shadow-lg transition-all hover:from-purple-600 hover:to-purple-700"
                >
                  Ir al Contrato
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Success Modal */}
        {showConfirmationSuccessModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-green-600 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-4 flex flex-col items-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 mb-4">
                  <CheckCircle className="h-10 w-10 text-green-500" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  ¡Gracias por confirmar el trabajo!
                </h3>
                <p className="text-slate-300">
                  Gracias por confiar en DoApp, nosotros nos encargamos de que el pago llegue a destino.
                </p>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={() => setShowConfirmationSuccessModal(false)}
                  className="rounded-xl bg-gradient-to-r from-green-500 to-green-600 px-8 py-3 font-semibold text-white shadow-lg transition-all hover:from-green-600 hover:to-green-700"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Error Modal */}
        {showErrorModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-md rounded-2xl border border-red-600 bg-slate-900 p-6 shadow-2xl">
              <div className="mb-4 flex flex-col items-center text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 mb-4">
                  <XCircle className="h-10 w-10 text-red-500" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  Error
                </h3>
                <p className="text-slate-300">
                  {errorMessage}
                </p>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={() => {
                    setShowErrorModal(false);
                    setErrorMessage("");
                  }}
                  className="rounded-xl bg-gradient-to-r from-red-500 to-red-600 px-8 py-3 font-semibold text-white shadow-lg transition-all hover:from-red-600 hover:to-red-700"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
