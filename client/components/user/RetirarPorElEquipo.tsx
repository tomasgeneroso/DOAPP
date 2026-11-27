import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import Transicion from '@/components/ui/Transicion';

/** El equipo retira la publicación de otra persona (por ejemplo, fotos con personas o datos personales): pide el motivo, que le llega a quien publicó. */
export default function RetirarPorElEquipo({ postId, token, alRetirar }: { postId: string; token: string | null | undefined; alRetirar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  const retirar = async () => {
    setEnviando(true);
    setAviso('');
    try {
      const r = await fetch(`/api/posts/${postId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }) });
      const j = await r.json().catch(() => null);
      if (j?.success) alRetirar();
      else setAviso(r.status === 403 ? 'Para retirarla, abrí el panel con tu clave de panel.' : j?.message || 'No se pudo retirar.');
    } catch {
      setAviso('No se pudo retirar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto} data-testid="retirar-por-el-equipo" title="Retirar la publicación (equipo)" aria-label="Retirar la publicación (equipo)" className="rounded-full p-2 hover:bg-red-50 dark:hover:bg-red-900/20">
        <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden="true" />
      </button>
      <div className="absolute right-0 z-20 w-72 max-w-[80vw]">
        <Transicion mostrar={abierto}>
          <div className="space-y-2 rounded-xl border border-slate-300 bg-white p-3 shadow-xl dark:border-slate-600 dark:bg-slate-800">
            <label className="block text-sm text-slate-700 dark:text-slate-200">
              Motivo (le llega a quien publicó)
              <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={500} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
            </label>
            <button type="button" disabled={enviando || motivo.trim().length < 10} onClick={() => { void retirar(); }} className="w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              {enviando ? 'Retirando…' : 'Retirar publicación'}
            </button>
            {aviso && <p role="status" className="text-sm text-amber-700 dark:text-amber-300">{aviso}</p>}
          </div>
        </Transicion>
      </div>
    </div>
  );
}
