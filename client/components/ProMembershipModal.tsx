import React, { useState, useEffect } from 'react';
import { MembershipPricing } from '../types';
import Button from './ui/Button';
import { Crown, Check, X } from 'lucide-react';

interface ProMembershipModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProMembershipModal({ isOpen, onClose }: ProMembershipModalProps) {
  const [pricing, setPricing] = useState<MembershipPricing | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadPricing();
    }
  }, [isOpen]);

  const loadPricing = async () => {
    try {
      const response = await fetch('/api/membership/pricing');
      const data = await response.json();
      if (data.success) {
        setPricing(data.tiers);
      }
    } catch (err) {
      console.error('Error loading pricing:', err);
      setError('Error al cargar precios');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    setError(null);
    setUpgrading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/membership/upgrade-to-pro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al actualizar a PRO');
      }

      // Redirect to MercadoPago payment
      if (data.data?.paymentUrl) {
        window.location.href = data.data.paymentUrl;
      }
    } catch (err: any) {
      setError(err.message);
      setUpgrading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Crown className="w-8 h-8 text-yellow-500" />
                Actualiza a PRO
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                Desbloquea beneficios exclusivos y ahorra en comisiones
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-6">
              <p className="text-red-800 dark:text-red-200">{error}</p>
            </div>
          ) : pricing ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {/* Plan FREE */}
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6 border-2 border-gray-200 dark:border-gray-600">
                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      {pricing.free.name}
                    </h3>
                    <div className="text-4xl font-bold text-gray-900 dark:text-white">
                      Gratis
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">Por siempre</p>
                  </div>

                  <ul className="space-y-3">
                    {pricing.free.benefits.map((benefit, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <Check className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    <div className="bg-white dark:bg-gray-600 rounded-lg p-3 text-center">
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                        Plan Actual
                      </p>
                    </div>
                  </div>
                </div>

                {/* Plan PRO */}
                <div className="bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg p-6 border-2 border-purple-500 relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-purple-500 text-white px-4 py-1 text-xs font-bold">
                    POPULAR
                  </div>

                  <div className="text-center mb-6">
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 flex items-center justify-center gap-2">
                      <Crown className="w-6 h-6 text-yellow-500" />
                      {pricing.pro.name}
                    </h3>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className="text-4xl font-bold text-purple-600 dark:text-purple-400">
                        ${pricing.pro.priceARS?.toLocaleString('es-AR')}
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">ARS/mes</span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      €{pricing.pro.priceEUR} EUR ≈ ${pricing.pro.priceARS?.toLocaleString('es-AR')} ARS
                    </p>
                  </div>

                  <ul className="space-y-3 mb-6">
                    {pricing.pro.benefits.map((benefit, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <Check className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    variant="primary"
                    onClick={handleUpgrade}
                    disabled={upgrading}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                  >
                    {upgrading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                        Procesando...
                      </>
                    ) : (
                      <>
                        <Crown className="w-5 h-5 mr-2" />
                        Actualizar a PRO
                      </>
                    )}
                  </Button>

                  <p className="text-xs text-center text-gray-600 dark:text-gray-400 mt-3">
                    Cancela en cualquier momento. Procesado por MercadoPago.
                  </p>
                </div>
              </div>

              {/* Comparación de características */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 text-center">
                  ¿Por qué PRO?
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Ahorra en Comisiones</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Solo 2% vs 6% en plan Free</p>
                  </div>

                  <div className="text-center">
                    <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Verificación Premium</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Badge PRO y KYC completo</p>
                  </div>

                  <div className="text-center">
                    <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-1">Prioridad en Búsquedas</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Aparece primero en resultados</p>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
