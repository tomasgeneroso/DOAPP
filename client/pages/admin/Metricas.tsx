import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useCambiosDeAdministracion } from '../../hooks/useSocket';
import {
  DEFINICIONES, MINIMO_PARA_CONFIAR, SECCIONES, costoPorPersona,
  type ClaveDeIndice, type Indice, type MetricasDeProducto, type Unidad,
} from '../../../shared/metricas/definiciones';

/**
 * Índices de producto para el dueño y marketing. Cada tarjeta dice de cuántos casos sale, cómo se calcula y cómo se lee; cuando todavía no se puede calcular
 * dice qué falta, en vez de mostrar un cero. Qué es cada índice: shared/metricas/definiciones.ts.
 */

const numero = (v: number, decimales = 0) => v.toLocaleString('es-AR', { maximumFractionDigits: decimales, minimumFractionDigits: 0 });

export function formatearIndice(valor: number, unidad: Unidad): string {
  if (unidad === 'porcentaje') return `${numero(valor, 1)} %`;
  if (unidad === 'pesos') return `$ ${numero(valor)}`;
  if (unidad === 'horas') return `${numero(valor, 1)} h`;
  if (unidad === 'segundos') {
    const s = Math.round(valor);
    return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  }
  return numero(valor, unidad === 'decimal' ? 1 : 0);
}

const CAJA = 'rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800';
const APAGADO = 'text-slate-500 dark:text-slate-400';

function Tarjeta({ clave, indice }: { clave: ClaveDeIndice; indice: Indice }) {
  const def = DEFINICIONES[clave];
  const casos = indice.sobre;
  const conPocos = indice.valor !== null && casos !== undefined && (def.unidad === 'porcentaje') && casos < MINIMO_PARA_CONFIAR;
  return (
    <article className={`${CAJA} p-4 flex flex-col gap-1`} data-indice={clave}>
      <h3 className={`text-sm font-medium ${APAGADO}`}>{def.nombre}</h3>
      {indice.valor !== null ? (
        <p className="text-2xl font-semibold text-slate-900 dark:text-white">{formatearIndice(indice.valor, def.unidad)}</p>
      ) : (
        <p className="text-sm text-slate-700 dark:text-slate-300">{indice.falta}</p>
      )}
      {indice.valor !== null && indice.de !== undefined && casos !== undefined && (
        <p className={`text-xs ${APAGADO}`}>{numero(indice.de)} de {numero(casos)}</p>
      )}
      {conPocos && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">⚠ Pocos datos: una sola persona lo mueve mucho</p>
      )}
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-sky-700 dark:text-sky-400">Cómo se calcula y se lee</summary>
        <p className="mt-1 text-slate-600 dark:text-slate-300">{def.formula}</p>
        <p className={`mt-1 ${APAGADO}`}>{def.lectura}</p>
      </details>
    </article>
  );
}

/** Barras horizontales de una sola serie: el largo es la cantidad y el número va escrito al lado (no depende del color). */
function Barras({ filas }: { filas: Array<{ nombre: string; valor: number; nota: string; ancho: number }> }) {
  return (
    <ul className="space-y-3">
      {filas.map((f) => (
        <li key={f.nombre} title={`${f.nombre}: ${f.nota}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-slate-700 dark:text-slate-200">{f.nombre}</span>
            <span className={`shrink-0 text-xs ${APAGADO}`}>{f.nota}</span>
          </div>
          <div className="mt-1 h-2 rounded-r bg-slate-100 dark:bg-slate-700">
            <div className="h-2 rounded-r bg-sky-600 dark:bg-sky-500 transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, f.ancho))}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function PersonasPorDia({ dias }: { dias: MetricasDeProducto['usoPorDia'] }) {
  const [elegido, setElegido] = useState<number | null>(null);
  const tope = Math.max(1, ...dias.map((d) => d.personas));
  const fecha = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const activo = elegido !== null ? dias[elegido] : dias[dias.length - 1];
  return (
    <div>
      <p className="text-sm text-slate-700 dark:text-slate-200" aria-live="polite">{fecha(activo.dia)}: <strong>{numero(activo.personas)}</strong> {activo.personas === 1 ? 'persona' : 'personas'}</p>
      {/* Cada barra tiene un ancho mínimo: en un espacio angosto el gráfico se desplaza solo, en vez de achicar las barras hasta que no se ven. */}
      <div className="overflow-x-auto">
      <div className="mt-2 flex h-32 min-w-full items-end gap-0.5 border-b border-slate-200 dark:border-slate-700" onMouseLeave={() => setElegido(null)}>
        {dias.map((d, i) => (
          <button
            key={d.dia}
            type="button"
            aria-label={`${fecha(d.dia)}: ${d.personas}`}
            onMouseEnter={() => setElegido(i)}
            onFocus={() => setElegido(i)}
            className="flex h-full min-w-[4px] max-w-8 flex-1 items-end"
          >
            <span className={`block w-full rounded-t ${elegido === i ? 'bg-sky-800 dark:bg-sky-300' : 'bg-sky-600 dark:bg-sky-500'}`} style={{ height: `${(d.personas / tope) * 100}%` }} />
          </button>
        ))}
      </div>
      </div>
      <div className={`mt-1 flex justify-between text-xs ${APAGADO}`}><span>{fecha(dias[0].dia)}</span><span>máximo {numero(tope)}</span><span>{fecha(dias[dias.length - 1].dia)}</span></div>
    </div>
  );
}

/** Cuánto costó conseguir cada persona nueva. Lo que se escribe acá queda en la pantalla: no se guarda. */
function CostoDeConseguir({ nuevas, ltv }: { nuevas: number; ltv: number | null }) {
  const [inversion, setInversion] = useState('');
  const { cac, ltvSobreCac } = costoPorPersona(Number(inversion), nuevas, ltv);
  return (
    <div className={`${CAJA} p-4`}>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Costo por persona conseguida (CAC)</h3>
      <p className={`mt-1 text-xs ${APAGADO}`}>Escribí lo invertido en anuncios en los últimos 90 días. Se divide por las {numero(nuevas)} cuentas que se registraron y publicaron o se postularon.</p>
      <label className="mt-3 block text-xs text-slate-600 dark:text-slate-300" htmlFor="inversion">Inversión en pesos</label>
      <input
        id="inversion" inputMode="numeric" value={inversion} onChange={(e) => setInversion(e.target.value.replace(/\D/g, '').slice(0, 12))}
        className="mt-1 w-full max-w-xs rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-900 dark:text-white"
        placeholder="200000"
      />
      <p className="mt-2 text-sm text-slate-800 dark:text-slate-100">
        {cac === null ? (inversion && nuevas === 0 ? 'Todavía no hay cuentas nuevas que hayan hecho algo.' : 'El resultado aparece al escribir el monto.') : <>Cada persona costó <strong>$ {numero(cac)}</strong>{ltvSobreCac !== null ? <> · el LTV lo devuelve <strong>{numero(ltvSobreCac, 1)} veces</strong> (la referencia habitual es 3)</> : ' · la comparación con el LTV aparece cuando el LTV se pueda calcular'}.</>}
      </p>
    </div>
  );
}

export default function Metricas() {
  const [datos, setDatos] = useState<MetricasDeProducto | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/metricas', { credentials: 'include', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success || !j.data?.indices) throw new Error(j?.message || 'No pudimos cargar los índices.');
      setDatos(j.data);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'No pudimos cargar los índices.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);
  // Tiempo real (regla del dueño): son cálculos pesados, así que los avisos se juntan 5 segundos.
  useCambiosDeAdministracion(['user', 'job', 'contract', 'payment'], () => { void cargar(); }, 5000);

  if (cargando && !datos) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-sky-500" /></div>;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Índices de producto</h1>
          <p className={`mt-1 text-sm ${APAGADO}`}>Solo totales de la comunidad (el equipo no cuenta).{datos && ` Calculado el ${new Date(datos.calculadasEl).toLocaleString('es-AR')}.`}</p>
        </div>
        <button type="button" onClick={() => { void cargar(); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </header>

      {error && <p role="alert" className="rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-800 dark:text-red-300">{error}</p>}

      {datos && (
        <>
          <p className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/20 p-3 text-sm text-sky-900 dark:text-sky-200">
            {datos.usoDesde
              ? <>El registro de uso (DAU, visitas, retención) cuenta desde el <strong>{new Date(`${datos.usoDesde}T12:00:00`).toLocaleDateString('es-AR')}</strong>. Lo demás sale de todo lo guardado.</>
              : <>Todavía no hay registro de uso: DAU, visitas y retención empiezan a juntarse desde que las personas usen esta versión. Lo demás ya sale de lo guardado.</>}
          </p>

          {SECCIONES.map((s) => (
            <section key={s.id} aria-labelledby={`s-${s.id}`}>
              <h2 id={`s-${s.id}`} className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">{s.titulo}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {s.claves.map((c) => <Tarjeta key={c} clave={c} indice={datos.indices[c]} />)}
              </div>

              {s.id === 'uso' && datos.usoPorDia.length > 0 && (
                <div className={`${CAJA} mt-3 p-4`}>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Personas activas por día (30 días)</h3>
                  <PersonasPorDia dias={datos.usoPorDia} />
                  {datos.plataformas.length > 0 && <p className={`mt-3 text-xs ${APAGADO}`}>Por dónde entraron: {datos.plataformas.map((p) => `${p.plataforma} ${numero(p.personas)}`).join(' · ')}</p>}
                </div>
              )}

              {s.id === 'conversion' && (
                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className={`${CAJA} p-4`}>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Embudo de las cuentas de los últimos 90 días</h3>
                    <p className={`mb-3 text-xs ${APAGADO}`}>El porcentaje es sobre las que se registraron.</p>
                    <Barras filas={datos.embudo.map((p) => {
                      const total = datos.embudo[0].personas;
                      const pct = total > 0 ? (p.personas / total) * 100 : 0;
                      return { nombre: p.nombre, valor: p.personas, ancho: pct, nota: total > 0 ? `${numero(p.personas)} · ${numero(pct)} %` : '0' };
                    })} />
                  </div>
                  <div className={`${CAJA} p-4`}>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Adopción de funciones (30 días)</h3>
                    <p className={`mb-3 text-xs ${APAGADO}`}>Sobre las {numero(datos.adopcion[0]?.base ?? 0)} personas con alguna actividad en el período.</p>
                    <Barras filas={datos.adopcion.map((a) => {
                      const pct = a.base > 0 ? (a.personas / a.base) * 100 : 0;
                      return { nombre: a.nombre, valor: a.personas, ancho: pct, nota: `${numero(a.personas)} · ${numero(pct)} %` };
                    })} />
                  </div>
                </div>
              )}

              {s.id === 'dinero' && <div className="mt-3"><CostoDeConseguir nuevas={datos.embudo[2]?.personas ?? 0} ltv={datos.indices.ltv.valor} /></div>}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
