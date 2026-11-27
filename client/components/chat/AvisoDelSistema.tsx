import { Link } from 'react-router-dom';
import { Briefcase } from 'lucide-react';

/** Los avisos que NO son una postulación (novedades del equipo, pagos confirmados, un trabajo compartido): se muestran como aviso, con su texto. */
export default function AvisoDelSistema({ texto, jobId, fecha }: { texto: string; jobId?: string; fecha: string }) {
  // El texto puede venir como «encabezado||título||detalle» o como una sola frase.
  const partes = texto.split('||').map((p) => p.trim()).filter(Boolean);
  const [encabezado, ...resto] = partes.length > 1 ? partes : ['', partes[0] ?? texto];
  const detalle = resto.length > 1 ? resto[resto.length - 1] : resto[0] ?? '';
  const titulo = resto.length > 1 ? resto[0] : '';
  return (
    <div className="my-3 flex justify-center" data-testid="aviso-del-sistema">
      <div className="max-w-lg rounded-2xl border border-slate-200 bg-slate-100 px-4 py-2.5 text-center text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200">
        {encabezado && <p className="font-semibold text-slate-900 dark:text-white">{encabezado}</p>}
        {titulo && <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{titulo}</p>}
        <p className="whitespace-pre-wrap break-words">{detalle.replace(/\*\*/g, '')}</p>
        <p className="mt-1 flex items-center justify-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>{new Date(fecha).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          {jobId && (
            <Link to={`/jobs/${jobId}`} className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline dark:text-sky-300">
              <Briefcase className="h-3 w-3" aria-hidden="true" />Ver trabajo
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}
