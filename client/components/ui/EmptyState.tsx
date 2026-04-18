import React from "react";
import { useTranslation } from "react-i18next";
import { AnimatedButton } from "./Button";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon = "📋",
  actionLabel,
  onAction,
}) => {
  const { t } = useTranslation();
  const displayTitle = title || t('emptyState.noJobsAvailable', 'No jobs available');
  const displayDescription = description || t('emptyState.atTheMoment', 'at the moment.');
  const displayActionLabel = actionLabel || t('emptyState.publishFirst', 'Publish the first one');
  return (
    <div className="flex flex-col items-center justify-center py-16 px-10">
      {/* Icono */}
      <div className="w-20 h-20 rounded-full bg-[#FFF3E0] dark:bg-[#4D3300] flex items-center justify-center mb-6">
        <span className="text-4xl">{icon}</span>
      </div>

      {/* Título */}
      <h3 className="text-xl font-bold text-[#212121] dark:text-white text-center mb-2">
        {displayTitle}
      </h3>

      {/* Descripción */}
      <p className="text-base text-[#757575] dark:text-[#B0B0B0] text-center mb-8">
        {displayDescription}
      </p>

      {/* Acción */}
      {onAction && (
        <div className="w-full">
          <AnimatedButton onClick={onAction} fullWidth>
            {displayActionLabel}
          </AnimatedButton>
        </div>
      )}
    </div>
  );
};
