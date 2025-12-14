import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useOnboarding } from '../../hooks/useOnboarding';
import { X, ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';

interface TooltipPosition {
  top: number;
  left: number;
  arrowPosition: 'top' | 'bottom' | 'left' | 'right';
}

export default function OnboardingTooltip() {
  const {
    isActive,
    currentStepData,
    currentStep,
    totalSteps,
    nextStep,
    prevStep,
    skipOnboarding,
    progress,
  } = useOnboarding();

  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const [targetElement, setTargetElement] = useState<Element | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !currentStepData) {
      setPosition(null);
      setTargetElement(null);
      return;
    }

    const findAndPositionTooltip = () => {
      const target = document.querySelector(currentStepData.targetSelector);

      if (!target) {
        // If target not found, show tooltip in center
        setPosition({
          top: window.innerHeight / 2 - 100,
          left: window.innerWidth / 2 - 175,
          arrowPosition: 'top',
        });
        setTargetElement(null);
        return;
      }

      setTargetElement(target);

      const rect = target.getBoundingClientRect();
      const tooltipWidth = 350;
      const tooltipHeight = 200;
      const padding = 16;
      const arrowOffset = 12;

      let top = 0;
      let left = 0;
      let arrowPosition = currentStepData.position;

      switch (currentStepData.position) {
        case 'bottom':
          top = rect.bottom + arrowOffset;
          left = rect.left + rect.width / 2 - tooltipWidth / 2;
          break;
        case 'top':
          top = rect.top - tooltipHeight - arrowOffset;
          left = rect.left + rect.width / 2 - tooltipWidth / 2;
          break;
        case 'left':
          top = rect.top + rect.height / 2 - tooltipHeight / 2;
          left = rect.left - tooltipWidth - arrowOffset;
          break;
        case 'right':
          top = rect.top + rect.height / 2 - tooltipHeight / 2;
          left = rect.right + arrowOffset;
          break;
      }

      // Keep tooltip within viewport
      if (left < padding) left = padding;
      if (left + tooltipWidth > window.innerWidth - padding) {
        left = window.innerWidth - tooltipWidth - padding;
      }
      if (top < padding) {
        top = rect.bottom + arrowOffset;
        arrowPosition = 'top';
      }
      if (top + tooltipHeight > window.innerHeight - padding) {
        top = rect.top - tooltipHeight - arrowOffset;
        arrowPosition = 'bottom';
      }

      setPosition({ top, left, arrowPosition });

      // Only scroll into view if element is outside viewport
      const isInViewport =
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth;

      if (!isInViewport) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    // Initial positioning with delay
    const timer = setTimeout(findAndPositionTooltip, 150);

    // Reposition on resize only (not on scroll to prevent jitter)
    window.addEventListener('resize', findAndPositionTooltip);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', findAndPositionTooltip);
    };
  }, [isActive, currentStepData]);

  if (!isActive || !currentStepData || !position) {
    return null;
  }

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  const tooltipContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black z-[9998] transition-opacity duration-300"
        style={{ opacity: 0.8 }}
        onClick={skipOnboarding}
      />

      {/* Highlight the target element */}
      {targetElement && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: targetElement.getBoundingClientRect().top - 4,
            left: targetElement.getBoundingClientRect().left - 4,
            width: targetElement.getBoundingClientRect().width + 8,
            height: targetElement.getBoundingClientRect().height + 8,
            boxShadow: '0 0 0 4px rgb(14, 165, 233), 0 0 0 9999px rgba(0, 0, 0, 0.8)',
            borderRadius: '8px',
          }}
        />
      )}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed z-[10000] w-[350px] bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300"
        style={{
          top: position.top,
          left: position.left,
        }}
      >
        {/* Progress bar */}
        <div className="h-1 bg-slate-200 dark:bg-slate-700">
          <div
            className="h-full bg-sky-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <span className="text-xs font-medium text-sky-500 dark:text-sky-400">
                Paso {currentStep + 1} de {totalSteps}
              </span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                {currentStepData.title}
              </h3>
            </div>
            <button
              onClick={skipOnboarding}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              title="Cerrar"
            >
              <X className="h-5 w-5 text-slate-400" />
            </button>
          </div>

          {/* Description */}
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
            {currentStepData.description}
          </p>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={skipOnboarding}
              className="flex items-center gap-1 px-3 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              <SkipForward className="h-4 w-4" />
              Saltar tutorial
            </button>

            <div className="flex items-center gap-2">
              {!isFirstStep && (
                <button
                  onClick={prevStep}
                  className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
              )}

              <button
                onClick={nextStep}
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-sky-500 hover:bg-sky-600 rounded-lg transition-colors"
              >
                {isLastStep ? (
                  '¡Entendido!'
                ) : (
                  <>
                    Siguiente
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex justify-center gap-1.5 pb-4">
          {Array.from({ length: totalSteps }).map((_, index) => (
            <div
              key={index}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index === currentStep
                  ? 'w-6 bg-sky-500'
                  : index < currentStep
                  ? 'w-1.5 bg-sky-300 dark:bg-sky-600'
                  : 'w-1.5 bg-slate-300 dark:bg-slate-600'
              }`}
            />
          ))}
        </div>

        {/* Arrow */}
        <div
          className={`absolute w-3 h-3 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 transform rotate-45 ${
            position.arrowPosition === 'top'
              ? '-top-1.5 left-1/2 -translate-x-1/2 border-t border-l'
              : position.arrowPosition === 'bottom'
              ? '-bottom-1.5 left-1/2 -translate-x-1/2 border-b border-r'
              : position.arrowPosition === 'left'
              ? '-left-1.5 top-1/2 -translate-y-1/2 border-l border-b'
              : '-right-1.5 top-1/2 -translate-y-1/2 border-r border-t'
          }`}
        />
      </div>
    </>
  );

  return createPortal(tooltipContent, document.body);
}
