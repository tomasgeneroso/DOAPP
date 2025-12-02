import React from 'react';
import { Heart } from 'lucide-react';

interface FamilyBadgeProps {
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  className?: string;
}

export default function FamilyBadge({ size = 'md', showTooltip = true, className = '' }: FamilyBadgeProps) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const badge = (
    <div
      className={`inline-flex items-center justify-center ${className}`}
      title={showTooltip ? 'Plan Familia' : undefined}
    >
      <Heart className={`${sizes[size]} text-pink-500 fill-pink-400`} />
    </div>
  );

  if (showTooltip) {
    return (
      <div className="relative group inline-flex">
        {badge}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
          <div className="bg-pink-600 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
            Plan Familia
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
              <div className="border-4 border-transparent border-t-pink-600"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return badge;
}
