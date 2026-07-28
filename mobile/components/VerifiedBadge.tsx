import React from 'react';
import { ShieldCheck } from 'lucide-react-native';

/** Blue shield next to the name of users with verified identity (KYC). */
export default function VerifiedBadge({ size = 16 }: { size?: number }) {
  return <ShieldCheck size={size} color="#ffffff" fill="#0ea5e9" strokeWidth={2} />;
}
