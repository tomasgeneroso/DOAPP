import { useEffect, useState, useCallback } from 'react';
import { Megaphone, Star, MapPin, Loader2, Check, AlertCircle, TrendingUp } from 'lucide-react';

/**
 * Promocioná tu perfil.
 *
 * El trabajador elige semanas sueltas, ve exactamente cómo va a quedar su
 * tarjeta en el muro, y paga. La vista previa no es decoración: sin ella hay
 * que imaginarse qué se compra, y lo que se compra es precisamente cómo se ve.
 */

interface Semana { start: string; end: string; label: string; ocupada: boolean }
interface Options {
  precioSemanaEur: number;
  precioSemanaArs: number;
  eurArs: number;
  elegible: boolean;
  motivoNoElegible: string | null;
  semanas: Semana[];
  preview: {
    name: string; avatar: string | null; rating: number;
    reviewsCount: number; skills: string[]; location: string | null;
  };
}
interface Promo {
  id: string; startDate: string; endDate: string; status: string;
  paymentStatus: string; totalPrice: number; impressions: number;
  clicks: number; ctr: number | null;
}

const ars = (n: number) => 'ARS $' + Math.round(n).toLocaleString('es-AR');

/** La tarjeta tal cual se ve en el muro, para que no haya sorpresas. */
export function PromotedCard({ p }: { p: Options['preview'] }) {
  return (
    <div className="relative rounded-xl border-2 border-amber-300 dark:border-amber-600 bg-gradient-to-br from-amber-50 to-white dark:from-amber-900/20 dark:to-slate-800 p-4">
      <span className="absolute top-2 right-2 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded">
        Promocionado
      </span>
      <div className="flex items-start gap-3">
        {p.avatar ? (
          <img src={p.avatar} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className="h-14 w-14 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-lg font-bold text-slate-500">
            {p.name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 dark:text-white truncate">{p.name}</p>
          <div className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
            <Star className="h-3.5 w-3.5 fill-current" />
            {p.rating > 0 ? p.rating.toFixed(1) : '—'}
            <span className="text-slate-400 text-xs">({p.reviewsCount})</span>
          </div>
          {p.location && (
            <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              <MapPin className="h-3 w-3" /> {p.location}
            </p>
          )}
          {p.skills?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {p.skills.slice(0, 3).map((s) => (
                <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePromotion() {
  const [opts, setOpts] = useState<Options | null>(null);
  const [mine, setMine] = useState<Promo[]>([]);
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const token = localStorage.getItem('token');
    const h = { Authorization: `Bearer ${token}` };
    try {
      const [o, m] = await Promise.all([
        fetch('/api/profile-promotion/options', { headers: h }).then((r) => r.json()),
        fetch('/api/profile-promotion/mine', { headers: h }).then((r) => r.json()),
      ]);
      if (o.success) setOpts(o.data);
      if (m.success) setMine(m.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = (start: string) =>
    setElegidas((prev) =>
      prev.includes(start) ? prev.filter((s) => s !== start) : [...prev, start],
    );

  const reservar = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/profile-promotion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ semanas: elegidas }),
      });
      const data = await res.json();
      if (data.success) {
        setMsg({ ok: true, text: data.message });
        setElegidas([]);
        await load();
      } else {
        setMsg({ ok: false, text: data.message || 'No se pudo reservar' });
      }
    } catch (err: any) {
      setMsg({ ok: false, text: err.message || 'Error de conexión' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-sky-500" /></div>;
  }
  if (!opts) return null;

  const total = elegidas.length * opts.precioSemanaArs;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Megaphone className="h-5 w-5 text-amber-500 mt-0.5" />
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">Hacete más conocido</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Tu perfil aparece entre los trabajos del muro, en tu zona y tus oficios. Elegís qué
            semanas y pagás sólo esas.
          </p>
        </div>
      </div>

      {!opts.elegible && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Todavía no podés promocionarte</p>
            {/* Se puede comprar visibilidad, no reputación. */}
            <p className="text-xs mt-0.5">{opts.motivoNoElegible}</p>
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
          Así se va a ver tu tarjeta
        </p>
        <PromotedCard p={opts.preview} />
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Elegí las semanas</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {ars(opts.precioSemanaArs)} por semana
            <span className="text-slate-400"> · EUR {opts.precioSemanaEur} al cambio de hoy</span>
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {opts.semanas.map((w) => {
            const sel = elegidas.includes(w.start);
            return (
              <button
                key={w.start}
                type="button"
                disabled={w.ocupada || !opts.elegible}
                onClick={() => toggle(w.start)}
                className={`px-3 py-2 rounded-lg text-sm border transition text-left ${
                  w.ocupada
                    ? 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-400 cursor-not-allowed'
                    : sel
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200'
                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-amber-400'
                } disabled:opacity-60`}
              >
                <span className="flex items-center gap-1.5">
                  {sel && <Check className="h-3.5 w-3.5" />}
                  {w.label}
                </span>
                {w.ocupada && <span className="text-[10px]">ya la tenés</span>}
              </button>
            );
          })}
        </div>
      </div>

      {elegidas.length > 0 && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600 dark:text-slate-400">
              {elegidas.length} {elegidas.length === 1 ? 'semana' : 'semanas'} × {ars(opts.precioSemanaArs)}
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">{ars(total)}</span>
          </div>
          <div className="flex justify-between text-base font-bold border-t border-slate-200 dark:border-slate-700 pt-2">
            <span className="text-slate-900 dark:text-white">Total a pagar</span>
            <span className="text-amber-600 dark:text-amber-400">{ars(total)}</span>
          </div>
          <button
            onClick={() => void reservar()}
            disabled={saving}
            className="w-full mt-1 px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Reservar y pagar
          </button>
        </div>
      )}

      {msg && (
        <p className={`text-sm ${msg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {msg.text}
        </p>
      )}

      {mine.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" /> Tus promociones
          </p>
          <div className="space-y-2">
            {mine.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
              >
                <div>
                  <p className="text-slate-900 dark:text-white">
                    {new Date(p.startDate).toLocaleDateString('es-AR')} —{' '}
                    {new Date(p.endDate).toLocaleDateString('es-AR')}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {p.paymentStatus === 'paid' ? p.status : 'falta pagar'} · {ars(p.totalPrice)}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                  <p>{p.impressions} vistas</p>
                  <p>{p.clicks} clics {p.ctr !== null ? `(${p.ctr}%)` : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
