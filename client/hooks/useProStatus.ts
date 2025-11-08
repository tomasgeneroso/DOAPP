import { User } from '../types';

export function useProStatus(user: User | null | undefined) {
  const isPro = user?.membershipTier === 'pro' && user?.hasMembership === true;
  const isVerified = user?.isPremiumVerified === true;

  return {
    isPro,
    isVerified,
    hasProBadge: isPro && isVerified,
  };
}
