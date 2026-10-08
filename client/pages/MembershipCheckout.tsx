import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../components/ui/Toast';
import { Crown, Check, TrendingUp, Shield, BarChart3, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import Button from '../components/ui/Button';
import OrigenDeLaCotizacion, { type Cotizacion } from '../components/ui/OrigenDeLaCotizacion';
import { COMMISSION_RATES, MEMBERSHIP_PRICES_EUR, MEMBERSHIP_PROMO_DAYS } from '../../shared/constants/membershipPricing';

// Hay una sola membresia paga: PRO, mensual. Los links viejos con ?plan=quarterly
// o ?plan=super_pro caen aca tambien y se ven como PRO mensual.
const PLAN = 'monthly';

export default function MembershipCheckout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pricing, setPricing] = useState<any>(null);
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);

  console.log('🔄 MembershipCheckout renderizando...');
  console.log('👤 Usuario actual:', user);

  useEffect(() => {
    console.log('🎬 MembershipCheckout montado (useEffect)');
    console.log('👤 Usuario en useEffect:', user?.name, user?.email);
    loadPricing();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadPricing = async () => {
    try {
      console.log('💰 Cargando precios...');
      const token = localStorage.getItem('token');
      const endpoint = `/api/membership/pricing`;
      console.log('📍 Endpoint pricing:', endpoint);

      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      console.log('📊 Precios recibidos:', data);
      if (data.success) {
        setPricing(data.pricing);
        setCotizacion(data.cotizacion || null);
      }
    } catch (err: any) {
      console.error('❌ Error cargando precios:', err);
      setError('Error al cargar precios');
    }
  };

  const handleProceedToPayment = async () => {
    console.log('💳 Iniciando pago para plan:', PLAN);
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      console.log('🔑 Token presente:', !!token);

      const endpoint = `/api/membership/create-payment`;
      console.log('📍 Endpoint completo:', endpoint);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: PLAN }),
      });

      console.log('📡 Response status:', response.status);
      console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response no OK:', errorText);
        // El servidor contesta { success:false, message }: se muestra el mensaje, no el JSON crudo.
        let mensaje = `HTTP ${response.status}: ${errorText}`;
        try {
          const json = JSON.parse(errorText);
          if (json && typeof json.message === 'string' && json.message) mensaje = json.message;
        } catch {
          /* no era JSON: queda el texto tal cual */
        }
        throw new Error(mensaje);
      }

      const data = await response.json();
      console.log('📥 Respuesta del servidor:', data);

      if (data.success && data.initPoint) {
        console.log('✅ Redirigiendo a MercadoPago:', data.initPoint);
        toast.info('Redirigiendo a MercadoPago', 'Serás redirigido al procesador de pago');
        // Redirigir a MercadoPago
        window.location.href = data.initPoint;
      } else {
        console.error('❌ Error en respuesta:', data.message);
        toast.error('Error', data.message || 'Error al iniciar el pago');
        setError(data.message || 'Error al iniciar el pago');
      }
    } catch (err: any) {
      console.error('❌ Error procesando pago:', err);
      toast.error('Error de pago', err.message || 'Error al procesar el pago');
      setError(err.message || 'Error al procesar el pago');
    } finally {
      setLoading(false);
    }
  };

  // PRO se vende por visibilidad: no cambia la comision. Los numeros salen de
  // las constantes compartidas, no se escriben a mano aca.
  const proPlan = {
    name: t('membership.planMonthlyName', 'PRO'),
    priceARS: pricing?.pro?.priceARS || 0,
    period: 'por mes',
    benefits: [
      { icon: TrendingUp, title: '1 publicación mensual libre de comisión (0%)', description: 'Publicá 1 trabajo al mes sin comisión' },
      { icon: Crown, title: '2 publicaciones iniciales libres de comisión', description: 'Solo para los primeros 1000 usuarios totales de la app' },
      { icon: TrendingUp, title: `${MEMBERSHIP_PROMO_DAYS} días de promoción de tu perfil por mes`, description: 'Elegís los días en que querés que tu perfil aparezca destacado' },
      { icon: Shield, title: 'Prioridad en resultados de búsqueda', description: 'Aparece primero cuando clientes busquen servicios' },
      { icon: Crown, title: 'Verificación de identidad', description: 'Verificamos tus IDs necesarios para que ganes veracidad' },
      { icon: Crown, title: 'Badge PRO dorado junto a tu nombre', description: 'Destaca como profesional verificado' },
      { icon: BarChart3, title: 'Estadísticas avanzadas sobre trabajos', description: 'Analytics detallados de tus contratos y aplicaciones' },
      { icon: BarChart3, title: 'Analytics de balances', description: 'Visualiza tus ingresos y gastos en detalle' },
    ],
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Botón volver */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          {t('common.back', 'Volver')}
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-sky-600 to-sky-500 rounded-full mb-4">
            <Crown className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            {t('membership.upgradeTo', 'Actualizar a')} {proPlan.name}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            {t('membership.unlockFeatures', 'Desbloquea todas las funcionalidades profesionales de DOAPP')}
          </p>
        </div>

        {/* Tarjeta del plan */}
        <div className="max-w-md mx-auto mb-8">
          <div className="relative rounded-2xl border-2 border-sky-500 ring-2 ring-sky-500/30 bg-sky-50 dark:bg-sky-900/20 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Crown className="w-5 h-5 text-sky-500" />
              <span className="font-bold text-gray-900 dark:text-white">{proPlan.name}</span>
            </div>
            <p className="text-2xl font-extrabold text-gray-900 dark:text-white">
              €{MEMBERSHIP_PRICES_EUR.pro}
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400"> / {proPlan.period}</span>
            </p>
            {proPlan.priceARS > 0 && (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                ≈ ${Math.round(proPlan.priceARS).toLocaleString('es-AR')} ARS
              </p>
            )}
            <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-sky-600 dark:text-sky-400">
              <Check className="w-4 h-4" />
              {t('membership.selected', 'Seleccionado')}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Beneficios - 2/3 del ancho */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                {t('membership.whyChoose', '¿Por qué elegir')} {proPlan.name}?
              </h2>

              <div className="space-y-6">
                {proPlan.benefits.map((benefit, index) => {
                  const Icon = benefit.icon;
                  return (
                    <div key={index} className="flex gap-4">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-sky-100 dark:bg-sky-900/40 rounded-full flex items-center justify-center">
                          <Icon className="w-6 h-6 text-sky-600 dark:text-sky-400" />
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                          {benefit.title}
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                          {benefit.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* La comisión no depende del plan */}
              <div className="mt-8 rounded-lg p-6 bg-sky-50 dark:bg-sky-900/20">
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">
                  {t('membership.commissionTitle', 'La comisión es la misma en todos los planes')}
                </h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {t(
                    'membership.commissionSame',
                    'La comisión es del {{comision}}% y la paga el cliente. PRO no la modifica: lo que suma es visibilidad para tu perfil.',
                    { comision: COMMISSION_RATES.free },
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Resumen de pago - 1/3 del ancho (sticky) */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 sticky top-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                {t('membership.paymentSummary', 'Resumen de Pago')}
              </h2>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {proPlan.name}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {proPlan.period}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-sky-500">
                      ${Math.round(proPlan.priceARS).toLocaleString('es-AR')} ARS
                    </p>
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-gray-900 dark:text-white">{t('common.total', 'Total')}</p>
                    <p className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-sky-500">
                      ${Math.round(proPlan.priceARS).toLocaleString('es-AR')} ARS
                    </p>
                  </div>
                  {/*
                    El plan está fijado en euros y se cobra en pesos al cambio
                    del día: acá se dice con qué cotización salió este importe
                    y de dónde, para que el mes que viene un número distinto no
                    parezca un aumento sin aviso.
                  */}
                  <OrigenDeLaCotizacion cotizacion={cotizacion} moneda="EUR" className="mt-2 text-right" />
                </div>
              </div>

              <Button
                variant="primary"
                onClick={handleProceedToPayment}
                disabled={loading}
                className="w-full bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-700 hover:to-sky-600 text-lg py-3 flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    {t('common.processing', 'Procesando...')}
                  </>
                ) : (
                  <>
                    <Crown className="w-5 h-5 mr-2" />
                    {t('membership.proceedToPayment', 'Proceder al Pago')}
                  </>
                )}
              </Button>

              <div className="mt-6 space-y-3">
                <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>{t('membership.securePayment', 'Pago seguro con MercadoPago')}</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>{t('membership.cancelAnytime', 'Cancela en cualquier momento')}</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>{t('membership.instantActivation', 'Activación instantánea')}</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>{t('membership.autoRenewal', 'Renovación automática mensual')}</span>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  {t('membership.termsAgree', 'Al continuar, aceptas nuestros')}{' '}
                  <a href="/legal/terms" className="text-sky-600 hover:text-sky-700">
                    {t('membership.termsAndConditions', 'Términos y Condiciones')}
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
