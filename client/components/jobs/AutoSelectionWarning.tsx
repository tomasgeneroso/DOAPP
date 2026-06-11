import { AlertCircle, Clock, PauseCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface AutoSelectionWarningProps {
  jobTitle: string;
  hoursUntilStart: number;
  proposalCount: number;
  jobId: string;
  isClient?: boolean;
  canPause?: boolean;
}

export default function AutoSelectionWarning({
  jobTitle,
  const { t } = useTranslation();
  hoursUntilStart,
  proposalCount,
  jobId,
  isClient = false,
  canPause = false
}: AutoSelectionWarningProps) {
  // Solo mostrar si:
  // - 1 sola propuesta
  // - Faltan entre 12 horas y 0 horas antes del inicio
  // - No ha sido auto-seleccionado aún
  if (proposalCount !== 1 || hoursUntilStart < 0 || hoursUntilStart >= 12) {
    return null;
  }

  return (
    <div className="p-4 rounded-lg border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-900/20">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />

        <div className="flex-1">
          <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">
            {isClient ? '⚠️ Auto-selección Inminente' : '⏰ Contratación Pendiente'}
          </h3>

          {isClient ? (
            <>
              <p className="text-sm text-orange-800 dark:text-orange-200 mb-3">
                Tu trabajo <strong>"{jobTitle}"</strong> será asignado automáticamente en{' '}
                <strong>{Math.round(hoursUntilStart)} horas</strong> porque hay solo 1 propuesta.
              </p>

              <div className="space-y-2 text-sm text-orange-700 dark:text-orange-300 mb-3">
                <p>💡 <strong>Opciones:</strong></p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Confirma ahora y cierra las postulaciones</li>
                  <li>Pausa el trabajo para arreglar tu agenda o esperar más propuestas</li>
                  <li>Deja que se auto-seleccione en {Math.round(hoursUntilStart)} horas</li>
                </ul>
              </div>

              {canPause && (
                <div className="flex gap-2">
                  <Link
                    to={`/jobs/${jobId}`}
                    className="inline-flex items-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <PauseCircle className="h-4 w-4" />
                    Pausar Publicación
                  </Link>
                  <button className="inline-flex items-center gap-2 px-3 py-2 bg-orange-100 dark:bg-orange-900/40 hover:bg-orange-200 dark:hover:bg-orange-900/60 text-orange-700 dark:text-orange-300 rounded-lg text-sm font-medium transition-colors">
                    <Clock className="h-4 w-4" />
                    Ver Propuesta
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-orange-800 dark:text-orange-200 mb-2">
                Eres el único postulado para <strong>"{jobTitle}"</strong>. Serás asignado automáticamente en{' '}
                <strong>{Math.round(hoursUntilStart)} horas</strong>.
              </p>
              <p className="text-sm text-orange-700 dark:text-orange-300">
                Prepárate: asegúrate de estar disponible a partir del horario acordado.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
