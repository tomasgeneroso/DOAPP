import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from "react-router-dom";
import ExcelJS from "exceljs";
import { getImageUrl } from "@/utils/imageUrl";
import IdBadge from "@/components/admin/IdBadge";
import {
  CheckCircle,
  XCircle,
  Eye,
  Search,
  FileText,
  AlertCircle,
  Download,
  Loader2,
  DollarSign,
  Users,
  Building,
  CreditCard,
  User,
  RefreshCw,
  Upload,
  Receipt,
  Copy,
  Check,
  Calculator,
  Percent,
  Banknote,
  Clock,
  History,
  ExternalLink,
  ArrowDownCircle,
  Ban,
  RotateCcw,
  FileImage,
  MessageSquare,
  X,
} from "lucide-react";

interface WorkerPaymentInfo {
  workerId: string;
  workerName: string;
  workerEmail: string;
  workerDni: string | null;
  workerPhone: string | null;
  workerAddress: {
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
  bankingInfo: {
    bankName: string | null;
    accountHolder: string | null;
    accountType: string | null;
    cbu: string | null;
    alias: string | null;
  } | null;
  hasBankingInfo: boolean;
  amountToPay: number;
  commission: number;
  percentageOfBudget: number | null;
}

interface PaymentProofInfo {
  id: string;
  fileUrl: string;
  status: string;
  uploadedAt: string;
}

interface ContractPaymentRow {
  contractId: string;
  contractNumber: number;
  jobId: string;
  jobTitle: string;
  clientId: string;
  clientName: string;
  clientEmail: string;
  totalContractAmount: number;
  totalCommission: number;
  completedAt: string;
  paymentStatus: string;
  escrowStatus: string;
  contractStatus: string;
  workers: WorkerPaymentInfo[];
  commissionVerified?: boolean;
  paymentRecordStatus?: string;
  paymentId?: string;
  proofs?: PaymentProofInfo[];
  // Worker payment proof (admin's proof of transfer to worker)
  workerPaymentProofUrl?: string | null;
}

interface ReportSummary {
  totalContracts: number;
  totalWorkers: number;
  totalAmountToPay: number;
  totalCommissionCollected: number;
  averagePaymentPerWorker: number;
  bankBreakdown: Record<string, { count: number; totalAmount: number }>;
}

interface PaymentDetails {
  contract: {
    id: string;
    status: string;
    paymentStatus: string;
    escrowStatus: string;
    price: number;
    commission: number;
    totalPrice: number;
    allocatedAmount?: number;
    percentageOfBudget?: number;
    startDate: string;
    endDate: string;
    completedAt?: string;
  };
  job: {
    id: string;
    title: string;
    description: string;
    totalBudget: number;
    maxWorkers: number;
    selectedWorkersCount: number;
    location: string;
  };
  client: {
    id: string;
    name: string;
    email: string;
    dni?: string;
    phone?: string;
    address?: any;
  };
  worker: {
    id: string;
    name: string;
    email: string;
    dni?: string;
    phone?: string;
    address?: any;
    bankingInfo?: {
      bankName?: string;
      accountHolder?: string;
      accountType?: string;
      cbu?: string;
      alias?: string;
    };
  };
  payment?: {
    id: string;
    status: string;
    amount: number;
    workerPaymentAmount?: number;
    mercadopagoId?: string;
    paidAt?: string;
    proofs?: PaymentProofInfo[];
  };
}

interface CompletedPayment {
  contractId: string;
  rowNumber: number;
  jobId: string;
  jobTitle: string;
  clientName: string;
  clientEmail: string;
  workerName: string;
  workerEmail: string;
  bankName: string;
  cbu: string;
  grossAmount: number;
  commission: number;
  netAmount: number;
  paymentProofUrl?: string;
  paymentAdminNotes?: string;
  processedBy: string;
  processedByEmail?: string;
  processedAt: string;
  completedAt: string;
}

interface CompletedSummary {
  totalPayments: number;
  totalGrossAmount: number;
  totalCommission: number;
  totalNetPaid: number;
}

export default function PendingPayments() {
  // Main tab state: "app" = Pagos a la App, "workers" = Pagos a Trabajadores
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"app" | "workers" | "refunds">("app");
  const [refunds, setRefunds] = useState<any[]>([]);
  const [refundsLoading, setRefundsLoading] = useState(false);
  const [urlParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(urlParams.get("search") || "");

  // Generic matcher: search across every field of a payment row (name, email, id, amount, ...)
  const matchesQuery = (item: any): boolean => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    try {
      return JSON.stringify(item).toLowerCase().includes(q);
    } catch {
      return true;
    }
  };

  // Sub-filter state for each tab
  const [appSubFilter, setAppSubFilter] = useState<"all" | "pending" | "verified" | "escrow" | "confirmed" | "disputed" | "rejected">("pending");
  const [workersSubFilter, setWorkersSubFilter] = useState<"pending" | "paid" | "disputed">("pending");

  const [payments, setPayments] = useState<ContractPaymentRow[]>([]);
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState<PaymentDetails | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

  // Completed payments state
  const [completedPayments, setCompletedPayments] = useState<CompletedPayment[]>([]);
  const [completedSummary, setCompletedSummary] = useState<CompletedSummary | null>(null);
  const [completedLoading, setCompletedLoading] = useState(false);

  // Verification payments state (client → platform payments pending admin approval)
  const [verificationPayments, setVerificationPayments] = useState<any[]>([]);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [approvingPaymentId, setApprovingPaymentId] = useState<string | null>(null);
  const [rejectingPaymentId, setRejectingPaymentId] = useState<string | null>(null);

  // Reject modal state
  const [rejectModalPaymentId, setRejectModalPaymentId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectFile, setRejectFile] = useState<File | null>(null);
  const [rejectUploading, setRejectUploading] = useState(false);
  const [rejectPayer, setRejectPayer] = useState<{ id?: string; name?: string } | null>(null);
  const [rejectSendMessage, setRejectSendMessage] = useState(true);

  // Approve modal state (mandatory proof upload)
  const [approveModalPaymentId, setApproveModalPaymentId] = useState<string | null>(null);
  const [approveFile, setApproveFile] = useState<File | null>(null);
  const [approveReference, setApproveReference] = useState("");
  const [approveAmount, setApproveAmount] = useState("");
  const [approveDate, setApproveDate] = useState("");
  const [approveSenderBank, setApproveSenderBank] = useState("");
  const [approveNotes, setApproveNotes] = useState("");
  const [approveUploading, setApproveUploading] = useState(false);

  // Liquidation form state
  const [bankFee, setBankFee] = useState<number>(0);
  const [taxPercentage, setTaxPercentage] = useState<number>(0);
  const [otherDeductions, setOtherDeductions] = useState<number>(0);
  const [otherDeductionsDescription, setOtherDeductionsDescription] = useState("");
  const [copiedCBU, setCopiedCBU] = useState(false);

  // Advanced Filters
  const [period, setPeriod] = useState("monthly");
  const [completedPeriod, setCompletedPeriod] = useState("monthly");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Proof viewer modal (in-page image/PDF + message the payer)
  const [proofViewer, setProofViewer] = useState<{ url: string; title: string; userId?: string; userName?: string; paymentId?: string } | null>(null);
  const [proofImgError, setProofImgError] = useState(false);
  const [proofChatConvId, setProofChatConvId] = useState<string | null>(null);
  const [proofChatInput, setProofChatInput] = useState('');
  const [proofChatSending, setProofChatSending] = useState(false);
  const [proofChatMsg, setProofChatMsg] = useState<string | null>(null);
  // Notas de comprobante de pago (evidence attached by admins)
  const [proofNotes, setProofNotes] = useState<any[]>([]);
  const [noteCaption, setNoteCaption] = useState('');
  const [noteUploading, setNoteUploading] = useState(false);
  const [chatAttachments, setChatAttachments] = useState<{ url: string; type: string; fileName?: string }[]>([]);

  // Sorting
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const loadPayments = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(
        `/api/admin/pending-payments?period=${period}&sortBy=${sortBy}&sortOrder=${sortOrder}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      if (data.success) {
        // Data comes from data.report.data (backend response structure)
        setPayments(data.report?.data || data.data || []);
        setSummary(data.report?.summary || data.summary || null);
      }
    } catch (error) {
      console.error("Error loading payments:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCompletedPayments = async () => {
    try {
      setCompletedLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(
        `/api/admin/pending-payments/completed/list?period=${completedPeriod}&sortBy=paymentProcessedAt&sortOrder=${sortOrder}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      if (data.success) {
        setCompletedPayments(data.data || []);
        setCompletedSummary(data.summary || null);
      }
    } catch (error) {
      console.error("Error loading completed payments:", error);
    } finally {
      setCompletedLoading(false);
    }
  };

  const loadVerificationPayments = async () => {
    try {
      setVerificationLoading(true);
      const token = localStorage.getItem("token");

      // Build query params based on sub-filter
      const params = new URLSearchParams();
      if (appSubFilter === "all") {
        params.append("status", "all");
      } else if (appSubFilter === "pending") {
        params.append("status", "pending_verification");
      } else if (appSubFilter === "verified") {
        params.append("status", "verified");
      } else if (appSubFilter === "escrow") {
        params.append("status", "held_escrow");
      } else if (appSubFilter === "confirmed") {
        params.append("status", "confirmed_for_payout");
      } else if (appSubFilter === "disputed") {
        params.append("status", "disputed");
      } else if (appSubFilter === "rejected") {
        params.append("status", "rejected");
      }
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);
      if (minAmount) params.append("minAmount", minAmount);
      if (maxAmount) params.append("maxAmount", maxAmount);
      params.append("sortBy", sortBy);
      params.append("sortOrder", sortOrder);

      const response = await fetch(
        `/api/admin/payments/pending?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();
      if (data.success) {
        setVerificationPayments(data.data || []);
      }
    } catch (error) {
      console.error("Error loading verification payments:", error);
    } finally {
      setVerificationLoading(false);
    }
  };

  // Open the proof in an in-page modal (and prepare a chat with the payer)
  const openProofViewer = async (url: string, title: string, userId?: string, userName?: string, paymentId?: string) => {
    setProofViewer({ url: getImageUrl(url), title, userId, userName, paymentId });
    setProofImgError(false);
    setProofChatConvId(null);
    setProofChatInput('');
    setProofChatMsg(null);
    setProofNotes([]);
    setNoteCaption('');
    setChatAttachments([]);
    if (paymentId) loadProofNotes(paymentId);
    if (userId) {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch('/api/chat/conversations/find-or-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ participantId: userId }),
        });
        const data = await res.json();
        const conv = data.conversation || data.data;
        if (data.success && conv) {
          const cid = conv.id || conv._id;
          setProofChatConvId(cid);
          loadChatAttachments(cid);
        }
      } catch { /* chat is best-effort */ }
    }
  };

  // --- Notas de comprobante de pago ---
  const loadProofNotes = async (paymentId: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/payments/${paymentId}/proofs`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setProofNotes(data.notes || []);
    } catch { /* best-effort */ }
  };

  const postProofNote = async (paymentId: string, fileUrl: string, fileName: string, fileSize: number, caption: string) => {
    const token = localStorage.getItem("token");
    const res = await fetch(`/api/admin/payments/${paymentId}/proof-notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fileUrl, fileName, fileSize, caption }),
    });
    return res.json();
  };

  const addProofNoteFromFile = async (file: File) => {
    if (!proofViewer?.paymentId || noteUploading) return;
    setNoteUploading(true);
    try {
      const token = localStorage.getItem("token");
      const fd = new FormData();
      fd.append('file', file);
      const up = await fetch('/api/admin/payments/upload-proof', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
      const upData = await up.json();
      if (upData.success && upData.url) {
        await postProofNote(proofViewer.paymentId, upData.url, upData.originalName || file.name, upData.size || file.size, noteCaption);
        setNoteCaption('');
        await loadProofNotes(proofViewer.paymentId);
      }
    } catch { /* best-effort */ }
    setNoteUploading(false);
  };

  const addProofNoteFromUrl = async (fileUrl: string, fileName?: string) => {
    if (!proofViewer?.paymentId || noteUploading) return;
    setNoteUploading(true);
    try {
      await postProofNote(proofViewer.paymentId, fileUrl, fileName || fileUrl.split('/').pop() || 'adjunto', 0, noteCaption);
      setNoteCaption('');
      await loadProofNotes(proofViewer.paymentId);
    } catch { /* best-effort */ }
    setNoteUploading(false);
  };

  const loadChatAttachments = async (convId: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/chat/conversations/${convId}/messages?limit=40`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      const msgs: any[] = data.messages || data.data || [];
      const atts: { url: string; type: string; fileName?: string }[] = [];
      for (const m of msgs) {
        const u = m.fileUrl || m.metadata?.fileUrl;
        if (u && (m.type === 'image' || m.type === 'file' || /\.(png|jpe?g|pdf|webp)$/i.test(u))) {
          atts.push({ url: u, type: /\.pdf$/i.test(u) ? 'pdf' : 'image', fileName: m.fileName });
        }
      }
      setChatAttachments(atts);
    } catch { /* best-effort */ }
  };

  const sendProofMessage = async () => {
    if (!proofChatConvId || !proofChatInput.trim() || proofChatSending) return;
    setProofChatSending(true);
    setProofChatMsg(null);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/chat/conversations/${proofChatConvId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: proofChatInput.trim(), type: 'text' }),
      });
      const data = await res.json();
      if (data.success) {
        setProofChatInput('');
        setProofChatMsg('Mensaje enviado ✓');
      } else {
        setProofChatMsg((typeof data.message === 'string' && data.message) || 'No se pudo enviar el mensaje');
      }
    } catch {
      setProofChatMsg('Error de red al enviar el mensaje');
    }
    setProofChatSending(false);
  };

  // Abrir modal de aprobación (Step 1: requiere comprobante + datos)
  const handleApproveVerificationPayment = (paymentId: string, payment?: any) => {
    setApproveModalPaymentId(paymentId);
    setApproveFile(null);
    // Auto-fill with the information we already have from the client's uploaded proof
    const proof = payment?.proofs?.[0] || {};
    setApproveReference(proof.binanceTransactionId || proof.transferReference || "");
    setApproveAmount(
      payment?.amount != null ? String(payment.amount)
      : proof.transferAmount != null ? String(proof.transferAmount)
      : ""
    );
    setApproveDate(proof.uploadedAt ? new Date(proof.uploadedAt).toISOString().slice(0, 10) : "");
    setApproveSenderBank(proof.senderBankName || "");
    setApproveNotes("");
  };

  // Confirmar aprobación desde modal
  const handleConfirmApprove = async () => {
    if (!approveModalPaymentId) return;
    if (!approveFile) {
      alert("Debes subir el comprobante de pago");
      return;
    }
    if (!approveReference.trim()) {
      alert("Debes ingresar el número de referencia / ID de transacción");
      return;
    }
    if (!approveAmount.trim()) {
      alert("Debes ingresar el monto recibido");
      return;
    }
    if (!approveDate.trim()) {
      alert("Debes ingresar la fecha de la transferencia");
      return;
    }

    try {
      setApproveUploading(true);
      const token = localStorage.getItem("token");

      // 1. Upload proof file
      const formData = new FormData();
      formData.append("file", approveFile);
      const uploadResponse = await fetch("/api/admin/payments/upload-proof", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const uploadData = await uploadResponse.json();
      if (!uploadData.success) {
        throw new Error(uploadData.message || "Error al subir comprobante");
      }

      // 2. Approve payment with proof data
      const response = await fetch(`/api/admin/payments/${approveModalPaymentId}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          proofUrl: uploadData.url,
          bankReference: approveReference,
          transferAmount: approveAmount,
          transferDate: approveDate,
          senderBankName: approveSenderBank,
          notes: approveNotes || "Comprobante verificado por admin",
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert("✅ Comprobante verificado. Ahora debes verificar el escrow para que el contrato pueda continuar.");
        setApproveModalPaymentId(null);
        loadVerificationPayments();
      } else {
        alert(data.message || "Error al aprobar el pago");
      }
    } catch (error: any) {
      console.error("Error approving payment:", error);
      alert(error.message || "Error al aprobar el pago");
    } finally {
      setApproveUploading(false);
    }
  };

  // Verificar Escrow (Step 2: mover a escrow después de verificar comprobante)
  const handleVerifyEscrow = async (paymentId: string) => {
    if (!confirm("¿Confirmas que el dinero está en la cuenta de la plataforma y se puede poner en escrow? El contrato podrá continuar.")) return;

    try {
      setApprovingPaymentId(paymentId);
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/payments/${paymentId}/verify-escrow`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notes: "Escrow verificado por admin",
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert("✅ Escrow verificado. El pago está asegurado y el contrato puede continuar.");
        loadVerificationPayments();
      } else {
        alert(data.message || "Error al verificar escrow");
      }
    } catch (error) {
      console.error("Error verifying escrow:", error);
      alert("Error al verificar escrow");
    } finally {
      setApprovingPaymentId(null);
    }
  };

  // Confirmar para Pago a Trabajador (Step 3: mover de escrow a pendiente de pago)
  const handleConfirmForPayout = async (paymentId: string) => {
    if (!confirm("¿Confirmas que este pago debe pasar a 'Pagos a Trabajadores (Pendiente)'? Esto indica que el trabajo fue completado y el pago al trabajador está listo para procesarse.")) return;

    try {
      setApprovingPaymentId(paymentId);
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/payments/${paymentId}/confirm-for-payout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notes: "Confirmado para pago por admin",
        }),
      });

      const data = await response.json();
      if (data.success) {
        alert("✅ Pago confirmado. Ahora aparece en 'Pagos a Trabajadores - Pendiente' para procesar la transferencia al trabajador.");
        loadVerificationPayments();
      } else {
        alert(data.message || "Error al confirmar para pago");
      }
    } catch (error) {
      console.error("Error confirming for payout:", error);
      alert("Error al confirmar para pago");
    } finally {
      setApprovingPaymentId(null);
    }
  };

  // Abrir modal de rechazo
  const handleRejectVerificationPayment = (paymentId: string, payment?: any) => {
    setRejectModalPaymentId(paymentId);
    setRejectReason("");
    setRejectFile(null);
    setRejectSendMessage(true);
    setRejectPayer(payment?.payer ? { id: payment.payer.id, name: payment.payer.name } : null);
  };

  // Send a chat message to a user (find-or-create conversation, then post).
  const sendChatMessageTo = async (userId: string, content: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch('/api/chat/conversations/find-or-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ participantId: userId }),
      });
      const data = await res.json();
      const conv = data.conversation || data.data;
      const convId = conv?.id || conv?._id;
      if (!convId) return;
      await fetch(`/api/chat/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content, type: 'text' }),
      });
    } catch { /* best-effort */ }
  };

  // Confirmar rechazo desde modal
  const handleConfirmReject = async () => {
    if (!rejectModalPaymentId) return;
    if (!rejectReason.trim()) {
      alert("Debes ingresar un motivo de rechazo");
      return;
    }

    try {
      setRejectUploading(true);
      const token = localStorage.getItem("token");

      // Si hay archivo, primero subirlo
      let attachmentUrl = null;
      if (rejectFile) {
        const formData = new FormData();
        formData.append("file", rejectFile);
        formData.append("type", "rejection_evidence");

        const uploadResponse = await fetch("/api/admin/pending-payments/upload-proof", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        const uploadData = await uploadResponse.json();
        if (uploadData.success) {
          attachmentUrl = uploadData.fileUrl;
        }
      }

      // Rechazar el pago
      const response = await fetch(`/api/admin/payments/${rejectModalPaymentId}/reject`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: rejectReason,
          notes: attachmentUrl ? `Adjunto: ${attachmentUrl}` : undefined,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Rechazar + mensaje en un paso: avisar al usuario por chat con el motivo
        if (rejectSendMessage && rejectPayer?.id) {
          await sendChatMessageTo(
            rejectPayer.id,
            `Rechazamos el comprobante de tu pago. Motivo: ${rejectReason.trim()}. Por favor revisá e intentá nuevamente subiendo un comprobante válido de la transferencia (que se vean monto, fecha y número de operación).`
          );
        }
        alert("✅ Pago rechazado." + (rejectSendMessage && rejectPayer?.id ? " Se envió un mensaje al usuario con el motivo." : ""));
        setRejectModalPaymentId(null);
        setRejectReason("");
        setRejectFile(null);
        setRejectPayer(null);
        loadVerificationPayments();
      } else {
        alert(data.message || "Error al rechazar el pago");
      }
    } catch (error) {
      console.error("Error rejecting payment:", error);
      alert("Error al rechazar el pago");
    } finally {
      setRejectUploading(false);
    }
  };

  // Cancelar rechazo de pago
  const handleCancelReject = async (paymentId: string) => {
    if (!confirm("¿Cancelar el rechazo de este pago? El pago volverá a 'Pendiente de Verificación' para ser revisado nuevamente.")) return;

    try {
      setApprovingPaymentId(paymentId);
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/payments/${paymentId}/cancel-reject`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes: "Rechazo cancelado por admin" }),
      });

      const data = await response.json();
      if (data.success) {
        alert("✅ Rechazo cancelado. El pago volvió a 'Pendiente de Verificación'.");
        loadVerificationPayments();
      } else {
        alert(data.message || "Error al cancelar el rechazo");
      }
    } catch (error) {
      console.error("Error canceling reject:", error);
      alert("Error al cancelar el rechazo");
    } finally {
      setApprovingPaymentId(null);
    }
  };

  const loadRefunds = async () => {
    setRefundsLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/admin/payments/refunds?limit=100`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setRefunds(data.data?.refunds || []);
    } catch { /* best-effort */ }
    setRefundsLoading(false);
  };

  const reloadActive = () => {
    if (activeTab === "app") {
      loadVerificationPayments();
    } else if (activeTab === "refunds") {
      loadRefunds();
    } else if (workersSubFilter === "paid") {
      loadCompletedPayments();
    } else {
      loadPayments();
    }
  };

  // Immediate reload on tab / sub-filter / sort / period changes.
  useEffect(() => {
    reloadActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, completedPeriod, sortBy, sortOrder, activeTab, appSubFilter, workersSubFilter]);

  // Debounced reload for the amount/date filters — typing a min/max amount no
  // longer refetches (and collapses the panel) on every keystroke.
  const didMountFilters = useRef(false);
  useEffect(() => {
    if (!didMountFilters.current) {
      didMountFilters.current = true;
      return;
    }
    const t = setTimeout(reloadActive, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, minAmount, maxAmount]);

  // Advanced filters are shared UI, but shouldn't leak from one tab into the
  // other — reset them when switching between "app" and "workers".
  const didMountTab = useRef(false);
  useEffect(() => {
    if (!didMountTab.current) {
      didMountTab.current = true;
      return;
    }
    setDateFrom("");
    setDateTo("");
    setMinAmount("");
    setMaxAmount("");
  }, [activeTab]);

  const handleViewPayment = async (contractId: string) => {
    try {
      setActionLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/pending-payments/${contractId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      console.log("[DEBUG] handleViewPayment response:", data);
      if (data.success) {
        // API returns data.data, not data.paymentDetails
        setSelectedPayment(data.data || data.paymentDetails);
        setShowModal(true);
      } else {
        console.error("Error loading payment details:", data.message);
        alert(data.message || "Error al cargar los detalles del pago");
      }
    } catch (error) {
      console.error("Error loading payment details:", error);
      alert("Error al cargar los detalles del pago");
    } finally {
      setActionLoading(false);
    }
  };

  // Calculate final amount after all deductions
  const calculateFinalAmount = () => {
    if (!selectedPayment) return 0;
    const grossAmount = selectedPayment.contract.price;
    const platformCommission = selectedPayment.contract.commission;
    const netBeforeDeductions = grossAmount - platformCommission;
    const taxAmount = netBeforeDeductions * (taxPercentage / 100);
    const finalAmount = netBeforeDeductions - bankFee - taxAmount - otherDeductions;
    return Math.max(0, finalAmount);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCBU(true);
      setTimeout(() => setCopiedCBU(false), 2000);
    } catch (err) {
      console.error("Error copying to clipboard:", err);
    }
  };

  // Reset liquidation form when modal opens
  const handleViewPaymentWithReset = async (contractId: string) => {
    setBankFee(0);
    setTaxPercentage(0);
    setOtherDeductions(0);
    setOtherDeductionsDescription("");
    setPaymentProof(null);
    setAdminNotes("");
    await handleViewPayment(contractId);
  };

  const handleMarkAsPaid = async (contractId: string, skipConfirm = false) => {
    if (!skipConfirm && !confirm("¿Confirmas que el pago al trabajador fue realizado mediante transferencia bancaria?")) return;

    try {
      setMarkingPaidId(contractId);
      const token = localStorage.getItem("token");

      // If there's a payment proof file, upload it first
      let proofUrl = "";
      if (paymentProof) {
        const formData = new FormData();
        formData.append("file", paymentProof);
        const uploadRes = await fetch("/api/admin/pending-payments/upload-proof", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (uploadData.success && uploadData.url) {
          proofUrl = uploadData.url;
        } else {
          throw new Error(uploadData.message || "Error al subir comprobante");
        }
      }

      const response = await fetch(`/api/admin/pending-payments/${contractId}/mark-paid`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paymentMethod: "bank_transfer",
          proofOfPayment: proofUrl,
          adminNotes: adminNotes || "Pago procesado manualmente",
          deductions: {
            bankFee,
            taxPercentage,
            taxAmount: (selectedPayment ? (selectedPayment.contract.price - selectedPayment.contract.commission) * (taxPercentage / 100) : 0),
            otherDeductions,
            otherDeductionsDescription,
            finalAmountPaid: calculateFinalAmount(),
          }
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Reload the appropriate list based on current view
        loadPayments();
        // Also reload completed payments to show the newly completed payment there
        loadCompletedPayments();
        if (showModal) {
          setShowModal(false);
          setSelectedPayment(null);
          setPaymentProof(null);
          setAdminNotes("");
        }
        alert("✅ Pago marcado como completado. El registro se ha movido a la pestaña 'Pagados'.");
      } else {
        alert(data.message || "Error al marcar pago");
      }
    } catch (error) {
      console.error("Error marking payment:", error);
      alert("Error al marcar pago como completado");
    } finally {
      setMarkingPaidId(null);
    }
  };

  // Fix stuck payment status - when proof exists but payment still in pending
  const handleFixPaymentStatus = async (contractId: string) => {
    if (!confirm("¿Corregir el estado de este pago? Esto marcará todos los payments asociados como completados.")) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`/api/admin/pending-payments/${contractId}/fix-status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      if (data.success) {
        alert(`✅ Estado corregido. ${data.paymentsUpdated} pagos actualizados.`);
        loadPayments();
        loadCompletedPayments();
      } else {
        alert(data.message || "Error al corregir estado");
      }
    } catch (error) {
      console.error("Error fixing payment status:", error);
      alert("Error al corregir estado del pago");
    }
  };

  const handleExportXLSX = async () => {
    try {
      // Create workbook and worksheet
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'DoApp';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Pagos Pendientes');

      // Define columns with headers and widths
      worksheet.columns = [
        { header: 'ID Contrato', key: 'contractId', width: 36 },
        { header: '# Contrato', key: 'contractNumber', width: 12 },
        { header: 'ID Trabajo', key: 'jobId', width: 36 },
        { header: 'Título Trabajo', key: 'jobTitle', width: 30 },
        { header: 'Cliente', key: 'clientName', width: 20 },
        { header: 'Email Cliente', key: 'clientEmail', width: 25 },
        { header: 'Trabajador', key: 'workerName', width: 20 },
        { header: 'Email Trabajador', key: 'workerEmail', width: 25 },
        { header: 'DNI Trabajador', key: 'workerDni', width: 12 },
        { header: 'Teléfono', key: 'workerPhone', width: 15 },
        { header: 'Banco', key: 'bankName', width: 20 },
        { header: 'Titular Cuenta', key: 'accountHolder', width: 20 },
        { header: 'Tipo Cuenta', key: 'accountType', width: 12 },
        { header: 'CBU', key: 'cbu', width: 25 },
        { header: 'Alias', key: 'alias', width: 20 },
        { header: 'Monto a Pagar', key: 'amountToPay', width: 15 },
        { header: 'Comisión', key: 'commission', width: 12 },
        { header: '% del Presupuesto', key: 'percentageOfBudget', width: 15 },
        { header: 'Total Contrato', key: 'totalContractAmount', width: 15 },
        { header: 'Estado Pago', key: 'paymentStatus', width: 15 },
        { header: 'Estado Escrow', key: 'escrowStatus', width: 15 },
        { header: 'Fecha Completado', key: 'completedAt', width: 15 },
      ];

      // Style header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E7FF' }
      };

      // Flatten workers into rows - one row per worker
      payments.forEach((payment) => {
        payment.workers.forEach((worker) => {
          worksheet.addRow({
            contractId: payment.contractId,
            contractNumber: payment.contractNumber,
            jobId: payment.jobId,
            jobTitle: payment.jobTitle,
            clientName: payment.clientName,
            clientEmail: payment.clientEmail,
            workerName: worker.workerName,
            workerEmail: worker.workerEmail,
            workerDni: worker.workerDni || '',
            workerPhone: worker.workerPhone || '',
            bankName: worker.bankingInfo?.bankName || '',
            accountHolder: worker.bankingInfo?.accountHolder || '',
            accountType: worker.bankingInfo?.accountType || '',
            cbu: worker.bankingInfo?.cbu || '',
            alias: worker.bankingInfo?.alias || '',
            amountToPay: worker.amountToPay,
            commission: worker.commission,
            percentageOfBudget: worker.percentageOfBudget || 100,
            totalContractAmount: payment.totalContractAmount,
            paymentStatus: payment.paymentStatus,
            escrowStatus: payment.escrowStatus,
            completedAt: new Date(payment.completedAt).toLocaleDateString('es-AR'),
          });
        });
      });

      // Generate buffer and download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pagos-pendientes-${period}-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error exporting XLSX:", error);
      alert("Error al exportar Excel");
    }
  };

  const getPaymentStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      held: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      escrow: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
      pending_payout: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
      released: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300", // Legacy - treat as pending_payout
      completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    };
    return badges[status] || badges.pending;
  };

  const getPaymentStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "Pendiente",
      held: "En Escrow",
      escrow: "En Escrow",
      pending_payout: "Pendiente de Pago",
      released: "Pendiente de Pago", // Legacy - treat as pending_payout
      completed: "Completado",
    };
    return labels[status] || status;
  };

  const getEscrowStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      verified: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      held_escrow: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      released: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
      refunded: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    };
    return badges[status] || "bg-gray-100 text-gray-800";
  };

  const getEscrowStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      verified: "Verificado",
      held_escrow: "En Escrow",
      released: "Liberado",
      refunded: "Reembolsado",
    };
    return labels[status] || status;
  };

  // Helper for sortable column headers
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const SortableHeader = ({ field, children, className = "" }: { field: string; children: React.ReactNode; className?: string }) => (
    <th
      className={`px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition select-none ${className}`}
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortBy === field && (
          <span className="text-sky-500">
            {sortOrder === "asc" ? "↑" : "↓"}
          </span>
        )}
      </div>
    </th>
  );

  // Initial loading state check - only show spinner if first load
  const isInitialLoading = (activeTab === "app" && verificationLoading && verificationPayments.length === 0) ||
                           (activeTab === "workers" && workersSubFilter === "pending" && loading && payments.length === 0) ||
                           (activeTab === "workers" && workersSubFilter === "paid" && completedLoading && completedPayments.length === 0);

  if (isInitialLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Gestión de Pagos</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Administra los pagos entrantes y salientes de la plataforma
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (activeTab === "app") loadVerificationPayments();
              else if (workersSubFilter === "paid") loadCompletedPayments();
              else loadPayments();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
          {activeTab === "workers" && workersSubFilter === "pending" && (
            <button
              onClick={handleExportXLSX}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition"
            >
              <Download className="h-4 w-4" />
              Exportar Excel
            </button>
          )}
        </div>
      </div>

      {/* Main Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-6">
          <button
            onClick={() => setActiveTab("app")}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
              activeTab === "app"
                ? "border-purple-500 text-purple-600 dark:text-purple-400"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            <DollarSign className="h-5 w-5" />
            Pagos a la App
            {verificationPayments.length > 0 && appSubFilter === "pending" && (
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                {verificationPayments.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("workers")}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
              activeTab === "workers"
                ? "border-sky-500 text-sky-600 dark:text-sky-400"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            <Users className="h-5 w-5" />
            Pagos a Trabajadores
            {summary && summary.totalContracts > 0 && workersSubFilter === "pending" && (
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                {summary.totalContracts}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("refunds")}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
              activeTab === "refunds"
                ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
            }`}
          >
            <ArrowDownCircle className="h-5 w-5" />
            Devoluciones
            {refunds.length > 0 && (
              <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {refunds.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar por nombre, email, ID, monto..."
          className="w-full pl-9 pr-9 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <XCircle className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Sub-filters for active tab */}
      {activeTab === "app" && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Estado:</span>
          <button
            onClick={() => setAppSubFilter("all")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              appSubFilter === "all"
                ? "bg-slate-200 text-slate-800 dark:bg-slate-600 dark:text-slate-100"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
            }`}
          >
            <span className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              Todos
            </span>
          </button>
          <button
            onClick={() => setAppSubFilter("pending")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              appSubFilter === "pending"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
            }`}
          >
            <span className="flex items-center gap-1">
              <AlertCircle className="h-3.5 w-3.5" />
              Pendiente Verificación
            </span>
          </button>
          <button
            onClick={() => setAppSubFilter("verified")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              appSubFilter === "verified"
                ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
            }`}
          >
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5" />
              Verificado
            </span>
          </button>
          <button
            onClick={() => setAppSubFilter("escrow")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              appSubFilter === "escrow"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
            }`}
          >
            <span className="flex items-center gap-1">
              <DollarSign className="h-3.5 w-3.5" />
              En Escrow
            </span>
          </button>
          <button
            onClick={() => setAppSubFilter("confirmed")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              appSubFilter === "confirmed"
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
            }`}
          >
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5" />
              Confirmado para Pago
            </span>
          </button>
          <button
            onClick={() => setAppSubFilter("disputed")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              appSubFilter === "disputed"
                ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
            }`}
          >
            <span className="flex items-center gap-1">
              <XCircle className="h-3.5 w-3.5" />
              En Disputa
            </span>
          </button>
          <button
            onClick={() => setAppSubFilter("rejected")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              appSubFilter === "rejected"
                ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
            }`}
          >
            <span className="flex items-center gap-1">
              <Ban className="h-3.5 w-3.5" />
              Rechazados
            </span>
          </button>
        </div>
      )}

      {activeTab === "workers" && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-500 dark:text-gray-400 mr-2">Estado:</span>
          <button
            onClick={() => setWorkersSubFilter("pending")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              workersSubFilter === "pending"
                ? "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
            }`}
          >
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Pendiente de Pago
            </span>
          </button>
          <button
            onClick={() => setWorkersSubFilter("paid")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              workersSubFilter === "paid"
                ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
            }`}
          >
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3.5 w-3.5" />
              Pagados
            </span>
          </button>
          <button
            onClick={() => setWorkersSubFilter("disputed")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              workersSubFilter === "disputed"
                ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
            }`}
          >
            <span className="flex items-center gap-1">
              <XCircle className="h-3.5 w-3.5" />
              En Disputa
            </span>
          </button>
        </div>
      )}

      {/* Advanced Filters - Collapsible (controlled so a re-fetch/re-render
          triggered while typing an amount doesn't collapse it) */}
      <details
        open={filtersOpen}
        onToggle={(e) => setFiltersOpen((e.target as HTMLDetailsElement).open)}
        className="bg-white dark:bg-gray-800 rounded-lg shadow"
      >
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Filtros Avanzados
        </summary>
        <div className="px-4 pb-4 pt-2 border-t border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Date From */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Desde
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
              />
            </div>
            {/* Date To */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Hasta
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
              />
            </div>
            {/* Min Amount */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Monto Mínimo
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  placeholder="0"
                  className="w-full pl-7 pr-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
                />
              </div>
            </div>
            {/* Max Amount */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Monto Máximo
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                  placeholder="∞"
                  className="w-full pl-7 pr-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </div>
          {/* Clear filters button */}
          {(dateFrom || dateTo || minAmount || maxAmount) && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                  setMinAmount("");
                  setMaxAmount("");
                }}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      </details>

      {/* App Payments Tab Content (Pagos a la App) */}
      {activeTab === "app" && (
        <>
          {verificationLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Tipo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Pagador
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Trabajador
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Concepto
                      </th>
                      <SortableHeader field="amount">Comisión</SortableHeader>
                      <SortableHeader field="amount">Total Esperado</SortableHeader>
                      <SortableHeader field="status">Estado Contrato</SortableHeader>
                      <SortableHeader field="createdAt">Fecha</SortableHeader>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Comprobante
                      </th>
                      {appSubFilter === "rejected" && (
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Motivo Rechazo
                        </th>
                      )}
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {verificationPayments.length === 0 ? (
                      <tr>
                        <td colSpan={appSubFilter === "rejected" ? 11 : 10} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          {appSubFilter === "pending" && "No hay pagos pendientes de verificación"}
                          {appSubFilter === "verified" && "No hay pagos verificados pendientes de escrow"}
                          {appSubFilter === "escrow" && "No hay pagos en escrow pendientes de confirmación"}
                          {appSubFilter === "confirmed" && "No hay pagos confirmados para pago"}
                          {appSubFilter === "disputed" && "No hay pagos en disputa"}
                          {appSubFilter === "rejected" && "No hay pagos rechazados"}
                        </td>
                      </tr>
                    ) : (
                      verificationPayments.filter(matchesQuery).map((payment: any) => {
                        // Obtener datos del contrato
                        const contractPrice = payment.contract?.price ? parseFloat(payment.contract.price) : 0;
                        const contractCommission = payment.contract?.commission ? parseFloat(payment.contract.commission) : 0;

                        // Comisión: usar del contrato (tiene el valor correcto)
                        const commission = contractCommission || payment.platformFee || (contractPrice * 0.10);

                        // Monto para el trabajador (precio del contrato)
                        const workerAmount = contractPrice || payment.amount || 0;

                        // Total esperado = precio + comisión (lo que el cliente pagó a la plataforma)
                        const totalExpected = workerAmount + commission;

                        const contractStatus = payment.contract?.status;
                        const clientConfirmed = payment.contract?.clientConfirmed;
                        const doerConfirmed = payment.contract?.doerConfirmed;

                        // Porcentaje de comisión
                        const commissionPercentage = workerAmount > 0 ? ((commission / workerAmount) * 100).toFixed(1) : '10';

                        return (
                        <tr key={payment.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              {payment.isMercadoPago ? (
                                <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                  MercadoPago
                                </span>
                              ) : (
                                <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                  Transferencia
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {payment.payer?.name || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {payment.payer?.email || 'N/A'}
                            </div>
                            <IdBadge id={payment.id} />
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {payment.recipient?.name || payment.contract?.doer?.name || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {payment.recipient?.email || payment.contract?.doer?.email || 'N/A'}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {payment.displayInfo?.title || payment.contract?.job?.title || 'Pago'}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {payment.paymentType === 'job_publication' ? 'Publicación de trabajo' :
                               payment.paymentType === 'contract_payment' ? 'Pago de contrato' :
                               payment.paymentType}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm font-medium text-purple-600 dark:text-purple-400">
                              ${commission?.toLocaleString('es-AR')}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {commissionPercentage}%
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm font-bold text-green-600 dark:text-green-400">
                              ${totalExpected?.toLocaleString('es-AR')}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              Trabajador: ${workerAmount?.toLocaleString('es-AR')}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-1">
                              {/* Estado del contrato */}
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                contractStatus === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                contractStatus === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                              }`}>
                                {contractStatus === 'completed' ? 'Completado' :
                                 contractStatus === 'in_progress' ? 'En Progreso' :
                                 contractStatus === 'awaiting_confirmation' ? 'Esperando Confirm.' :
                                 contractStatus || 'Pendiente'}
                              </span>
                              {/* Confirmaciones de trabajo */}
                              <div className="flex items-center gap-1 text-xs mt-1">
                                {clientConfirmed ? (
                                  <CheckCircle className="h-3 w-3 text-green-500" />
                                ) : (
                                  <XCircle className="h-3 w-3 text-gray-400" />
                                )}
                                <span className="text-gray-600 dark:text-gray-400">Cliente</span>
                                {doerConfirmed ? (
                                  <CheckCircle className="h-3 w-3 text-green-500 ml-2" />
                                ) : (
                                  <XCircle className="h-3 w-3 text-gray-400 ml-2" />
                                )}
                                <span className="text-gray-600 dark:text-gray-400">Trabajador</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {new Date(payment.createdAt).toLocaleDateString("es-AR")}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(payment.createdAt).toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {payment.proofs && payment.proofs.length > 0 ? (
                              <button
                                onClick={() => openProofViewer(
                                  payment.proofs![0].fileUrl,
                                  `Comprobante · ${payment.proofs![0].clientName || ''}`,
                                  payment.proofs![0].clientId,
                                  payment.proofs![0].clientName,
                                  payment.id,
                                )}
                                className="inline-flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700 dark:text-sky-400"
                              >
                                <Receipt className="h-4 w-4" />
                                Ver
                              </button>
                            ) : payment.isMercadoPago ? (
                              <span className="text-xs text-blue-500 dark:text-blue-400">
                                MercadoPago
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">Sin comprobante</span>
                            )}
                          </td>
                          {appSubFilter === "rejected" && (
                            <td className="px-4 py-4">
                              {payment.adminNotes ? (
                                <div className="max-w-xs">
                                  <div className="text-sm text-red-600 dark:text-red-400">
                                    {/* Extraer razón de rechazo de adminNotes */}
                                    {payment.adminNotes.includes('[Rechazado]')
                                      ? payment.adminNotes.replace('[Rechazado] ', '').split('\n')[0]
                                      : payment.adminNotes}
                                  </div>
                                  {/* Mostrar si hay adjunto */}
                                  {payment.adminNotes.includes('Adjunto:') && (
                                    <a
                                      href={payment.adminNotes.match(/Adjunto: (https?:\/\/[^\s]+)/)?.[1] || '#'}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-sky-600 hover:text-sky-700 dark:text-sky-400 mt-1"
                                    >
                                      <FileImage className="h-3 w-3" />
                                      Ver evidencia
                                    </a>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">Sin motivo registrado</span>
                              )}
                            </td>
                          )}
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              {payment.contract?.id && (
                                <button
                                  onClick={() => window.location.href = `/admin/contracts?id=${payment.contract.id}`}
                                  className="p-1.5 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded"
                                  title="Ver contrato"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                              )}
                              {/* Show approve/reject buttons for pending payments */}
                              {appSubFilter === "pending" && (
                                <>
                                  <button
                                    onClick={() => handleApproveVerificationPayment(payment.id, payment)}
                                    disabled={approvingPaymentId === payment.id}
                                    className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded disabled:opacity-50"
                                    title="Verificar comprobante"
                                  >
                                    {approvingPaymentId === payment.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <CheckCircle className="h-4 w-4" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => handleRejectVerificationPayment(payment.id, payment)}
                                    disabled={rejectingPaymentId === payment.id}
                                    className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
                                    title="Rechazar pago"
                                  >
                                    {rejectingPaymentId === payment.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <XCircle className="h-4 w-4" />
                                    )}
                                  </button>
                                </>
                              )}
                              {/* Show verify escrow button for verified payments */}
                              {appSubFilter === "verified" && (
                                <button
                                  onClick={() => handleVerifyEscrow(payment.id)}
                                  disabled={approvingPaymentId === payment.id}
                                  className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1"
                                  title="Verificar Escrow"
                                >
                                  {approvingPaymentId === payment.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <DollarSign className="h-4 w-4" />
                                      Verificar Escrow
                                    </>
                                  )}
                                </button>
                              )}
                              {/* Show confirm for payout button for escrow payments */}
                              {appSubFilter === "escrow" && (
                                <button
                                  onClick={() => handleConfirmForPayout(payment.id)}
                                  disabled={approvingPaymentId === payment.id}
                                  className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1"
                                  title="Confirmar para Pago a Trabajador"
                                >
                                  {approvingPaymentId === payment.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <CheckCircle className="h-4 w-4" />
                                      Confirmar para Pago
                                    </>
                                  )}
                                </button>
                              )}
                              {/* Show cancel reject button for rejected payments */}
                              {appSubFilter === "rejected" && (
                                <button
                                  onClick={() => handleCancelReject(payment.id)}
                                  disabled={approvingPaymentId === payment.id}
                                  className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-1"
                                  title="Cancelar rechazo y volver a pendiente de verificación"
                                >
                                  {approvingPaymentId === payment.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <RotateCcw className="h-4 w-4" />
                                      Cancelar Rechazo
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );})
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Workers Payments Tab Content (Pagos a Trabajadores) */}
      {activeTab === "workers" && workersSubFilter === "pending" && (
        <>
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Período
                </label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
                >
                  <option value="daily">Hoy</option>
                  <option value="weekly">Esta Semana</option>
                  <option value="monthly">Este Mes</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Ordenar por
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
                >
                  <option value="completedAt">Fecha Completado</option>
                  <option value="amount">Monto</option>
                  <option value="workerCount">Cant. Trabajadores</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Orden
                </label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
                >
                  <option value="desc">Más reciente</option>
                  <option value="asc">Más antiguo</option>
                </select>
              </div>
            </div>
          </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Contratos</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {summary.totalContracts}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Trabajadores</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {summary.totalWorkers}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                <DollarSign className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Total a Pagar</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  ${summary.totalAmountToPay.toLocaleString('es-AR')}
                </div>
              </div>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <CreditCard className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Comisiones</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  ${summary.totalCommissionCollected.toLocaleString('es-AR')}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payments Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Trabajo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Cliente
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Trabajadores
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Monto / Comisión
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Pago Verificado
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Comprobante
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No hay pagos pendientes en este período
                  </td>
                </tr>
              ) : (
                payments.filter(matchesQuery).map((payment) => (
                  <tr key={payment.contractId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      {payment.contractNumber}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {payment.jobTitle}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        ID: {payment.jobId.slice(0, 8)}...
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {payment.clientName}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {payment.clientEmail}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-900 dark:text-white">
                          {payment.workers.length}
                        </span>
                      </div>
                      {payment.workers.slice(0, 2).map((w, i) => (
                        <div key={i} className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[150px]">
                          {w.workerName}
                        </div>
                      ))}
                      {payment.workers.length > 2 && (
                        <div className="text-xs text-gray-400">
                          +{payment.workers.length - 2} más
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm font-medium text-green-600 dark:text-green-400">
                        ${payment.totalContractAmount.toLocaleString('es-AR')}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Com: ${payment.totalCommission.toLocaleString('es-AR')}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1">
                        {payment.commissionVerified ? (
                          <div className="flex items-center gap-1">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                              Verificado
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <AlertCircle className="h-4 w-4 text-amber-500" />
                            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                              Pendiente
                            </span>
                          </div>
                        )}
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {payment.paymentRecordStatus === 'pending_verification' && '→ Ir a Verificación'}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      {payment.workerPaymentProofUrl ? (
                        <a
                          href={getImageUrl(payment.workerPaymentProofUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-green-600 hover:text-green-700 dark:text-green-400"
                          title="Comprobante de pago al trabajador"
                        >
                          <Receipt className="h-4 w-4" />
                          Pagado
                        </a>
                      ) : payment.proofs && payment.proofs.length > 0 ? (
                        <a
                          href={getImageUrl(payment.proofs[0].fileUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700 dark:text-sky-400"
                          title="Comprobante del cliente"
                        >
                          <Receipt className="h-4 w-4" />
                          Cliente
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">Sin comprobante</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {new Date(payment.completedAt).toLocaleDateString("es-AR")}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(payment.completedAt).toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleViewPaymentWithReset(payment.contractId)}
                          className="p-1.5 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded"
                          title="Ver detalles"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        {payment.commissionVerified && payment.paymentStatus !== 'completed' && !payment.workerPaymentProofUrl && (
                          <button
                            onClick={() => handleViewPaymentWithReset(payment.contractId)}
                            disabled={markingPaidId === payment.contractId}
                            className="flex items-center gap-1 px-2 py-1 text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 rounded disabled:opacity-50"
                            title="Procesar pago al trabajador"
                          >
                            {markingPaidId === payment.contractId ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Upload className="h-4 w-4" />
                                Pagar
                              </>
                            )}
                          </button>
                        )}
                        {/* Show fix button when there's proof but payment is still pending */}
                        {payment.workerPaymentProofUrl && payment.paymentRecordStatus !== 'completed' && (
                          <button
                            onClick={() => handleFixPaymentStatus(payment.contractId)}
                            className="flex items-center gap-1 px-2 py-1 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded"
                            title="Corregir estado - tiene comprobante pero sigue pendiente"
                          >
                            <AlertCircle className="h-4 w-4" />
                            Corregir
                          </button>
                        )}
                        {!payment.commissionVerified && (
                          <span className="text-xs text-amber-500" title="Primero debe verificarse el pago en la pestaña de Verificación">
                            ⚠️
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {/* Completed Payments Tab Content (inside Workers tab with "paid" sub-filter) */}
      {activeTab === "workers" && workersSubFilter === "paid" && (
        <>
          {/* Filters for Completed */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Período
                </label>
                <select
                  value={completedPeriod}
                  onChange={(e) => setCompletedPeriod(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
                >
                  <option value="daily">Hoy</option>
                  <option value="weekly">Esta Semana</option>
                  <option value="monthly">Este Mes</option>
                  <option value="all">Todo el historial</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Orden
                </label>
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 text-gray-900 dark:text-white"
                >
                  <option value="desc">Más reciente</option>
                  <option value="asc">Más antiguo</option>
                </select>
              </div>
            </div>
          </div>

          {/* Completed Summary Stats */}
          {completedSummary && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Pagos Realizados</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      {completedSummary.totalPayments}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                    <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Total Bruto</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      ${completedSummary.totalGrossAmount.toLocaleString('es-AR')}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <CreditCard className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Comisiones</div>
                    <div className="text-2xl font-bold text-gray-900 dark:text-white">
                      ${completedSummary.totalCommission.toLocaleString('es-AR')}
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                    <Banknote className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">Total Pagado</div>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      ${completedSummary.totalNetPaid.toLocaleString('es-AR')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Completed Payments Table */}
          {completedLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        #
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Trabajo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Trabajador
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Banco / CBU
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Monto
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Procesado por
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Fecha Pago
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Comprobante
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {completedPayments.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                          No hay pagos completados en este período
                        </td>
                      </tr>
                    ) : (
                      completedPayments.filter(matchesQuery).map((payment) => (
                        <tr key={payment.contractId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-white">
                            {payment.rowNumber}
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {payment.jobTitle}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {payment.clientName}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {payment.workerName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {payment.workerEmail}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-xs text-gray-900 dark:text-white">
                              {payment.bankName}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                              {payment.cbu !== 'N/A' ? `${payment.cbu.slice(0, 8)}...` : 'N/A'}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm font-medium text-green-600 dark:text-green-400">
                              ${payment.netAmount.toLocaleString('es-AR')}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              Com: ${payment.commission.toLocaleString('es-AR')}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {payment.processedBy}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {payment.processedAt ? new Date(payment.processedAt).toLocaleDateString("es-AR") : '-'}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {payment.processedAt ? new Date(payment.processedAt).toLocaleTimeString("es-AR", { hour: '2-digit', minute: '2-digit' }) : ''}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            {payment.paymentProofUrl ? (
                              <a
                                href={getImageUrl(payment.paymentProofUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-sky-600 hover:text-sky-700 dark:text-sky-400"
                              >
                                <ExternalLink className="h-4 w-4" />
                                Ver
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400">Sin comprobante</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Disputed Payments for Workers */}
      {activeTab === "workers" && workersSubFilter === "disputed" && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-full">
              <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Pagos en Disputa
            </h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md">
              Los pagos en disputa se gestionan desde el módulo de Disputas.
              Allí podrás ver los detalles del caso y tomar acciones.
            </p>
            <a
              href="/admin/disputes"
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition"
            >
              Ir a Gestión de Disputas
            </a>
          </div>
        </div>
      )}

      {/* Devoluciones (refunds) */}
      {activeTab === "refunds" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-emerald-800 dark:text-emerald-200">
            <p className="font-semibold text-sm mb-1">Mecánica de devolución</p>
            <p className="text-xs leading-relaxed">
              Las devoluciones se acreditan como <strong>saldo</strong> en el balance del usuario (no vuelven a la tarjeta).
              Origen típico: <strong>cancelación de una publicación</strong>. Reglas: aún no aprobada → precio + comisión;
              una vez aprobada, la comisión no se devuelve; con menos de 2h y trabajador asignado → mitad al dueño y mitad
              al trabajador; sin trabajador → precio total. El usuario puede <strong>retirar</strong> ese saldo (aparece en Retiros).
            </p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
            {refundsLoading ? (
              <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-500" /></div>
            ) : refunds.filter(matchesQuery).length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400 text-sm">No hay devoluciones.</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    {['Fecha', 'Usuario', 'Monto', 'Motivo', 'Estado', 'Conexiones'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {refunds.filter(matchesQuery).map((r) => {
                    const reasonLabels: Record<string, string> = {
                      job_cancelled_pending_approval: 'Cancelación (antes de aprobar)',
                      job_cancelled_late: 'Cancelación tardía (<2h)',
                      job_cancelled_late_no_worker: 'Cancelación <2h sin trabajador',
                      job_cancelled: 'Cancelación',
                    };
                    return (
                      <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-300">{new Date(r.createdAt).toLocaleString('es-AR')}</td>
                        <td className="px-4 py-3">
                          <div className="text-gray-900 dark:text-white">{r.user?.name || '—'}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{r.user?.email || ''}</div>
                          <IdBadge id={r.id} />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-emerald-600 dark:text-emerald-400">+${Number(r.amount).toLocaleString('es-AR')} ARS</td>
                        <td className="px-4 py-3 max-w-xs">
                          <div className="text-gray-700 dark:text-gray-300 truncate" title={r.description || ''}>
                            {r.description || reasonLabels[r.reason] || r.reason || 'Devolución'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 cursor-help" title="Devolución acreditada al saldo del usuario. Queda disponible para retirar.">
                            Acreditada al saldo
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2 text-xs">
                            {r.jobId && (
                              <Link to={`/jobs/${r.jobId}`} className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:underline">
                                <ExternalLink className="h-3 w-3" /> Publicación
                              </Link>
                            )}
                            {r.user && (
                              <Link to={`/admin/financial-transactions?search=${encodeURIComponent(r.user.email || r.user.name || '')}`} className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline">
                                <ExternalLink className="h-3 w-3" /> Transacciones
                              </Link>
                            )}
                            {r.user && (
                              <Link to={`/admin/withdrawals?search=${encodeURIComponent(r.user.email || r.user.name || '')}`} className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 hover:underline">
                                <ExternalLink className="h-3 w-3" /> Retiros
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Payment Detail Modal */}
      {showModal && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Detalles del Pago
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Contrato ID: {selectedPayment.contract.id.slice(0, 8)}...
                  </p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              {/* Status badges */}
              <div className="flex gap-3 mb-6">
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${getPaymentStatusBadge(selectedPayment.contract.paymentStatus)}`}>
                  Pago: {getPaymentStatusLabel(selectedPayment.contract.paymentStatus)}
                </span>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${getEscrowStatusBadge(selectedPayment.contract.escrowStatus)}`}>
                  Escrow: {getEscrowStatusLabel(selectedPayment.contract.escrowStatus)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Job Info */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Trabajo
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {selectedPayment.job.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedPayment.job.location}
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Presupuesto total: ${selectedPayment.job.totalBudget.toLocaleString('es-AR')}
                    </p>
                    {selectedPayment.job.maxWorkers > 1 && (
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        Trabajadores: {selectedPayment.job.selectedWorkersCount} / {selectedPayment.job.maxWorkers}
                      </p>
                    )}
                  </div>
                </div>

                {/* Client Info */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Cliente
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {selectedPayment.client.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {selectedPayment.client.email}
                    </p>
                    {selectedPayment.client.dni && (
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        DNI: {selectedPayment.client.dni}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Worker & Payment Info */}
              <div className="space-y-4 mb-6">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Building className="h-4 w-4" />
                  Trabajador - Datos de Pago
                </h3>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {selectedPayment.worker.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {selectedPayment.worker.email}
                      </p>
                      {selectedPayment.worker.dni && (
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          DNI: {selectedPayment.worker.dni}
                        </p>
                      )}
                      {selectedPayment.worker.phone && (
                        <p className="text-sm text-gray-700 dark:text-gray-300">
                          Tel: {selectedPayment.worker.phone}
                        </p>
                      )}
                    </div>
                    <div className="space-y-3">
                      {selectedPayment.worker.bankingInfo ? (
                        <>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-medium">Banco:</span> {selectedPayment.worker.bankingInfo.bankName || 'N/A'}
                          </p>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-medium">Titular:</span> {selectedPayment.worker.bankingInfo.accountHolder || 'N/A'}
                          </p>
                          {/* CBU with copy button */}
                          <div className="space-y-1">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">CBU/CVU:</span>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 font-mono text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-3 py-1.5 rounded border border-blue-200 dark:border-blue-700 break-all">
                                {selectedPayment.worker.bankingInfo.cbu || 'N/A'}
                              </code>
                              {selectedPayment.worker.bankingInfo.cbu && (
                                <button
                                  onClick={() => copyToClipboard(selectedPayment.worker.bankingInfo?.cbu || '')}
                                  className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition flex-shrink-0"
                                  title="Copiar CBU"
                                >
                                  {copiedCBU ? <Check className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            <span className="font-medium">Alias:</span> {selectedPayment.worker.bankingInfo.alias || 'N/A'}
                          </p>
                        </>
                      ) : (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
                          <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                            ⚠️ Sin datos bancarios registrados
                          </p>
                          <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                            El trabajador debe completar sus datos bancarios para recibir el pago.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Liquidation Form */}
              {selectedPayment.contract.paymentStatus !== 'completed' && (
                <div className="space-y-6">
                  {/* Section Header */}
                  <div className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-white">
                    <Calculator className="h-5 w-5 text-sky-500" />
                    Formulario de Liquidación
                  </div>

                  {/* Deductions Form */}
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <Percent className="h-4 w-4" />
                      Deducciones (opcional)
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Bank Fee */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Comisión bancaria (ARS)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={bankFee || ''}
                            onChange={(e) => setBankFee(parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>

                      {/* Tax Percentage */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Retención impositiva (%)
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={taxPercentage || ''}
                            onChange={(e) => setTaxPercentage(parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="w-full pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                        </div>
                      </div>
                    </div>

                    {/* Other Deductions */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        Otras deducciones (ARS)
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={otherDeductions || ''}
                            onChange={(e) => setOtherDeductions(parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                            className="w-full pl-7 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        </div>
                        <input
                          type="text"
                          value={otherDeductionsDescription}
                          onChange={(e) => setOtherDeductionsDescription(e.target.value)}
                          placeholder="Descripción..."
                          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Payment Breakdown */}
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-green-800 dark:text-green-300 mb-3 flex items-center gap-2">
                      <Banknote className="h-4 w-4" />
                      Desglose del Pago
                    </h4>

                    <div className="space-y-2 text-sm">
                      {/* Gross Amount */}
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Monto bruto del contrato:</span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          ${selectedPayment.contract.price.toLocaleString('es-AR')}
                        </span>
                      </div>

                      {/* Platform Commission */}
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Comisión plataforma:</span>
                        <span className="text-red-600 dark:text-red-400">
                          -${selectedPayment.contract.commission.toLocaleString('es-AR')}
                        </span>
                      </div>

                      {/* Subtotal */}
                      <div className="flex justify-between border-t border-green-200 dark:border-green-700 pt-2 mt-2">
                        <span className="text-gray-700 dark:text-gray-300">Neto antes de deducciones:</span>
                        <span className="text-gray-900 dark:text-white font-medium">
                          ${(selectedPayment.contract.price - selectedPayment.contract.commission).toLocaleString('es-AR')}
                        </span>
                      </div>

                      {/* Bank Fee (if any) */}
                      {bankFee > 0 && (
                        <div className="flex justify-between text-orange-600 dark:text-orange-400">
                          <span>Comisión bancaria:</span>
                          <span>-${bankFee.toLocaleString('es-AR')}</span>
                        </div>
                      )}

                      {/* Tax (if any) */}
                      {taxPercentage > 0 && (
                        <div className="flex justify-between text-orange-600 dark:text-orange-400">
                          <span>Retención impositiva ({taxPercentage}%):</span>
                          <span>
                            -${((selectedPayment.contract.price - selectedPayment.contract.commission) * (taxPercentage / 100)).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}

                      {/* Other Deductions (if any) */}
                      {otherDeductions > 0 && (
                        <div className="flex justify-between text-orange-600 dark:text-orange-400">
                          <span>Otras deducciones{otherDeductionsDescription ? ` (${otherDeductionsDescription})` : ''}:</span>
                          <span>-${otherDeductions.toLocaleString('es-AR')}</span>
                        </div>
                      )}

                      {/* Final Amount */}
                      <div className="flex justify-between border-t-2 border-green-300 dark:border-green-600 pt-3 mt-3">
                        <span className="font-bold text-green-800 dark:text-green-300 text-base">
                          MONTO FINAL A TRANSFERIR:
                        </span>
                        <span className="font-bold text-green-700 dark:text-green-400 text-xl">
                          ${calculateFinalAmount().toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bank Info Summary for Transfer */}
                  {selectedPayment.worker.bankingInfo?.cbu && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-3">
                        📋 Datos para transferir:
                      </h4>
                      <div className="space-y-3 text-sm">
                        {/* CBU - Full width */}
                        <div>
                          <span className="text-blue-600 dark:text-blue-400 block mb-1">CBU/CVU:</span>
                          <div className="flex items-center gap-2">
                            <code className="flex-1 font-mono text-blue-800 dark:text-blue-200 bg-blue-100 dark:bg-blue-800/50 px-2 py-1.5 rounded text-xs break-all">
                              {selectedPayment.worker.bankingInfo.cbu}
                            </code>
                            <button
                              onClick={() => copyToClipboard(selectedPayment.worker.bankingInfo?.cbu || '')}
                              className="p-1.5 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-800/50 rounded flex-shrink-0"
                              title="Copiar CBU"
                            >
                              {copiedCBU ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        {/* Other info in grid */}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <span className="text-blue-600 dark:text-blue-400">Monto:</span>
                            <div className="font-bold text-blue-800 dark:text-blue-200 mt-1">
                              ${calculateFinalAmount().toLocaleString('es-AR', { maximumFractionDigits: 2 })} ARS
                            </div>
                          </div>
                          {selectedPayment.worker.bankingInfo.bankName && (
                            <div>
                              <span className="text-blue-600 dark:text-blue-400">Banco:</span>
                              <div className="text-blue-800 dark:text-blue-200 mt-1">
                                {selectedPayment.worker.bankingInfo.bankName}
                              </div>
                            </div>
                          )}
                          {selectedPayment.worker.bankingInfo.accountHolder && (
                            <div className="col-span-2">
                              <span className="text-blue-600 dark:text-blue-400">Titular:</span>
                              <div className="text-blue-800 dark:text-blue-200 mt-1">
                                {selectedPayment.worker.bankingInfo.accountHolder}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Existing Payment Proofs */}
                  {selectedPayment.payment?.proofs && selectedPayment.payment.proofs.length > 0 && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <label className="text-sm font-medium mb-3 flex items-center gap-2 text-blue-700 dark:text-blue-300">
                        <Receipt className="h-4 w-4" />
                        Comprobantes Existentes ({selectedPayment.payment.proofs.length})
                      </label>
                      <div className="space-y-2">
                        {selectedPayment.payment.proofs.map((proof, index) => (
                          <div key={proof.id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3 border border-blue-100 dark:border-blue-800">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-blue-100 dark:bg-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-300 text-sm font-medium">
                                {index + 1}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  Comprobante #{index + 1}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {new Date(proof.uploadedAt).toLocaleString('es-AR')}
                                  {proof.status && ` - ${proof.status}`}
                                </div>
                              </div>
                            </div>
                            <a
                              href={getImageUrl(proof.fileUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-300 rounded-lg text-sm hover:bg-blue-200 dark:hover:bg-blue-700 transition"
                            >
                              <ExternalLink className="h-4 w-4" />
                              Ver
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Payment Proof Upload - Add more proofs */}
                  <div className={`rounded-lg p-4 ${paymentProof ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : (selectedPayment.payment?.proofs && selectedPayment.payment.proofs.length > 0 ? 'bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700' : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800')}`}>
                    <label className={`text-sm font-medium mb-2 flex items-center gap-2 ${paymentProof ? 'text-green-700 dark:text-green-300' : (selectedPayment.payment?.proofs && selectedPayment.payment.proofs.length > 0 ? 'text-gray-700 dark:text-gray-300' : 'text-amber-700 dark:text-amber-300')}`}>
                      <Upload className="h-4 w-4" />
                      {selectedPayment.payment?.proofs && selectedPayment.payment.proofs.length > 0
                        ? 'Agregar otro comprobante (opcional)'
                        : 'Comprobante de Transferencia'}
                      {!(selectedPayment.payment?.proofs && selectedPayment.payment.proofs.length > 0) && <span className="text-red-500">*</span>}
                    </label>
                    <div className="flex items-center gap-3">
                      <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition ${paymentProof ? 'border-green-400 dark:border-green-600 hover:border-green-500' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'}`}>
                        <Upload className={`h-5 w-5 ${paymentProof ? 'text-green-500' : 'text-gray-400'}`} />
                        <span className={`text-sm ${paymentProof ? 'text-green-700 dark:text-green-300 font-medium' : 'text-gray-600 dark:text-gray-400'}`}>
                          {paymentProof ? paymentProof.name : (selectedPayment.payment?.proofs && selectedPayment.payment.proofs.length > 0 ? "Click para agregar otro comprobante" : "Subir comprobante de la transferencia")}
                        </span>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="hidden"
                          onChange={(e) => setPaymentProof(e.target.files?.[0] || null)}
                        />
                      </label>
                      {paymentProof && (
                        <button
                          onClick={() => setPaymentProof(null)}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        >
                          <XCircle className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                    {!(selectedPayment.payment?.proofs && selectedPayment.payment.proofs.length > 0) && !paymentProof && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                        Debes subir el comprobante de la transferencia bancaria antes de confirmar el pago.
                      </p>
                    )}
                  </div>

                  {/* Admin Notes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Notas internas (opcional)
                    </label>
                    <textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Notas sobre el pago, referencia de transferencia, etc..."
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                      rows={2}
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={() => handleMarkAsPaid(selectedPayment.contract.id, true)}
                    disabled={markingPaidId === selectedPayment.contract.id || !selectedPayment.worker.bankingInfo?.cbu || (!paymentProof && !(selectedPayment.payment?.proofs && selectedPayment.payment.proofs.length > 0))}
                    className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg font-medium transition shadow-lg shadow-green-500/25"
                  >
                    {markingPaidId === selectedPayment.contract.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-5 w-5" />
                    )}
                    Confirmar Liquidación - ${calculateFinalAmount().toLocaleString('es-AR')} ARS
                  </button>

                  {!selectedPayment.worker.bankingInfo?.cbu && (
                    <p className="text-center text-sm text-red-500">
                      No se puede procesar el pago sin datos bancarios
                    </p>
                  )}
                  {selectedPayment.worker.bankingInfo?.cbu && !paymentProof && !(selectedPayment.payment?.proofs && selectedPayment.payment.proofs.length > 0) && (
                    <p className="text-center text-sm text-amber-600 dark:text-amber-400">
                      Sube el comprobante de transferencia para habilitar el botón
                    </p>
                  )}
                </div>
              )}

              {/* Completed Payment Info */}
              {selectedPayment.contract.paymentStatus === 'completed' && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Pago completado</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject Payment Modal */}
      {/* Approve Payment Modal - Mandatory proof upload */}
      {approveModalPaymentId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    Verificación Comprobante de pago
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Confirmá que el pago fue efectivamente recibido en la cuenta. Los datos se
                    autocompletan con lo que envió el usuario — revisalos antes de aprobar.
                  </p>
                </div>
                <button
                  onClick={() => setApproveModalPaymentId(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Comprobante */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <Upload className="inline h-4 w-4 mr-1" />
                    Comprobante de pago <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => setApproveFile(e.target.files?.[0] || null)}
                    className="block w-full text-sm text-gray-500 dark:text-gray-400
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-lg file:border-0
                      file:text-sm file:font-medium
                      file:bg-green-100 file:text-green-700
                      dark:file:bg-green-900/30 dark:file:text-green-300
                      hover:file:bg-green-200 dark:hover:file:bg-green-900/50"
                  />
                  {approveFile && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      ✓ {approveFile.name}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Formatos: JPG, PNG, PDF. Máx 10MB.
                  </p>
                </div>

                {/* Referencia */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Número de referencia / ID de transacción <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={approveReference}
                    onChange={(e) => setApproveReference(e.target.value)}
                    placeholder="Ej: TRX-123456789"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                {/* Monto y Banco */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Monto recibido (ARS) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={approveAmount}
                      onChange={(e) => setApproveAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Fecha de transferencia <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={approveDate}
                      onChange={(e) => setApproveDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Banco origen */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Banco de origen (opcional)
                  </label>
                  <input
                    type="text"
                    value={approveSenderBank}
                    onChange={(e) => setApproveSenderBank(e.target.value)}
                    placeholder="Ej: Banco Galicia, Mercado Pago..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>

                {/* Notas */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Notas de comprobante de pago (opcional)
                  </label>
                  <textarea
                    value={approveNotes}
                    onChange={(e) => setApproveNotes(e.target.value)}
                    placeholder="Ej: el usuario adjuntó una imagen que no corresponde a una transferencia recibida; se solicitó reenvío del comprobante..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setApproveModalPaymentId(null)}
                  disabled={approveUploading}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmApprove}
                  disabled={approveUploading || !approveFile || !approveReference.trim() || !approveAmount.trim() || !approveDate.trim()}
                  className="px-4 py-2 text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {approveUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verificando...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      Verificar Comprobante
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {rejectModalPaymentId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Ban className="h-5 w-5 text-red-500" />
                    Rechazar Pago
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Ingresa el motivo del rechazo
                  </p>
                </div>
                <button
                  onClick={() => {
                    setRejectModalPaymentId(null);
                    setRejectReason("");
                    setRejectFile(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Razón del rechazo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <MessageSquare className="inline h-4 w-4 mr-1" />
                    Motivo del rechazo *
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Ej: El comprobante no corresponde al monto indicado..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    rows={4}
                  />
                </div>

                {/* Rechazar + mensaje en un paso */}
                {rejectPayer?.id && (
                  <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rejectSendMessage}
                      onChange={(e) => setRejectSendMessage(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Enviar un mensaje a <strong>{rejectPayer.name || 'el usuario'}</strong> con el motivo del rechazo (pidiendo que reenvíe el comprobante).
                    </span>
                  </label>
                )}

                {/* Adjuntar archivo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    <FileImage className="inline h-4 w-4 mr-1" />
                    Adjuntar evidencia (opcional)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setRejectFile(e.target.files?.[0] || null)}
                      className="block w-full text-sm text-gray-500 dark:text-gray-400
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-lg file:border-0
                        file:text-sm file:font-medium
                        file:bg-gray-100 file:text-gray-700
                        dark:file:bg-gray-700 dark:file:text-gray-300
                        hover:file:bg-gray-200 dark:hover:file:bg-gray-600"
                    />
                  </div>
                  {rejectFile && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Archivo seleccionado: {rejectFile.name}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Formatos: JPG, PNG, PDF. Máx 10MB.
                  </p>
                </div>
              </div>

              {/* Botones */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => {
                    setRejectModalPaymentId(null);
                    setRejectReason("");
                    setRejectFile(null);
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
                  disabled={rejectUploading}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmReject}
                  disabled={rejectUploading || !rejectReason.trim()}
                  className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {rejectUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Rechazando...
                    </>
                  ) : (
                    <>
                      <Ban className="h-4 w-4" />
                      Confirmar Rechazo
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Proof viewer modal (in-page) */}
      {proofViewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setProofViewer(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <h3 className="font-semibold text-gray-900 dark:text-white truncate">{proofViewer.title}</h3>
              <button onClick={() => setProofViewer(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0 ml-2">
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 flex-1 min-h-0 overflow-y-auto">
              {proofViewer.url.toLowerCase().includes('.pdf') ? (
                <a href={proofViewer.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-12 text-sky-600 dark:text-sky-400 hover:underline">
                  <FileText className="h-8 w-8" /> Abrir PDF del comprobante
                </a>
              ) : proofImgError ? (
                <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400">
                  No se pudo cargar la imagen.
                  <a href={proofViewer.url} target="_blank" rel="noopener noreferrer" className="block mt-2 text-sky-600 dark:text-sky-400 hover:underline">Abrir en pestaña nueva</a>
                </div>
              ) : (
                <img
                  src={proofViewer.url}
                  alt="Comprobante"
                  onError={() => setProofImgError(true)}
                  className="w-full rounded-lg object-contain max-h-[60vh] bg-gray-100 dark:bg-gray-900"
                />
              )}
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <a href={proofViewer.url} target="_blank" rel="noopener noreferrer" className="inline-block text-xs text-sky-600 dark:text-sky-400 hover:underline">
                  Abrir en pestaña nueva ↗
                </a>
                {proofViewer.paymentId && (
                  <Link
                    to={`/admin/financial-transactions?search=${proofViewer.paymentId}`}
                    className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Ver transacción
                  </Link>
                )}
              </div>

              {/* Notas de comprobante de pago */}
              {proofViewer.paymentId && (
                <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-3">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">
                    Notas de comprobante de pago {proofNotes.length > 0 && `(${proofNotes.length})`}
                  </p>

                  {proofNotes.length > 0 ? (
                    <div className="space-y-2 mb-3">
                      {proofNotes.map((n) => {
                        const isPdf = n.fileType === 'pdf' || (n.fileUrl || '').toLowerCase().endsWith('.pdf');
                        return (
                          <div key={n.id} className="flex gap-3 p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                            <a href={getImageUrl(n.fileUrl)} target="_blank" rel="noopener noreferrer" className="shrink-0">
                              {isPdf ? (
                                <div className="w-14 h-14 flex items-center justify-center bg-red-100 dark:bg-red-900/30 rounded"><FileText className="h-6 w-6 text-red-500" /></div>
                              ) : (
                                <img src={getImageUrl(n.fileUrl)} alt="nota" className="w-14 h-14 object-cover rounded" />
                              )}
                            </a>
                            <div className="min-w-0 flex-1">
                              {n.caption && <p className="text-xs text-gray-700 dark:text-gray-300 break-words">{n.caption}</p>}
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                #{n.sequence ?? '?'} · {n.uploadedBy?.name || (n.uploadedByRole === 'admin' ? 'Admin' : 'Usuario')} · {new Date(n.uploadedAt).toLocaleString('es-AR')}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500 italic mb-3">Sin notas todavía.</p>
                  )}

                  <input
                    type="text"
                    value={noteCaption}
                    onChange={(e) => setNoteCaption(e.target.value)}
                    placeholder="Pie de la nota (ej: el usuario mandó otra imagen que no es un comprobante)"
                    className="w-full text-sm px-3 py-2 mb-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <label className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-900/20 ${noteUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                    <Upload className="h-3.5 w-3.5" /> {noteUploading ? 'Subiendo…' : 'Adjuntar archivo como nota'}
                    <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addProofNoteFromFile(f); e.currentTarget.value = ''; }} />
                  </label>

                  {chatAttachments.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Adjuntos enviados en el chat — agregalos como nota:</p>
                      <div className="flex flex-wrap gap-2">
                        {chatAttachments.map((a, i) => (
                          <div key={i} className="w-16">
                            <a href={getImageUrl(a.url)} target="_blank" rel="noopener noreferrer">
                              {a.type === 'pdf' ? (
                                <div className="w-14 h-14 flex items-center justify-center bg-red-100 dark:bg-red-900/30 rounded"><FileText className="h-6 w-6 text-red-500" /></div>
                              ) : (
                                <img src={getImageUrl(a.url)} alt="adjunto" className="w-14 h-14 object-cover rounded border border-gray-200 dark:border-gray-700" />
                              )}
                            </a>
                            <button
                              onClick={() => addProofNoteFromUrl(a.url, a.fileName)}
                              disabled={noteUploading}
                              className="mt-1 w-14 text-[10px] px-1 py-0.5 rounded bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50"
                            >
                              + nota
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {proofViewer.userId && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Enviar mensaje a {proofViewer.userName || 'el cliente'} (ej: pedir otra foto del comprobante)
                </p>
                {/* Predefined quick replies */}
                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setProofChatInput('Hola, no pudimos validar el comprobante que enviaste. ¿Podés volver a subir el comprobante de la transferencia? Asegurate de que se vean claramente el monto, la fecha y el número de operación. ¡Gracias!')}
                    className="text-xs px-2.5 py-1 rounded-full border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors"
                  >
                    📄 Pedir reenvío del comprobante
                  </button>
                  <button
                    type="button"
                    onClick={() => setProofChatInput('Hola, no detectamos la acreditación de tu pago en nuestra cuenta. Por favor verificá que la transferencia se haya realizado correctamente y que no haya sido rechazada o rebotada. Si ya la hiciste, esperá unos minutos y avisanos.')}
                    className="text-xs px-2.5 py-1 rounded-full border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                  >
                    ⚠️ No detectamos tu pago
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={proofChatInput}
                    onChange={(e) => setProofChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendProofMessage(); } }}
                    placeholder="Escribí un mensaje..."
                    className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-sky-500"
                  />
                  <button
                    onClick={sendProofMessage}
                    disabled={proofChatSending || !proofChatConvId || !proofChatInput.trim()}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
                  >
                    {proofChatSending ? '...' : 'Enviar'}
                  </button>
                </div>
                {!proofChatConvId && <p className="text-xs text-amber-500 mt-1">Iniciando conversación…</p>}
                {proofChatMsg && <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">{proofChatMsg}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
