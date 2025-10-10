import React from "react";
import { AnimatedButton } from "./Button";

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = "No hay trabajos disponibles",
  description = "en este momento.",
  icon = "📋",
  actionLabel = "Publicar el primero",
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-10">
      {/* Icono */}
      <div className="w-20 h-20 rounded-full bg-[#FFF3E0] dark:bg-[#4D3300] flex items-center justify-center mb-6">
        <span className="text-4xl">{icon}</span>
      </div>

      {/* Título */}
      <h3 className="text-xl font-bold text-[#212121] dark:text-white text-center mb-2">
        {title}
      </h3>

      {/* Descripción */}
      <p className="text-base text-[#757575] dark:text-[#B0B0B0] text-center mb-8">
        {description}
      </p>

      {/* Acción */}
      {onAction && (
        <div className="w-full">
          <AnimatedButton onClick={onAction} fullWidth>
            {actionLabel}
          </AnimatedButton>
        </div>
      )}
    </div>
  );
};
