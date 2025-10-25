import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Crown, X, Check, TrendingUp, Shield, BarChart3 } from 'lucide-react';
import Button from './ui/Button';

interface MembershipOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade?: (plan: 'monthly' | 'quarterly') => void;
}

export default function MembershipOfferModal({ isOpen, onClose, onUpgrade }: MembershipOfferModalProps) {
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'monthly' | 'quarterly'>('monthly');

  const handleUpgrade = (plan: 'monthly' | 'quarterly') => {
    console.log('🎯 handleUpgrade llamado con plan:', plan);

    if (onUpgrade) {
      console.log('✅ Usando callback onUpgrade (desde props)');
      onUpgrade(plan);
      // NO cerrar el modal aquí - el callback padre se encargará
    } else {
      console.log('✅ Navegando directamente a checkout (sin callback)');
      onClose();
      navigate(`/membership/checkout?plan=${plan}`);
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
      isPopular: false,
      features: [
        { text: '3 contratos gratis iniciales', included: true },
        { text: 'Comisión 6% en todos los contratos', included: true },
        { text: '3 códigos de invitación', included: true },
        { text: 'Búsqueda estándar', included: true },
        { text: 'Verificación básica', included: true },
        { text: 'Badge estándar', included: true },
        { text: 'Estadísticas avanzadas', included: false },
        { text: 'Prioridad en búsquedas', included: false },
        { text: 'Badge PRO dorado', included: false },
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
        { text: '3 contratos mensuales con 2% de comisión', included: true },
        { text: 'Aplica a 5 trabajos con 2% de comisión', included: true },
        { text: 'Prioridad en resultados de búsqueda', included: true },
        { text: 'Verificación de identidad', subtitle: 'Te dará más chances que apliquen a tu trabajo / que te contraten', included: true },
        { text: 'Badge PRO dorado junto a tu nombre', included: true },
        { text: 'Estadísticas avanzadas sobre trabajos', included: true },
        { text: 'Analytics de balances', included: true },
        { text: '1 contrato gratis bonus!', included: true },
      ],
    },
    {
      id: 'quarterly',
      name: 'PRO Trimestral',
      subtitle: 'Mejor valor',
      price: '€15.99',
      priceDetail: 'cada 3 meses',
      savings: 'Ahorra €1.98',
      isPopular: false,
      features: [
        { text: '3 contratos mensuales con 2% de comisión', included: true },
        { text: 'Aplica a 5 trabajos con 2% de comisión', included: true },
        { text: 'Prioridad en resultados de búsqueda', included: true },
        { text: 'Verificación de identidad', subtitle: 'Te dará más chances que apliquen a tu trabajo / que te contraten', included: true },
        { text: 'Badge PRO dorado junto a tu nombre', included: true },
        { text: 'Estadísticas avanzadas sobre trabajos', included: true },
        { text: 'Analytics de balances', included: true },
        { text: '1 contrato gratis bonus!', included: true },
      ],
    },
  ];

  const selectedPlanData = plans.find(p => p.id === selectedPlan);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full my-4 sm:my-8 max-h-[95vh] overflow-y-auto">
        <div className="relative">
          {/* Header con gradiente DOAPP */}
          <div className="bg-gradient-to-r from-sky-600 to-sky-500 text-white p-6 rounded-t-lg">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white hover:text-gray-200 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-full mb-4">
                <Crown className="w-10 h-10 text-yellow-300" />
              </div>
              <h2 className="text-3xl font-bold mb-2">
                ¡Bienvenido a DOAPP!
              </h2>
              <p className="text-sky-100">
                Potencia tu experiencia con una membresía PRO
              </p>
            </div>
          </div>

          {/* Comparación de planes */}
          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`relative border-2 rounded-lg p-6 transition-all cursor-pointer ${
                    selectedPlan === plan.id
                      ? 'border-sky-500 shadow-lg scale-105'
                      : 'border-gray-200 dark:border-gray-700 hover:border-sky-300'
                  } ${plan.isPopular ? 'lg:scale-105' : ''}`}
                  onClick={() => setSelectedPlan(plan.id as any)}
                >
                  {plan.isPopular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                      <span className="bg-gradient-to-r from-sky-600 to-sky-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                        MÁS POPULAR
                      </span>
                    </div>
                  )}

                  {plan.savings && (
                    <div className="absolute -top-3 right-4">
                      <span className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                        {plan.savings}
                      </span>
                    </div>
                  )}

                  <div className="text-center mb-6">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                      {plan.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {plan.subtitle}
                    </p>
                  </div>

                  <div className="text-center mb-6">
                    <div className={`text-4xl font-bold mb-1 ${
                      plan.id === 'free'
                        ? 'text-gray-700 dark:text-gray-300'
                        : 'text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-sky-500'
                    }`}>
                      {plan.price}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {plan.priceDetail}
                    </p>
                  </div>

                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        {feature.included ? (
                          <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <X className="w-5 h-5 text-gray-300 dark:text-gray-600 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <span className={feature.included ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}>
                            {feature.text}
                          </span>
                          {(feature as any).subtitle && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 italic">
                              {(feature as any).subtitle}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>

                  {plan.id !== 'free' && (
                    <Button
                      variant="primary"
                      className={`w-full ${
                        selectedPlan === plan.id
                          ? 'bg-gradient-to-r from-sky-600 to-sky-500'
                          : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPlan(plan.id as any);
                      }}
                    >
                      {selectedPlan === plan.id ? 'Seleccionado' : 'Seleccionar'}
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Beneficios destacados */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 bg-sky-50 dark:bg-sky-900/20 rounded-lg p-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900/40 rounded-full flex items-center justify-center mx-auto mb-3">
                  <TrendingUp className="w-6 h-6 text-sky-600 dark:text-sky-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                  Ahorra en Comisiones
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Solo 2% vs 6% sin licencia DO
                </p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900/40 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Shield className="w-6 h-6 text-sky-600 dark:text-sky-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                  Perfil Verificado
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Ganas confianza y destacas más tu perfil
                </p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900/40 rounded-full flex items-center justify-center mx-auto mb-3">
                  <BarChart3 className="w-6 h-6 text-sky-600 dark:text-sky-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                  3 Publicaciones Mensuales
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Con comisión reducida
                </p>
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="primary"
                onClick={() => selectedPlan !== 'free' && handleUpgrade(selectedPlan as 'monthly' | 'quarterly')}
                disabled={selectedPlan === 'free'}
                className="flex-1 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-700 hover:to-sky-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                <Crown className="w-5 h-5 mr-2 inline-block" />
                <span>{selectedPlan === 'free' ? 'Selecciona un plan PRO' : `Activar ${selectedPlanData?.name}`}</span>
              </Button>
              <Button
                variant="secondary"
                onClick={onClose}
                className="flex-1"
              >
                Más tarde
              </Button>
            </div>

            <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-4">
              Cancela en cualquier momento • Siempre puedes actualizar desde tu perfil
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
