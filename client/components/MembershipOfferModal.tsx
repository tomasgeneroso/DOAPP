import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Crown, X, Check, Sparkles, Zap } from 'lucide-react';

interface MembershipOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade?: (plan: 'monthly' | 'quarterly' | 'super_pro') => void;
}

export default function MembershipOfferModal({ isOpen, onClose, onUpgrade }: MembershipOfferModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'monthly' | 'quarterly' | 'super_pro'>('monthly');

  const handleUpgrade = (plan: 'monthly' | 'quarterly' | 'super_pro') => {
    if (onUpgrade) {
      onUpgrade(plan);
    } else {
      onClose();
      navigate(`/membership/checkout?plan=${plan}`);
    }
  };

  if (!isOpen) return null;

  const proFeatures = [
    t('membership.proFeat1', '1 publicación/mes sin comisión'),
    t('membership.proFeat2', '2 publicaciones iniciales gratis'),
    t('membership.proFeat3', '3% comisión adicional'),
    t('membership.proFeat4', 'Prioridad en búsquedas'),
    t('membership.proFeat5', 'Badge PRO dorado'),
  ];

  const plans = [
    {
      id: 'free',
      name: t('membership.planFreeName', 'Versión Gratis'),
      price: t('membership.planFreePrice', 'Gratis'),
      priceNote: t('membership.priceNoteAlways', 'siempre'),
      color: 'slate',
      features: [
        t('membership.freeFeat1', '3 publicaciones sin comisión*'),
        t('membership.freeFeat2', '8% comisión fija'),
        t('membership.freeFeat3', '3 códigos de invitación'),
      ],
    },
    {
      id: 'monthly',
      name: t('membership.planMonthlyName', 'PRO Mensual'),
      price: '$4.999',
      priceNote: t('membership.priceNoteMonth', 'ARS/mes'),
      badge: t('membership.badgePopular', 'MÁS POPULAR'),
      badgeColor: 'sky',
      color: 'sky',
      isPopular: true,
      features: proFeatures,
    },
    {
      id: 'quarterly',
      name: t('membership.planQuarterlyName', 'PRO Trimestral'),
      price: '$13.347',
      priceNote: t('membership.priceNoteQuarter', 'ARS/3 meses'),
      badge: t('membership.badgeSave', 'Ahorrá $1.650'),
      badgeColor: 'green',
      color: 'sky',
      savings: true,
      features: proFeatures,
    },
    {
      id: 'super_pro',
      name: t('membership.planSuperProName', 'SUPER PRO'),
      price: '$8.999',
      priceNote: t('membership.priceNoteMonth', 'ARS/mes'),
      badge: t('membership.badgePremium', 'PREMIUM'),
      badgeColor: 'purple',
      color: 'purple',
      isSuperPro: true,
      features: [
        t('membership.superProFeat1', '2 publicaciones/mes sin comisión'),
        t('membership.proFeat2', '2 publicaciones iniciales gratis'),
        t('membership.superProFeat3', '1% comisión adicional'),
        t('membership.superProFeat4', 'Analytics avanzados'),
        t('membership.superProFeat5', 'Reportes mensuales'),
      ],
    },
  ];

  const selectedPlanData = plans.find(p => p.id === selectedPlan);

  const btnGradient = selectedPlanData?.isSuperPro
    ? 'from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
    : 'from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col" style={{ maxHeight: 'calc(100vh - 24px)' }}>

        {/* Header compacto */}
        <div className="relative bg-gradient-to-r from-sky-600 to-blue-700 text-white px-6 py-4 rounded-t-2xl flex items-center gap-3 flex-shrink-0">
          <Crown className="w-7 h-7 text-yellow-300 flex-shrink-0" />
          <div>
            <h2 className="text-lg font-bold leading-tight">{t('membership.welcomeToDoapp', '¡Bienvenido a DOAPP!')}</h2>
            <p className="text-sky-100 text-xs">{t('membership.boostExperience', 'Elegí el plan que mejor se adapta a vos')}</p>
          </div>
          <button onClick={onClose} className="absolute top-3 right-3 text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Plans grid — no scroll */}
        <div className="grid grid-cols-4 gap-2 px-4 pt-4 pb-2 flex-shrink-0">
          {plans.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            const borderColor = isSelected
              ? plan.color === 'purple' ? 'border-purple-500' : 'border-sky-500'
              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600';

            return (
              <div
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id as any)}
                className={`relative border-2 rounded-xl p-3 cursor-pointer transition-all ${borderColor} ${isSelected ? 'shadow-md' : ''}`}
              >
                {/* Badge */}
                {plan.badge && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap text-white flex items-center gap-0.5 ${
                      plan.badgeColor === 'green' ? 'bg-green-500' :
                      plan.badgeColor === 'purple' ? 'bg-gradient-to-r from-purple-600 to-pink-600' :
                      'bg-sky-500'
                    }`}>
                      {plan.badgeColor === 'purple' && <Sparkles className="w-2.5 h-2.5" />}
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Name + price */}
                <div className="text-center mb-2 mt-1">
                  <p className="text-xs font-bold text-slate-800 dark:text-white leading-tight">{plan.name}</p>
                  <p className={`text-base font-extrabold mt-1 ${
                    plan.isSuperPro ? 'text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600' :
                    plan.id === 'free' ? 'text-slate-600 dark:text-slate-300' :
                    'text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-blue-600'
                  }`}>{plan.price}</p>
                  <p className="text-[10px] text-slate-400 leading-none">{plan.priceNote}</p>
                </div>

                {/* Features */}
                <ul className="space-y-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <Check className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-[10px] text-slate-600 dark:text-slate-300 leading-tight">{f}</span>
                    </li>
                  ))}
                </ul>

                {/* Selected check */}
                {isSelected && plan.id !== 'free' && (
                  <div className={`absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center ${plan.isSuperPro ? 'bg-purple-500' : 'bg-sky-500'}`}>
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Note */}
        <p className="text-[10px] text-slate-400 text-center px-4">{t('membership.offerNote', '*Para los primeros 1.000 usuarios')}</p>

        {/* Actions */}
        <div className="px-4 pb-4 pt-2 flex flex-col gap-2 flex-shrink-0">
          {selectedPlan !== 'free' && (
            <button
              onClick={() => handleUpgrade(selectedPlan as any)}
              className={`w-full py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r ${btnGradient} transition-all flex items-center justify-center gap-2`}
            >
              <Zap className="w-4 h-4" />
              {t('membership.activate', 'Activar {{plan}}', { plan: selectedPlanData?.name })}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full py-2 rounded-xl font-medium text-sm border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {t('membership.continueFree', 'Continuar con Versión Gratis')}
          </button>
          <p className="text-[10px] text-center text-slate-400">{t('membership.offerFooter', 'Cancelás cuando quieras · Siempre podés subir de plan')}</p>
        </div>
      </div>
    </div>
  );
}
