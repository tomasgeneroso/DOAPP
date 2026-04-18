/**
 * Feature Flags / Toggles
 *
 * Centralized configuration to enable/disable app modules.
 * Change values here to toggle features across web, mobile, and server.
 *
 * Usage:
 *   import { features } from '../../shared/featureFlags';
 *   if (features.blog) { ... }
 *
 *   // React component:
 *   {features.chat && <ChatButton />}
 */

export const features = {
  // ============================================
  // CORE MODULES
  // ============================================

  /** Job posting and search */
  jobs: true,

  /** Contract creation and management */
  contracts: true,

  /** Proposal system (apply to jobs) */
  proposals: true,

  /** Real-time chat / messaging */
  chat: true,

  /** Balance, withdrawals, transaction history */
  balance: true,

  /** Payment processing (MercadoPago) */
  payments: true,

  // ============================================
  // MEMBERSHIP & MONETIZATION
  // ============================================

  /** PRO/SUPER PRO membership plans */
  membership: true,

  /** Referral program (invite codes) */
  referrals: true,

  /** Advertisement system (banners, sidebar, cards) */
  advertisements: true,

  /** Family plan codes */
  familyCodes: true,

  // ============================================
  // SOCIAL & CONTENT
  // ============================================

  /** Blog / community articles */
  blog: true,

  /** User portfolio */
  portfolio: true,

  /** User reviews and ratings */
  reviews: true,

  /** Social login (Google, Twitter, Facebook) */
  socialLogin: true,

  // ============================================
  // SUPPORT
  // ============================================

  /** Support tickets */
  tickets: true,

  /** Contract disputes */
  disputes: true,

  /** Help center / FAQ */
  helpCenter: true,

  // ============================================
  // COMMUNICATION
  // ============================================

  /** Push notifications (FCM) */
  pushNotifications: true,

  /** Email notifications */
  emailNotifications: true,

  /** In-app notifications */
  inAppNotifications: true,

  // ============================================
  // ADVANCED
  // ============================================

  /** Admin panel */
  adminPanel: true,

  /** Multi-language support (i18n) */
  i18n: true,

  /** Dark mode */
  darkMode: true,

  /** Onboarding tutorial */
  onboarding: true,

  /** Location/map features */
  maps: true,

  /** 2FA authentication */
  twoFactorAuth: true,

  /** PDF invoice generation */
  invoices: true,

  /** Site map page */
  sitemap: true,
};

export type FeatureKey = keyof typeof features;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(key: FeatureKey): boolean {
  return features[key] ?? false;
}

export default features;
