import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
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
    title: 'onboarding.welcome.title',
    description: 'onboarding.welcome.desc',
    targetSelector: '[data-onboarding="logo"]',
    position: 'bottom',
    page: '/',
  },
  {
    id: 'search',
    title: 'onboarding.search.title',
    description: 'onboarding.search.desc',
    targetSelector: '[data-onboarding="search"]',
    position: 'bottom',
    page: '/',
  },
  {
    id: 'jobs',
    title: 'onboarding.jobs.title',
    description: 'onboarding.jobs.desc',
    targetSelector: '[data-onboarding="jobs-list"]',
    position: 'top',
    page: '/',
  },
  {
    id: 'tasks',
    title: 'onboarding.tasks.title',
    description: 'onboarding.tasks.desc',
    targetSelector: '[data-onboarding="jobs-list"]',
    position: 'top',
    page: '/',
  },
  {
    id: 'create-job',
    title: 'onboarding.createJob.title',
    description: 'onboarding.createJob.desc',
    targetSelector: '[data-onboarding="create-job"]',
    position: 'bottom',
    page: '/',
  },
  {
    id: 'profile',
    title: 'onboarding.profile.title',
    description: 'onboarding.profile.desc',
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
  const location = useLocation();
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasCheckedOnboarding, setHasCheckedOnboarding] = useState(false);
  const [shouldShowOnboarding, setShouldShowOnboarding] = useState(false);

  // Check if user needs onboarding when they first log in
  useEffect(() => {
    // TEMPORARILY DISABLED IN PRODUCTION - TODO: re-enable when onboarding is fixed
    if (!import.meta.env.DEV) {
      setHasCheckedOnboarding(true);
      return;
    }

    if (user && !hasCheckedOnboarding) {
      const userId = user.id || user._id;
      if (!userId) {
        setHasCheckedOnboarding(true);
        return;
      }

      // Check localStorage first for tooltip onboarding
      const tooltipOnboardingStatus = localStorage.getItem(`onboarding_tooltips_${userId}`);

      // Show tooltips if:
      // 1. User hasn't completed/skipped tooltip onboarding, AND
      // 2. User has been using the app (onboardingCompleted means they went through interest selection)
      //    OR they're returning users who may not have the flag
      const shouldShow = !tooltipOnboardingStatus && user.onboardingCompleted !== false;

      if (shouldShow) {
        console.log('🎓 Tooltip onboarding: scheduling to show');
        setShouldShowOnboarding(true);
      }
      setHasCheckedOnboarding(true);
    }
  }, [user, hasCheckedOnboarding]);

  // Only activate onboarding when user is on the home page (/)
  useEffect(() => {
    if (shouldShowOnboarding && location.pathname === '/') {
      // Wait for DOM to be ready - check for key elements before showing
      const checkAndActivate = () => {
        const logoElement = document.querySelector('[data-onboarding="logo"]');
        const searchElement = document.querySelector('[data-onboarding="search"]');

        // If key elements exist, activate onboarding
        if (logoElement || searchElement) {
          console.log('🎓 Tooltip onboarding: activating');
          setIsActive(true);
          setShouldShowOnboarding(false);
          return true;
        }
        return false;
      };

      // Try immediately first
      if (checkAndActivate()) return;

      // Otherwise, poll for elements with a timeout
      let attempts = 0;
      const maxAttempts = 10;
      const timer = setInterval(() => {
        attempts++;
        if (checkAndActivate() || attempts >= maxAttempts) {
          clearInterval(timer);
          if (attempts >= maxAttempts) {
            console.log('🎓 Tooltip onboarding: elements not found, skipping');
            setShouldShowOnboarding(false);
          }
        }
      }, 300);

      return () => clearInterval(timer);
    }
  }, [shouldShowOnboarding, location.pathname]);

  // Deactivate onboarding if user navigates away from home page
  useEffect(() => {
    if (isActive && location.pathname !== '/') {
      setIsActive(false);
    }
  }, [location.pathname, isActive]);

  // Reset check when user changes (for new registrations)
  useEffect(() => {
    if (!user) {
      setHasCheckedOnboarding(false);
      setShouldShowOnboarding(false);
    }
  }, [user]);

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
    // Clear localStorage to allow restart
    if (user) {
      const userId = user.id || user._id;
      if (userId) {
        localStorage.removeItem(`onboarding_tooltips_${userId}`);
      }
    }
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
