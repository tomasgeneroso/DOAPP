import React from 'react';
import { User } from '../../types';
import ProBadge from './ProBadge';
import FamilyBadge from './FamilyBadge';
import { useProStatus } from '../../hooks/useProStatus';

interface UserNameWithBadgeProps {
  user: User | { _id: string; name: string; membershipTier?: string; hasMembership?: boolean; isPremiumVerified?: boolean; hasFamilyPlan?: boolean };
  badgeSize?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function UserNameWithBadge({ user, badgeSize = 'md', className = '' }: UserNameWithBadgeProps) {
  const { hasProBadge } = useProStatus(user as User);
  const hasFamilyPlan = 'hasFamilyPlan' in user && user.hasFamilyPlan;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span>{user.name}</span>
      {hasProBadge && <ProBadge size={badgeSize} />}
      {hasFamilyPlan && <FamilyBadge size={badgeSize} />}
    </span>
  );
}
