/**
 * Google Analytics Utility
 * Provides analytics tracking for client-side events
 *
 * Privacidad (auditoría del 2026-11-06): a Google solo se le entrega la RUTA de cada pantalla (sin `?token=`, `?email=` ni `#…`:
 * `direccionSinDatos`), el referrer sin query y los textos libres sin correos ni teléfonos. Ningún evento llama a `window.gtag`
 * directo: todo sale por `gtagSeguro`, que es el único que limpia. `tests/datosPersonalesAfuera.test.ts` lo vigila.
 */
import { direccionSinDatos, parametrosSinDatos, referrerSinDatos, ubicacionParaAnalitica } from "../../shared/seguridad/datosPersonales";
import { leerEleccionDeCookies } from "./consentimientoDeCookies";

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

/** Único punto por donde sale un comando hacia Google: los eventos pasan con el texto libre limpio. */
function gtagSeguro(comando: string, ...resto: any[]) {
  if (!window.gtag) return;
  // Sin consentimiento no sale nada, ni siquiera a la cola de Google: `index.html` deja un `gtag` que solo encola, y lo encolado antes de aceptar se
  // enviaría completo en cuanto cargue el script. Solo se mide a quien aceptó en el cartel de cookies (`BannerDeCookies`).
  if (leerEleccionDeCookies() !== "aceptado") return;
  if (comando === "event" && resto[1] && typeof resto[1] === "object") {
    window.gtag("event", resto[0], parametrosSinDatos(resto[1]));
    return;
  }
  window.gtag(comando, ...resto);
}

/** Última pantalla contada: es el referrer de la siguiente (ya limpia). `null` = todavía no se contó ninguna. */
let ultimaRuta: string | null = null;

/**
 * Initialize Google Analytics
 * Note: The main initialization is handled by GoogleAnalytics.tsx component
 * This function is kept for backwards compatibility but should not be called directly
 */
export function initGA(measurementId: string) {
  if (typeof window === "undefined" || !measurementId) return;

  // Check if already initialized
  if (window.gtag) {
    configurarAnalitica(measurementId);
    return;
  }

  // Initialize dataLayer if not exists
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: any[]) {
    window.dataLayer!.push(args);
  };

  // Load Google Analytics script
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);

  gtagSeguro("js", new Date());
  configurarAnalitica(measurementId);
}

/**
 * Configura Google y cuenta la primera visita.
 *
 * `send_page_view: false`: con `true` Google arma la visita solo, leyendo `document.location` y `document.referrer`, que traen la
 * query entera (`/reset-password?token=…`, `/auth/callback?token=<sesión>`) y el referrer sin limpiar. La visita la cuenta
 * `trackPageView`, con la ruta limpia. El `set` previo hace que TAMBIÉN las mediciones automáticas (scroll, clics, sesión) usen la
 * dirección limpia y no la del documento.
 */
export function configurarAnalitica(measurementId: string, rutaActual: string = window.location.pathname) {
  if (!window.gtag || !measurementId) return;
  ultimaRuta = null;
  // La primera visita conserva los parámetros de campaña (`utm_*`, `gclid`): sin ellos Google no sabría qué anuncio trajo a la persona.
  gtagSeguro("set", {
    page_location: ubicacionParaAnalitica(window.location),
    page_referrer: referrerSinDatos(document.referrer),
  });
  gtagSeguro("config", measurementId, { send_page_view: false });
  trackPageView(rutaActual);
}

/**
 * Track page view
 */
export function trackPageView(url: string, title?: string) {
  if (!window.gtag) return;

  const ruta = direccionSinDatos(url);
  // La primera visita trae el referrer del documento (sin query); las siguientes, la pantalla anterior, ya limpia.
  const referrer = ultimaRuta === null ? referrerSinDatos(document.referrer) : window.location.origin + ultimaRuta;
  // Solo la primera visita trae la campaña: es la que Google usa para atribuir la sesión. Las pantallas siguientes, solo la ruta.
  const ubicacion = ultimaRuta === null ? ubicacionParaAnalitica(window.location) : window.location.origin + ruta;
  ultimaRuta = ruta;
  gtagSeguro("set", { page_location: ubicacion, page_referrer: referrer });
  gtagSeguro("event", "page_view", {
    page_path: ruta,
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
  gtagSeguro("event", action, {
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
    // Solo el id interno de la cuenta, nunca el correo ni el nombre. `send_page_view: false`: otro `config` con el valor por defecto
    // mandaría una visita más, armada por Google con la dirección completa.
    gtagSeguro("config", measurementId, {
      user_id: userId,
      send_page_view: false,
    });
  }
}

/**
 * Track conversion
 */
export function trackConversion(transactionId: string, value: number) {
  gtagSeguro("event", "purchase", {
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
      gtagSeguro("event", "view_item", {
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
      gtagSeguro("event", "create_job", {
        category: jobData.category,
        value: jobData.price,
        urgency: jobData.urgency,
      });
    }
  },

  jobSearch: (query: string, filters?: { category?: string; location?: string; minPrice?: number; maxPrice?: number }) => {
    trackEvent("search", "job", query);
    if (filters) {
      gtagSeguro("event", "search", {
        search_term: query,
        category: filters.category,
        location: filters.location,
        price_range: filters.minPrice && filters.maxPrice ? `${filters.minPrice}-${filters.maxPrice}` : undefined,
      });
    }
  },

  jobPublish: (jobId: string, price: number, category: string) => {
    trackEvent("job_publish", "job", jobId, price);
    gtagSeguro("event", "job_publish", {
      job_id: jobId,
      value: price,
      category: category,
    });
  },

  // Proposal events
  proposalCreate: (jobId: string, proposalAmount: number) => {
    trackEvent("create_proposal", "proposal", jobId, proposalAmount);
    gtagSeguro("event", "add_to_cart", {
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
    gtagSeguro("event", "accept_proposal", {
      proposal_id: proposalId,
      value: amount,
    });
  },

  // Contract events
  contractCreate: (contractId: string, amount: number, category?: string) => {
    trackEvent("create_contract", "contract", contractId, amount);
    gtagSeguro("event", "begin_checkout", {
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
    gtagSeguro("event", "contract_complete", {
      contract_id: contractId,
      value: amount,
      rating: rating,
    });
  },

  // Payment events
  paymentInitiate: (amount: number, paymentMethod: string, paymentType: string) => {
    trackEvent("begin_checkout", "payment", `${paymentMethod}_${paymentType}`, amount);
    gtagSeguro("event", "begin_checkout", {
      value: amount,
      currency: "ARS",
      payment_method: paymentMethod,
      payment_type: paymentType,
    });
  },

  paymentSuccess: (amount: number, transactionId: string, paymentMethod: string, paymentType: string) => {
    trackEvent("purchase", "payment", transactionId, amount);
    trackConversion(transactionId, amount);
    gtagSeguro("event", "purchase", {
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
    gtagSeguro("event", "view_item", {
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
    gtagSeguro("event", "purchase", {
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
    gtagSeguro("event", "withdrawal_request", {
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
    gtagSeguro("event", "dispute_create", {
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
    gtagSeguro("event", "exception", {
      description: error,
      fatal: severity === 'high',
      page: page,
    });
  },

  // Conversion funnel tracking
  funnelStep: (funnelName: string, step: number, stepName: string) => {
    trackEvent(`funnel_${funnelName}_step_${step}`, "funnel", stepName);
  },

  // Navigation click tracking
  navClick: (destination: string, location: 'header' | 'footer' | 'sidebar' | 'mobile_tab') => {
    gtagSeguro("event", "nav_click", {
      destination,
      nav_location: location,
    });
  },

  // Clipboard copy tracking
  clipboardCopy: (content_type: string, content_value?: string) => {
    gtagSeguro("event", "clipboard_copy", {
      content_type,
      content_value,
    });
  },

  // Filter / search interaction tracking
  filterApply: (filter_name: string, filter_value: string, context?: string) => {
    gtagSeguro("event", "filter_apply", {
      filter_name,
      filter_value,
      context,
    });
  },

  // Scroll depth milestone tracking (25 / 50 / 75 / 100)
  scrollDepth: (percent: 25 | 50 | 75 | 100, page_path?: string) => {
    gtagSeguro("event", "scroll_depth", {
      percent_scrolled: percent,
      page_path: page_path || window.location.pathname,
    });
  },
};

export default analytics;
