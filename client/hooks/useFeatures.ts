import features, { FeatureKey, isFeatureEnabled } from '../../shared/featureFlags';

/**
 * Hook to check feature flags in React components
 *
 * Usage:
 *   const { isEnabled, features } = useFeatures();
 *
 *   if (isEnabled('blog')) { ... }
 *   {features.chat && <ChatSection />}
 */
export function useFeatures() {
  return {
    features,
    isEnabled: isFeatureEnabled,
  };
}

export { features, isFeatureEnabled };
export type { FeatureKey };
