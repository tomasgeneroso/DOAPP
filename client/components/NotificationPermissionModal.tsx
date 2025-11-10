import React from 'react';
import { Bell, X, MessageSquare, Briefcase, CreditCard } from 'lucide-react';
import Button from './ui/Button';

interface NotificationPermissionModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
  isRetry?: boolean;
}

export default function NotificationPermissionModal({
  isOpen,
  onAccept,
  onDecline,
  isRetry = false,
}: NotificationPermissionModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full animate-scale-in">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-blue-500 to-purple-600 rounded-t-2xl p-6 text-white">
          <button
            onClick={onDecline}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center justify-center mb-4">
            <div className="bg-white/20 backdrop-blur-sm p-4 rounded-full">
              <Bell className="h-10 w-10" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-center">
            {isRetry ? '¿Activar Notificaciones?' : 'Mantente al día'}
          </h2>
          <p className="text-blue-100 text-center mt-2">
            {isRetry
              ? 'No te pierdas actualizaciones importantes'
              : 'Recibe alertas instantáneas en tiempo real'}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg shrink-0">
                <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Mensajes nuevos
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Recibe notificaciones cuando alguien te escriba
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg shrink-0">
                <Briefcase className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Actualizaciones de contratos
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Entérate al instante de cambios en tus trabajos
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg shrink-0">
                <CreditCard className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Confirmaciones de pago
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Sé notificado cuando recibas o envíes pagos
                </p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-xs text-blue-800 dark:text-blue-300 text-center">
              🔒 Puedes desactivar las notificaciones en cualquier momento desde la configuración
            </p>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <Button
              onClick={onAccept}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-3 rounded-xl transition-all duration-200 transform hover:scale-[1.02]"
            >
              Activar Notificaciones
            </Button>

            <button
              onClick={onDecline}
              className="w-full text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium py-2 rounded-xl transition-colors"
            >
              {isRetry ? 'Ahora no' : 'Más tarde'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
