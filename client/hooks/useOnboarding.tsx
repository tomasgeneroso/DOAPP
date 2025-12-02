import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './useAuth';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  targetSelector: string; // CSS selector for the element to highlight
  position: 'top' | 'bottom' | 'left' | 'right';
  page?: string; // Optional: which page this step belongs to
}

interface OnboardingContextType {
  isActive: boolean;
  currentStep: number;
  steps: OnboardingStep[];
  currentStepData: OnboardingStep | null;
  nextStep: () => void;
  prevStep: () => void;
  skipOnboarding: () => void;
  completeOnboarding: () => void;
  startOnboarding: () => void;
  goToStep: (stepIndex: number) => void;
  totalSteps: number;
  progress: number;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

// Define onboarding steps
const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: '¡Bienvenido a DOAPP!',
    description: 'Te guiaremos por las funciones principales de la plataforma. Puedes saltar este tutorial en cualquier momento o ir paso a paso.',
    targetSelector: '[data-onboarding="logo"]',
    position: 'bottom',
    page: '/',
  },
  {
    id: 'search',
    title: 'Buscar Trabajos y Usuarios',
    description: 'Usa la barra de búsqueda para encontrar trabajos por título, descripción o ubicación. También puedes buscar usuarios por nombre o @usuario.',
    targetSelector: '[data-onboarding="search"]',
    position: 'bottom',
    page: '/',
  },
  {
    id: 'jobs',
    title: 'Trabajos Disponibles',
    description: 'Aquí verás los trabajos publicados por otros usuarios. Haz clic en cualquiera para ver los detalles, aplicar y negociar el precio.',
    targetSelector: '[data-onboarding="jobs-list"]',
    position: 'top',
    page: '/',
  },
  {
    id: 'create-job',
    title: 'Publicar un Trabajo',
    description: 'Si necesitas contratar a alguien, publica tu trabajo desde aquí. Recibirás propuestas de profesionales interesados.',
    targetSelector: '[data-onboarding="create-job"]',
    position: 'bottom',
    page: '/',
  },
  {
    id: 'profile',
    title: 'Tu Menú de Usuario',
    description: 'Desde aquí accedes a tu perfil, dashboard, mensajes, contratos, configuración y más. También puedes invitar amigos con códigos de referido.',
    targetSelector: '[data-onboarding="profile-menu"]',
    position: 'bottom',
    page: '/',
  },
];

interface OnboardingProviderProps {
  children: ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const { user, token } = useAuth();
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasCheckedOnboarding, setHasCheckedOnboarding] = useState(false);

  // Check if user needs onboarding when they first log in
  useEffect(() => {
    if (user && !hasCheckedOnboarding) {
      // Check localStorage first for tooltip onboarding (separate from interest selection)
      const tooltipOnboardingCompleted = localStorage.getItem(`onboarding_tooltips_${user.id || user._id}`);

      if (!tooltipOnboardingCompleted && user.onboardingCompleted) {
        // User completed interest selection but not tooltips - show tooltips
        setIsActive(true);
      }
      setHasCheckedOnboarding(true);
    }
  }, [user, hasCheckedOnboarding]);

  const nextStep = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      completeOnboarding();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const goToStep = (stepIndex: number) => {
    if (stepIndex >= 0 && stepIndex < ONBOARDING_STEPS.length) {
      setCurrentStep(stepIndex);
    }
  };

  const skipOnboarding = async () => {
    setIsActive(false);
    setCurrentStep(0);

    // Save to localStorage
    if (user) {
      localStorage.setItem(`onboarding_tooltips_${user.id || user._id}`, 'skipped');
    }

    // Optionally save to backend
    try {
      await fetch('/api/auth/onboarding-tooltips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ completed: false, skipped: true }),
      });
    } catch (error) {
      console.error('Error saving onboarding status:', error);
    }
  };

  const completeOnboarding = async () => {
    setIsActive(false);
    setCurrentStep(0);

    // Save to localStorage
    if (user) {
      localStorage.setItem(`onboarding_tooltips_${user.id || user._id}`, 'completed');
    }

    // Save to backend
    try {
      await fetch('/api/auth/onboarding-tooltips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ completed: true, skipped: false }),
      });
    } catch (error) {
      console.error('Error saving onboarding status:', error);
    }
  };

  const startOnboarding = () => {
    setCurrentStep(0);
    setIsActive(true);
  };

  const currentStepData = isActive ? ONBOARDING_STEPS[currentStep] : null;
  const totalSteps = ONBOARDING_STEPS.length;
  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <OnboardingContext.Provider
      value={{
        isActive,
        currentStep,
        steps: ONBOARDING_STEPS,
        currentStepData,
        nextStep,
        prevStep,
        skipOnboarding,
        completeOnboarding,
        startOnboarding,
        goToStep,
        totalSteps,
        progress,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}
