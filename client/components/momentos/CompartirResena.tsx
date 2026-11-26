import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { compartirTexto } from './api';

/** Compartir una reseña buena propia: solo la puntuación y el enlace a tu perfil público (ahí ya se ve). No copia el nombre ni las palabras de quien la escribió. */
export default function CompartirResena({ puntuacion, userId }: { puntuacion: number; userId: string }) {
  const [hecho, setHecho] = useState('');
  return (
    <div className="mb-3 flex items-center gap-2">
      <button type="button" onClick={async () => {
        const r = await compartirTexto(`Me dejaron una reseña de ${Number(puntuacion).toLocaleString('es-AR', { maximumFractionDigits: 1 })} de 5 en DOAPP. Así trabajo:`, `${window.location.origin}/profile/${userId}`);
        setHecho(r === 'copiado' ? 'Texto y enlace copiados.' : r === 'compartido' ? 'Compartido.' : '');
      }} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 dark:border-sky-700 px-3 py-1.5 text-xs font-medium text-sky-700 dark:text-sky-300">
        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />Compartir
      </button>
      <span role="status" className="text-xs text-slate-500 dark:text-slate-400">{hecho}</span>
    </div>
  );
}
