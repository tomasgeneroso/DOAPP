import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { InvitationCode } from '../types';
import Button from './ui/Button';

interface InvitationCodesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InvitationCodesModal({ isOpen, onClose }: InvitationCodesModalProps) {
  const { user } = useAuth();
  const [invitationData, setInvitationData] = useState<InvitationCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      loadInvitationData();
    }
  }, [isOpen, user]);

  const loadInvitationData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/referrals/my-invitations', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success) {
        setInvitationData(data.data);
      }
    } catch (err) {
      console.error('Error loading invitation data:', err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    if (invitationData?.referralCode) {
      navigator.clipboard.writeText(invitationData.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Códigos de Invitación
              </h2>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                Invita hasta 3 amigos y obtén beneficios exclusivos
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : invitationData ? (
            <>
              {/* Tu Código */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  Tu Código de Invitación
                </h3>
                <div className="flex gap-3">
                  <div className="flex-1 bg-white dark:bg-gray-700 rounded-lg p-4 font-mono text-2xl font-bold text-center text-blue-600 dark:text-blue-400">
                    {invitationData.referralCode}
                  </div>
                  <Button
                    variant="primary"
                    onClick={copyToClipboard}
                  >
                    {copied ? (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copiado!
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copiar
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Estadísticas */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {invitationData.codesUsed}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Usados</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                    {invitationData.codesRemaining}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Disponibles</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                    {invitationData.maxCodes}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Total</p>
                </div>
              </div>

              {/* Beneficios */}
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  Beneficios por invitar
                </h3>
                <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 dark:text-purple-400 font-bold">1er invitado:</span>
                    <span>2 contratos gratis cuando complete su primer contrato</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 dark:text-purple-400 font-bold">2do invitado:</span>
                    <span>1 contrato gratis cuando complete su primer contrato</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-600 dark:text-purple-400 font-bold">3er invitado:</span>
                    <span>3% de comisión permanente (vs 5% normal)</span>
                  </li>
                </ul>
              </div>

              {/* Invitados */}
              {invitationData.invitedUsers && invitationData.invitedUsers.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Usuarios Invitados ({invitationData.invitedUsers.length})
                  </h3>
                  <div className="space-y-2">
                    {invitationData.invitedUsers.map((invitedUser, index) => (
                      <div
                        key={invitedUser._id}
                        className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3"
                      >
                        <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                          {index + 1}
                        </div>
                        {invitedUser.avatar ? (
                          <img
                            src={invitedUser.avatar}
                            alt={invitedUser.name}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                            <span className="text-gray-600 dark:text-gray-300 font-semibold">
                              {invitedUser.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 dark:text-white">
                            {invitedUser.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Registrado {new Date(invitedUser.createdAt).toLocaleDateString('es-AR')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {invitationData.codesRemaining === 0 && (
                <div className="mt-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Has usado todos tus códigos de invitación. ¡Espera a que tus invitados completen contratos para recibir tus beneficios!
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600 dark:text-gray-400">
                No se pudo cargar la información de invitaciones
              </p>
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
