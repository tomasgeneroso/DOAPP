import { useState } from 'react';
import { Trash2, Loader2 } from 'lucide-react';

/**
 * Borrar de verdad un trabajo que su dueño ya eliminó (pedido del dueño, 2026-11-23). Un trabajo eliminado nunca se borra solo: queda guardado y el equipo lo ve siempre.
 * Para borrarlo hay que escribir su nombre tal cual y un motivo; la eliminación queda anotada en el registro de auditoría.
 */
export default function EliminarTrabajoDefinitivamente({
  trabajoId,
  titulo,
  token,
  alBorrar,
}: {
  trabajoId: string;
  titulo: string;
  token?: string | null;
  alBorrar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coincide = nombre.trim() === titulo.trim();
  const puede = coincide && motivo.trim().length >= 15 && !enviando;

  const borrar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/jobs/${trabajoId}/permanent`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nombre: nombre.trim(), motivo: motivo.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.message || 'No se pudo borrar.');
      setAbierto(false);
      alBorrar();
    } catch (e: any) {
      setError(e?.message || 'No se pudo borrar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-0.5 text-xs font-semibold text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20"
        data-testid="borrar-trabajo-definitivamente"
      >
        <Trash2 className="h-3 w-3" aria-hidden="true" />
        Eliminar definitivamente
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-borrado-definitivo">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
            <h3 id="titulo-borrado-definitivo" className="text-lg font-semibold text-gray-900 dark:text-white">
              Eliminar definitivamente
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Su dueño ya lo eliminó y quedó guardado. Si lo borrás ahora, no se puede recuperar. Queda anotado en el registro con el motivo.
            </p>
            <label className="mt-4 block text-sm font-medium text-gray-700 dark:text-gray-200">
              Escribí el nombre del trabajo: <strong>{titulo}</strong>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                data-testid="nombre-del-trabajo-a-borrar"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-gray-700 dark:text-gray-200">
              Motivo (15 caracteres o más)
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                data-testid="motivo-del-borrado"
              />
            </label>
            {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAbierto(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 dark:border-gray-600 dark:text-gray-200">
                Cancelar
              </button>
              <button
                type="button"
                onClick={borrar}
                disabled={!puede}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                data-testid="confirmar-borrado-definitivo"
              >
                {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
                Eliminar definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
