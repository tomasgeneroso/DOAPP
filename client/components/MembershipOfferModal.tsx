import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Crown, X, Check, Zap } from 'lucide-react';
import { COMMISSION_RATES, MEMBERSHIP_PRICES_EUR, MEMBERSHIP_PROMO_DAYS } from '../../shared/constants/membershipPricing';

interface MembershipOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade?: (plan: 'monthly') => void;
}

export default function MembershipOfferModal({ isOpen, onClose, onUpgrade }: MembershipOfferModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<'free' | 'monthly'>('monthly');

  const handleUpgrade = (plan: 'monthly') => {
    if (onUpgrade) {
      onUpgrade(plan);
    } else {
      onClose();
      navigate(`/membership/checkout?plan=${plan}`);
    }
  };

  if (!isOpen) return null;

  // PRO se vende por visibilidad: no modifica la comision, que es la misma en
  // todos los planes. Los numeros salen de las constantes compartidas.
  // Sólo lo que dicen los Términos (8.1): visibilidad. Antes la lista prometía también
  // "1 publicación/mes sin comisión" y "2 iniciales gratis", que contradicen la nota de
  // abajo (la comisión es la misma en todos los planes).
  const proFeatures = [
    t('membership.proFeat3', '{{dias}} días de promoción de tu perfil por mes', { dias: MEMBERSHIP_PROMO_DAYS }),
    t('membership.proFeat4', 'Prioridad en búsquedas'),
    t('membership.proFeat5', 'Badge PRO dorado'),
  ];

  const plans = [
    {
      id: 'free' as const,
      name: t('membership.planFreeName', 'Versión Gratis'),
      price: t('membership.planFreePrice', 'Gratis'),
      priceNote: t('membership.priceNoteAlways', 'siempre'),
      features: [
        t('membership.freeFeat1', '3 publicaciones sin comisión*'),
        t('membership.freeFeat2', 'Comisión del {{comision}}%, a cargo del cliente', { comision: COMMISSION_RATES.free }),
        t('membership.freeFeat3', '3 códigos de invitación'),
      ],
    },
    {
      id: 'monthly' as const,
      name: t('membership.planMonthlyName', 'PRO'),
      price: `€${MEMBERSHIP_PRICES_EUR.pro}`,
      priceNote: t('membership.priceNoteMonth', 'por mes, cobrado en pesos al cambio del día'),
      features: proFeatures,
    },
  ];

  const selectedPlanData = plans.find(p => p.id === selectedPlan);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col" style={{ maxHeight: 'calc(100vh - 24px)' }}>

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

        {/* Plans grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 pt-4 pb-2 overflow-y-auto">
          {plans.map((plan) => {
            const isSelected = selectedPlan === plan.id;
            const borderColor = isSelected
              ? 'border-sky-500'
              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600';

            return (
              <div
                key={plan.id}
                onClick={() => setSelectedPlan(plan.id)}
                className={`relative border-2 rounded-xl p-4 cursor-pointer transition-all ${borderColor} ${isSelected ? 'shadow-md' : ''}`}
              >
                {/* Name + price */}
                <div className="text-center mb-3">
                  <p className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{plan.name}</p>
                  <p className={`text-xl font-extrabold mt-1 ${
                    plan.id === 'free'
                      ? 'text-slate-600 dark:text-slate-300'
                      : 'text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-blue-600'
                  }`}>{plan.price}</p>
                  <p className="text-[11px] text-slate-400 leading-tight">{plan.priceNote}</p>
                </div>

                {/* Features */}
                <ul className="space-y-1.5">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-slate-600 dark:text-slate-300 leading-tight">{f}</span>
                    </li>
                  ))}
                </ul>

                {/* Selected check */}
                {isSelected && plan.id !== 'free' && (
                  <div className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center bg-sky-500">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Notes */}
        <p className="text-[10px] text-slate-400 text-center px-4">{t('membership.offerNote', '*Para los primeros 1.000 usuarios')}</p>
        <p className="text-[10px] text-slate-400 text-center px-4 mt-1">
          {t('membership.sameCommissionNote', 'La comisión es la misma en todos los planes: PRO suma visibilidad, no cambia lo que pagás de comisión.')}
        </p>

        {/* Actions */}
        <div className="px-4 pb-4 pt-2 flex flex-col gap-2 flex-shrink-0">
          {selectedPlan !== 'free' && (
            <button
              onClick={() => handleUpgrade('monthly')}
              className="w-full py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 transition-all flex items-center justify-center gap-2"
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
