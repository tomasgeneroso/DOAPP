import { useState } from 'react';
import { Users, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { fetchWithAuth } from '../utils/fetchWithAuth';

/**
 * Canje del código de familia con la cuenta ya creada (regla del dueño, 2026-11-12: se puede poner también con Google o X, o ya registrado).
 * Acepta el código con o sin «FAM-», en mayúsculas o minúsculas (el servidor lo normaliza: `server/services/codigoDeFamilia.ts`).
 * No es un formulario (`div` + botón): también se usa dentro del paso de completar el registro, que ya es uno.
 */
export default function CanjearCodigoDeFamilia() {
  const { user, refreshUser } = useAuth() as any;
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  if (user?.hasFamilyPlan && !resultado) {
    return (
      <div role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
        <CheckCircle2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        Plan Familia activo: 0% de comisión en tus contratos.
      </div>
    );
  }

  const canjear = async () => {
    if (!codigo.trim() || enviando) return;
    setEnviando(true);
    setResultado(null);
    try {
      const r = await fetchWithAuth('/api/auth/activate-family-code', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: codigo }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.success) {
        setResultado({ ok: true, texto: d.message || 'Plan Familia activado.' });
        setCodigo('');
        await refreshUser?.();
      } else {
        setResultado({ ok: false, texto: d.message || 'No se pudo activar el código. Probá de nuevo.' });
      }
    } catch {
      setResultado({ ok: false, texto: 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <label htmlFor="codigoDeFamilia" className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <Users className="h-4 w-4" aria-hidden="true" />
        ¿Tenés un código de familia?
      </label>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pegalo acá, con o sin «FAM-». Activa el Plan Familia: 0% de comisión en tus contratos.</p>
      <div className="mt-2 flex gap-2">
        <input
          id="codigoDeFamilia"
          type="text"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void canjear(); } }}
          placeholder="FAM-ABCD2345"
          maxLength={16}
          autoCapitalize="characters"
          autoComplete="off"
          className="block h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm uppercase text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
        />
        <button type="button" onClick={canjear} disabled={enviando || !codigo.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
          {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Activar
        </button>
      </div>
      {resultado && (
        <p role="alert" className={`mt-2 text-sm ${resultado.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'}`}>
          {resultado.texto}
        </p>
      )}
    </div>
  );
}
