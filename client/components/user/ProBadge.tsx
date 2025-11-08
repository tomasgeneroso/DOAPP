import React from 'react';
import { Crown } from 'lucide-react';

interface ProBadgeProps {
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  className?: string;
}

export default function ProBadge({ size = 'md', showTooltip = true, className = '' }: ProBadgeProps) {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const badge = (
    <div
      className={`inline-flex items-center justify-center ${className}`}
      title={showTooltip ? 'Usuario PRO Verificado' : undefined}
    >
      <Crown className={`${sizes[size]} text-yellow-500 fill-yellow-400`} />
    </div>
  );

  if (showTooltip) {
    return (
      <div className="relative group inline-flex">
        {badge}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
          <div className="bg-gray-900 dark:bg-gray-700 text-white text-xs rounded py-1 px-2 whitespace-nowrap">
            Usuario PRO Verificado
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
              <div className="border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return badge;
}
