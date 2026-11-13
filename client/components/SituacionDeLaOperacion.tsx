import type { SituacionParaLaPersona } from '../../shared/jobs/situacionParaLaPersona';

/**
 * En qué está un trabajo o un contrato, de punta a punta, dicho para quien lo mira (pedido del dueño, 2026-11-12: «todo debe estar con los mismos estados»).
 * Es el MISMO estado que ve el equipo en Publicaciones, Pagos y Contratos; el servidor lo manda ya traducido para el rol (`situacion` en los contratos y trabajos).
 * Sin `situacion` (una respuesta vieja, un administrador que mira) no dibuja nada.
 */
const COLORES: Record<SituacionParaLaPersona['tono'], string> = {
  atencion: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  espera: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  bien: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  cierre: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};

export default function SituacionDeLaOperacion({
  situacion,
  conExplicacion = false,
  className = '',
}: {
  situacion?: SituacionParaLaPersona | null;
  conExplicacion?: boolean;
  className?: string;
}) {
  if (!situacion) return null;
  return (
    <span className={`inline-flex flex-col gap-0.5 ${className}`} data-testid="situacion-de-la-operacion">
      <span
        title={situacion.explicacion || undefined}
        className={`inline-block w-fit rounded-full px-3 py-1 text-xs font-semibold ${COLORES[situacion.tono]}`}
      >
        {situacion.etiqueta}
      </span>
      {conExplicacion && situacion.explicacion && <span className="text-xs text-slate-500 dark:text-slate-400">{situacion.explicacion}</span>}
    </span>
  );
}
