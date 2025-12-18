import React, { useState, useCallback, memo } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { Job } from "@/types";

interface JobCardProps {
  job: Job;
  index?: number;
}

const JobCardComponent: React.FC<JobCardProps> = ({ job, index = 0 }) => {
  const navigate = useNavigate();
  const [isPressed, setIsPressed] = useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      className={cn(
        "mb-4 animate-fadeInUp",
        "transition-all duration-150 ease-out",
        isPressed && "scale-[0.97]",
      )}
      style={{
        animationDelay: `${index * 100}ms`,
      }}
    >
      <button
        onClick={() => navigate(`/jobs/${job._id}`)}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
        onMouseLeave={() => setIsPressed(false)}
        className={cn(
          "w-full p-5 rounded-2xl text-left",
          "bg-white dark:bg-[#2C2C2C]",
          "border border-[#E0E0E0] dark:border-[#333333]",
          "transition-all duration-150",
          "hover:shadow-sm",
          "focus:outline-none focus:ring-2 focus:ring-[#FF9800]",
        )}
      >
        {/* Badge de precio */}
        <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-[#FFF3E0] dark:bg-[#4D3300]">
          <span className="text-base font-bold text-[#FB8C00] dark:text-[#FFB74D]">
            ${job.budget?.toLocaleString() || "0"}
          </span>
        </div>

        {/* Título */}
        <h3 className="text-lg font-bold text-[#212121] dark:text-white mb-2 pr-24 line-clamp-1">
          {job.title}
        </h3>

        {/* Descripción */}
        <p className="text-sm text-[#757575] dark:text-[#B0B0B0] mb-4 line-clamp-2 leading-5">
          {job.description}
        </p>

        {/* Footer con fechas */}
        <div className="flex justify-between pt-3 border-t border-[#E0E0E0] dark:border-[#333333]">
          <div className="flex-1">
            <p className="text-xs text-[#757575] dark:text-[#B0B0B0] mb-1">
              Inicio:
            </p>
            <p className="text-sm font-semibold text-[#212121] dark:text-white">
              {formatDate(job.startDate)} {formatTime(job.startDate)}
            </p>
          </div>

          <div className="flex-1">
            <p className="text-xs text-[#757575] dark:text-[#B0B0B0] mb-1">
              Fin:
            </p>
            <p className="text-sm font-semibold text-[#212121] dark:text-white">
              {job.endDate ? `${formatDate(job.endDate)} ${formatTime(job.endDate)}` : 'Por definir'}
            </p>
          </div>
        </div>
      </button>
    </div>
  );
};

// Memoize to prevent re-renders when parent updates but job props unchanged
export const JobCard = memo(JobCardComponent, (prevProps, nextProps) => {
  return prevProps.job._id === nextProps.job._id &&
         prevProps.job.title === nextProps.job.title &&
         prevProps.job.budget === nextProps.job.budget &&
         prevProps.job.description === nextProps.job.description &&
         prevProps.index === nextProps.index;
});
