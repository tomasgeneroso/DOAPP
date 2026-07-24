import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  MessageSquare,
  MessageCircle,
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
  Flag,
  Share2,
  MoreVertical,
  Headphones,
  ClipboardList,
  ShieldCheck,
  FileText,
} from "lucide-react";
import type { Job } from "@/types";
import { getClientInfo } from "@/lib/utils";
import MultipleRatings from "../components/user/MultipleRatings";
import { getCategoryById } from "../../shared/constants/categories";
import LocationCircleMap from "../components/map/LocationCircleMap";
import JobTasks from "../components/jobs/JobTasks";
import { getImageUrl } from "../utils/imageUrl";
import { analytics } from "../utils/analytics";
import { parseArgentineNumber, formatBudgetInput } from "../utils/numberFormat";
import ConfirmationSuccessModal from "../components/jobDetail/ConfirmationSuccessModal";
import ErrorModal from "../components/jobDetail/ErrorModal";
import ContractRedirectModal from "../components/jobDetail/ContractRedirectModal";
import PauseApprovalModal from "../components/jobDetail/PauseApprovalModal";
import CancelJobModal from "../components/jobDetail/CancelJobModal";
import DeleteJobModal from "../components/jobDetail/DeleteJobModal";
import ChangeBudgetModal from "../components/jobDetail/ChangeBudgetModal";
import SelectWorkerConfirmModal from "../components/jobDetail/SelectWorkerConfirmModal";
import BudgetPaymentConfirmModal from "../components/jobDetail/BudgetPaymentConfirmModal";
import ConfirmModal from "../components/ui/ConfirmModal";
import useDialog from "../hooks/useDialog";
import useImageViewer from "../hooks/useImageViewer";
import JobActionsMenu from "../components/jobDetail/JobActionsMenu";
import ClientDropdownMenu from "../components/jobDetail/ClientDropdownMenu";
import AdminJobDetailsPanel from "../components/jobDetail/AdminJobDetailsPanel";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const isAdmin = !!(user as any)?.adminRole;
  const [adminPayment, setAdminPayment] = useState<any>(null);
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
  const [messagingProposal, setMessagingProposal] = useState<string | null>(
    null,
  );
  const [showSelectConfirmModal, setShowSelectConfirmModal] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<any>(null);
  const [newProposalAlert, setNewProposalAlert] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [newBudget, setNewBudget] = useState("");
  const [budgetReason, setBudgetReason] = useState("");
  const [changingBudget, setChangingBudget] = useState(false);
  const [showClientMenu, setShowClientMenu] = useState(false);
  const [showPauseApprovalModal, setShowPauseApprovalModal] = useState(false);
  const [requestingPauseApproval, setRequestingPauseApproval] = useState(false);
  const proposalsSectionRef = useRef<HTMLDivElement | null>(null);

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
  const [showContractRedirectModal, setShowContractRedirectModal] =
    useState(false);
  const [contractRedirectUrl, setContractRedirectUrl] = useState<string>("");
  const [contractRedirectMessage, setContractRedirectMessage] =
    useState<string>("");

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
    price?: number;
    commission?: number;
    totalPrice?: number;
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
  const [showConfirmationSuccessModal, setShowConfirmationSuccessModal] =
    useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [copiedPairingCode, setCopiedPairingCode] = useState(false);
  const [copiedJobCode, setCopiedJobCode] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [myProposalId, setMyProposalId] = useState<string | null>(null);
  const [myProposalStatus, setMyProposalStatus] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [confirmWithdrawOpen, setConfirmWithdrawOpen] = useState(false);
  const { notify, dialog } = useDialog();
  const { openImage, viewer } = useImageViewer();
  const [checkingApplication, setCheckingApplication] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);

  const {
    registerNewProposalHandler,
    registerJobUpdateHandler,
    registerJobsRefreshHandler,
    registerContractUpdateHandler,
  } = useSocket();

  // Handle contract updates (for real-time confirmation updates)
  const handleContractUpdate = useCallback(
    (data: any) => {
      if (
        contractData &&
        (data.contractId === contractData.id ||
          data.contract?.id === contractData.id ||
          data.contract?.jobId === id)
      ) {
        console.log("📋 Contract updated:", data);
        if (data.contract) {
          setContractData((prev) =>
            prev
              ? {
                  ...prev,
                  clientConfirmed:
                    data.contract.clientConfirmed ?? prev.clientConfirmed,
                  doerConfirmed:
                    data.contract.doerConfirmed ?? prev.doerConfirmed,
                  status: data.contract.status ?? prev.status,
                }
              : null,
          );
        }
        // Also refresh job data if contract status changed
        if (
          data.contract?.status === "completed" ||
          data.action === "confirmed"
        ) {
          setRefreshKey((prev) => prev + 1);
        }
      }
    },
    [contractData, id],
  );

  // Handle new proposal notification
  const handleNewProposal = useCallback(
    (data: any) => {
      if (data.proposal?.jobId === id || data.proposal?.job?.id === id) {
        console.log("🆕 New proposal received for this job:", data);
        setNewProposalAlert(
          t("jobs.newApplication", "New application from {{name}}", {
            name:
              data.proposal?.freelancer?.name || t("common.aUser", "a user"),
          }),
        );
        // Add to proposals list
        setProposals((prev) => {
          if (prev.some((p) => p.id === data.proposal.id)) return prev;
          return [data.proposal, ...prev];
        });
        // Auto-hide after 5 seconds
        setTimeout(() => setNewProposalAlert(null), 5000);
      }
    },
    [id, t],
  );

  // Handle job updates
  const handleJobUpdate = useCallback(
    (data: any) => {
      if (data.jobId === id || data.job?.id === id) {
        console.log("📝 Job updated:", data);
        if (data.job && typeof data.job === "object") {
          setJob((prev) => (prev ? { ...prev, ...data.job } : data.job));
        } else if (data.selectedWorkers !== undefined || data.status !== undefined) {
          // Partial update (e.g. auto-selection from cron) — merge fields directly
          setJob((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              ...(data.selectedWorkers !== undefined && { selectedWorkers: data.selectedWorkers }),
              ...(data.status !== undefined && { status: data.status }),
            };
          });
        }
      }
    },
    [id],
  );

  // Handle jobs refresh (general refresh signal)
  const handleJobsRefresh = useCallback(
    (data?: any) => {
      // If the refresh is for this specific job or a general refresh, refetch
      if (
        !data ||
        data.jobId === id ||
        data.job?.id === id ||
        data.action === "updated"
      ) {
        console.log("🔄 Jobs refresh signal received, refetching job:", id);
        setRefreshKey((prev) => prev + 1);
      }
    },
    [id],
  );

  // Register socket handlers
  useEffect(() => {
    registerNewProposalHandler(handleNewProposal);
    registerJobUpdateHandler(handleJobUpdate);
    registerJobsRefreshHandler(handleJobsRefresh);
    registerContractUpdateHandler(handleContractUpdate);
  }, [
    registerNewProposalHandler,
    registerJobUpdateHandler,
    registerJobsRefreshHandler,
    registerContractUpdateHandler,
    handleNewProposal,
    handleJobUpdate,
    handleJobsRefresh,
    handleContractUpdate,
  ]);

  // Fetch job data
  const fetchJob = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/jobs/${id}`);
      const data = await response.json();
      if (data.success) {
        setJob(data.job);
        // Track job view
        analytics.jobView(id, {
          category: data.job.category,
          price: data.job.price,
          location: data.job.location?.city || data.job.location?.province,
        });
      } else {
        setError(
          data.message || t("jobs.couldNotLoad", "Could not load the job"),
        );
      }
    } catch (err) {
      setError(t("jobs.errorLoading", "Error loading the job"));
      console.error("Error fetching job:", err);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob, refreshKey]);

  // Refetch when navigating back from edit page
  useEffect(() => {
    // Check if we navigated back from edit page
    const currentPath = location.pathname;
    const wasOnEditPage = lastPathRef.current?.includes("/edit");
    const isNowOnDetailPage = currentPath === `/jobs/${id}`;

    if (wasOnEditPage && isNowOnDetailPage) {
      // Force a refetch
      setRefreshKey((prev) => prev + 1);
    }

    lastPathRef.current = currentPath;
  }, [location.pathname, id]);

  // Scroll to proposals section when navigating from chat "Ver todos los aplicantes"
  useEffect(() => {
    if ((location.state as any)?.scrollTo === 'proposals' && proposalsSectionRef.current) {
      setTimeout(() => {
        proposalsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 600);
    }
  }, [location.state, job]);

  // Fetch proposals if user is the job owner
  useEffect(() => {
    const fetchProposals = async () => {
      if (!job || !user || !token) return;

      // Check if user is the job owner
      const clientId =
        typeof job.client === "string"
          ? job.client
          : job.client?.id || job.client?._id;
      const userId = user?.id || user?._id;

      if (clientId !== userId) return;
      // Cargar propuestas si el trabajo está abierto o in_progress (para ver historial de postulaciones)
      if (job.status !== "open" && job.status !== "in_progress") return;

      setLoadingProposals(true);
      try {
        const response = await fetch(
          `/api/proposals/job/${job.id || job._id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        const data = await response.json();
        console.log("📋 Proposals fetched:", {
          success: data.success,
          count: data.proposals?.length,
          proposals: data.proposals?.map((p: any) => ({
            id: p.id,
            isCounterOffer: p.isCounterOffer,
            proposedPrice: p.proposedPrice,
            originalJobPrice: p.originalJobPrice,
            status: p.status,
            freelancerName: p.freelancer?.name,
          })),
        });
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

  // Admin: fetch publication payment + proof details to show on the publication view
  useEffect(() => {
    const fetchAdminPayment = async () => {
      if (!id || !token || !isAdmin) return;
      try {
        const res = await fetch(`/api/admin/jobs/${id}/payment`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.success) setAdminPayment(data.data);
      } catch {
        /* silent: admin panel is best-effort */
      }
    };
    fetchAdminPayment();
  }, [id, token, isAdmin, refreshKey]);

  // Check if current user has already applied to this job
  useEffect(() => {
    const checkIfApplied = async () => {
      if (!job || !user || !token) return;

      // Only check for non-owners
      const clientId =
        typeof job.client === "string"
          ? job.client
          : job.client?.id || job.client?._id;
      const userId = user?.id || user?._id;
      if (clientId === userId) return;

      setCheckingApplication(true);
      try {
        const response = await fetch(
          `/api/proposals/check/${job.id || job._id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
        const data = await response.json();
        if (data.success) {
          setHasApplied(data.hasApplied || false);
          setMyProposalId(data.proposalId || null);
          setMyProposalStatus(data.proposalStatus || null);
        }
      } catch (err) {
        console.error("Error checking application status:", err);
      } finally {
        setCheckingApplication(false);
      }
    };

    checkIfApplied();
  }, [job, user, token]);

  // Fetch all contracts for team jobs - extracted as callback for reuse
  const fetchAllContracts = useCallback(async () => {
    if (!job || !token) return;
    // Jobs without contracts yet
    const jobStatusWithoutContract = [
      "draft",
      "pending_payment",
      "pending_approval",
      "open",
    ];
    if (jobStatusWithoutContract.includes(job.status)) return;
    // Only fetch for team jobs that have selected workers
    if (!job.maxWorkers || job.maxWorkers <= 1) return;
    // Only fetch if there are selected workers (contracts exist)
    if (!job.selectedWorkers || job.selectedWorkers.length === 0) return;

    try {
      const response = await fetch(
        `/api/contracts/all-by-job/${job.id || job._id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
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
  }, [job, token]);

  // Fetch contract data for selected worker OR client (to show pairing code and confirmation)
  useEffect(() => {
    const fetchContractData = async () => {
      if (!job || !user || !token) return;
      const jobDoerId =
        job.doerId || (typeof job.doer === "object" ? job.doer?.id : job.doer);
      const jobClientId =
        typeof job.client === "object"
          ? job.client?.id || job.client?._id
          : job.client;
      const userId = user?.id || user?._id;

      // Additional check: Jobs in certain statuses don't have contracts yet
      const jobStatusWithoutContract = [
        "draft",
        "pending_payment",
        "pending_approval",
        "paused",
        "cancelled",
      ];
      if (jobStatusWithoutContract.includes(job.status)) {
        return; // No contract exists yet for this job
      }

      // Fetch if current user is either the selected worker OR the client
      // Also try to fetch for 'open' and 'in_progress' jobs - the backend will return 404 if no contract exists
      const isDoer = jobDoerId && jobDoerId === userId;
      const isClient = jobClientId && jobClientId === userId;
      const isSelectedWorker = job.selectedWorkers?.includes(userId as string);

      // Always try to fetch for client or if user might be a worker (let backend decide)
      if (!isDoer && !isClient && !isSelectedWorker) {
        // Even if not in selectedWorkers, try to fetch - user might have a contract from a proposal
        // that wasn't reflected in selectedWorkers (data sync issue)
        if (job.status !== "open" && job.status !== "in_progress") {
          return;
        }
      }

      try {
        // Fetch contract by job ID
        const response = await fetch(
          `/api/contracts/by-job/${job.id || job._id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );
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
            price: data.contract.price,
            commission: data.contract.commission,
            totalPrice: data.contract.totalPrice,
          });
        }
      } catch (err) {
        console.error("Error fetching contract data:", err);
      }
    };

    fetchContractData();
    fetchAllContracts();
  }, [job, user, token, fetchAllContracts]);

  const handleCopyPairingCode = () => {
    if (contractData?.pairingCode) {
      navigator.clipboard.writeText(contractData.pairingCode);
      setCopiedPairingCode(true);
      setTimeout(() => setCopiedPairingCode(false), 3000);
    }
  };

  const getJobCode = (jobId: string) => {
    if (!jobId) return "A0000";
    const hex = jobId.replace(/-/g, "");
    const letter = String.fromCharCode(65 + (parseInt(hex[0], 16) % 26));
    const nums = hex
      .slice(1, 5)
      .split("")
      .map((c) => String(parseInt(c, 16) % 10))
      .join("");
    return letter + nums;
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
      const response = await fetch(
        `/api/contracts/${contractData.id}/confirm`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = await response.json();
      if (data.success) {
        // Update local contract data
        setContractData((prev) =>
          prev
            ? {
                ...prev,
                clientConfirmed:
                  data.contract?.clientConfirmed ?? prev.clientConfirmed,
                doerConfirmed:
                  data.contract?.doerConfirmed ?? prev.doerConfirmed,
                status: data.contract?.status ?? prev.status,
              }
            : null,
        );
        // Refresh all contracts data for team jobs
        if (job?.maxWorkers && job.maxWorkers > 1) {
          fetchAllContracts();
        }
        // Show success modal instead of navigating
        setShowConfirmationSuccessModal(true);
      } else {
        setErrorMessage(
          data.message || t("jobs.errorConfirming", "Error confirming the job"),
        );
        setShowErrorModal(true);
      }
    } catch (err) {
      console.error("Error confirming work:", err);
      setErrorMessage(t("jobs.errorConfirming", "Error confirming the job"));
      setShowErrorModal(true);
    } finally {
      setConfirmingWork(false);
    }
  };

  // Handle opening chat with worker/client from contract
  const handleOpenChat = async () => {
    if (!contractData?.id || !token || loadingChat) return;

    setLoadingChat(true);
    try {
      const response = await fetch(
        `/api/chat/conversations/by-contract/${contractData.id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const data = await response.json();
      if (data.success && data.conversation) {
        navigate(`/chat/${data.conversation._id || data.conversation.id}`);
      } else {
        setErrorMessage(t("chat.couldNotOpen", "Could not open chat"));
        setShowErrorModal(true);
      }
    } catch (err) {
      console.error("Error opening chat:", err);
      setErrorMessage(
        t("chat.errorOpening", "Error opening chat. Please try again."),
      );
      setShowErrorModal(true);
    } finally {
      setLoadingChat(false);
    }
  };

  const handleApply = () => {
    if (!user) {
      navigate("/login", { state: { from: `/jobs/${id}` } });
      return;
    }

    navigate(`/jobs/${id}/apply`);
  };

  // Withdraw an application straight from the job view (previously only possible from chat)
  const handleWithdrawApplication = async () => {
    if (!myProposalId || withdrawing) return;
    setWithdrawing(true);
    try {
      const res = await fetch(`/api/proposals/${myProposalId}/withdraw`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        setHasApplied(false);
        setMyProposalId(null);
        setMyProposalStatus(null);
      } else {
        setError(data.message || t("jobs.errorWithdrawing", "No se pudo cancelar la postulación"));
      }
    } catch (err: any) {
      setError(t("jobs.errorWithdrawing", "No se pudo cancelar la postulación"));
    } finally {
      setWithdrawing(false);
      setConfirmWithdrawOpen(false);
    }
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
      const response = await fetch("/api/proposals/start-negotiation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
        setError(
          data.message ||
            t("chat.couldNotStart", "Could not start conversation"),
        );
      }
    } catch (err: any) {
      setError(
        err.message || t("chat.errorStarting", "Error starting conversation"),
      );
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
      setError(
        t(
          "jobs.couldNotIdentifyFreelancer",
          "Could not identify the freelancer",
        ),
      );
      return;
    }

    setMessagingProposal(proposal.id);
    setError(null);

    try {
      // Create or find conversation with the freelancer, linked to this job
      const response = await fetch("/api/chat/conversations/find-or-create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
        setError(
          data.message ||
            t("chat.couldNotStart", "Could not start conversation"),
        );
      }
    } catch (err: any) {
      setError(
        err.message || t("chat.errorStarting", "Error starting conversation"),
      );
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
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        // Refresh job data
        const jobResponse = await fetch(`/api/jobs/${id}`);
        const jobData = await jobResponse.json();
        if (jobData.success) {
          setJob(jobData.job);
        }
      } else if (data.requiresWorkerApproval) {
        setShowPauseApprovalModal(true);
      } else {
        setError(
          data.message || t("jobs.errorPausing", "Error pausing the listing"),
        );
      }
    } catch (err: any) {
      setError(
        err.message || t("jobs.errorPausing", "Error pausing the listing"),
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestPauseApproval = async () => {
    if (!job || !token) return;
    setRequestingPauseApproval(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}/request-pause-approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setShowPauseApprovalModal(false);
      if (data.success) {
        setError(null);
        notify(t("jobs.pauseApprovalSent", "Se envió la solicitud de pausa al trabajador. Esperá su respuesta."), 'success');
      } else {
        setError(data.message || "Error al enviar solicitud");
      }
    } catch {
      setError("Error al enviar solicitud de pausa");
    } finally {
      setRequestingPauseApproval(false);
    }
  };

  const handleResumeJob = async () => {
    if (!job || !token) return;

    setActionLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${job.id}/resume`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
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
        setError(
          data.message || t("jobs.errorResuming", "Error resuming the listing"),
        );
      }
    } catch (err: any) {
      setError(
        err.message || t("jobs.errorResuming", "Error resuming the listing"),
      );
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
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({
          reason: cancellationReason.trim() || null,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setShowCancelModal(false);
        setCancellationReason("");
        // Redirect to dashboard
        navigate("/dashboard");
      } else {
        setError(
          data.message ||
            t("jobs.errorCancelling", "Error cancelling the listing"),
        );
        setShowCancelModal(false);
      }
    } catch (err: any) {
      setError(
        err.message ||
          t("jobs.errorCancelling", "Error cancelling the listing"),
      );
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
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        setShowDeleteModal(false);
        // Redirect to dashboard
        navigate("/dashboard");
      } else {
        setError(
          data.message || t("jobs.errorDeleting", "Error deleting the job"),
        );
        setShowDeleteModal(false);
      }
    } catch (err: any) {
      setError(
        err.message || t("jobs.errorDeleting", "Error deleting the job"),
      );
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
      setError(t("jobs.budgetMustBePositive", "Budget must be greater than 0"));
      return;
    }

    if (!budgetReason || budgetReason.trim().length < 10) {
      setError(
        t("jobs.reasonMinLength", "Reason must be at least 10 characters"),
      );
      return;
    }

    setChangingBudget(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${job.id || job._id}/budget`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
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
      if (
        response.status === 400 &&
        data.redirectTo &&
        data.redirectTo.includes("contracts")
      ) {
        setContractRedirectMessage(data.message);
        setContractRedirectUrl(data.redirectTo);
        setShowContractRedirectModal(true);
        setShowBudgetModal(false);
        return;
      }

      if (data.success) {
        setShowBudgetModal(false);
        setNewBudget("");
        setBudgetReason("");
        // Refresh job + proposals so price change is reflected everywhere
        const [jobResponse, proposalsResponse] = await Promise.all([
          fetch(`/api/jobs/${id}`),
          token ? fetch(`/api/proposals/job/${id}`, { headers: { Authorization: `Bearer ${token}` } }) : Promise.resolve(null),
        ]);
        const jobData = await jobResponse.json();
        if (jobData.success) {
          setJob(jobData.job);
        }
        if (proposalsResponse) {
          const proposalsData = await proposalsResponse.json();
          if (proposalsData.success) setProposals(proposalsData.proposals || []);
        }
      } else {
        setError(
          data.message ||
            t("jobs.errorChangingBudget", "Error changing the budget"),
        );
      }
    } catch (err: any) {
      setError(
        err.message ||
          t("jobs.errorChangingBudget", "Error changing the budget"),
      );
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
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
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
        setError(
          data.message ||
            t("jobs.errorSelectingWorker", "Error selecting worker"),
        );
      }
    } catch (err: any) {
      setError(
        err.message || t("jobs.errorSelectingWorker", "Error selecting worker"),
      );
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

    if (diff <= 0) return t("jobs.deadlinePassed", "Deadline has passed");

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return t("jobs.daysRemaining", "{{count}} days remaining", {
        count: days,
      });
    }
    return t("jobs.timeRemaining", "{{hours}}h {{minutes}}m remaining", {
      hours,
      minutes,
    });
  };

  // Check if cancellation is allowed (more than 24h before start, or pending_approval)
  const canCancelJob = () => {
    if (!job) return false;
    // Siempre se puede cancelar durante pending_approval (reembolso total)
    if (job.status === "pending_approval") return true;
    if (!job.startDate) return false;
    const startDate = new Date(job.startDate);
    const now = new Date();
    const hoursUntilStart =
      (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursUntilStart > 24;
  };

  // Check if pause is allowed (more than 24h before start)
  const canPauseJob = () => {
    if (!job?.startDate) return false;
    const startDate = new Date(job.startDate);
    const now = new Date();
    const hoursUntilStart =
      (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);
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
      return `${days} ${t("jobs.actions.daysToCancel", "days to cancel")}`;
    }
    return `${hours}h ${minutes}m ${t("jobs.actions.toCancel", "to cancel")}`;
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
          <p className="text-red-600 mb-4">
            {error || t("jobs.notFound", "Job not found")}
          </p>
          <Link to="/" className="text-sky-600 hover:text-sky-700 font-medium">
            {t("common.backToHome", "Back to home")}
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
  const isDraft = job.status === "draft" || job.status === "pending_payment";

  // Check if current user is a worker on this job
  const isWorkerOnJob =
    user &&
    userId &&
    (job.doerId === userId ||
      (job.selectedWorkers && job.selectedWorkers.includes(userId)) ||
      contractData?.doerId === userId);

  return (
    <>
      <Helmet>
        <title>{job.title} - DoApp</title>
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
            {t("jobs.backToJobs", "Back to jobs")}
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
                      title={t("jobs.copyJobCode", "Copy job code")}
                    >
                      <Key className="h-4 w-4" />#
                      {getJobCode(job.id || job._id)}
                      {copiedJobCode ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4 opacity-60" />
                      )}
                    </button>
                    {/* Status Badge - Visible para todos */}
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                        job.status === "completed"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border border-green-200 dark:border-green-700"
                          : job.status === "in_progress"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-700"
                            : job.status === "open"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700"
                              : job.status === "pending_approval"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-700"
                                : job.status === "pending_payment"
                                  ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-700"
                                  : job.status === "paused"
                                    ? "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
                                    : job.status === "cancelled"
                                      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-700"
                                      : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-600"
                      }`}
                    >
                      {job.status === "completed" && (
                        <CheckCircle className="h-3.5 w-3.5" />
                      )}
                      {job.status === "in_progress" && (
                        <Clock className="h-3.5 w-3.5" />
                      )}
                      {job.status === "open" && (
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      )}
                      {job.status === "pending_approval" && (
                        <Clock className="h-3.5 w-3.5" />
                      )}
                      {job.status === "pending_payment" && (
                        <DollarSign className="h-3.5 w-3.5" />
                      )}
                      {job.status === "paused" && (
                        <Pause className="h-3.5 w-3.5" />
                      )}
                      {job.status === "cancelled" && (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                      {job.status === "completed"
                        ? t("status.completed", "Completed")
                        : job.status === "in_progress"
                          ? t("status.inProgress", "In Progress")
                          : job.status === "open"
                            ? t("status.open", "Open")
                            : job.status === "pending_approval"
                              ? t("status.pending", "Pending")
                              : job.status === "pending_payment"
                                ? t("status.pendingPayment", "Payment Pending")
                                : job.status === "paused"
                                  ? t("status.paused", "Paused")
                                  : job.status === "cancelled"
                                    ? t("status.cancelled", "Cancelled")
                                    : job.status === "draft"
                                      ? t("status.draft", "Draft")
                                      : job.status}
                    </span>
                    <div className="flex items-center gap-1">
                      <MapPin className="h-4 w-4" />
                      <span>
                        {[
                          job.addressStreet,
                          job.neighborhood,
                          job.postalCode ? `CP ${job.postalCode}` : null,
                          job.location,
                          "Argentina",
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                      {(clientInfo?.rating || 0).toFixed(1)}
                    </span>
                  </div>
                </div>
                <div className="rounded-full bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-2 text-xl font-bold text-white shadow-lg shadow-sky-500/30">
                  ${Number(job.price || 0).toLocaleString("es-AR")}
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
                      {t("jobs.startDate", "Start date")}
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
                      {t("jobs.startTime", "Start time")}
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
                        {t("jobs.endDate", "End date")}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-amber-700 dark:text-amber-300">
                        {t("jobs.toBeDecided", "To be decided")}
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {t(
                          "jobs.clientHasNotSetEndDate",
                          "The client has not yet set the end date",
                        )}
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
                          {t("jobs.endDate", "End date")}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                          {job.endDate
                            ? new Date(job.endDate).toLocaleDateString("es-AR")
                            : t("jobs.toBeDecided", "To be decided")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/30 text-sky-600">
                        <Clock className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {t("jobs.endTime", "End time")}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">
                          {job.endDate
                            ? new Date(job.endDate).toLocaleTimeString(
                                "es-AR",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )
                            : "--:--"}
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
                        {t("jobs.teamJob", "Team job")}
                      </span>
                    </div>
                    <span className="text-sm text-purple-600 dark:text-purple-400">
                      {job.selectedWorkers?.length || 0} / {job.maxWorkers}{" "}
                      {t("jobs.workers", "workers")}
                    </span>
                  </div>
                  <div className="mt-2">
                    <div className="h-2 bg-purple-200 dark:bg-purple-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-600 dark:bg-purple-400 rounded-full transition-all duration-300"
                        style={{
                          width: `${((job.selectedWorkers?.length || 0) / (job.maxWorkers || 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  {(job.selectedWorkers?.length || 0) <
                    (job.maxWorkers || 1) && (
                    <p className="mt-2 text-sm text-purple-600 dark:text-purple-400">
                      {t(
                        "jobs.workersToSelect",
                        "{{count}} worker(s) to select",
                        {
                          count:
                            (job.maxWorkers || 1) -
                            (job.selectedWorkers?.length || 0),
                        },
                      )}
                    </p>
                  )}
                  {(job.selectedWorkers?.length || 0) >=
                    (job.maxWorkers || 1) && (
                    <p className="mt-2 text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                      <CheckCircle className="h-4 w-4" />
                      {t("jobs.teamComplete", "Team complete")}
                    </p>
                  )}
                </div>
              )}

              {/* Contract/Job Info Section - VISTA COMPLETA - Siempre visible para dueño o trabajador */}
              {(isOwnJob || isWorkerOnJob) && (
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border-2 border-sky-200 dark:border-sky-700 bg-gradient-to-br from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 p-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Briefcase className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                      <h2 className="text-xl font-bold text-sky-800 dark:text-sky-300">
                        {contractData
                          ? t("jobs.contractInfo", "Contract Information")
                          : t("jobs.jobInfo", "Job Information")}
                      </h2>
                    </div>

                    {/* {t('jobs.detail.parties')} + {t('jobs.detail.paymentDetails')} + Fechas */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      {/* Partes */}
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Users className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {t("jobs.detail.parties")}
                          </h3>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {t("common.client", "Client")}
                            </p>
                            <Link
                              to={`/profile/${getClientInfo(job?.client)?.id || ""}`}
                              className="font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:underline"
                            >
                              {getClientInfo(job?.client)?.name ||
                                t("common.client", "Client")}
                            </Link>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {t("common.worker", "Worker")}
                            </p>
                            {job.doer ? (
                              <Link
                                to={`/profile/${typeof job.doer === "string" ? job.doer : job.doer.id || job.doer._id}`}
                                className="font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:underline"
                              >
                                {typeof job.doer === "string"
                                  ? t("profile.viewProfile", "View profile")
                                  : job.doer.name}
                              </Link>
                            ) : contractData?.doerId ? (
                              <Link
                                to={`/profile/${contractData.doerId}`}
                                className="font-medium text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:underline"
                              >
                                {allContractsData?.contracts?.find(
                                  (c) => c.doerId === contractData.doerId,
                                )?.doerName ||
                                  t("profile.viewProfile", "View profile")}
                              </Link>
                            ) : (
                              <p className="font-medium text-gray-900 dark:text-white">
                                {t("jobs.detail.pendingAssignment")}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* {t('jobs.detail.paymentDetails')} */}
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <DollarSign className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {t("jobs.detail.paymentDetails")}
                          </h3>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                              {t("common.price", "Price")}:
                            </span>
                            <span className="font-semibold text-gray-900 dark:text-white">
                              $
                              {Number(
                                contractData?.price || job.price || 0,
                              ).toLocaleString("es-AR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                          {contractData?.commission && (
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                {t("common.commission", "Commission")}:
                              </span>
                              <span className="font-semibold text-gray-900 dark:text-white">
                                $
                                {Number(contractData.commission).toLocaleString(
                                  "es-AR",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  },
                                )}
                              </span>
                            </div>
                          )}
                          {contractData?.totalPrice && (
                            <div className="flex justify-between border-t dark:border-gray-700 pt-2">
                              <span className="font-semibold text-gray-900 dark:text-white">
                                {t("common.total", "Total")}:
                              </span>
                              <span className="font-bold text-sky-600 dark:text-sky-400">
                                $
                                {Number(contractData.totalPrice).toLocaleString(
                                  "es-AR",
                                  {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  },
                                )}
                              </span>
                            </div>
                          )}
                          {contractData && (
                            <div className="mt-2 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              {t(
                                "jobs.protectedWithEscrow",
                                "Protected with Escrow",
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Fechas */}
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Calendar className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {t("jobs.detail.dates")}
                          </h3>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {t("common.start", "Start")}:
                            </p>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {job.startDate
                                ? new Date(job.startDate).toLocaleDateString(
                                    "es-AR",
                                    {
                                      day: "numeric",
                                      month: "long",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )
                                : "N/A"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {t("common.end", "End")}:
                            </p>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {job.endDate
                                ? new Date(job.endDate).toLocaleDateString(
                                    "es-AR",
                                    {
                                      day: "numeric",
                                      month: "long",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    },
                                  )
                                : job.endDateFlexible
                                  ? t("common.flexible", "Flexible")
                                  : "N/A"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Estado del Contrato/Trabajo */}
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Clock className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {contractData
                            ? t("jobs.contractStatus", "Contract Status")
                            : t("jobs.jobStatus", "Job Status")}
                        </h3>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`px-4 py-2 rounded-full font-bold ${
                            contractData
                              ? contractData.status === "completed"
                                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                : contractData.status === "in_progress"
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                  : contractData.status ===
                                      "awaiting_confirmation"
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                    : contractData.status === "accepted"
                                      ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400"
                                      : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                              : job.status === "completed"
                                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                : job.status === "in_progress"
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                  : job.status === "open"
                                    ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400"
                                    : job.status === "pending_approval"
                                      ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                      : job.status === "paused"
                                        ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                                        : job.status === "cancelled"
                                          ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                          : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {contractData
                            ? contractData.status === "completed"
                              ? t("status.completed", "Completed")
                              : contractData.status === "in_progress"
                                ? t("status.inProgress", "In progress")
                                : contractData.status ===
                                    "awaiting_confirmation"
                                  ? t(
                                      "status.awaitingConfirmation",
                                      "Awaiting confirmation",
                                    )
                                  : contractData.status === "accepted"
                                    ? t("status.accepted", "Accepted")
                                    : contractData.status === "pending"
                                      ? t("status.pending", "Pending")
                                      : contractData.status
                            : job.status === "completed"
                              ? t("status.completed", "Completed")
                              : job.status === "in_progress"
                                ? t("status.inProgress", "In progress")
                                : job.status === "open"
                                  ? t("status.open", "Open")
                                  : job.status === "pending_approval"
                                    ? t(
                                        "status.pendingApproval",
                                        "Pending approval",
                                      )
                                    : job.status === "pending_payment"
                                      ? t(
                                          "status.pendingPayment",
                                          "Payment pending",
                                        )
                                      : job.status === "paused"
                                        ? t("status.paused", "Paused")
                                        : job.status === "cancelled"
                                          ? t("status.cancelled", "Cancelled")
                                          : job.status === "draft"
                                            ? t("status.draft", "Draft")
                                            : job.status}
                        </span>
                      </div>
                    </div>

                    {/* Confirmaciones - Solo mostrar si hay contrato */}
                    {contractData ? (
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-4">
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                          {t(
                            "jobs.completionConfirmations",
                            "Completion Confirmations",
                          )}
                        </p>
                        {allContractsData &&
                        allContractsData.totalContracts > 1 ? (
                          <div className="space-y-2">
                            {allContractsData.contracts.map((c) => (
                              <div
                                key={c.id}
                                className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded"
                              >
                                <span
                                  className={`flex items-center gap-2 font-medium ${c.doerConfirmed && c.clientConfirmed ? "text-green-600" : c.doerConfirmed || c.clientConfirmed ? "text-amber-600" : "text-slate-400"}`}
                                >
                                  {c.doerConfirmed && c.clientConfirmed ? (
                                    <CheckCircle className="h-5 w-5" />
                                  ) : (
                                    <Clock className="h-5 w-5" />
                                  )}
                                  {c.doerName}
                                </span>
                                <div className="flex items-center gap-3">
                                  <span
                                    className={`flex items-center gap-1 text-sm ${c.doerConfirmed ? "text-green-600" : "text-slate-400"}`}
                                  >
                                    {c.doerConfirmed ? (
                                      <CheckCircle className="h-4 w-4" />
                                    ) : (
                                      <Clock className="h-4 w-4" />
                                    )}
                                    {t("common.worker", "Worker")}
                                  </span>
                                  <span
                                    className={`flex items-center gap-1 text-sm ${c.clientConfirmed ? "text-green-600" : "text-slate-400"}`}
                                  >
                                    {c.clientConfirmed ? (
                                      <CheckCircle className="h-4 w-4" />
                                    ) : (
                                      <Clock className="h-4 w-4" />
                                    )}
                                    {t("common.client", "Client")}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-3">
                            <div
                              className={`p-3 rounded-lg ${contractData.doerConfirmed ? "bg-green-50 dark:bg-green-900/20 border-2 border-green-300" : "bg-gray-50 dark:bg-gray-700/50"}`}
                            >
                              <div className="flex items-center gap-2">
                                {contractData.doerConfirmed ? (
                                  <CheckCircle className="h-5 w-5 text-green-600" />
                                ) : (
                                  <Clock className="h-5 w-5 text-gray-400" />
                                )}
                                <div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {t("common.worker", "Worker")}
                                  </p>
                                  <p
                                    className={`font-semibold ${contractData.doerConfirmed ? "text-green-700 dark:text-green-400" : "text-gray-600"}`}
                                  >
                                    {contractData.doerConfirmed
                                      ? t("status.confirmed", "Confirmed")
                                      : t("status.pending", "Pending")}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div
                              className={`p-3 rounded-lg ${contractData.clientConfirmed ? "bg-green-50 dark:bg-green-900/20 border-2 border-green-300" : "bg-gray-50 dark:bg-gray-700/50"}`}
                            >
                              <div className="flex items-center gap-2">
                                {contractData.clientConfirmed ? (
                                  <CheckCircle className="h-5 w-5 text-green-600" />
                                ) : (
                                  <Clock className="h-5 w-5 text-gray-400" />
                                )}
                                <div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {t("common.client", "Client")}
                                  </p>
                                  <p
                                    className={`font-semibold ${contractData.clientConfirmed ? "text-green-700 dark:text-green-400" : "text-gray-600"}`}
                                  >
                                    {contractData.clientConfirmed
                                      ? t("status.confirmed", "Confirmed")
                                      : t("status.pending", "Pending")}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Botón de Confirmar - Habilitado 5 minutos antes del fin del trabajo hasta que se confirme */}
                        {contractData.status === "in_progress" &&
                          job.endDate &&
                          (() => {
                            const now = new Date();
                            const endDate = new Date(job.endDate);
                            const fiveMinutesBefore = new Date(
                              endDate.getTime() - 5 * 60 * 1000,
                            );
                            return now >= fiveMinutesBefore;
                          })() && (
                            <div className="mt-4">
                              {((isOwnJob && !contractData.clientConfirmed) ||
                                (isWorkerOnJob &&
                                  !contractData.doerConfirmed)) && (
                                <button
                                  onClick={handleConfirmWork}
                                  disabled={confirmingWork}
                                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 text-lg"
                                >
                                  {confirmingWork ? (
                                    <>
                                      <Loader2 className="h-5 w-5 animate-spin" />
                                      {t("common.confirming", "Confirming...")}
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle className="h-6 w-6" />
                                      {t(
                                        "jobs.confirmCompletion",
                                        "Confirm Job Completion",
                                      )}
                                    </>
                                  )}
                                </button>
                              )}
                              {isOwnJob &&
                                contractData.clientConfirmed &&
                                !contractData.doerConfirmed && (
                                  <div className="bg-sky-50 dark:bg-sky-900/20 border-2 border-sky-300 dark:border-sky-700 rounded-lg p-4 text-center">
                                    <p className="text-sky-700 dark:text-sky-300 font-semibold">
                                      {t(
                                        "jobs.confirmedWaitingWorker",
                                        "You have confirmed. Waiting for worker confirmation...",
                                      )}
                                    </p>
                                  </div>
                                )}
                              {isWorkerOnJob &&
                                contractData.doerConfirmed &&
                                !contractData.clientConfirmed && (
                                  <div className="bg-sky-50 dark:bg-sky-900/20 border-2 border-sky-300 dark:border-sky-700 rounded-lg p-4 text-center">
                                    <p className="text-sky-700 dark:text-sky-300 font-semibold">
                                      {t(
                                        "jobs.confirmedWaitingClient",
                                        "You have confirmed. Waiting for client confirmation...",
                                      )}
                                    </p>
                                  </div>
                                )}
                            </div>
                          )}

                        {/* Summary message */}
                        {contractData.clientConfirmed &&
                        contractData.doerConfirmed ? (
                          <div className="mt-4 text-sm text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30 border-2 border-green-500 rounded-lg p-3 text-center font-bold">
                            {t(
                              "jobs.bothConfirmedPaymentsReleased",
                              "Both parties confirmed - Contract completed - Payments will be released",
                            )}
                          </div>
                        ) : (
                          contractData.status === "awaiting_confirmation" && (
                            <div className="mt-4 text-sm text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 border-2 border-amber-500 rounded-lg p-3 text-center font-semibold">
                              {t(
                                "jobs.awaitingConfirmationFrom",
                                "Awaiting confirmation from {{party}}",
                                {
                                  party:
                                    !contractData.clientConfirmed &&
                                    !contractData.doerConfirmed
                                      ? t("jobs.bothParties", "both parties")
                                      : !contractData.clientConfirmed
                                        ? t("common.client", "client")
                                        : t("common.worker", "worker"),
                                },
                              )}
                            </div>
                          )
                        )}

                        {/* Botones de acción: Chat y Reportar Problema */}
                        <div className="mt-4 flex flex-wrap gap-2.5">
                          <button
                            onClick={handleOpenChat}
                            disabled={loadingChat}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-500/25 hover:from-sky-400 hover:to-blue-500 hover:shadow-sky-500/35 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <MessageCircle className="h-4 w-4" />
                            {loadingChat
                              ? t("common.loading", "Loading...")
                              : t("common.chat", "Chat")}
                          </button>
                          {[
                            "in_progress",
                            "completed",
                            "awaiting_confirmation",
                          ].includes(contractData.status || "") && (
                            <button
                              onClick={() =>
                                navigate(
                                  `/disputes/new?contractId=${contractData.id}`,
                                )
                              }
                              className="inline-flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800/60 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700 transition-all duration-200 active:scale-95"
                            >
                              <Flag className="h-4 w-4" />
                              {t("jobs.reportProblem", "Report Problem")}
                            </button>
                          )}
                          <Link
                            to={`/contracts/${contractData.id}`}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all duration-200 active:scale-95"
                          >
                            <ExternalLink className="h-4 w-4" />
                            {t("jobs.viewContract", "View Contract")}
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white dark:bg-slate-800 rounded-lg p-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                          {t("jobs.detail.noActiveContract")}
                        </p>
                      </div>
                    )}

                    {/* Trabajadores del Proyecto - Solo si hay múltiples contratos */}
                    {allContractsData &&
                      allContractsData.totalContracts > 1 && (
                        <div className="bg-white dark:bg-slate-800 rounded-lg p-4 mt-4">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <Users className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                            {t("jobs.projectWorkers", "Project Workers")} (
                            {allContractsData.totalContracts})
                          </h3>
                          <div className="space-y-3">
                            {allContractsData.contracts.map((c) => (
                              <div
                                key={c.id}
                                className={`p-4 rounded-lg border-2 ${
                                  c.clientConfirmed && c.doerConfirmed
                                    ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700"
                                    : c.status === "cancelled"
                                      ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700"
                                      : "bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    {c.doerAvatar ? (
                                      <img
                                        src={getImageUrl(c.doerAvatar)}
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
                                        {c.doerName ||
                                          t("common.worker", "Worker")}
                                      </p>
                                      <span
                                        className={`text-xs px-2 py-0.5 rounded-full ${
                                          c.status === "completed"
                                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                            : c.status === "in_progress"
                                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                              : c.status ===
                                                  "awaiting_confirmation"
                                                ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                                : c.status === "cancelled"
                                                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                                  : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                                        }`}
                                      >
                                        {c.status === "completed"
                                          ? t("status.completed", "Completed")
                                          : c.status === "in_progress"
                                            ? t(
                                                "status.inProgress",
                                                "In progress",
                                              )
                                            : c.status ===
                                                "awaiting_confirmation"
                                              ? t(
                                                  "status.awaitingConfirmation",
                                                  "Awaiting confirmation",
                                                )
                                              : c.status === "cancelled"
                                                ? t(
                                                    "status.cancelled",
                                                    "Cancelled",
                                                  )
                                                : c.status === "accepted"
                                                  ? t(
                                                      "status.accepted",
                                                      "Accepted",
                                                    )
                                                  : c.status}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <div className="text-right">
                                      <div className="flex items-center gap-1 text-sm">
                                        {c.doerConfirmed ? (
                                          <CheckCircle className="h-4 w-4 text-green-600" />
                                        ) : (
                                          <Clock className="h-4 w-4 text-yellow-500" />
                                        )}
                                        <span className="text-gray-600 dark:text-gray-400">
                                          {t("common.worker", "Worker")}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-1 text-sm mt-1">
                                        {c.clientConfirmed ? (
                                          <CheckCircle className="h-4 w-4 text-green-600" />
                                        ) : (
                                          <Clock className="h-4 w-4 text-yellow-500" />
                                        )}
                                        <span className="text-gray-600 dark:text-gray-400">
                                          {t("common.client", "Client")}{" "}
                                          {isOwnJob
                                            ? t("common.you", "(you)")
                                            : ""}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          {/* Resumen */}
                          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-600 dark:text-gray-400">
                                {t(
                                  "jobs.workerConfirmations",
                                  "Worker confirmations",
                                )}
                                :
                              </span>
                              <span className="font-medium text-gray-900 dark:text-white">
                                {
                                  allContractsData.contracts.filter(
                                    (c) => c.doerConfirmed,
                                  ).length
                                }{" "}
                                / {allContractsData.totalContracts}
                              </span>
                            </div>
                            <div className="flex justify-between text-sm mt-1">
                              <span className="text-gray-600 dark:text-gray-400">
                                {isOwnJob
                                  ? t(
                                      "jobs.yourConfirmations",
                                      "Your confirmations (client)",
                                    )
                                  : t(
                                      "jobs.clientConfirmations",
                                      "Client confirmations",
                                    )}
                                :
                              </span>
                              <span className="font-medium text-gray-900 dark:text-white">
                                {
                                  allContractsData.contracts.filter(
                                    (c) => c.clientConfirmed,
                                  ).length
                                }{" "}
                                / {allContractsData.totalContracts}
                              </span>
                            </div>
                            {allContractsData.allCompleted && (
                              <div className="mt-3 bg-green-100 dark:bg-green-900/30 rounded-lg p-3 text-center">
                                <p className="text-green-700 dark:text-green-300 font-medium">
                                  {t(
                                    "jobs.allContractsCompleted",
                                    "All contracts have been completed",
                                  )}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>

            {/* Admin: publication payment + proof details */}
            {isAdmin && adminPayment && (
              <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-900/20 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  <h2 className="text-lg font-bold text-indigo-900 dark:text-indigo-200">
                    {t("jobs.detail.adminPaymentTitle", "Detalles de pago (admin)")}
                  </h2>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Estado del pago</p>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {adminPayment.publicationPaid ? 'Pagado' : (adminPayment.payment?.status || 'Esperando pago')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('jobs.adminPayment.amount', 'Monto')}</p>
                    <p className="font-medium text-slate-900 dark:text-white">
                      ${Number(adminPayment.payment?.amount || adminPayment.price || 0).toLocaleString('es-AR')} ARS
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('jobs.adminPayment.commission', 'Comisión')}</p>
                    <p className="font-medium text-slate-900 dark:text-white">
                      ${Number(adminPayment.payment?.platformFee || 0).toLocaleString('es-AR')} ({Number(adminPayment.payment?.platformFeePercentage || 0).toFixed(1)}%)
                    </p>
                  </div>
                  {adminPayment.payment?.paymentMethod && (
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t('jobs.adminPayment.method', 'Método')}</p>
                      <p className="font-medium text-slate-900 dark:text-white">{adminPayment.payment.paymentMethod}</p>
                    </div>
                  )}
                  {adminPayment.client?.name && (
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t('jobs.adminPayment.payer', 'Pagador')}</p>
                      <p className="font-medium text-slate-900 dark:text-white">{adminPayment.client.name}</p>
                    </div>
                  )}
                </div>

                {/* Proof */}
                {adminPayment.proof ? (
                  <div className="mt-4">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{t('jobs.adminPayment.proofLabel', 'Comprobante de pago')}</p>
                    {((adminPayment.proof.fileType === 'pdf') || (adminPayment.proof.fileUrl || '').toLowerCase().endsWith('.pdf')) ? (
                      <a href={getImageUrl(adminPayment.proof.fileUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sky-600 dark:text-sky-400 hover:underline">
                        <FileText className="h-4 w-4" /> {t('jobs.adminPayment.openPdfProof', 'Abrir PDF del comprobante')}
                      </a>
                    ) : (
                      <a href={getImageUrl(adminPayment.proof.fileUrl)} target="_blank" rel="noopener noreferrer" className="block">
                        <img src={getImageUrl(adminPayment.proof.fileUrl)} alt={t('jobs.adminPayment.proofAlt', 'Comprobante')} className="max-h-64 rounded-lg border border-slate-200 dark:border-slate-700 object-contain bg-white dark:bg-slate-900" />
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-slate-500 dark:text-slate-400 italic">{t('jobs.adminPayment.noProof', 'Sin comprobante adjunto.')}</p>
                )}

                {/* Navigation */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {adminPayment.payment?.id && (
                    <Link to={`/admin/financial-transactions?search=${adminPayment.payment.id}`} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors">
                      <ExternalLink className="h-4 w-4" /> {t('jobs.adminPayment.viewTransaction', 'Ver transacción')}
                    </Link>
                  )}
                  <Link to={`/admin/jobs?search=${adminPayment.jobId}`} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors">
                    <Briefcase className="h-4 w-4" /> {t('jobs.adminPayment.viewInJobManagement', 'Ver en gestión de publicaciones')}
                  </Link>
                  {adminPayment.payment?.id && (adminPayment.payment?.status === 'pending_verification' || !adminPayment.publicationPaid) && (
                    <Link to={`/admin/pending-payments?search=${adminPayment.payment.id}`} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors">
                      <Clock className="h-4 w-4" /> {t('jobs.adminPayment.viewInPendingPayments', 'Ver en pagos pendientes')}
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Description */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">
                {t("jobs.description", "Job Description")}
              </h2>
              <p className="whitespace-pre-line leading-relaxed text-slate-600 dark:text-slate-300">
                {job.description}
              </p>
            </div>

            {/* Job photos */}
            {Array.isArray((job as any).images) && (job as any).images.length > 0 && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
                <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">
                  {t("jobs.photos", "Fotos del trabajo")}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {(job as any).images.map((img: string, i: number) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => openImage(getImageUrl(img), `${job.title} — foto ${i + 1}`)}
                      className="block aspect-square overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 cursor-zoom-in"
                    >
                      <img
                        src={getImageUrl(img)}
                        alt={`${job.title} — foto ${i + 1}`}
                        className="h-full w-full object-cover transition-opacity hover:opacity-90"
                        onError={(e) => { (e.currentTarget.style.display = 'none'); }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Job Tasks - visible to owner and workers */}
            {(isOwnJob || isWorkerOnJob) &&
              job.status !== "cancelled" &&
              job.status !== "draft" && (
                <JobTasks
                  jobId={job.id || job._id}
                  isOwner={!!isOwnJob}
                  isWorker={!!isWorkerOnJob}
                  jobStatus={job.status}
                  clientConfirmed={
                    contractData?.clientConfirmed ||
                    (allContractsData?.allClientConfirmed ?? false)
                  }
                />
              )}

            {/* Location Map */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <LocationCircleMap location={job.location} latitude={(job as any).latitude} longitude={(job as any).longitude} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Client Info */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">
                {t("jobs.detail.publishedBy")}
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
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${clientInfo?.name || "user"}`
                      }
                      alt={clientInfo?.name || t("common.user", "User")}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {clientInfo?.name || t("common.user", "User")}
                    </p>
                    <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                      <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                      <span>
                        {(clientInfo?.rating || 0).toFixed(1)} (
                        {clientInfo?.reviewsCount || 0} reviews)
                      </span>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-400 transition-transform ${showClientMenu ? "rotate-180" : ""}`}
                  />
                </button>

                {/* Dropdown Menu */}
                <ClientDropdownMenu
                  open={showClientMenu}
                  clientId={clientInfo?.id || clientInfo?._id}
                  onClose={() => setShowClientMenu(false)}
                />
              </div>
              <div className="my-4 h-px bg-slate-200 dark:bg-slate-700"></div>

              {/* Multiple Ratings Display */}
              {job.client && typeof job.client !== "string" && (
                <div className="mb-4">
                  <MultipleRatings user={job.client as any} />
                </div>
              )}

              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  <span>{t("profile.memberSince", "Member since 2023")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  <span>
                    {clientInfo?.completedJobs || 0}{" "}
                    {t("jobs.completedJobs", "completed jobs")}
                  </span>
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
                      {t("chat.opening", "Opening chat...")}
                    </>
                  ) : (
                    <>
                      <MessageSquare className="inline h-4 w-4 mr-2" />
                      {t("chat.sendMessage", "Send message")}
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Admin Details Panel */}
            {user?.adminRole && <AdminJobDetailsPanel job={job} clientInfo={clientInfo} />}

            {/* Worker(s) Info - Public view of who is doing/did the work */}
            {((job.doer && typeof job.doer === "object") ||
              (job.selectedWorkersData &&
                job.selectedWorkersData.length > 0)) && (
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-sky-500" />
                  {job.status === "completed"
                    ? t("jobs.doneBy", "Done by")
                    : t("jobs.workingOnProject", "Working on this project")}
                </h2>

                {/* Single worker (doer) */}
                {job.doer &&
                  typeof job.doer === "object" &&
                  !job.selectedWorkersData?.length && (
                    <Link
                      to={`/profile/${job.doer.id || job.doer._id}`}
                      className="flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl p-2 -m-2 transition-colors"
                    >
                      <div className="h-12 w-12 overflow-hidden rounded-full bg-sky-100">
                        <img
                          src={
                            job.doer.avatar ||
                            `https://api.dicebear.com/7.x/avataaars/svg?seed=${job.doer.name || "worker"}`
                          }
                          alt={job.doer.name || t("common.worker", "Worker")}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {job.doer.name || t("common.worker", "Worker")}
                        </p>
                        <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">
                          <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                          <span>
                            {(job.doer.rating || 0).toFixed(1)} (
                            {job.doer.reviewsCount || 0} reviews)
                          </span>
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 text-slate-400" />
                    </Link>
                  )}

                {/* Multiple workers (team job) */}
                {job.selectedWorkersData &&
                  job.selectedWorkersData.length > 0 && (
                    <div className="space-y-3">
                      {job.selectedWorkersData.map((worker: any) => (
                        <Link
                          key={worker.id}
                          to={`/profile/${worker.id}`}
                          className="flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl p-2 -m-2 transition-colors"
                        >
                          <div className="h-10 w-10 overflow-hidden rounded-full bg-sky-100">
                            <img
                              src={
                                worker.avatar ||
                                `https://api.dicebear.com/7.x/avataaars/svg?seed=${worker.name || "worker"}`
                              }
                              alt={worker.name || t("common.worker", "Worker")}
                              className="h-full w-full object-cover"
                            />
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-slate-900 dark:text-white text-sm">
                              {worker.name || t("common.worker", "Worker")}
                            </p>
                            <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                              <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                              <span>{(worker.rating || 0).toFixed(1)}</span>
                            </div>
                          </div>
                          <ExternalLink className="h-4 w-4 text-slate-400" />
                        </Link>
                      ))}
                    </div>
                  )}

                {/* Matrícula del worker — visible solo para el dueño del job */}
                {isOwnJob && job.doer && typeof job.doer === 'object' && job.doer.profession && (() => {
                  const REGULATED = ['gasista','electricista','plomero','maestro_mayor_obras','instalador_aire'];
                  const isReg = REGULATED.includes(job.doer.profession);
                  return (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">{t('jobs.professionalData', 'Datos profesionales')}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-700 dark:text-slate-300">
                        <span><span className="font-medium">{t('jobs.profession', 'Profesión')}:</span> {job.doer.profession.replace(/_/g,' ')}</span>
                        {isReg && job.doer.licenseNumber && (
                          <span><span className="font-medium">{t('jobs.license', 'Matrícula')}:</span> {job.doer.licenseNumber}</span>
                        )}
                        {isReg && job.doer.licenseCategory && (
                          <span><span className="font-medium">{t('jobs.category', 'Categoría')}:</span> {job.doer.licenseCategory}</span>
                        )}
                        {isReg && job.doer.licenseCertNumber && (
                          <span><span className="font-medium">{t('jobs.certNumber', 'Cert. N°')}:</span> {job.doer.licenseCertNumber}</span>
                        )}
                        {isReg && job.doer.licenseDocumentUrl && (
                          <a href={job.doer.licenseDocumentUrl} target="_blank" rel="noreferrer"
                            className="text-sky-600 dark:text-sky-400 hover:underline font-medium">
                            {t('jobs.viewDocument', 'Ver documento')}
                          </a>
                        )}
                        {job.doer.licenseVerified && (
                          <span className="text-green-600 dark:text-green-400 font-semibold">✓ {t('jobs.verified', 'Verificado')}</span>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Job status indicator */}
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <div
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                      job.status === "completed"
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                        : job.status === "in_progress"
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                          : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
                    }`}
                  >
                    {job.status === "completed" ? (
                      <>
                        <CheckCircle className="h-4 w-4" />
                        {t("jobs.jobCompleted", "Job completed")}
                      </>
                    ) : job.status === "in_progress" ? (
                      <>
                        <Clock className="h-4 w-4" />
                        {t("status.inProgress", "In progress")}
                      </>
                    ) : (
                      <>
                        <Clock className="h-4 w-4" />
                        {t("jobs.workerAssigned", "Worker assigned")}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons - Only show if positions still available */}
            {!isOwnJob &&
              job.status === "open" &&
              job.doerId !== userId &&
              // For team jobs: show if there are still positions available and user is not already selected
              // For single worker jobs: show if no worker assigned yet
              (job.maxWorkers && job.maxWorkers > 1
                ? (job.selectedWorkers?.length || 0) < job.maxWorkers &&
                  !job.selectedWorkers?.includes(userId || "")
                : !job.doerId) && (
                <div className="space-y-3">
                  {hasApplied ? (
                    <div className="space-y-2">
                      <div className="w-full rounded-xl bg-gradient-to-r from-green-500 to-green-600 px-6 py-3 text-center shadow-lg shadow-green-500/30">
                        <div className="flex items-center justify-center gap-2 text-lg font-semibold text-white">
                          <CheckCircle className="h-5 w-5" />
                          <span>
                            {t(
                              "jobs.alreadyApplied",
                              "You already applied to this job!",
                            )}
                          </span>
                        </div>
                        <p className="text-sm text-green-100 mt-1">
                          {t(
                            "jobs.clientWillReview",
                            "The client will review your proposal soon",
                          )}
                        </p>
                      </div>
                      {(user?.role === 'doer' || user?.role === 'both') && (
                        <button
                          onClick={() => {
                            const clientId = typeof job.client === 'object' ? (job.client?._id || job.client?.id) : job.postedBy;
                            navigate(`/quotes/new?recipientId=${clientId}&jobId=${job._id || job.id}`);
                          }}
                          className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 px-6 py-3 text-base font-semibold text-white transition-all"
                        >
                          <ClipboardList className="h-5 w-5" />
                          {t("jobs.sendQuote", "Enviar cotización")}
                        </button>
                      )}
                      {myProposalId && myProposalStatus === 'pending' && (
                        <button
                          onClick={() => setConfirmWithdrawOpen(true)}
                          disabled={withdrawing}
                          className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 px-6 py-3 text-base font-semibold transition-all disabled:opacity-50"
                        >
                          <XCircle className="h-5 w-5" />
                          {withdrawing
                            ? t("jobs.withdrawing", "Cancelando...")
                            : t("jobs.withdrawApplication", "Cancelar postulación")}
                        </button>
                      )}
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
                          {checkingApplication
                            ? t("common.verifying", "Verifying...")
                            : t("jobs.applying", "Applying...")}
                        </>
                      ) : user ? (
                        t("jobs.applyToJob", "Apply to job")
                      ) : (
                        t("jobs.loginToApply", "Log in to apply")
                      )}
                    </button>
                  )}
                  {(job as any).allowCounterOffers === false && (
                    <p className="mt-2 text-xs text-center text-amber-600 dark:text-amber-400">
                      {t('jobs.noCounterOffersWarning', '⚠️ Este trabajo no acepta contraofertas: te postulás al precio publicado.')}
                    </p>
                  )}
                  {error && (
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  )}
                </div>
              )}

            {!isOwnJob && job.status === "pending_approval" && (
              <div className="rounded-2xl border border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/30 p-4">
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                  {t(
                    "jobs.pendingApprovalMessage",
                    "This job is pending approval",
                  )}
                </p>
              </div>
            )}

            {isOwnJob && job.status === "pending_approval" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/30 p-4">
                  <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300 mb-2">
                    {t(
                      "jobs.pendingAdminApproval",
                      "Your job is pending admin approval",
                    )}
                  </p>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    {t(
                      "jobs.canCancelForRefund",
                      "You can cancel now and get a refund of the price (without commission).",
                    )}
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
                      {t(
                        "jobs.actions.cancelAndRefund",
                        "Cancel and get refund",
                      )}
                    </>
                  )}
                </button>

                {error && (
                  <div className="rounded-2xl border border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30 p-4">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">
                      {error}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Trabajador asignado - verificar si ya inició, terminó o no */}
            {!isOwnJob &&
              job.status === "open" &&
              (job.doerId ||
                (job.selectedWorkers && job.selectedWorkers.length > 0)) && (
                <div className="space-y-4">
                  {/* Check if current user is the selected worker */}
                  {job.doerId === userId ||
                  contractData?.doerId === userId ||
                  (userId && job.selectedWorkers?.includes(userId)) ? (
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
                              {t(
                                "jobs.congratsJobFinished",
                                "Congratulations! Job finished",
                              )}
                            </p>
                            <p className="text-sm text-emerald-600 dark:text-emerald-400">
                              {t("jobs.jobFinishedOn", "El trabajo finalizó el")}{" "}
                              {new Date(job.endDate).toLocaleDateString(
                                "es-AR",
                                {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                },
                              )}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                          {t(
                            "jobs.confirmNowRequested",
                            "Ahora solo resta confirmar que el trabajo fue finalizado correctamente para proceder con los pagos.",
                          )}
                        </p>

                        {/* Confirmation status - Team jobs show all workers */}
                        {allContractsData &&
                        allContractsData.totalContracts > 1 ? (
                          <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 mb-4">
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                              {t("jobs.confirmationStatusTitle", "Estado de confirmaciones")} (
                              {
                                allContractsData.contracts.filter(
                                  (c) => c.doerConfirmed,
                                ).length
                              }
                              /{allContractsData.totalContracts} {t("jobs.workers", "trabajadores")}):
                            </p>
                            <div className="space-y-2">
                              {allContractsData.contracts.map((c) => (
                                <div
                                  key={c.id}
                                  className="flex items-center justify-between text-sm"
                                >
                                  <span
                                    className={`flex items-center gap-1 ${c.doerConfirmed ? "text-green-600" : "text-slate-400"}`}
                                  >
                                    {c.doerConfirmed ? (
                                      <CheckCircle className="h-4 w-4" />
                                    ) : (
                                      <Clock className="h-4 w-4" />
                                    )}
                                    {c.doerName}
                                  </span>
                                  <Link
                                    to={`/contracts/${c.id}`}
                                    className="text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-medium"
                                  >
                                    {t("jobs.viewDetails", "Ver →")}
                                  </Link>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          contractData && (
                            <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 mb-4">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                  {t(
                                    "jobs.confirmationStatus",
                                    "Confirmation status",
                                  )}
                                  :
                                </p>
                                <Link
                                  to={`/contracts/${contractData.id}`}
                                  className="text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-medium"
                                >
                                  {t("jobs.viewContract", "Ver contrato →")}
                                </Link>
                              </div>
                              <div className="flex items-center gap-4 text-sm">
                                <span
                                  className={`flex items-center gap-1 ${contractData.doerConfirmed ? "text-green-600" : "text-slate-400"}`}
                                >
                                  {contractData.doerConfirmed ? (
                                    <CheckCircle className="h-4 w-4" />
                                  ) : (
                                    <Clock className="h-4 w-4" />
                                  )}
                                  {t("jobs.yourConfirmation", "Tu confirmación")}
                                </span>
                                <span
                                  className={`flex items-center gap-1 ${contractData.clientConfirmed ? "text-green-600" : "text-slate-400"}`}
                                >
                                  {contractData.clientConfirmed ? (
                                    <CheckCircle className="h-4 w-4" />
                                  ) : (
                                    <Clock className="h-4 w-4" />
                                  )}
                                  {t("jobs.clientConfirmation", "Confirmación del cliente")}
                                </span>
                              </div>
                            </div>
                          )
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
                                  {t("jobs.confirming", "Confirmando...")}
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4" />
                                  {t("jobs.confirmMyWork", "Confirmar mi trabajo")}
                                </>
                              )}
                            </button>
                          )}
                          {contractData?.doerConfirmed &&
                            !(
                              allContractsData?.allCompleted ??
                              contractData?.clientConfirmed
                            ) && (
                              <div className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-xl text-sm">
                                {allContractsData &&
                                allContractsData.totalContracts > 1
                                  ? `${t("jobs.waitingConfirmations", "Esperando confirmaciones")} (${allContractsData.contracts.filter((c) => c.doerConfirmed && c.clientConfirmed).length}/${allContractsData.totalContracts} ${t("common.completed", "completos")})...`
                                  : t(
                                      "jobs.waitingClientConfirmation",
                                      "Waiting for client confirmation...",
                                    )}
                              </div>
                            )}
                          {(allContractsData?.allCompleted ??
                            (contractData?.doerConfirmed &&
                              contractData?.clientConfirmed)) && (
                            <div className="px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl text-sm font-medium">
                              ✅ {t(
                                "jobs.allConfirmedPaymentsWillBeReleased",
                                "Todos confirmaron - Los pagos serán liberados a los trabajadores",
                              )}
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
                            🔧 {t("jobs.jobInProgress", "Trabajo en marcha")}
                          </p>
                        </div>
                        {job.endDate && (
                          <>
                            <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                              {t("jobs.jobWillEndOn", "El trabajo terminará el")}{" "}
                              {new Date(job.endDate).toLocaleDateString(
                                "es-AR",
                                {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                            </p>
                            <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                              <div className="flex items-start gap-2">
                                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                <p className="text-sm text-amber-700 dark:text-amber-300">
                                  {t(
                                    "jobs.confirmButtonWillEnable",
                                    "The confirm completion button will be enabled when the job end time arrives for both parties.",
                                  )}
                                </p>
                              </div>
                            </div>
                          </>
                        )}
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                          <Link
                            to="/my-jobs?tab=applied&view=calendar"
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300 text-sm font-medium rounded-lg hover:bg-green-200 dark:hover:bg-green-700/50 transition-colors"
                          >
                            <Calendar className="h-4 w-4" />
                            {t("jobs.viewInCalendar", "Ver en Calendario")}
                          </Link>
                        </div>
                      </div>
                    ) : (
                      // Job hasn't started yet - show "selected" message
                      <div className="rounded-2xl border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                            {t(
                              "jobs.youWereSelected",
                              "You were selected for this job!",
                            )}
                          </p>
                        </div>
                        <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                          {t("jobs.jobWillStartOn", "El trabajo iniciará el")}{" "}
                          {new Date(job.startDate).toLocaleDateString("es-AR", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                          <Link
                            to="/my-jobs?tab=applied&view=calendar"
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-100 dark:bg-blue-800/50 text-blue-700 dark:text-blue-300 text-sm font-medium rounded-lg hover:bg-blue-200 dark:hover:bg-blue-700/50 transition-colors"
                          >
                            <Calendar className="h-4 w-4" />
                            {t("jobs.viewInCalendar", "Ver en Calendario")}
                          </Link>
                        </div>
                      </div>
                    )
                  ) : (job.selectedWorkers?.length || 0) >=
                    (job.maxWorkers || 1) ? (
                    // Solo mostrar "ya tiene profesional" si TODOS los puestos están ocupados
                    <div className="rounded-2xl border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 p-4">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        {job.maxWorkers === 1
                          ? t(
                              "jobs.hasAssignedProfessional",
                              "This job already has an assigned professional",
                            )
                          : t(
                              "jobs.hasAllProfessionals",
                              "This job already has all {{count}} professionals assigned",
                              { count: job.maxWorkers },
                            )}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                        {t('jobs.willStartOnShort', 'Iniciará el')}{" "}
                        {new Date(job.startDate).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "long",
                        })}
                      </p>
                    </div>
                  ) : null}
                </div>
              )}

            {!isOwnJob &&
              job.status === "in_progress" &&
              (job.doerId ||
                (job.selectedWorkers && job.selectedWorkers.length > 0)) && (
                <div className="space-y-4">
                  {/* Check if current user is one of the selected workers */}
                  {contractData?.doerId === userId ||
                  job.doerId === userId ||
                  (userId && job.selectedWorkers?.includes(userId)) ? (
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
                                {t(
                                  "jobs.congratsJobFinished",
                                  "Congratulations! Job finished",
                                )}
                              </p>
                              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                                {t("jobs.jobFinishedOn", "El trabajo finalizó el")}{" "}
                                {new Date(job.endDate).toLocaleDateString(
                                  "es-AR",
                                  {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                  },
                                )}
                              </p>
                            </div>
                          </div>
                          <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                            {t(
                              "jobs.confirmToRelease",
                              "Now just confirm that the job was completed correctly to proceed with payments.",
                            )}
                          </p>

                          {/* Confirmation status - Team jobs show all workers */}
                          {allContractsData &&
                          allContractsData.totalContracts > 1 ? (
                            <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 mb-4">
                              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                                Estado de confirmaciones (
                                {
                                  allContractsData.contracts.filter(
                                    (c) => c.doerConfirmed,
                                  ).length
                                }
                                /{allContractsData.totalContracts}{" "}
                                trabajadores):
                              </p>
                              <div className="space-y-2">
                                {allContractsData.contracts.map((c) => (
                                  <div
                                    key={c.id}
                                    className="flex items-center justify-between text-sm"
                                  >
                                    <span
                                      className={`flex items-center gap-1 ${c.doerConfirmed ? "text-green-600" : "text-slate-400"}`}
                                    >
                                      {c.doerConfirmed ? (
                                        <CheckCircle className="h-4 w-4" />
                                      ) : (
                                        <Clock className="h-4 w-4" />
                                      )}
                                      {c.doerName}
                                    </span>
                                    <Link
                                      to={`/contracts/${c.id}`}
                                      className="text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-medium"
                                    >
                                      Ver →
                                    </Link>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            contractData && (
                              <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 mb-4">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                    {t(
                                      "jobs.confirmationStatus",
                                      "Confirmation status",
                                    )}
                                    :
                                  </p>
                                  <Link
                                    to={`/contracts/${contractData.id}`}
                                    className="text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-medium"
                                  >
                                    {t("jobs.viewContract", "Ver contrato →")}
                                  </Link>
                                </div>
                                <div className="flex items-center gap-4 text-sm">
                                  <span
                                    className={`flex items-center gap-1 ${contractData.doerConfirmed ? "text-green-600" : "text-slate-400"}`}
                                  >
                                    {contractData.doerConfirmed ? (
                                      <CheckCircle className="h-4 w-4" />
                                    ) : (
                                      <Clock className="h-4 w-4" />
                                    )}
                                    {t(
                                      "jobs.yourConfirmation",
                                      "Your confirmation",
                                    )}
                                  </span>
                                  <span
                                    className={`flex items-center gap-1 ${contractData.clientConfirmed ? "text-green-600" : "text-slate-400"}`}
                                  >
                                    {contractData.clientConfirmed ? (
                                      <CheckCircle className="h-4 w-4" />
                                    ) : (
                                      <Clock className="h-4 w-4" />
                                    )}
                                    {t(
                                      "jobs.clientConfirmation",
                                      "Client confirmation",
                                    )}
                                  </span>
                                </div>
                              </div>
                            )
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
                                    {t("jobs.confirmMyWork", "Confirm my work")}
                                  </>
                                )}
                              </button>
                            )}
                            {contractData?.doerConfirmed &&
                              !(
                                allContractsData?.allCompleted ??
                                contractData?.clientConfirmed
                              ) && (
                                <div className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-xl text-sm">
                                  {allContractsData &&
                                  allContractsData.totalContracts > 1
                                    ? `Esperando confirmaciones (${allContractsData.contracts.filter((c) => c.doerConfirmed && c.clientConfirmed).length}/${allContractsData.totalContracts} completos)...`
                                    : t(
                                        "jobs.waitingClientConfirmation",
                                        "Waiting for client confirmation...",
                                      )}
                                </div>
                              )}
                            {(allContractsData?.allCompleted ??
                              (contractData?.doerConfirmed &&
                                contractData?.clientConfirmed)) && (
                              <div className="px-4 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-xl text-sm font-medium">
                                {t(
                                  "jobs.allConfirmedPaymentsReleased",
                                  "All confirmed - Payments will be released to workers",
                                )}
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
                              {t("jobs.workInProgress", "Work in progress")}
                            </p>
                          </div>
                          {job.endDate && (
                            <>
                              <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                                {t("jobs.jobWillEndOn", "El trabajo terminará el")}{" "}
                                {new Date(job.endDate).toLocaleDateString(
                                  "es-AR",
                                  {
                                    day: "numeric",
                                    month: "long",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </p>
                              <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                                <div className="flex items-start gap-2">
                                  <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                                  <p className="text-sm text-amber-700 dark:text-amber-300">
                                    {t(
                                      "jobs.confirmButtonWillEnable",
                                      "The confirm completion button will be enabled when the job end time arrives for both parties.",
                                    )}
                                  </p>
                                </div>
                              </div>
                            </>
                          )}
                          <div className="flex flex-wrap items-center gap-3 mt-3">
                            <Link
                              to="/my-jobs?tab=applied&view=calendar"
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300 text-sm font-medium rounded-lg hover:bg-green-200 dark:hover:bg-green-700/50 transition-colors"
                            >
                              <Calendar className="h-4 w-4" />
                              {t("jobs.viewInCalendar", "View in Calendar")}
                            </Link>
                          </div>
                        </div>
                      )}

                      {/* Pairing Code Display for Worker - only show if job not finished */}
                      {contractData?.pairingCode &&
                        !(
                          job.endDate && new Date(job.endDate) <= new Date()
                        ) && (
                          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-2xl p-5 border-2 border-purple-200 dark:border-purple-700 shadow-md">
                            <div className="flex items-start gap-4">
                              <div className="p-3 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                                <Key className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                              </div>
                              <div className="flex-1">
                                <h4 className="font-bold text-purple-900 dark:text-purple-100 text-lg mb-1">
                                  {t("jobs.pairingCode", "Pairing Code")}
                                </h4>
                                <p className="text-sm text-purple-700 dark:text-purple-300 mb-3">
                                  {t(
                                    "jobs.showCodeToClient",
                                    "Show this code to the client when you arrive at the work location",
                                  )}
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
                                    title={t("common.copyCode", "Copy code")}
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
                                    {t("common.codeCopied", "Code copied!")}
                                  </p>
                                )}
                                {contractData?.pairingExpiry && (
                                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
                                    {t("common.expires", "Expires")}:{" "}
                                    {new Date(
                                      contractData?.pairingExpiry,
                                    ).toLocaleString("es-AR")}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                    </>
                  ) : (job.selectedWorkers?.length || 0) >=
                    (job.maxWorkers || 1) ? (
                    // Solo mostrar mensaje si todos los puestos están ocupados
                    <div className="rounded-2xl border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 p-4">
                      <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        🔧 Este trabajo ya tiene{" "}
                        {job.maxWorkers === 1
                          ? "un profesional asignado"
                          : `los ${job.maxWorkers} profesionales asignados`}
                      </p>
                    </div>
                  ) : null}
                </div>
              )}

            {!isOwnJob &&
              (job.status === "completed" ||
                job.status === "cancelled" ||
                job.status === "paused" ||
                job.status === "suspended") && (
                <div
                  className={`rounded-2xl border p-4 ${
                    job.status === "cancelled"
                      ? "border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30"
                      : job.status === "paused"
                        ? job.pendingNewPrice
                          ? "border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30"
                          : "border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30"
                        : job.status === "suspended"
                          ? "border-orange-300 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/30"
                          : "border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/30"
                  }`}
                >
                  <p
                    className={`text-sm font-medium ${
                      job.status === "cancelled"
                        ? "text-red-700 dark:text-red-300"
                        : job.status === "paused"
                          ? job.pendingNewPrice
                            ? "text-blue-700 dark:text-blue-300"
                            : "text-amber-700 dark:text-amber-300"
                          : job.status === "suspended"
                            ? "text-orange-700 dark:text-orange-300"
                            : "text-green-700 dark:text-green-300"
                    }`}
                  >
                    {job.status === "cancelled" &&
                      t("jobs.listingCancelled", "This listing was cancelled")}
                    {job.status === "completed" && (
                      <>
                        {t("jobs.jobWasCompleted", "This job was completed")}
                        {job.category && (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300">
                            {getCategoryById(job.category)?.icon}{" "}
                            {getCategoryById(job.category)?.label ||
                              job.category}
                          </span>
                        )}
                      </>
                    )}
                    {job.status === "paused" &&
                      (job.pendingNewPrice
                        ? t(
                            "jobs.updatingBudget",
                            "This job is updating its budget",
                          )
                        : t("jobs.jobPaused", "This job is paused"))}
                    {job.status === "suspended" &&
                      t(
                        "jobs.jobSuspendedNoEndDate",
                        "This job is suspended due to missing end date",
                      )}
                  </p>
                  {job.status === "cancelled" && job.cancellationReason && (
                    <div className="mt-3 p-3 bg-red-100 dark:bg-red-950/50 rounded-lg border border-red-200 dark:border-red-800">
                      <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">
                        {t("jobs.cancellationReason", "Cancellation reason")}:
                      </p>
                      <p className="text-sm text-red-700 dark:text-red-200">
                        {job.cancellationReason}
                      </p>
                    </div>
                  )}
                  {job.status === "cancelled" && job.cancelledAt && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                      Cancelado el{" "}
                      {new Date(job.cancelledAt).toLocaleDateString("es-AR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  )}
                  {/* Share to Portfolio button for workers on completed jobs */}
                  {job.status === "completed" && isWorkerOnJob && (
                    <button
                      onClick={() =>
                        navigate(
                          `/portfolio/create?fromJob=${job.id || job._id}`,
                        )
                      }
                      className="mt-4 inline-flex items-center gap-2 rounded-xl border border-sky-200 dark:border-sky-800/60 bg-sky-50 dark:bg-sky-900/20 px-4 py-2.5 text-sm font-semibold text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40 hover:border-sky-300 dark:hover:border-sky-700 transition-all duration-200 active:scale-95 shadow-sm"
                    >
                      <Share2 className="h-4 w-4" />
                      {t("jobs.shareToPortfolio", "Share to Portfolio")}
                    </button>
                  )}
                </div>
              )}

            {isOwnJob && isDraft && (
              <div className="space-y-3">
                <button
                  onClick={() => navigate(`/jobs/${job.id || job._id}/payment`)}
                  className="w-full gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-3 text-lg font-semibold text-white shadow-lg shadow-orange-500/30 transition-all hover:from-orange-600 hover:to-orange-700"
                >
                  {t("jobs.payAndPublish", "Pay and Publish")}
                </button>
                <div className="rounded-2xl border border-yellow-600 bg-yellow-900/30 p-4">
                  <p className="text-sm font-medium text-yellow-300">
                    {t(
                      "jobs.draftPayToPublish",
                      "This job is a draft. Complete the payment to publish it.",
                    )}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleEditJob}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-sky-600 bg-transparent px-4 py-2 text-sm font-semibold text-sky-400 transition-colors hover:bg-sky-900/30"
                  >
                    <Edit className="h-4 w-4" />
                    {t("common.edit", "Edit")}
                  </button>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-red-600 bg-transparent px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-900/30"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("common.delete", "Delete")}
                  </button>
                </div>
              </div>
            )}

            {isOwnJob &&
              !isDraft &&
              (job.status === "open" ||
                (job.status === "in_progress" && !job.doerId)) &&
              /* Solo mostrar postulados si aún hay vacantes disponibles */
              (job.selectedWorkers?.length || 0) < (job.maxWorkers || 1) && (
                <div className="space-y-4" ref={proposalsSectionRef}>
                  {/* New proposal real-time alert */}
                  {newProposalAlert && (
                    <div className="bg-green-900/30 border border-green-600 rounded-xl p-4 flex items-center gap-3 animate-pulse">
                      <Bell className="h-5 w-5 text-green-400" />
                      <span className="text-green-300 font-medium">
                        {newProposalAlert}
                      </span>
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
                        {t("jobs.applicants", "Applicants")} ({proposals.length}
                        )
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
                        <p className="text-slate-500 dark:text-slate-400 text-sm">
                          {t("jobs.detail.noApplicants")}
                        </p>
                        <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">
                          {t("jobs.detail.applicantsWillAppear")}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Auto-selection warning */}
                        <div className="rounded-lg border border-amber-300 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-900/20 p-3">
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="inline h-3 w-3 mr-1" />
                            {t(
                              "jobs.autoSelectWarning",
                              "If you don't select a worker 24h before the start, the first applicant will be automatically assigned.",
                            )}
                          </p>
                        </div>

                        {/* Consejos antes de seleccionar trabajador */}
                        <div className="rounded-lg border border-sky-200 dark:border-sky-700/50 bg-sky-50 dark:bg-sky-900/20 p-3">
                          <p className="text-xs font-semibold text-sky-800 dark:text-sky-200 mb-1 flex items-center gap-1.5">
                            <span>💡</span> {t("jobs.detail.beforeSelectTitle", "Consejos antes de seleccionar trabajador")}
                          </p>
                          <ul className="space-y-1 text-xs text-sky-700 dark:text-sky-300">
                            <li className="flex items-start gap-1.5"><span className="mt-0.5">⭐</span><span>{t("jobs.detail.beforeSelectReviewProfile", "Revisá el perfil y las reseñas del trabajador antes de seleccionarlo.")}</span></li>
                          </ul>
                        </div>

                        {proposals.map((proposal: any) => {
                          const isOffer = proposal.isCounterOffer || (proposal.proposedPrice !== undefined && proposal.proposedPrice !== job.price);
                          return (
                          <div
                            key={proposal.id}
                            className={`rounded-xl border p-4 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
                              isOffer
                                ? "border-orange-300 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/20"
                                : "border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50"
                            }`}
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
                                      `https://api.dicebear.com/7.x/avataaars/svg?seed=${proposal.freelancer?.name || "user"}`
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
                                    {proposal.freelancer?.name ||
                                      t("common.user", "User")}
                                  </Link>
                                  <ExternalLink className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                                  {/* Job Code Badge */}
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-900/40 text-xs font-mono font-bold text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-700">
                                    <Key className="h-3 w-3" />#
                                    {getJobCode(job.id || job._id)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 mt-1">
                                  <span className="flex items-center gap-1">
                                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                                    {Number(
                                      proposal.freelancer?.rating || 0,
                                    ).toFixed(1)}
                                  </span>
                                  <span>•</span>
                                  <span>
                                    {proposal.freelancer?.completedJobs || 0}{" "}
                                    {t("common.jobs", "jobs")}
                                  </span>
                                  {/* Profesión y matrícula del postulante */}
                                  {proposal.freelancer?.profession && (
                                    <>
                                      <span>•</span>
                                      <span className="text-sky-600 dark:text-sky-400 font-medium">
                                        {proposal.freelancer.profession.replace(/_/g, ' ')}
                                      </span>
                                      {proposal.freelancer.licenseNumber && (
                                        <span className="text-xs bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded font-mono">
                                          Mat. {proposal.freelancer.licenseNumber}
                                        </span>
                                      )}
                                      {proposal.freelancer.licenseVerified && (
                                        <span className="text-xs text-green-600 dark:text-green-400 font-semibold">✓</span>
                                      )}
                                    </>
                                  )}
                                </div>

                                {/* Monto propuesto */}
                                <div className="mt-3 flex items-center gap-2 flex-wrap">
                                  <div
                                    className={`px-5 py-3 rounded-xl text-lg font-bold flex items-center gap-1.5 ${
                                      isOffer
                                        ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-2 border-amber-400 dark:border-amber-600"
                                        : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-2 border-green-400 dark:border-green-600"
                                    }`}
                                  >
                                    <DollarSign className="inline h-5 w-5" />
                                    {(proposal.proposedPrice || job.price)?.toLocaleString("es-AR")}{" "}
                                    ARS
                                  </div>
                                  {isOffer && (
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500 text-white">
                                      {t("jobs.counterOffer", "Contraoferta")}
                                    </span>
                                  )}
                                  {!isOffer && proposal.proposedPrice === job.price && (
                                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-500 text-white">
                                      {t("jobs.acceptedOriginalPrice", "Precio original")}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="shrink-0 flex items-center gap-2">
                                {/* Message Button */}
                                <button
                                  onClick={() =>
                                    handleMessageProposal(proposal)
                                  }
                                  disabled={messagingProposal === proposal.id}
                                  className="flex items-center gap-1 px-3 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                                  title={t("chat.sendMessage")}
                                >
                                  {messagingProposal === proposal.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <MessageSquare className="h-4 w-4" />
                                  )}
                                </button>

                                {/* Select / Aceptar Button */}
                                {proposal.status === "pending" ? (
                                  <button
                                    onClick={() => openSelectConfirmModal(proposal)}
                                    disabled={selectingWorker === proposal.id}
                                    className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-50 ${isOffer ? "bg-amber-500 hover:bg-amber-600" : "bg-green-600 hover:bg-green-700"}`}
                                  >
                                    {selectingWorker === proposal.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <>
                                        <CheckCircle className="h-4 w-4" />
                                        {isOffer
                                          ? t("common.accept", "Aceptar")
                                          : t("common.select", "Seleccionar")}
                                      </>
                                    )}
                                  </button>
                                ) : proposal.status === "approved" ? (
                                  <span className="flex items-center gap-1 px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm font-medium rounded-lg border border-green-300 dark:border-green-600">
                                    <CheckCircle className="h-4 w-4" />
                                    {t("status.selected", "Selected")}
                                  </span>
                                ) : proposal.status === "rejected" ? (
                                  <span className="flex items-center gap-1 px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm font-medium rounded-lg border border-red-300 dark:border-red-600">
                                    {t("status.rejected", "Rejected")}
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

                            {/* Quote badge if worker applied with quote */}
                            {proposal.quote && (
                              <div className="mt-3 flex items-center gap-2 flex-wrap">
                                <Link
                                  to={`/quotes/${proposal.quote.id}`}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 text-sm font-medium text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors"
                                >
                                  <ClipboardList className="h-4 w-4" />
                                  {t('jobs.viewQuoteNumber', 'Ver cotización #{{number}}', { number: proposal.quote.quoteNumber })}
                                  <span className="text-sky-600 dark:text-sky-400 font-semibold">
                                    · ${Number(proposal.quote.total).toLocaleString('es-AR')} ARS
                                  </span>
                                </Link>
                              </div>
                            )}

                            {/* View Full Proposal Link for Counter-offers */}
                            {proposal.isCounterOffer && (
                              <Link
                                to={`/proposals/${proposal.id}`}
                                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300"
                              >
                                {t(
                                  "jobs.viewCounterOfferDetail",
                                  "View counter-offer detail",
                                )}
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="relative">
                    <button
                      onClick={() => setShowActionsMenu(!showActionsMenu)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-700 hover:bg-slate-600 dark:bg-slate-600 dark:hover:bg-slate-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                    >
                      <MoreVertical className="h-4 w-4" />
                      {t("jobs.actions.actions")}
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${showActionsMenu ? "rotate-180" : ""}`}
                      />
                    </button>

                    <JobActionsMenu
                      open={showActionsMenu}
                      loading={actionLoading}
                      canPause={canPauseJob()}
                      canCancel={canCancelJob()}
                      onChangeBudget={() => setShowBudgetModal(true)}
                      onPause={handlePauseJob}
                      onCancel={() => setShowCancelModal(true)}
                      onContactSupport={() =>
                        navigate(
                          `/tickets/new?type=job&jobId=${job.id || job._id}&jobTitle=${encodeURIComponent(job.title)}`,
                        )
                      }
                      onClose={() => setShowActionsMenu(false)}
                    />

                    {/* Cancellation deadline warning */}
                    {!canCancelJob() ? (
                      <div className="mt-3 rounded-xl border border-red-300 dark:border-red-600/50 bg-red-50 dark:bg-red-900/20 p-3">
                        <p className="text-xs text-red-700 dark:text-red-300">
                          <AlertTriangle className="inline h-3 w-3 mr-1" />
                          {t("jobs.actions.cantCancel")}
                        </p>
                      </div>
                    ) : (
                      getTimeUntilCancelDeadline() && (
                        <div className="mt-3 rounded-xl border border-amber-300 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-900/20 p-3">
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            <Clock className="inline h-3 w-3 mr-1" />
                            {t("jobs.actions.timeToCancel")}{" "}
                            <span className="font-semibold">
                              {getTimeUntilCancelDeadline()}
                            </span>
                          </p>
                        </div>
                      )
                    )}
                  </div>

                  {error && (
                    <div className="rounded-2xl border border-red-600 bg-red-900/30 p-4">
                      <p className="text-sm font-medium text-red-300">
                        {error}
                      </p>
                    </div>
                  )}

                  <div className="rounded-2xl border border-sky-300 dark:border-sky-600 bg-white dark:bg-sky-900/30 p-4">
                    <p className="text-sm font-medium text-sky-700 dark:text-sky-300">
                      ✅ {t("jobs.actions.publishedReceiving")}
                    </p>
                  </div>
                </div>
              )}

            {isOwnJob && !isDraft && job.status === "paused" && (
              <div className="space-y-4">
                {/* Check if paused due to pending budget increase payment */}
                {job.pendingNewPrice ? (
                  <div className="rounded-2xl border border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 p-4">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-3">
                      {t(
                        "jobs.waitingPaymentVerification",
                        "Waiting for payment verification",
                      )}
                    </p>
                    <div className="space-y-2 text-xs text-blue-600 dark:text-blue-400">
                      <p>
                        {t(
                          "jobs.paymentProofBeingVerified",
                          "Your payment proof for the budget increase is being verified by our team.",
                        )}
                      </p>
                      <div className="mt-3 p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                        <p className="font-medium">
                          {t("jobs.currentPrice", "Current price")}: $
                          {Number(job.price).toLocaleString("es-AR")} ARS
                        </p>
                        <p className="font-medium">
                          {t("jobs.pendingNewPrice", "Pending new price")}: $
                          {Number(job.pendingNewPrice).toLocaleString("es-AR")}{" "}
                          ARS
                        </p>
                      </div>
                      <p className="mt-2">
                        {t(
                          "jobs.budgetWillUpdateOnApproval",
                          "Once approved, the budget will update automatically and your job will be reactivated.",
                        )}
                      </p>
                      <p className="text-blue-500 dark:text-blue-300">
                        {t(
                          "jobs.estimatedTime",
                          "Estimated time: 24-48 business hours (transfer) or 5-15 minutes (Binance)",
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 p-4">
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-3">
                        {t("jobs.listingPaused", "This listing is paused")}
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        {t(
                          "jobs.willResumeAutomatically",
                          "If you don't resume or cancel it, it will resume automatically.",
                        )}
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
                            {t("common.resume", "Resume")}
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setShowCancelModal(true)}
                        disabled={actionLoading || !canCancelJob()}
                        title={
                          !canCancelJob()
                            ? t(
                                "jobs.cantCancel24h",
                                "Cannot cancel less than 24h before start",
                              )
                            : ""
                        }
                        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <XCircle className="h-4 w-4" />
                        {t("common.cancel", "Cancel")}
                      </button>
                    </div>
                  </>
                )}

                {error && (
                  <div className="rounded-2xl border border-red-300 dark:border-red-600 bg-red-50 dark:bg-red-900/30 p-4">
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">
                      {error}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Client view - Job finished, needs confirmation */}
            {isOwnJob &&
              !isDraft &&
              (job.doerId ||
                (job.selectedWorkers && job.selectedWorkers.length > 0)) &&
              job.endDate &&
              new Date(job.endDate) <= new Date() &&
              (job.status === "open" || job.status === "in_progress") &&
              contractData &&
              !contractData.clientConfirmed && (
                <div className="rounded-2xl border-2 border-emerald-400 dark:border-emerald-500 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/30 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-emerald-100 dark:bg-emerald-800/50 rounded-full">
                      <CheckCircle className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                        {t("jobs.jobFinished", "Job finished!")}
                      </p>
                      <p className="text-sm text-emerald-600 dark:text-emerald-400">
                        {t("jobs.jobFinishedOn", "El trabajo finalizó el")}{" "}
                        {new Date(job.endDate).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-4">
                    {t(
                      "jobs.confirmForWorkerPayment",
                      "Confirm that the job was completed correctly to proceed with payments to the worker.",
                    )}
                  </p>

                  {/* Confirmation status */}
                  <div className="bg-white dark:bg-slate-800/50 rounded-xl p-4 mb-4">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                      {t("jobs.confirmationStatus", "Confirmation status")}:
                    </p>
                    <div className="flex items-center gap-4 text-sm">
                      <span
                        className={`flex items-center gap-1 ${contractData.clientConfirmed ? "text-green-600" : "text-slate-400"}`}
                      >
                        {contractData.clientConfirmed ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          <Clock className="h-4 w-4" />
                        )}
                        {t("jobs.yourConfirmation", "Tu confirmación")}
                      </span>
                      <span
                        className={`flex items-center gap-1 ${contractData.doerConfirmed ? "text-green-600" : "text-slate-400"}`}
                      >
                        {contractData.doerConfirmed ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          <Clock className="h-4 w-4" />
                        )}
                        {t("jobs.workerConfirmation", "Worker confirmation")}
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
                          {t("jobs.confirming", "Confirmando...")}
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4" />
                          {t("jobs.confirmWorkDone", "Confirm work done")}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

            {/* Client view - Waiting for worker confirmation */}
            {isOwnJob &&
              !isDraft &&
              (job.doerId ||
                (job.selectedWorkers && job.selectedWorkers.length > 0)) &&
              job.endDate &&
              new Date(job.endDate) <= new Date() &&
              (job.status === "open" || job.status === "in_progress") &&
              contractData &&
              contractData.clientConfirmed &&
              !(
                allContractsData?.allCompleted ?? contractData.doerConfirmed
              ) && (
                <div className="rounded-2xl border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-amber-100 dark:bg-amber-800/50 rounded-full">
                      <Clock className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-amber-700 dark:text-amber-300">
                        {allContractsData && allContractsData.totalContracts > 1
                          ? `Esperando confirmaciones (${allContractsData.contracts.filter((c) => c.doerConfirmed && c.clientConfirmed).length}/${allContractsData.totalContracts})`
                          : t(
                              "jobs.waitingWorkerConfirmation",
                              "Waiting for worker confirmation",
                            )}
                      </p>
                    </div>
                  </div>
                  {allContractsData && allContractsData.totalContracts > 1 ? (
                    <div className="space-y-2 mb-3">
                      {allContractsData.contracts.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between text-sm"
                        >
                          <span
                            className={`flex items-center gap-1 ${c.doerConfirmed ? "text-green-600" : "text-amber-600"}`}
                          >
                            {c.doerConfirmed ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : (
                              <Clock className="h-4 w-4" />
                            )}
                            {c.doerName}
                          </span>
                          <Link
                            to={`/contracts/${c.id}`}
                            className="text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-medium"
                          >
                            Ver contrato →
                          </Link>
                        </div>
                      ))}
                    </div>
                  ) : (
                    contractData && (
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          {t(
                            "jobs.youConfirmedWaitingWorker",
                            "You confirmed that the work was done. We are waiting for the worker to also confirm to proceed with payments.",
                          )}
                        </p>
                        <Link
                          to={`/contracts/${contractData.id}`}
                          className="text-sm text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-medium whitespace-nowrap ml-3"
                        >
                          Ver contrato →
                        </Link>
                      </div>
                    )
                  )}
                </div>
              )}

            {/* Client view - All confirmed */}
            {isOwnJob &&
              !isDraft &&
              (job.doerId ||
                (job.selectedWorkers && job.selectedWorkers.length > 0)) &&
              job.endDate &&
              new Date(job.endDate) <= new Date() &&
              (job.status === "open" || job.status === "in_progress") &&
              (allContractsData?.allCompleted ??
                (contractData &&
                  contractData.clientConfirmed &&
                  contractData.doerConfirmed)) && (
                <div className="rounded-2xl border-2 border-green-400 dark:border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-green-100 dark:bg-green-800/50 rounded-full">
                      <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-green-700 dark:text-green-300">
                        {t("jobs.jobCompleted", "Job completed!")}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    ✅{" "}
                    {allContractsData && allContractsData.totalContracts > 1
                      ? t(
                          "jobs.allWorkersClientConfirmed",
                          "All {{count}} workers and client confirmed - Payments will be released",
                          { count: allContractsData.totalContracts },
                        )
                      : t(
                          "jobs.bothConfirmedPaymentReleased",
                          "Both confirmed - Payment will be released to the worker",
                        )}
                  </p>
                </div>
              )}

            {isOwnJob && !isDraft && job.status === "cancelled" && (
              <div className="space-y-4">
                {/* Check if cancelled due to no applicants */}
                {job.cancellationReason?.includes(
                  "Ningún trabajador se postuló",
                ) ? (
                  <div className="rounded-2xl border border-blue-400 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/30 p-5">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-800">
                        <Users className="h-5 w-5 text-blue-600 dark:text-blue-300" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-blue-800 dark:text-blue-200">
                          {t(
                            "jobs.noWorkersApplied",
                            "Sorry, no workers applied",
                          )}
                        </h3>
                        <p className="text-sm text-blue-600 dark:text-blue-300 mt-1">
                          {t(
                            "jobs.jobExpiredNoApplications",
                            "Your job expired before receiving applications.",
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="bg-blue-100 dark:bg-blue-950/50 rounded-lg p-4 mb-4">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                        {t(
                          "jobs.wouldYouReschedule",
                          "Would you like to reschedule it?",
                        )}
                      </p>
                      <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                        <li>
                          •{" "}
                          {t(
                            "jobs.updateDates",
                            "Update dates to a more convenient time",
                          )}
                        </li>
                        <li>
                          •{" "}
                          {t(
                            "jobs.adjustBudget",
                            "Consider adjusting the budget",
                          )}
                        </li>
                        <li>
                          •{" "}
                          {t(
                            "jobs.addMoreDetails",
                            "Add more details to the description",
                          )}
                        </li>
                      </ul>
                    </div>

                    {job.cancelledAt && (
                      <p className="text-xs text-blue-500 dark:text-blue-400 mb-4">
                        Expirado el{" "}
                        {new Date(job.cancelledAt).toLocaleDateString("es-AR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
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
                        {t("jobs.reschedule", "Reschedule")}
                      </button>
                      <button
                        onClick={() => setShowDeleteModal(true)}
                        className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-4 py-3 font-semibold text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("common.cancel", "Cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-red-600 bg-red-900/30 p-4">
                      <p className="text-sm font-medium text-red-300 mb-2">
                        {t(
                          "jobs.listingCancelled",
                          "This listing was cancelled",
                        )}
                      </p>
                      {(job.cancellationReason || job.rejectedReason) && (
                        <div className="mt-3 p-3 bg-red-950/50 rounded-lg border border-red-800">
                          <p className="text-xs text-red-400 font-medium mb-1">
                            {t("common.reason", "Reason")}:
                          </p>
                          <p className="text-sm text-red-200">
                            {job.cancellationReason || job.rejectedReason}
                          </p>
                        </div>
                      )}
                      {job.cancelledAt && (
                        <p className="text-xs text-red-400 mt-2">
                          Cancelado el{" "}
                          {new Date(job.cancelledAt).toLocaleDateString(
                            "es-AR",
                            {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
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
                        {t("jobs.editAndResubmit", "Edit and Resubmit")}
                      </button>
                      <button
                        onClick={() => setShowDeleteModal(true)}
                        className="flex items-center justify-center gap-2 rounded-xl border border-red-600 bg-transparent px-4 py-3 font-semibold text-red-400 transition-colors hover:bg-red-900/30"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("common.delete", "Delete")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Suspended job - needs end date */}
            {isOwnJob && job.status === "suspended" && (
              <div className="rounded-2xl border-2 border-orange-400 dark:border-orange-600 bg-orange-50 dark:bg-orange-900/30 p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-800">
                    <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-300" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-orange-800 dark:text-orange-200">
                      {t("jobs.jobSuspended", "Job suspended")}
                    </h3>
                    <p className="text-sm text-orange-600 dark:text-orange-300 mt-1">
                      {t(
                        "jobs.suspendedNoEndDate",
                        "Your job is suspended because you did not set an end date before 24 hours prior to the start.",
                      )}
                    </p>
                  </div>
                </div>

                <div className="bg-orange-100 dark:bg-orange-950/50 rounded-lg p-4 mb-4">
                  <p className="text-sm font-medium text-orange-800 dark:text-orange-200 mb-2">
                    {t("jobs.toReactivateJob", "To reactivate your job:")}
                  </p>
                  <ul className="text-sm text-orange-700 dark:text-orange-300 space-y-1">
                    <li>
                      •{" "}
                      {t(
                        "jobs.editAndSetEndDate",
                        "Edit the job and set an end date",
                      )}
                    </li>
                    <li>
                      •{" "}
                      {t(
                        "jobs.willReactivateAutomatically",
                        "The job will reactivate automatically",
                      )}
                    </li>
                  </ul>
                </div>

                <button
                  onClick={handleEditJob}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-orange-700"
                >
                  <Edit className="h-4 w-4" />
                  {t("jobs.editAndSetEndDate", "Edit and set end date")}
                </button>
              </div>
            )}

            {/* Trabajadores del Proyecto - Similar to ContractDetail */}
            {isOwnJob &&
              allContractsData &&
              allContractsData.contracts &&
              allContractsData.contracts.length > 0 && (
                <div className="rounded-2xl border border-slate-700 bg-slate-800 overflow-hidden">
                  <div className="bg-slate-900/50 px-4 py-3 border-b border-slate-700">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      <Users className="h-5 w-5 text-sky-400" />
                      {t("jobs.projectWorkers", "Project Workers")} (
                      {allContractsData.contracts.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-700">
                    {allContractsData.contracts.map((contract) => (
                      <div
                        key={contract.id}
                        className="p-4 hover:bg-slate-700/30 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 overflow-hidden rounded-full bg-sky-100">
                              <img
                                src={
                                  contract.doerAvatar ||
                                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${contract.doerName}`
                                }
                                alt={contract.doerName}
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div>
                              <p className="font-medium text-white">
                                {contract.doerName}
                              </p>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full ${
                                  contract.status === "completed"
                                    ? "bg-green-500/20 text-green-400"
                                    : contract.status === "in_progress"
                                      ? "bg-blue-500/20 text-blue-400"
                                      : contract.status ===
                                          "awaiting_confirmation"
                                        ? "bg-amber-500/20 text-amber-400"
                                        : "bg-slate-500/20 text-slate-400"
                                }`}
                              >
                                {contract.status === "completed"
                                  ? t("status.completed", "Completed")
                                  : contract.status === "in_progress"
                                    ? t("status.inProgress", "In progress")
                                    : contract.status ===
                                        "awaiting_confirmation"
                                      ? t(
                                          "status.awaitingConfirmation",
                                          "Awaiting confirmation",
                                        )
                                      : contract.status}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right text-xs">
                              <div className="flex items-center gap-1">
                                {contract.doerConfirmed ? (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Clock className="h-4 w-4 text-slate-400" />
                                )}
                                <span
                                  className={
                                    contract.doerConfirmed
                                      ? "text-green-400"
                                      : "text-slate-400"
                                  }
                                >
                                  {t("common.worker", "Worker")}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 mt-1">
                                {contract.clientConfirmed ? (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Clock className="h-4 w-4 text-slate-400" />
                                )}
                                <span
                                  className={
                                    contract.clientConfirmed
                                      ? "text-green-400"
                                      : "text-slate-400"
                                  }
                                >
                                  {t("common.client", "Client")}{" "}
                                  {t("common.you", "(you)")}
                                </span>
                              </div>
                            </div>
                            <Link
                              to={`/contracts/${contract.id}`}
                              className="text-xs text-sky-400 hover:text-sky-300 font-medium"
                            >
                              Ver →
                            </Link>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Summary */}
                  <div className="bg-slate-900/50 px-4 py-3 border-t border-slate-700">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>
                        {t("jobs.confirmedByWorkers", "Confirmed by workers")}:
                      </span>
                      <span className="font-medium text-white">
                        {
                          allContractsData.contracts.filter(
                            (c) => c.doerConfirmed,
                          ).length
                        }{" "}
                        / {allContractsData.contracts.length}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400 mt-1">
                      <span>
                        {t(
                          "jobs.confirmedByYouClient",
                          "Confirmed by you (client)",
                        )}
                        :
                      </span>
                      <span className="font-medium text-white">
                        {
                          allContractsData.contracts.filter(
                            (c) => c.clientConfirmed,
                          ).length
                        }{" "}
                        / {allContractsData.contracts.length}
                      </span>
                    </div>
                  </div>
                </div>
              )}

            {/* Single worker contract info - when not team job */}
            {isOwnJob &&
              contractData &&
              (!allContractsData || allContractsData.contracts.length <= 1) && (
                <div className="rounded-2xl border border-slate-700 bg-slate-800 overflow-hidden">
                  <div className="bg-slate-900/50 px-4 py-3 border-b border-slate-700">
                    <h3 className="font-semibold text-white flex items-center gap-2">
                      <Users className="h-5 w-5 text-sky-400" />
                      {t("jobs.jobContract", "Job Contract")}
                    </h3>
                  </div>
                  <div className="p-4">
                    {/* Contract status */}
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-slate-400">
                        {t("common.status", "Status")}:
                      </span>
                      <span
                        className={`text-sm px-3 py-1 rounded-full font-medium ${
                          contractData.status === "completed"
                            ? "bg-green-500/20 text-green-400"
                            : contractData.status === "in_progress"
                              ? "bg-blue-500/20 text-blue-400"
                              : contractData.status === "awaiting_confirmation"
                                ? "bg-amber-500/20 text-amber-400"
                                : "bg-slate-500/20 text-slate-400"
                        }`}
                      >
                        {contractData.status === "completed"
                          ? t("status.completed", "Completed")
                          : contractData.status === "in_progress"
                            ? t("status.inProgress", "In progress")
                            : contractData.status === "awaiting_confirmation"
                              ? t(
                                  "status.awaitingConfirmation",
                                  "Awaiting confirmation",
                                )
                              : contractData.status === "pending"
                                ? t("status.pending", "Pending")
                                : contractData.status === "ready"
                                  ? t("status.ready", "Ready")
                                  : contractData.status === "accepted"
                                    ? t("status.accepted", "Accepted")
                                    : contractData.status}
                      </span>
                    </div>

                    {/* Price details */}
                    {contractData.price && (
                      <div className="space-y-2 mb-4 p-3 bg-slate-900/50 rounded-lg">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-400">
                            {t("common.price", "Price")}:
                          </span>
                          <span className="text-white font-medium">
                            $
                            {Number(contractData.price || 0).toLocaleString(
                              "es-AR",
                              { minimumFractionDigits: 2 },
                            )}
                          </span>
                        </div>
                        {contractData.commission && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-400">
                              {t("common.commission", "Commission")}:
                            </span>
                            <span className="text-white">
                              $
                              {Number(
                                contractData.commission || 0,
                              ).toLocaleString("es-AR", {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        )}
                        {contractData.totalPrice && (
                          <div className="flex justify-between text-sm pt-2 border-t border-slate-700">
                            <span className="text-slate-400 font-medium">
                              {t("common.total", "Total")}:
                            </span>
                            <span className="text-sky-400 font-bold">
                              $
                              {Number(
                                contractData.totalPrice || 0,
                              ).toLocaleString("es-AR", {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Confirmation status */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-slate-400 mb-2">
                        {t("jobs.confirmationStatus", "Confirmation status")}:
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {contractData.doerConfirmed ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <Clock className="h-4 w-4 text-slate-400" />
                          )}
                          <span
                            className={`text-sm ${contractData.doerConfirmed ? "text-green-400" : "text-slate-400"}`}
                          >
                            {t("common.worker", "Worker")}:{" "}
                            {contractData.doerConfirmed
                              ? t("status.confirmed", "Confirmed")
                              : t("status.pending", "Pending")}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {contractData.clientConfirmed ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <Clock className="h-4 w-4 text-slate-400" />
                          )}
                          <span
                            className={`text-sm ${contractData.clientConfirmed ? "text-green-400" : "text-slate-400"}`}
                          >
                            {t("common.client", "Client")}{" "}
                            {t("common.you", "(you)")}:{" "}
                            {contractData.clientConfirmed
                              ? t("status.confirmed", "Confirmed")
                              : t("status.pending", "Pending")}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Link to full contract */}
                    <Link
                      to={`/contracts/${contractData.id}`}
                      className="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {t("jobs.viewFullContract", "View full contract")}
                    </Link>
                  </div>
                </div>
              )}

            {/* Tips */}
            <div className="rounded-2xl border border-sky-300 dark:border-sky-600 bg-sky-50 dark:bg-sky-900/30 p-4">
              <h3 className="mb-2 font-semibold text-sky-700 dark:text-sky-300">
                💡 {t("jobs.detail.tip", "Tip")}
              </h3>
              <p className="text-sm text-sky-600 dark:text-sky-200">
                {t(
                  "jobs.detail.tipText",
                  "Read the description carefully and make sure you have the necessary tools before applying.",
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Pause Approval Request Modal */}
        <PauseApprovalModal
          open={showPauseApprovalModal}
          loading={requestingPauseApproval}
          onConfirm={handleRequestPauseApproval}
          onClose={() => setShowPauseApprovalModal(false)}
        />

        <CancelJobModal
          open={showCancelModal}
          timeRemaining={getTimeUntilCancelDeadline()}
          reason={cancellationReason}
          onReasonChange={setCancellationReason}
          publicationAmount={job.publicationAmount}
          loading={actionLoading}
          onConfirm={handleCancelJob}
          onClose={() => {
            setShowCancelModal(false);
            setCancellationReason("");
          }}
        />

        <DeleteJobModal
          open={showDeleteModal}
          loading={deleting}
          onConfirm={handleDeleteJob}
          onClose={() => setShowDeleteModal(false)}
        />

        <ConfirmModal
          open={confirmWithdrawOpen}
          tone="danger"
          loading={withdrawing}
          title={t("jobs.withdrawApplication", "Cancelar postulación")}
          message={t(
            "jobs.confirmWithdrawApplication",
            "¿Seguro que querés cancelar tu postulación a este trabajo? Vas a poder volver a postularte mientras siga abierto.",
          )}
          confirmLabel={t("jobs.yesWithdraw", "Sí, cancelar postulación")}
          onConfirm={handleWithdrawApplication}
          onClose={() => setConfirmWithdrawOpen(false)}
        />

        {dialog}
        {viewer}

        <ChangeBudgetModal
          open={showBudgetModal}
          currentPrice={Number(job.price || 0)}
          newBudget={newBudget}
          onNewBudgetChange={setNewBudget}
          reason={budgetReason}
          onReasonChange={setBudgetReason}
          error={error}
          loading={changingBudget}
          onConfirm={handleChangeBudget}
          onClose={() => {
            setShowBudgetModal(false);
            setNewBudget("");
            setBudgetReason("");
            setError(null);
          }}
        />

        {/* Select Worker Confirmation Modal */}
        <SelectWorkerConfirmModal
          open={showSelectConfirmModal}
          proposal={selectedProposal}
          job={job}
          loading={selectingWorker !== null}
          onConfirm={() => handleSelectWorker(selectedProposal)}
          onClose={() => {
            setShowSelectConfirmModal(false);
            setSelectedProposal(null);
          }}
        />

        <BudgetPaymentConfirmModal
          open={showPaymentConfirmModal}
          breakdown={paymentBreakdown}
          onGoToPayment={() => {
            if (job && paymentBreakdown) {
              window.location.href = `/jobs/${job.id || (job as any)._id}/payment?amount=${paymentBreakdown.amountRequired}&reason=budget_increase&oldPrice=${paymentBreakdown.oldPrice}&newPrice=${paymentBreakdown.newPrice}`;
            }
          }}
          onClose={() => {
            setShowPaymentConfirmModal(false);
            setPaymentBreakdown(null);
          }}
        />

        <ContractRedirectModal
          open={showContractRedirectModal}
          message={contractRedirectMessage}
          redirectUrl={contractRedirectUrl}
          onClose={() => {
            setShowContractRedirectModal(false);
            setContractRedirectUrl("");
            setContractRedirectMessage("");
          }}
        />

        {/* Confirmation Success Modal */}
        <ConfirmationSuccessModal
          open={showConfirmationSuccessModal}
          onClose={() => setShowConfirmationSuccessModal(false)}
        />

        <ErrorModal
          open={showErrorModal}
          message={errorMessage}
          onClose={() => {
            setShowErrorModal(false);
            setErrorMessage("");
          }}
        />
      </div>
    </>
  );
}
