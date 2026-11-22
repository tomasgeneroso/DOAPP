import { useState } from 'react';
import { MessageSquarePlus, FileText, Play } from 'lucide-react';
import { getImageUrl } from '@/utils/imageUrl';

/**
 * Las pruebas de un reclamo: cada foto, video o archivo dice QUIÉN lo subió y CUÁNDO, y se le puede agregar una nota (pedido del dueño, 2026-11-22).
 * Las notas se suman (no se pisan): quien reclama y la otra parte pueden aclarar qué se ve; cada nota lleva el nombre de quien la escribió y su hora.
 */
export interface NotaDePrueba {
  by: string;
  text: string;
  at: string | Date;
}
export interface PruebaDelReclamo {
  fileName: string;
  fileUrl: string;
  fileType: 'image' | 'video' | 'pdf' | 'other';
  fileSize?: number;
  uploadedAt?: string | Date;
  /** Quién la subió (id). Las pruebas de antes de este cambio no lo traen. */
  uploadedBy?: string;
  notes?: NotaDePrueba[];
}
export interface ParteDelReclamo {
  id?: string | null;
  nombre?: string;
}

const cuando = (f?: string | Date) => {
  if (!f) return '';
  const d = new Date(f);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
};

export default function PruebasDelReclamo({
  disputeId,
  token,
  pruebas,
  partes,
  puedeAgregarNota,
  alCambiar,
  textoVacio,
}: {
  disputeId: string;
  token?: string | null;
  pruebas: PruebaDelReclamo[];
  partes: ParteDelReclamo[];
  puedeAgregarNota: boolean;
  alCambiar: () => void;
  textoVacio?: string;
}) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quien = (id?: string | null): string | null => {
    if (!id) return null;
    return partes.find((p) => p.id && String(p.id) === String(id))?.nombre || 'Equipo de DOAPP';
  };

  const guardar = async (indice: number) => {
    const limpio = texto.trim();
    if (!limpio) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch(`/api/disputes/${disputeId}/evidence/${indice}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: limpio }),
      });
      const datos = await r.json().catch(() => ({}));
      if (!r.ok || datos.success === false) throw new Error(datos.message || 'No se pudo guardar la nota.');
      setTexto('');
      setAbierta(null);
      alCambiar();
    } catch (e: any) {
      setError(e?.message || 'No se pudo guardar la nota.');
    } finally {
      setGuardando(false);
    }
  };

  if (!pruebas || pruebas.length === 0) {
    return (
      <div className="mb-4 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 py-8 text-center dark:border-gray-600 dark:bg-gray-700/30" data-testid="sin-pruebas">
        <p className="font-medium text-gray-600 dark:text-gray-400">{textoVacio || 'Todavía no hay pruebas adjuntas'}</p>
      </div>
    );
  }

  return (
    <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="pruebas-del-reclamo">
      {pruebas.map((p, indice) => {
        const url = getImageUrl(p.fileUrl);
        const subio = quien(p.uploadedBy);
        return (
          <figure key={indice} className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800" data-testid="prueba-del-reclamo">
            <a href={url} target="_blank" rel="noopener noreferrer" className="relative block aspect-video bg-gray-100 dark:bg-gray-700">
              {p.fileType === 'image' ? (
                <img src={url} alt={p.fileName} className="h-full w-full object-cover" />
              ) : p.fileType === 'video' ? (
                <>
                  <video src={url} className="h-full w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white">
                      <Play className="h-6 w-6" aria-hidden="true" />
                    </span>
                  </span>
                </>
              ) : (
                <span className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-gray-600 dark:text-gray-300">
                  <FileText className="h-10 w-10 text-red-400" aria-hidden="true" />
                  <span className="w-full truncate text-center text-xs font-medium">{p.fileName}</span>
                </span>
              )}
            </a>
            <figcaption className="space-y-2 p-3 text-sm">
              <p className="text-gray-700 dark:text-gray-200" data-testid="quien-subio">
                {subio ? (
                  <>
                    Subida por <strong>{subio}</strong>
                  </>
                ) : (
                  'Subida'
                )}
                {p.uploadedAt ? <span className="text-gray-500 dark:text-gray-400"> · {cuando(p.uploadedAt)}</span> : null}
              </p>

              {(p.notes || []).map((n, i) => (
                <p key={i} className="rounded-lg bg-sky-50 px-3 py-2 text-gray-800 dark:bg-sky-900/20 dark:text-gray-100" data-testid="nota-de-prueba">
                  {n.text}
                  <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                    {quien(n.by) || 'Alguien'} · {cuando(n.at)}
                  </span>
                </p>
              ))}

              {puedeAgregarNota &&
                (abierta === indice ? (
                  <div className="space-y-2">
                    <textarea
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      rows={2}
                      maxLength={500}
                      aria-label="Nota sobre esta prueba"
                      placeholder="Qué se ve en esta prueba (hasta 500 caracteres)"
                      className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                      data-testid="texto-de-la-nota"
                    />
                    {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => guardar(indice)}
                        disabled={guardando || !texto.trim()}
                        className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                        data-testid="guardar-nota"
                      >
                        {guardando ? 'Guardando…' : 'Guardar nota'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAbierta(null);
                          setTexto('');
                          setError(null);
                        }}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAbierta(indice);
                      setTexto('');
                      setError(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300"
                    data-testid="agregar-nota"
                  >
                    <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                    Agregar nota
                  </button>
                ))}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
