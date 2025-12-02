import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, X, Check, Sparkles } from 'lucide-react';
import Button from './ui/Button';

interface MembershipOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade?: (plan: 'monthly' | 'quarterly' | 'super_pro') => void;
}

export default function MembershipOfferModal({ isOpen, onClose, onUpgrade }: MembershipOfferModalProps) {
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'monthly' | 'quarterly' | 'super_pro'>('monthly');

  const handleUpgrade = (plan: 'monthly' | 'quarterly' | 'super_pro') => {
    console.log('🔵 handleUpgrade called with plan:', plan);
    console.log('🔵 onUpgrade prop:', onUpgrade);

    if (onUpgrade) {
      console.log('🔵 Calling onUpgrade callback');
      onUpgrade(plan);
    } else {
      console.log('🔵 Closing modal and navigating to checkout');
      onClose();
      navigate(`/membership/checkout?plan=${plan}`);
      console.log('🔵 Navigation triggered to:', `/membership/checkout?plan=${plan}`);
    }
  };

  if (!isOpen) return null;

  const plans = [
    {
      id: 'free',
      name: 'Free',
      subtitle: 'Para empezar',
      price: 'Gratis',
      priceDetail: 'siempre',
      features: [
        '3 contratos gratis para los primeros 1000 usuarios',
        'Comisión 8% en todos los contratos',
        '3 códigos de invitación',
      ],
    },
    {
      id: 'monthly',
      name: 'PRO Mensual',
      subtitle: 'Más popular',
      price: '€5.99',
      priceDetail: 'por mes',
      isPopular: true,
      features: [
        '1 contrato mensual sin comisión',
        '2 contratos gratis iniciales únicos',
        'Contratos adicionales: 3% de comisión',
        'Prioridad en resultados de búsqueda',
        'Verificación de identidad',
        'Badge PRO dorado',
      ],
    },
    {
      id: 'quarterly',
      name: 'PRO Trimestral',
      subtitle: 'Mejor valor',
      price: '€15.99',
      priceDetail: 'cada 3 meses',
      savings: 'Ahorra €1.98',
      features: [
        '1 contrato mensual sin comisión',
        '2 contratos gratis iniciales únicos',
        'Contratos adicionales: 3% de comisión',
        'Prioridad en resultados de búsqueda',
        'Verificación de identidad',
        'Badge PRO dorado',
      ],
    },
    {
      id: 'super_pro',
      name: 'SUPER PRO',
      subtitle: 'Para profesionales',
      price: '€8.99',
      priceDetail: 'por mes',
      isSuperPro: true,
      features: [
        'Todo lo de PRO +',
        '2 contratos mensuales sin comisión',
        '2 contratos gratis iniciales únicos',
        'Contratos adicionales: 2% de comisión',
        'Analytics avanzados',
        'Reportes mensuales detallados',
      ],
    },
  ];

  const selectedPlanData = plans.find(p => p.id === selectedPlan);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-sky-600 to-sky-500 text-white p-6 rounded-t-xl">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white hover:text-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="text-center">
            <Crown className="w-12 h-12 text-yellow-300 mx-auto mb-2" />
            <h2 className="text-2xl font-bold">¡Bienvenido a DOAPP!</h2>
            <p className="text-sky-100 text-sm mt-1">Potencia tu experiencia con una membresía PRO</p>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="p-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 pt-3">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative border-2 rounded-lg p-4 transition-all cursor-pointer ${
                  selectedPlan === plan.id
                    ? (plan as any).isSuperPro
                      ? 'border-purple-500 shadow-lg shadow-purple-200 dark:shadow-purple-900/50'
                      : 'border-sky-500 shadow-lg'
                    : 'border-gray-200 dark:border-gray-700 hover:border-sky-300'
                } ${
                  (plan as any).isPopular
                    ? 'ring-2 ring-sky-200 dark:ring-sky-800'
                    : (plan as any).isSuperPro
                    ? 'ring-2 ring-purple-200 dark:ring-purple-800'
                    : ''
                }`}
                onClick={() => setSelectedPlan(plan.id as any)}
              >
                {(plan as any).isPopular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                    <span className="bg-sky-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                      MÁS POPULAR
                    </span>
                  </div>
                )}

                {(plan as any).isSuperPro && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                    <span className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      PREMIUM
                    </span>
                  </div>
                )}

                {(plan as any).savings && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-10">
                    <span className="bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                      {(plan as any).savings}
                    </span>
                  </div>
                )}

                <div className="text-center mb-3">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                    {plan.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {plan.subtitle}
                  </p>
                </div>

                <div className="text-center mb-3">
                  <div className={`text-xl font-bold ${
                    plan.id === 'free'
                      ? 'text-gray-700 dark:text-gray-300'
                      : (plan as any).isSuperPro
                      ? 'text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600'
                      : 'text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-sky-500'
                  }`}>
                    {plan.price}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {plan.priceDetail}
                  </p>
                </div>

                <ul className="space-y-1.5 text-xs">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>

                {selectedPlan === plan.id && plan.id !== 'free' && (
                  <div className="absolute inset-0 border-2 border-sky-500 rounded-lg pointer-events-none">
                    <div className="absolute top-2 right-2 w-5 h-5 bg-sky-500 rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            {selectedPlan !== 'free' && (
              <Button
                variant="primary"
                onClick={() => handleUpgrade(selectedPlan as any)}
                className={`w-full ${
                  (selectedPlanData as any)?.isSuperPro
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                    : 'bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-700 hover:to-sky-600'
                }`}
              >
                <Crown className="w-4 h-4 mr-2 inline-block" />
                Activar {selectedPlanData?.name}
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={onClose}
              className="w-full border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
            >
              Continuar con plan FREE
            </Button>
          </div>

          <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-3">
            Cancela en cualquier momento • Siempre puedes actualizar
          </p>
        </div>
      </div>
    </div>
  );
}
