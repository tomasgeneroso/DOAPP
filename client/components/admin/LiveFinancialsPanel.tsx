import { useEffect, useState, useCallback } from 'react';
import {
  Activity, Users, Briefcase, FileText, Wallet, Target,
  RefreshCw, AlertTriangle, TrendingUp, Loader2,
} from 'lucide-react';

/**
 * Estado financiero real, al lado de la proyección.
 *
 * La proyección responde "si pasa X, cuánto gano". Esto responde "qué está
 * pasando y cuánto me falta". Son preguntas distintas y conviene no mezclarlas
 * en la misma pantalla: un número supuesto y uno medido se ven igual, y a los
 * dos días nadie se acuerda de cuál era cuál.
 */

interface Live {
  calculadoEn: string;
  eurArs: number;
  usuarios: { total: number; nuevos30: number; activos30: number; verificados: number; trabajadores: number; clientes: number };
  trabajos: { publicados30: number; abiertos: number; enCurso: number; completados30: number };
  contratos: { creados30: number; completados30: number; cancelados30: number; disputados30: number; tasaFinalizacion: number; porUsuarioMes: number };
  dinero: { brutoMovido30: number; comisionGanada30: number; ticketPromedio: number; comisionPromedioPct: number; enEscrow: number; pendientePagoTrabajadores: number };
  objetivo: { costoFijoMensualArs: number; ingresoMensualArs: number; cobertura: number; faltaIngreso: number; contratosFaltantes: number; usuariosFaltantes: number; estimadoConPlan: boolean };
}

const ars = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-lg font-semibold text-slate-900 dark:text-white">{value}</p>
      {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

function Card({ icon: Icon, title, children }: any) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-sky-500" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

export default function LiveFinancialsPanel() {
  const [live, setLive] = useState<Live | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/business-plan/live', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setLive(data.data);
      else setError(data.message || 'No se pudo calcular');
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading && !live) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-sky-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
        {error}
      </div>
    );
  }

  if (!live) return null;

  const o = live.objetivo;
  const cubierto = o.cobertura >= 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-emerald-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Estado real</h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            últimos 30 días · EUR/ARS {live.eurArs}
          </span>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Lo primero: cuánto falta. Es la única pregunta que se hace todos los meses. */}
      <div
        className={`rounded-xl p-5 border ${
          cubierto
            ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
            : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
        }`}
      >
        <div className="flex items-center gap-2 mb-3">
          <Target className={`h-5 w-5 ${cubierto ? 'text-emerald-600' : 'text-amber-600'}`} />
          <h3 className="font-semibold text-slate-900 dark:text-white">
            {cubierto ? 'Los gastos están cubiertos' : 'Cuánto falta para cubrir los gastos'}
          </h3>
        </div>

        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-3">
          <div
            className={`h-full ${cubierto ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${Math.min(100, o.cobertura)}%` }}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label="Costo fijo mensual" value={ars(o.costoFijoMensualArs)} />
          <Metric label="Ingreso del mes" value={ars(o.ingresoMensualArs)} hint={`${o.cobertura}% cubierto`} />
          <Metric label="Falta facturar" value={ars(o.faltaIngreso)} />
          <Metric
            label="Equivale a"
            value={`${o.contratosFaltantes} contratos`}
            hint={`≈ ${o.usuariosFaltantes} usuarios activos`}
          />
        </div>

        {o.estimadoConPlan && (
          <p className="mt-3 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {/* Sin comisiones cobradas no hay forma de deducir de los datos cuánto
                aporta un contrato. Se avisa para que nadie lea esto como medido. */}
            Todavía no hay comisiones cobradas, así que estos dos últimos números salen de los
            supuestos del plan, no de datos reales. Se recalculan solos en cuanto empiece a
            cobrarse comisión.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card icon={Users} title="Usuarios">
          <Metric label="Totales" value={live.usuarios.total} />
          <Metric label="Nuevos (30d)" value={live.usuarios.nuevos30} />
          <Metric label="Activos (30d)" value={live.usuarios.activos30} hint="con al menos un contrato" />
          <Metric label="Verificados" value={live.usuarios.verificados} />
          <Metric label="Trabajadores" value={live.usuarios.trabajadores} />
          <Metric label="Clientes" value={live.usuarios.clientes} />
        </Card>

        <Card icon={Briefcase} title="Trabajos">
          <Metric label="Publicados (30d)" value={live.trabajos.publicados30} />
          <Metric label="Abiertos ahora" value={live.trabajos.abiertos} />
          <Metric label="En curso" value={live.trabajos.enCurso} />
          <Metric label="Completados (30d)" value={live.trabajos.completados30} />
        </Card>

        <Card icon={FileText} title="Contratos">
          <Metric label="Creados (30d)" value={live.contratos.creados30} />
          <Metric label="Completados" value={live.contratos.completados30} />
          <Metric label="Cancelados" value={live.contratos.cancelados30} />
          <Metric label="En disputa" value={live.contratos.disputados30} />
          <Metric label="Tasa de finalización" value={`${live.contratos.tasaFinalizacion}%`} />
          <Metric
            label="Contratos por usuario"
            value={live.contratos.porUsuarioMes}
            hint="al mes — el número que mueve todo"
          />
        </Card>

        <Card icon={Wallet} title="Dinero">
          <Metric label="Bruto movido (30d)" value={ars(live.dinero.brutoMovido30)} />
          <Metric label="Comisión ganada" value={ars(live.dinero.comisionGanada30)} />
          <Metric label="Ticket promedio" value={ars(live.dinero.ticketPromedio)} hint="últimos 90 días" />
          <Metric label="Comisión efectiva" value={`${live.dinero.comisionPromedioPct}%`} />
          <Metric
            label="Retenido en escrow"
            value={ars(live.dinero.enEscrow)}
            hint={`${live.dinero.pendientePagoTrabajadores} contratos`}
          />
        </Card>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
        <TrendingUp className="h-3 w-3" />
        Calculado el {new Date(live.calculadoEn).toLocaleString('es-AR')} · todo sale de la base de
        datos, ningún número de acá es un supuesto salvo donde se aclara.
      </p>
    </div>
  );
}
