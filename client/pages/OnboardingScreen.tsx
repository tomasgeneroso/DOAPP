import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { JOB_CATEGORIES } from "../../shared/constants/categories";
import { Check, X } from "lucide-react";

export default function OnboardingScreen() {
  const { user, updateUserData } = useAuth();
  const navigate = useNavigate();
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleInterest = (categoryId: string) => {
    setSelectedInterests((prev) =>
      prev.includes(categoryId)
        ? prev.filter((id) => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const handleSkip = async () => {
    try {
      setIsSubmitting(true);
      await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          interests: [],
          onboardingCompleted: true,
        }),
      });
      navigate("/");
    } catch (error) {
      console.error("Error al saltar onboarding:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      const response = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          interests: selectedInterests,
          onboardingCompleted: true,
        }),
      });

      if (response.ok) {
        navigate("/");
      }
    } catch (error) {
      console.error("Error al guardar intereses:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4">
            ¡Bienvenido, {user?.name}!
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Cuéntanos qué tipo de trabajos te interesan para mostrarte las mejores
            oportunidades
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
            Selecciona tus áreas de interés
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {JOB_CATEGORIES.map((category) => {
              const isSelected = selectedInterests.includes(category.id);
              return (
                <button
                  key={category.id}
                  onClick={() => toggleInterest(category.id)}
                  className={`relative flex flex-col items-center justify-center p-6 rounded-xl border-2 transition-all ${
                    isSelected
                      ? "border-sky-500 bg-sky-50 dark:bg-sky-900/20"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-sky-300 dark:hover:border-sky-600"
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2">
                      <Check className="h-5 w-5 text-sky-500" />
                    </div>
                  )}
                  <span className="text-4xl mb-2">{category.icon}</span>
                  <span
                    className={`text-sm font-medium text-center ${
                      isSelected
                        ? "text-sky-600 dark:text-sky-400"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {category.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-8 flex items-center justify-between gap-4">
            <button
              onClick={handleSkip}
              disabled={isSubmitting}
              className="px-6 py-3 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50"
            >
              Saltar por ahora
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || selectedInterests.length === 0}
              className="px-8 py-3 bg-sky-500 text-white rounded-xl font-medium hover:bg-sky-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Guardando..." : "Continuar"}
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          Podrás cambiar tus preferencias en cualquier momento desde tu perfil
        </p>
      </div>
    </div>
  );
}
