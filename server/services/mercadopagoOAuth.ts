/**
 * MercadoPago OAuth & Split Payments Service
 *
 * Handles:
 * - OAuth flow for workers to link their MercadoPago accounts
 * - Token refresh
 * - Split payments (marketplace disbursements to workers)
 *
 * IMPORTANT: This module requires:
 * - MercadoPago Marketplace/Vendedor account (not just buyer account)
 * - MERCADOPAGO_CLIENT_ID and MERCADOPAGO_CLIENT_SECRET from MP dashboard
 * - MERCADOPAGO_SPLIT_PAYMENTS_ENABLED=true to enable split payments
 *
 * Currently DISABLED by default until marketplace account is obtained.
 * Set MERCADOPAGO_SPLIT_PAYMENTS_ENABLED=true in .env to enable.
 */

import { User } from '../models/sql/User.model.js';

// OAuth Configuration
const MERCADOPAGO_CLIENT_ID = process.env.MERCADOPAGO_CLIENT_ID;
const MERCADOPAGO_CLIENT_SECRET = process.env.MERCADOPAGO_CLIENT_SECRET;
const MERCADOPAGO_REDIRECT_URI = process.env.MERCADOPAGO_OAUTH_REDIRECT_URI || 'https://doapp.com.ar/api/mercadopago/oauth/callback';

// Feature flag - disabled by default until marketplace account is ready
const SPLIT_PAYMENTS_ENABLED = process.env.MERCADOPAGO_SPLIT_PAYMENTS_ENABLED === 'true';

// API URLs
const MP_AUTH_URL = 'https://auth.mercadopago.com/authorization';
const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token';
const MP_API_URL = 'https://api.mercadopago.com';

interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  user_id: number;
  refresh_token: string;
  public_key: string;
}

interface MercadoPagoUserInfo {
  id: number;
  nickname: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface SplitPaymentResult {
  success: boolean;
  transactionId?: string;
  workerAmount: number;
  platformFee: number;
  error?: string;
}

interface BatchPaymentResult {
  success: boolean;
  totalProcessed: number;
  totalSuccess: number;
  totalFailed: number;
  results: Array<{
    workerId: string;
    workerName: string;
    amount: number;
    success: boolean;
    transactionId?: string;
    error?: string;
  }>;
}

interface WorkerPayment {
  workerId: string;
  amount: number;
  description?: string;
}

class MercadoPagoOAuthService {
  private isConfigured: boolean;
  private splitPaymentsEnabled: boolean;

  constructor() {
    this.isConfigured = !!(MERCADOPAGO_CLIENT_ID && MERCADOPAGO_CLIENT_SECRET);
    this.splitPaymentsEnabled = SPLIT_PAYMENTS_ENABLED;

    if (!this.isConfigured) {
      console.warn('⚠️  MercadoPago OAuth not configured. Set MERCADOPAGO_CLIENT_ID and MERCADOPAGO_CLIENT_SECRET.');
    } else {
      console.log('✅ [MercadoPago OAuth] Service initialized');
    }

    if (!this.splitPaymentsEnabled) {
      console.log('ℹ️  [MercadoPago] Split Payments DISABLED. Set MERCADOPAGO_SPLIT_PAYMENTS_ENABLED=true to enable.');
    } else {
      console.log('✅ [MercadoPago] Split Payments ENABLED');
    }
  }

  /**
   * Check if split payments feature is enabled
   */
  isSplitPaymentsEnabled(): boolean {
    return this.splitPaymentsEnabled && this.isConfigured;
  }

  /**
   * Generate OAuth authorization URL for a user to link their MercadoPago account
   */
  getAuthorizationUrl(userId: string, returnUrl?: string): string {
    if (!this.isConfigured) {
      throw new Error('MercadoPago OAuth is not configured');
    }

    // State includes userId and optional return URL for security and redirect
    const state = Buffer.from(JSON.stringify({
      userId,
      returnUrl: returnUrl || '/perfil/pagos',
      timestamp: Date.now(),
    })).toString('base64');

    const params = new URLSearchParams({
      client_id: MERCADOPAGO_CLIENT_ID!,
      response_type: 'code',
      platform_id: 'mp', // Required for marketplace
      redirect_uri: MERCADOPAGO_REDIRECT_URI,
      state,
    });

    return `${MP_AUTH_URL}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
    if (!this.isConfigured) {
      throw new Error('MercadoPago OAuth is not configured');
    }

    try {
      const response = await fetch(MP_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: MERCADOPAGO_CLIENT_ID!,
          client_secret: MERCADOPAGO_CLIENT_SECRET!,
          code,
          redirect_uri: MERCADOPAGO_REDIRECT_URI,
        }).toString(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ OAuth token exchange failed:', errorData);
        throw new Error(errorData.message || 'Failed to exchange code for token');
      }

      const tokenData: OAuthTokenResponse = await response.json();
      console.log('✅ OAuth token obtained for MP user:', tokenData.user_id);

      return tokenData;
    } catch (error: any) {
      console.error('❌ Error exchanging OAuth code:', error);
      throw new Error(`OAuth exchange failed: ${error.message}`);
    }
  }

  /**
   * Refresh an expired access token
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenResponse> {
    if (!this.isConfigured) {
      throw new Error('MercadoPago OAuth is not configured');
    }

    try {
      const response = await fetch(MP_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: MERCADOPAGO_CLIENT_ID!,
          client_secret: MERCADOPAGO_CLIENT_SECRET!,
          refresh_token: refreshToken,
        }).toString(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ OAuth token refresh failed:', errorData);
        throw new Error(errorData.message || 'Failed to refresh token');
      }

      const tokenData: OAuthTokenResponse = await response.json();
      console.log('✅ OAuth token refreshed for MP user:', tokenData.user_id);

      return tokenData;
    } catch (error: any) {
      console.error('❌ Error refreshing OAuth token:', error);
      throw new Error(`OAuth refresh failed: ${error.message}`);
    }
  }

  /**
   * Get MercadoPago user info using their access token
   */
  async getUserInfo(accessToken: string): Promise<MercadoPagoUserInfo> {
    try {
      const response = await fetch(`${MP_API_URL}/users/me`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user info');
      }

      return await response.json();
    } catch (error: any) {
      console.error('❌ Error fetching MP user info:', error);
      throw new Error(`Failed to get user info: ${error.message}`);
    }
  }

  /**
   * Link MercadoPago account to a user
   */
  async linkAccount(userId: string, code: string): Promise<{ success: boolean; email?: string }> {
    try {
      // Exchange code for tokens
      const tokenData = await this.exchangeCodeForToken(code);

      // Get user info from MercadoPago
      const mpUserInfo = await this.getUserInfo(tokenData.access_token);

      // Find our user
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Link the account
      await user.linkMercadopago({
        userId: tokenData.user_id.toString(),
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresIn: tokenData.expires_in,
        email: mpUserInfo.email,
        publicKey: tokenData.public_key,
      });

      console.log(`✅ MercadoPago account linked for user ${userId} (MP user: ${tokenData.user_id})`);

      return {
        success: true,
        email: mpUserInfo.email,
      };
    } catch (error: any) {
      console.error('❌ Error linking MercadoPago account:', error);
      throw error;
    }
  }

  /**
   * Unlink MercadoPago account from a user
   */
  async unlinkAccount(userId: string): Promise<void> {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await user.unlinkMercadopago();
    console.log(`✅ MercadoPago account unlinked for user ${userId}`);
  }

  /**
   * Ensure user has valid access token, refresh if needed
   */
  async ensureValidToken(user: User): Promise<string> {
    if (!user.hasMercadopagoLinked()) {
      throw new Error('User does not have MercadoPago linked');
    }

    // Check if token is expired
    if (user.isMercadopagoTokenExpired()) {
      if (!user.mercadopagoRefreshToken) {
        throw new Error('No refresh token available, user must re-link account');
      }

      console.log(`🔄 Refreshing MercadoPago token for user ${user.id}`);

      const tokenData = await this.refreshAccessToken(user.mercadopagoRefreshToken);
      await user.updateMercadopagoTokens(
        tokenData.access_token,
        tokenData.refresh_token,
        tokenData.expires_in
      );

      return tokenData.access_token;
    }

    return user.mercadopagoAccessToken!;
  }

  /**
   * Create a split payment - pay worker directly via MercadoPago
   * This uses the marketplace disbursement feature
   *
   * @param workerId - Our platform's worker user ID
   * @param amount - Total amount to transfer (worker receives this minus platform fee if any)
   * @param platformFee - Amount to keep as platform commission
   * @param description - Payment description
   * @param externalReference - Reference to contract/job ID
   */
  async createSplitPayment(
    workerId: string,
    amount: number,
    platformFee: number,
    description: string,
    externalReference: string
  ): Promise<SplitPaymentResult> {
    try {
      const worker = await User.findByPk(workerId);
      if (!worker) {
        throw new Error('Worker not found');
      }

      if (!worker.hasMercadopagoLinked()) {
        return {
          success: false,
          workerAmount: amount - platformFee,
          platformFee,
          error: 'Worker does not have MercadoPago linked - requires manual payment',
        };
      }

      // Ensure worker has valid token
      const accessToken = await this.ensureValidToken(worker);

      const workerAmount = amount - platformFee;

      // Use MercadoPago's disbursement API to send money to seller
      // Note: This requires the main marketplace account's access token
      const mainAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
      if (!mainAccessToken) {
        throw new Error('Main MercadoPago access token not configured');
      }

      const response = await fetch(`${MP_API_URL}/v1/advanced_payments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mainAccessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `split-${externalReference}-${Date.now()}`,
        },
        body: JSON.stringify({
          application_id: MERCADOPAGO_CLIENT_ID,
          payments: [
            {
              payment_method_id: 'account_money',
              amount: workerAmount,
              external_reference: externalReference,
              description: description,
            }
          ],
          disbursements: [
            {
              collector_id: worker.mercadopagoUserId,
              amount: workerAmount,
              external_reference: `worker-${externalReference}`,
              application_fee: 0, // Fee already deducted from amount
            }
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Split payment failed:', errorData);

        // Return detailed error for logging but mark as needing manual payment
        return {
          success: false,
          workerAmount,
          platformFee,
          error: `MercadoPago error: ${errorData.message || JSON.stringify(errorData)}`,
        };
      }

      const paymentResult = await response.json();
      console.log(`✅ Split payment created: ${paymentResult.id}, worker receives $${workerAmount}`);

      return {
        success: true,
        transactionId: paymentResult.id?.toString(),
        workerAmount,
        platformFee,
      };
    } catch (error: any) {
      console.error('❌ Error creating split payment:', error);
      return {
        success: false,
        workerAmount: amount - platformFee,
        platformFee,
        error: error.message,
      };
    }
  }

  /**
   * Alternative: Direct bank transfer via MercadoPago (for workers with MP linked)
   * Uses MercadoPago's transfer to bank account feature
   */
  async transferToBankAccount(
    workerId: string,
    amount: number,
    description: string,
    externalReference: string
  ): Promise<SplitPaymentResult> {
    try {
      const worker = await User.findByPk(workerId);
      if (!worker) {
        throw new Error('Worker not found');
      }

      if (!worker.hasMercadopagoLinked()) {
        return {
          success: false,
          workerAmount: amount,
          platformFee: 0,
          error: 'Worker does not have MercadoPago linked',
        };
      }

      // Get valid token
      const accessToken = await this.ensureValidToken(worker);

      // Transfer from our account to worker's MP account
      // Then worker can withdraw to their bank account
      const mainAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
      if (!mainAccessToken) {
        throw new Error('Main MercadoPago access token not configured');
      }

      // MercadoPago P2P transfer endpoint
      const response = await fetch(`${MP_API_URL}/v1/transaction_intentions/process`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mainAccessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `transfer-${externalReference}-${Date.now()}`,
        },
        body: JSON.stringify({
          intention_type: 'TRANSFER',
          receiver_id: worker.mercadopagoUserId,
          amount: {
            currency_id: 'ARS',
            value: amount,
          },
          description: description,
          external_reference: externalReference,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Transfer failed:', errorData);
        return {
          success: false,
          workerAmount: amount,
          platformFee: 0,
          error: `Transfer error: ${errorData.message || JSON.stringify(errorData)}`,
        };
      }

      const result = await response.json();
      console.log(`✅ Transfer completed: ${result.id}, amount: $${amount}`);

      return {
        success: true,
        transactionId: result.id?.toString(),
        workerAmount: amount,
        platformFee: 0,
      };
    } catch (error: any) {
      console.error('❌ Error in transfer:', error);
      return {
        success: false,
        workerAmount: amount,
        platformFee: 0,
        error: error.message,
      };
    }
  }

  /**
   * Process payments for multiple workers (batch payment)
   * Splits the total amount among workers and processes each payment individually
   * Since MercadoPago Split Payments is 1:1, we process each worker separately
   *
   * @param workers - Array of workers with their allocated amounts
   * @param contractId - Contract ID for reference
   * @param jobTitle - Job title for payment description
   */
  async processBatchPayments(
    workers: WorkerPayment[],
    contractId: string,
    jobTitle: string
  ): Promise<BatchPaymentResult> {
    if (!this.isSplitPaymentsEnabled()) {
      return {
        success: false,
        totalProcessed: 0,
        totalSuccess: 0,
        totalFailed: workers.length,
        results: workers.map(w => ({
          workerId: w.workerId,
          workerName: '',
          amount: w.amount,
          success: false,
          error: 'Split Payments está deshabilitado. Requiere cuenta vendedor de MercadoPago.',
        })),
      };
    }

    const results: BatchPaymentResult['results'] = [];
    let totalSuccess = 0;
    let totalFailed = 0;

    for (const workerPayment of workers) {
      const worker = await User.findByPk(workerPayment.workerId);
      const workerName = worker?.name || 'Unknown';

      try {
        const description = workerPayment.description || `Pago por trabajo: ${jobTitle}`;
        const externalReference = `contract-${contractId}-worker-${workerPayment.workerId}`;

        const result = await this.transferToBankAccount(
          workerPayment.workerId,
          workerPayment.amount,
          description,
          externalReference
        );

        if (result.success) {
          totalSuccess++;
          results.push({
            workerId: workerPayment.workerId,
            workerName,
            amount: workerPayment.amount,
            success: true,
            transactionId: result.transactionId,
          });
        } else {
          totalFailed++;
          results.push({
            workerId: workerPayment.workerId,
            workerName,
            amount: workerPayment.amount,
            success: false,
            error: result.error,
          });
        }
      } catch (error: any) {
        totalFailed++;
        results.push({
          workerId: workerPayment.workerId,
          workerName,
          amount: workerPayment.amount,
          success: false,
          error: error.message,
        });
      }
    }

    return {
      success: totalFailed === 0,
      totalProcessed: workers.length,
      totalSuccess,
      totalFailed,
      results,
    };
  }

  /**
   * Check if OAuth service is properly configured
   */
  isOAuthConfigured(): boolean {
    return this.isConfigured;
  }

  /**
   * Parse OAuth state parameter
   */
  parseState(stateBase64: string): { userId: string; returnUrl: string; timestamp: number } | null {
    try {
      const decoded = Buffer.from(stateBase64, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch (error) {
      console.error('❌ Error parsing OAuth state:', error);
      return null;
    }
  }
}

// Export singleton instance
export const mercadopagoOAuthService = new MercadoPagoOAuthService();
export default mercadopagoOAuthService;
