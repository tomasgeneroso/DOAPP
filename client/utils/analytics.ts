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
 */
export function initGA(measurementId: string) {
  if (typeof window === "undefined" || !measurementId) return;

  // Load Google Analytics script
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  // Initialize gtag
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: any[]) {
    window.dataLayer!.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    page_path: window.location.pathname,
    send_page_view: true,
  });

  console.log("✅ Google Analytics initialized");
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

  window.gtag("config", import.meta.env.VITE_GOOGLE_ANALYTICS_ID, {
    user_id: userId,
  });
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
  jobView: (jobId: string) =>
    trackEvent("view_item", "job", jobId),

  jobCreate: () =>
    trackEvent("create_job", "job"),

  jobSearch: (query: string) =>
    trackEvent("search", "job", query),

  // Contract events
  contractCreate: (contractId: string) =>
    trackEvent("create_contract", "contract", contractId),

  contractAccept: (contractId: string) =>
    trackEvent("accept_contract", "contract", contractId),

  contractComplete: (contractId: string) =>
    trackEvent("complete_contract", "contract", contractId),

  // Payment events
  paymentInitiate: (amount: number) =>
    trackEvent("begin_checkout", "payment", "payment_initiated", amount),

  paymentSuccess: (amount: number, transactionId: string) => {
    trackEvent("purchase", "payment", transactionId, amount);
    trackConversion(transactionId, amount);
  },

  // Chat events
  messageSend: () =>
    trackEvent("message_send", "chat"),

  conversationStart: () =>
    trackEvent("conversation_start", "chat"),

  // Engagement events
  share: (contentType: string, contentId: string) =>
    trackEvent("share", contentType, contentId),

  like: (contentType: string, contentId: string) =>
    trackEvent("like", contentType, contentId),

  follow: (userId: string) =>
    trackEvent("follow", "user", userId),

  // Error tracking
  error: (error: string, page?: string) =>
    trackEvent("error", "error", error, page ? undefined : undefined),
};

export default analytics;
