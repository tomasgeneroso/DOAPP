import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Crown, Check, TrendingUp, Shield, BarChart3, Loader2, AlertCircle, ArrowLeft } from 'lucide-react';
import Button from '../components/ui/Button';

export default function MembershipCheckout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const plan = searchParams.get('plan') || 'monthly'; // monthly, quarterly, or super_pro

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pricing, setPricing] = useState<any>(null);
  const [upgradeInfo, setUpgradeInfo] = useState<any>(null);

  console.log('🔄 MembershipCheckout renderizando...');
  console.log('👤 Usuario actual:', user);
  console.log('📦 Plan desde URL:', plan);

  useEffect(() => {
    console.log('🎬 MembershipCheckout montado (useEffect)');
    console.log('👤 Usuario en useEffect:', user?.name, user?.email);
    console.log('📦 Plan seleccionado:', plan);
    loadPricing();
    checkUpgradeEligibility();
  }, []);

  const checkUpgradeEligibility = async () => {
    // Verificar si el usuario puede hacer upgrade (PRO → SUPER PRO)
    if (user?.membershipTier === 'pro' && user?.hasMembership && plan === 'super_pro') {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/membership/usage', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (data.success) {
          setUpgradeInfo({
            isUpgrade: true,
            daysRemaining: data.data.nextReset
              ? Math.ceil((new Date(data.data.nextReset).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
              : 0
          });
        }
      } catch (err) {
        console.error('Error checking upgrade eligibility:', err);
      }
    }
  };

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
      }
    } catch (err: any) {
      console.error('❌ Error cargando precios:', err);
      setError('Error al cargar precios');
    }
  };

  const handleProceedToPayment = async () => {
    console.log('💳 Iniciando pago para plan:', plan);
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
        body: JSON.stringify({ plan }),
      });

      console.log('📡 Response status:', response.status);
      console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Response no OK:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('📥 Respuesta del servidor:', data);

      if (data.success && data.initPoint) {
        console.log('✅ Redirigiendo a MercadoPago:', data.initPoint);
        // Redirigir a MercadoPago
        window.location.href = data.initPoint;
      } else {
        console.error('❌ Error en respuesta:', data.message);
        setError(data.message || 'Error al iniciar el pago');
      }
    } catch (err: any) {
      console.error('❌ Error procesando pago:', err);
      setError(err.message || 'Error al procesar el pago');
    } finally {
      setLoading(false);
    }
  };

  const planDetails = {
    monthly: {
      name: 'PRO Mensual',
      price: pricing?.pro?.price || 5.99,
      priceUSD: pricing?.pro?.price || 5.99,
      period: 'por mes',
      benefits: [
        { icon: TrendingUp, title: '1 contrato mensual SIN comisión (0%)', description: 'Publica 1 trabajo al mes completamente gratis' },
        { icon: Crown, title: '2 contratos gratis iniciales únicos', description: 'Solo para los primeros 1000 usuarios totales de la app' },
        { icon: Check, title: 'Contratos adicionales: 3% de comisión', description: 'Plan PRO (3%) vs Plan Free (8%) - ahorra 5%' },
        { icon: Shield, title: 'Prioridad en resultados de búsqueda', description: 'Aparece primero cuando clientes busquen servicios' },
        { icon: Crown, title: 'Verificación de identidad', description: 'Verificamos tus IDs necesarios para que ganes veracidad' },
        { icon: Crown, title: 'Badge PRO dorado junto a tu nombre', description: 'Destaca como profesional verificado' },
        { icon: BarChart3, title: 'Estadísticas avanzadas sobre trabajos', description: 'Analytics detallados de tus contratos y aplicaciones' },
        { icon: BarChart3, title: 'Analytics de balances', description: 'Visualiza tus ingresos y gastos en detalle' },
      ],
    },
    quarterly: {
      name: 'PRO Trimestral',
      price: pricing?.pro?.price ? pricing.pro.price * 3 * 0.89 : 15.99,
      priceUSD: pricing?.pro?.price ? pricing.pro.price * 3 * 0.89 : 15.99,
      period: 'cada 3 meses',
      savings: '$1.98',
      benefits: [
        { icon: TrendingUp, title: '1 contrato mensual SIN comisión (0%)', description: 'Publica 1 trabajo al mes completamente gratis' },
        { icon: Crown, title: '2 contratos gratis iniciales únicos', description: 'Solo para los primeros 1000 usuarios totales de la app' },
        { icon: Check, title: 'Contratos adicionales: 3% de comisión', description: 'Plan PRO (3%) vs Plan Free (8%) - ahorra 5%' },
        { icon: Shield, title: 'Prioridad en resultados de búsqueda', description: 'Aparece primero cuando clientes busquen servicios' },
        { icon: Crown, title: 'Verificación de identidad', description: 'Verificamos tus IDs necesarios para que ganes veracidad' },
        { icon: Crown, title: 'Badge PRO dorado junto a tu nombre', description: 'Destaca como profesional verificado' },
        { icon: BarChart3, title: 'Estadísticas avanzadas sobre trabajos', description: 'Analytics detallados de tus contratos y aplicaciones' },
        { icon: BarChart3, title: 'Analytics de balances', description: 'Visualiza tus ingresos y gastos en detalle' },
      ],
    },
    super_pro: {
      name: 'SUPER PRO',
      price: pricing?.superPro?.price || 8.99,
      priceUSD: pricing?.superPro?.price || 8.99,
      period: 'por mes',
      benefits: [
        { icon: Crown, title: 'Todos los beneficios de PRO', description: 'Incluye todos los beneficios del plan PRO: verificación, badge dorado, prioridad en búsquedas' },
        { icon: TrendingUp, title: '2 contratos mensuales SIN comisión (0%)', description: 'Publica 2 trabajos al mes completamente gratis' },
        { icon: Crown, title: '2 contratos gratis iniciales únicos', description: 'Solo para los primeros 1000 usuarios totales de la app' },
        { icon: Check, title: 'Contratos adicionales: 2% de comisión', description: 'La comisión más baja de la plataforma - ahorra 6% vs Free (8%) y 1% vs PRO (3%)' },
        { icon: BarChart3, title: 'Dashboard exclusivo con métricas avanzadas', description: 'Panel personalizado con gráficos interactivos, KPIs y seguimiento de rendimiento en tiempo real' },
        { icon: BarChart3, title: 'Estadísticas de visitas a tu perfil', description: 'Detalle completo de quién visita tu perfil: nombre, frecuencia, fecha de última visita y procedencia' },
        { icon: TrendingUp, title: 'Analytics de conversaciones', description: 'Analiza con quién conversas, si tuviste contratos completados con ellos, tasa de conversión a contrato' },
        { icon: Check, title: 'Estadísticas de contratos completados', description: 'Métricas detalladas: ganancias totales, ratings promedio, clientes repetidos, tasa de éxito, distribución por categoría' },
        { icon: BarChart3, title: 'Reportes mensuales automatizados', description: 'Informes completos enviados por email: resumen de actividad, ganancias, tendencias, comparativa con mes anterior' },
      ],
    },
  };

  const selectedPlan = planDetails[plan as keyof typeof planDetails];

  if (!selectedPlan) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Plan no válido
          </h1>
          <Button onClick={() => navigate('/')}>Volver al inicio</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Botón volver */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Volver
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-sky-600 to-sky-500 rounded-full mb-4">
            <Crown className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Actualizar a {selectedPlan.name}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">
            Desbloquea todas las funcionalidades profesionales de DOAPP
          </p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Banner de Upgrade */}
        {upgradeInfo?.isUpgrade && upgradeInfo.daysRemaining > 0 && (
          <div className="mb-6 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-2 border-purple-300 dark:border-purple-700 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-600 rounded-full flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-purple-900 dark:text-purple-100 mb-2">
                  Upgrade a SUPER PRO
                </h3>
                <p className="text-purple-800 dark:text-purple-200 text-sm mb-3">
                  Tienes <strong>{upgradeInfo.daysRemaining} días restantes</strong> en tu membresía PRO actual. Solo pagarás la diferencia prorrateada para actualizar a SUPER PRO por el tiempo restante.
                </p>
                <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg p-3 text-sm">
                  <p className="text-purple-900 dark:text-purple-100 font-semibold mb-1">
                    ¿Cómo funciona el upgrade?
                  </p>
                  <ul className="list-disc list-inside text-purple-800 dark:text-purple-200 space-y-1">
                    <li>Calculas el valor de tus {upgradeInfo.daysRemaining} días restantes de PRO</li>
                    <li>Solo pagas la diferencia para tener SUPER PRO por esos mismos días</li>
                    <li>Tu fecha de renovación se mantiene igual</li>
                    <li>Obtienes acceso inmediato a todos los beneficios SUPER PRO</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Beneficios - 2/3 del ancho */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                ¿Por qué elegir {selectedPlan.name}?
              </h2>

              <div className="space-y-6">
                {selectedPlan.benefits.map((benefit, index) => {
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

              {/* Comparación */}
              <div className={`mt-8 rounded-lg p-6 ${
                plan === 'super_pro'
                  ? 'bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20'
                  : 'bg-sky-50 dark:bg-sky-900/20'
              }`}>
                <h3 className="font-bold text-gray-900 dark:text-white mb-4">
                  Comparación de Comisiones
                </h3>
                <div className={`grid ${plan === 'super_pro' ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>
                  <div className="text-center p-4 bg-white dark:bg-gray-800 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Plan Free</p>
                    <p className="text-3xl font-bold text-gray-400 dark:text-gray-500">8%</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">de comisión</p>
                  </div>
                  {plan === 'super_pro' && (
                    <div className="text-center p-4 bg-gradient-to-br from-sky-400 to-sky-500 rounded-lg">
                      <p className="text-sm text-sky-100 mb-2">Plan PRO</p>
                      <p className="text-3xl font-bold text-white">3%</p>
                      <p className="text-xs text-sky-100 mt-1">de comisión</p>
                    </div>
                  )}
                  <div className={`text-center p-4 rounded-lg ${
                    plan === 'super_pro'
                      ? 'bg-gradient-to-br from-purple-600 to-pink-600'
                      : 'bg-gradient-to-br from-sky-500 to-sky-600'
                  }`}>
                    <p className="text-sm text-white opacity-90 mb-2">
                      {plan === 'super_pro' ? 'Plan SUPER PRO' : 'Plan PRO'}
                    </p>
                    <p className="text-3xl font-bold text-white">
                      {plan === 'super_pro' ? '2%' : '3%'}
                    </p>
                    <p className="text-xs text-white opacity-90 mt-1">de comisión</p>
                  </div>
                </div>
                <p className="text-center text-sm text-green-600 dark:text-green-400 font-semibold mt-4">
                  {plan === 'super_pro'
                    ? '¡Ahorra hasta 6% en cada transacción vs Free y 1% vs PRO!'
                    : '¡Ahorra 5% en cada transacción!'}
                </p>
              </div>
            </div>
          </div>

          {/* Resumen de pago - 1/3 del ancho (sticky) */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 sticky top-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                Resumen de Pago
              </h2>

              {plan === 'quarterly' && selectedPlan.savings && (
                <div className="mb-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <p className="text-green-800 dark:text-green-200 text-sm font-semibold text-center">
                    Ahorra {selectedPlan.savings} con el plan trimestral
                  </p>
                </div>
              )}

              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {selectedPlan.name}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedPlan.period}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-sky-500">
                      ${selectedPlan.priceUSD.toFixed(2)} USD
                    </p>
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-gray-900 dark:text-white">Total</p>
                    <p className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-sky-500">
                      ${selectedPlan.priceUSD.toFixed(2)} USD
                    </p>
                  </div>
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
                    Procesando...
                  </>
                ) : (
                  <>
                    <Crown className="w-5 h-5 mr-2" />
                    Proceder al Pago
                  </>
                )}
              </Button>

              <div className="mt-6 space-y-3">
                <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>Pago seguro con MercadoPago</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>Cancela en cualquier momento</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>Activación instantánea</span>
                </div>
                <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>Renovación automática mensual</span>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  Al continuar, aceptas nuestros{' '}
                  <a href="/legal/terms" className="text-sky-600 hover:text-sky-700">
                    Términos y Condiciones
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
