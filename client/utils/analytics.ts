/**
 * Google Analytics Utility
 * Provides analytics tracking for client-side events
 */

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

/**
 * Initialize Google Analytics
 * Note: The main initialization is handled by GoogleAnalytics.tsx component
 * This function is kept for backwards compatibility but should not be called directly
 */
export function initGA(measurementId: string) {
  if (typeof window === "undefined" || !measurementId) return;

  // Check if already initialized
  if (window.gtag) {
    window.gtag("config", measurementId, {
      page_path: window.location.pathname,
      send_page_view: true,
    });
    return;
  }

  // Initialize dataLayer if not exists
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: any[]) {
    window.dataLayer!.push(arguments);
  };

  // Load Google Analytics script
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    page_path: window.location.pathname,
    send_page_view: true,
  });
}

/**
 * Track page view
 */
export function trackPageView(url: string, title?: string) {
  if (!window.gtag) return;

  window.gtag("event", "page_view", {
    page_path: url,
    page_title: title || document.title,
  });
}

/**
 * Track custom event
 */
export function trackEvent(
  action: string,
  category?: string,
  label?: string,
  value?: number
) {
  if (!window.gtag) return;

  window.gtag("event", action, {
    event_category: category,
    event_label: label,
    value: value,
  });
}

/**
 * Track user
 */
export function identifyUser(userId: string) {
  if (!window.gtag) return;

  const measurementId = import.meta.env.VITE_GOOGLE_ANALYTICS_ID;
  if (measurementId) {
    window.gtag("config", measurementId, {
      user_id: userId,
    });
  }
}

/**
 * Track conversion
 */
export function trackConversion(transactionId: string, value: number) {
  if (!window.gtag) return;

  window.gtag("event", "purchase", {
    transaction_id: transactionId,
    value: value,
    currency: "USD",
  });
}

/**
 * Common event trackers
 */
export const analytics = {
  // Auth events
  login: (method: string) =>
    trackEvent("login", "auth", method),

  logout: () =>
    trackEvent("logout", "auth"),

  signup: (method: string) =>
    trackEvent("sign_up", "auth", method),

  // Job events
  jobView: (jobId: string, jobData?: { category?: string; price?: number; location?: string }) => {
    trackEvent("view_item", "job", jobId);
    if (jobData) {
      window.gtag?.("event", "view_item", {
        items: [{
          item_id: jobId,
          item_name: "Job Posting",
          item_category: jobData.category,
          price: jobData.price,
          item_location: jobData.location,
        }]
      });
    }
  },

  jobCreate: (jobData?: { category?: string; price?: number; urgency?: string }) => {
    trackEvent("create_job", "job");
    if (jobData) {
      window.gtag?.("event", "create_job", {
        category: jobData.category,
        value: jobData.price,
        urgency: jobData.urgency,
      });
    }
  },

  jobSearch: (query: string, filters?: { category?: string; location?: string; minPrice?: number; maxPrice?: number }) => {
    trackEvent("search", "job", query);
    if (filters) {
      window.gtag?.("event", "search", {
        search_term: query,
        category: filters.category,
        location: filters.location,
        price_range: filters.minPrice && filters.maxPrice ? `${filters.minPrice}-${filters.maxPrice}` : undefined,
      });
    }
  },

  jobPublish: (jobId: string, price: number, category: string) => {
    trackEvent("job_publish", "job", jobId, price);
    window.gtag?.("event", "job_publish", {
      job_id: jobId,
      value: price,
      category: category,
    });
  },

  // Proposal events
  proposalCreate: (jobId: string, proposalAmount: number) => {
    trackEvent("create_proposal", "proposal", jobId, proposalAmount);
    window.gtag?.("event", "add_to_cart", {
      value: proposalAmount,
      currency: "ARS",
      items: [{
        item_id: jobId,
        item_name: "Job Proposal",
        price: proposalAmount,
      }]
    });
  },

  proposalAccept: (proposalId: string, amount: number) => {
    trackEvent("accept_proposal", "proposal", proposalId, amount);
    window.gtag?.("event", "accept_proposal", {
      proposal_id: proposalId,
      value: amount,
    });
  },

  // Contract events
  contractCreate: (contractId: string, amount: number, category?: string) => {
    trackEvent("create_contract", "contract", contractId, amount);
    window.gtag?.("event", "begin_checkout", {
      value: amount,
      currency: "ARS",
      items: [{
        item_id: contractId,
        item_name: "Contract",
        item_category: category,
        price: amount,
      }]
    });
  },

  contractAccept: (contractId: string, amount: number) => {
    trackEvent("accept_contract", "contract", contractId, amount);
  },

  contractComplete: (contractId: string, amount: number, rating?: number) => {
    trackEvent("complete_contract", "contract", contractId, amount);
    window.gtag?.("event", "contract_complete", {
      contract_id: contractId,
      value: amount,
      rating: rating,
    });
  },

  // Payment events
  paymentInitiate: (amount: number, paymentMethod: string, paymentType: string) => {
    trackEvent("begin_checkout", "payment", `${paymentMethod}_${paymentType}`, amount);
    window.gtag?.("event", "begin_checkout", {
      value: amount,
      currency: "ARS",
      payment_method: paymentMethod,
      payment_type: paymentType,
    });
  },

  paymentSuccess: (amount: number, transactionId: string, paymentMethod: string, paymentType: string) => {
    trackEvent("purchase", "payment", transactionId, amount);
    trackConversion(transactionId, amount);
    window.gtag?.("event", "purchase", {
      transaction_id: transactionId,
      value: amount,
      currency: "ARS",
      payment_method: paymentMethod,
      payment_type: paymentType,
    });
  },

  paymentProofUpload: (paymentId: string, amount: number) => {
    trackEvent("payment_proof_upload", "payment", paymentId, amount);
  },

  // Membership events
  membershipView: (tier: string, price: number) => {
    trackEvent("view_membership", "membership", tier, price);
    window.gtag?.("event", "view_item", {
      items: [{
        item_id: tier,
        item_name: `Membership ${tier}`,
        item_category: "Subscription",
        price: price,
      }]
    });
  },

  membershipPurchase: (tier: string, price: number, transactionId: string) => {
    trackEvent("purchase_membership", "membership", tier, price);
    window.gtag?.("event", "purchase", {
      transaction_id: transactionId,
      value: price,
      currency: "EUR",
      items: [{
        item_id: tier,
        item_name: `Membership ${tier}`,
        item_category: "Subscription",
        price: price,
      }]
    });
  },

  membershipCancel: (tier: string) => {
    trackEvent("cancel_membership", "membership", tier);
  },

  // Referral events
  referralCodeGenerate: () => {
    trackEvent("generate_referral_code", "referral");
  },

  referralCodeUse: (code: string) => {
    trackEvent("use_referral_code", "referral", code);
  },

  referralRewardClaim: (rewardType: string) => {
    trackEvent("claim_referral_reward", "referral", rewardType);
  },

  // Balance & Withdrawal events
  withdrawalRequest: (amount: number, method: string) => {
    trackEvent("withdrawal_request", "balance", method, amount);
    window.gtag?.("event", "withdrawal_request", {
      value: amount,
      currency: "ARS",
      method: method,
    });
  },

  withdrawalComplete: (amount: number, transactionId: string) => {
    trackEvent("withdrawal_complete", "balance", transactionId, amount);
  },

  // Chat events
  messageSend: (conversationId?: string) =>
    trackEvent("message_send", "chat", conversationId),

  conversationStart: (withUserId?: string) => {
    trackEvent("conversation_start", "chat", withUserId);
  },

  // Portfolio events
  portfolioItemAdd: (itemType: string) => {
    trackEvent("portfolio_add", "portfolio", itemType);
  },

  portfolioView: (userId: string) => {
    trackEvent("portfolio_view", "portfolio", userId);
  },

  // Dispute events
  disputeCreate: (contractId: string, category: string) => {
    trackEvent("dispute_create", "dispute", category);
    window.gtag?.("event", "dispute_create", {
      contract_id: contractId,
      category: category,
    });
  },

  disputeResolve: (disputeId: string, resolution: string) => {
    trackEvent("dispute_resolve", "dispute", resolution);
  },

  // Engagement events
  share: (contentType: string, contentId: string) =>
    trackEvent("share", contentType, contentId),

  like: (contentType: string, contentId: string) =>
    trackEvent("like", contentType, contentId),

  follow: (userId: string) =>
    trackEvent("follow", "user", userId),

  // User behavior events
  profileComplete: (completionPercentage: number) => {
    trackEvent("profile_complete", "user", "profile", completionPercentage);
  },

  searchFilter: (filterType: string, filterValue: string) => {
    trackEvent("search_filter", "search", filterType);
  },

  // Error tracking
  error: (error: string, page?: string, severity?: 'low' | 'medium' | 'high') => {
    trackEvent("error", "error", error);
    window.gtag?.("event", "exception", {
      description: error,
      fatal: severity === 'high',
      page: page,
    });
  },

  // Conversion funnel tracking
  funnelStep: (funnelName: string, step: number, stepName: string) => {
    trackEvent(`funnel_${funnelName}_step_${step}`, "funnel", stepName);
  },
};

export default analytics;
