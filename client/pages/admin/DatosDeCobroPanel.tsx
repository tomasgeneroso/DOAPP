import { useCallback, useEffect, useState } from 'react';
import { Banknote, Loader2, Wallet } from 'lucide-react';

/**
 * «Datos de cobro»: la cuenta a la que los clientes transfieren y el ID de Binance al que pagan (pedido del dueño, 2026-11-19). Se guardan con la contraseña de cambio de fase y
 * rigen enseguida en la pantalla de pago; lo que se deja vacío vuelve a usar el .env del servidor. Cada cambio queda en el registro de auditoría (con los números enmascarados).
 */
interface Vigente {
  banco: { cbu?: string; alias?: string; accountHolder?: string; cuit?: string; bank?: string } | null;
  binance: { id: string | null; nickname: string | null };
}
interface Guardado {
  cbu: string | null; alias: string | null; titular: string | null; cuit: string | null; banco: string | null;
  binanceId: string | null; binanceNickname: string | null; actualizadoEn?: string | null;
}

const campo = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-700 dark:text-white';

export default function DatosDeCobroPanel({ token, password }: { token: string | null; password: string }) {
  const [vigente, setVigente] = useState<Vigente | null>(null);
  const [form, setForm] = useState({ cbu: '', alias: '', titular: '', cuit: '', banco: '', binanceId: '', binanceNickname: '' });
  const [guardado, setGuardado] = useState<Guardado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  const aplicar = useCallback((d: { guardado: Guardado; vigente: Vigente }) => {
    setGuardado(d.guardado);
    setVigente(d.vigente);
    setForm({
      cbu: d.guardado.cbu ?? '', alias: d.guardado.alias ?? '', titular: d.guardado.titular ?? '', cuit: d.guardado.cuit ?? '', banco: d.guardado.banco ?? '',
      binanceId: d.guardado.binanceId ?? '', binanceNickname: d.guardado.binanceNickname ?? '',
    });
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch('/api/admin/platform/cobro', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (vivo && d.success) aplicar(d.data); })
      .catch(() => undefined)
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [token, aplicar]);

  const guardar = async () => {
    setOcupado(true);
    setMsg(null);
    try {
      const r = await fetch('/api/admin/platform/cobro', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, password }),
      });
      const d = await r.json();
      if (d.success) {
        aplicar(d.data);
        setMsg({ ok: true, texto: 'Datos de cobro guardados: ya rigen en la pantalla de pago.' });
      } else {
        setMsg({ ok: false, texto: d.message || 'No se pudo guardar' });
      }
    } catch {
      setMsg({ ok: false, texto: 'Error de conexión.' });
    } finally {
      setOcupado(false);
    }
  };

  const cambiar = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (cargando) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-sky-500" /></div>;

  return (
    <section className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800" data-testid="datos-de-cobro">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white"><Banknote className="h-5 w-5" aria-hidden="true" /> Datos de cobro</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Acá cargás la cuenta a la que los clientes transfieren y tu ID de Binance. Lo que dejes vacío usa lo que haya en el servidor. Sin CBU ni alias no se ofrece la transferencia, y sin ID de Binance no se ofrece Binance.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">CBU / CVU (22 números)</span><input className={campo} value={form.cbu} onChange={cambiar('cbu')} inputMode="numeric" maxLength={30} autoComplete="off" /></label>
        <label className="text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Alias</span><input className={campo} value={form.alias} onChange={cambiar('alias')} maxLength={30} autoComplete="off" /></label>
        <label className="text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Titular de la cuenta</span><input className={campo} value={form.titular} onChange={cambiar('titular')} maxLength={80} autoComplete="off" /></label>
        <label className="text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">CUIT</span><input className={campo} value={form.cuit} onChange={cambiar('cuit')} maxLength={13} autoComplete="off" /></label>
        <label className="text-sm sm:col-span-2"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Banco o billetera</span><input className={campo} value={form.banco} onChange={cambiar('banco')} maxLength={80} autoComplete="off" /></label>
      </div>

      <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2 dark:border-slate-700">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 sm:col-span-2 dark:text-slate-200"><Wallet className="h-4 w-4" aria-hidden="true" /> Binance</p>
        <label className="text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">ID de Binance (Pay ID)</span><input className={campo} value={form.binanceId} onChange={cambiar('binanceId')} inputMode="numeric" maxLength={15} autoComplete="off" /></label>
        <label className="text-sm"><span className="mb-1 block font-medium text-slate-700 dark:text-slate-300">Nombre en Binance (opcional)</span><input className={campo} value={form.binanceNickname} onChange={cambiar('binanceNickname')} maxLength={80} autoComplete="off" /></label>
      </div>

      {vigente && (
        <p className="text-xs text-slate-500 dark:text-slate-400" data-testid="cobro-vigente">
          Hoy se ofrece: transferencia {vigente.banco ? `(${[vigente.banco.alias, vigente.banco.cbu ? `CBU …${vigente.banco.cbu.slice(-4)}` : null].filter(Boolean).join(' · ')})` : 'NO (falta CBU o alias)'} · Binance {vigente.binance.id ? `(ID …${vigente.binance.id.slice(-4)})` : 'NO (falta el ID)'}.
          {guardado?.actualizadoEn ? ` Última edición desde el panel: ${new Date(guardado.actualizadoEn).toLocaleString('es-AR')}.` : ''}
        </p>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">Para guardar se usa la contraseña de cambio de fase que escribiste arriba.</p>
      <button type="button" onClick={guardar} disabled={ocupado || !password} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
        {ocupado ? 'Guardando...' : 'Guardar datos de cobro'}
      </button>
      {msg && <p role="status" className={`text-sm ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{msg.texto}</p>}
    </section>
  );
}
