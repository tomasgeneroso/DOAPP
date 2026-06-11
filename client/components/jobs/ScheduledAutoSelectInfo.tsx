import { Clock, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ScheduledAutoSelectInfoProps {
  autoSelectAt?: string;
  jobTitle?: string;
  clientName?: string;
}

export default function ScheduledAutoSelectInfo({
  autoSelectAt,
  jobTitle,
  clientName
}: ScheduledAutoSelectInfoProps) {
  const { t } = useTranslation();
  if (!autoSelectAt) {
    return null;
  }

  const autoSelectTime = new Date(autoSelectAt);
  const nowTime = new Date();
  const msUntilSelect = autoSelectTime.getTime() - nowTime.getTime();
  const hoursUntilSelect = msUntilSelect / (1000 * 60 * 60);
  const minutesUntilSelect = (msUntilSelect / (1000 * 60)) % 60;

  return (
    <div className="p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20">
      <div className="flex items-start gap-3">
        <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />

        <div className="flex-1">
          <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            ⏱️ Auto-selección Programada
          </h3>

          <div className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
            <p>
              <strong>{clientName}</strong> ha programado auto-selección para:
            </p>
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {autoSelectTime.toLocaleString('es-AR')}
            </p>

            {msUntilSelect > 0 ? (
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Faltan{' '}
                {hoursUntilSelect >= 1
                  ? `${Math.round(hoursUntilSelect)} horas`
                  : `${Math.round(minutesUntilSelect)} minutos`}
                {' '}para que seas asignado automáticamente.
              </p>
            ) : (
              <p className="text-xs text-orange-600 dark:text-orange-300">
                La auto-selección ya debería haber ocurrido.
              </p>
            )}

            <div className="mt-3 p-3 bg-blue-100 dark:bg-blue-900/40 rounded border border-blue-300 dark:border-blue-700">
              <p className="text-xs leading-relaxed">
                💡 <strong>Qué significa:</strong> Eres el único postulado para &quot;{jobTitle}&quot;.
                Si el cliente no selecciona otro worker antes de esta hora, serás asignado automáticamente.
              </p>
            </div>

            <div className="mt-3 p-3 bg-yellow-100 dark:bg-yellow-900/20 rounded border border-yellow-300 dark:border-yellow-700">
              <div className="flex gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-700 dark:text-yellow-300 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-800 dark:text-yellow-200 leading-relaxed">
                  <strong>Prepárate:</strong> Asegúrate de estar disponible para comenzar el trabajo en su fecha y hora programada.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
