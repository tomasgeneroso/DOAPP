import { apiClient } from "./api";

export interface CreateOrderRequest {
  contractId: string;
  amount: number;
  description?: string;
}

export interface CreateOrderResponse {
  paymentId: string;
  orderId: string;
  approvalUrl: string;
  amount: number;
  platformFee: number;
}

export interface CaptureOrderRequest {
  orderId: string;
}

export interface CaptureOrderResponse {
  paymentId: string;
  captureId: string;
  status: string;
}

export interface Payment {
  _id: string;
  contractId: any;
  payerId: any;
  recipientId: any;
  amount: number;
  currency: string;
  status: "pending" | "processing" | "completed" | "failed" | "refunded" | "held_escrow";
  paymentType: "contract_payment" | "escrow_deposit" | "escrow_release" | "refund";
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paypalPayerId?: string;
  paypalPayerEmail?: string;
  isEscrow: boolean;
  escrowReleasedAt?: Date;
  escrowReleasedBy?: any;
  refundReason?: string;
  refundedAt?: Date;
  refundedBy?: any;
  description?: string;
  metadata?: any;
  platformFee: number;
  platformFeePercentage: number;
  createdAt: Date;
  updatedAt: Date;
}

export const paymentApi = {
  /**
   * Create a payment order
   */
  async createOrder(data: CreateOrderRequest): Promise<CreateOrderResponse> {
    const response = await apiClient.post("/payments/create-order", data);
    return response.data;
  },

  /**
   * Capture a payment after approval
   */
  async captureOrder(data: CaptureOrderRequest): Promise<CaptureOrderResponse> {
    const response = await apiClient.post("/payments/capture-order", data);
    return response.data;
  },

  /**
   * Release escrow payment
   */
  async releaseEscrow(paymentId: string): Promise<Payment> {
    const response = await apiClient.post(`/payments/${paymentId}/release-escrow`);
    return response.data;
  },

  /**
   * Refund a payment
   */
  async refundPayment(paymentId: string, reason: string): Promise<any> {
    const response = await apiClient.post(`/payments/${paymentId}/refund`, { reason });
    return response.data;
  },

  /**
   * Get payment details
   */
  async getPayment(paymentId: string): Promise<Payment> {
    const response = await apiClient.get(`/payments/${paymentId}`);
    return response.data;
  },

  /**
   * Get user payments (sent and received)
   */
  async getMyPayments(
    type: "all" | "sent" | "received" = "all",
    page: number = 1,
    limit: number = 20
  ): Promise<{ data: Payment[]; pagination: any }> {
    const response = await apiClient.get("/payments/my/list", {
      params: { type, page, limit },
    });
    return response;
  },

  /**
   * Get contract payments
   */
  async getContractPayments(contractId: string): Promise<Payment[]> {
    const response = await apiClient.get(`/payments/contract/${contractId}`);
    return response.data;
  },
};
