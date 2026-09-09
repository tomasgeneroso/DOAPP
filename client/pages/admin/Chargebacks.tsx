import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../../hooks/useAuth';
import { Loader2, RefreshCw, AlertTriangle, FileText, ShieldOff, Clock, UserX } from 'lucide-react';

/**
 * Contracargos y retenciones por fraude.
 *
 * Es el único panel de la plataforma ordenado por vencimiento en vez de por
 * fecha de entrada. La razón: acá el trabajo no se hace más difícil con el
 * tiempo, se vuelve imposible. Pasada la fecha límite el caso se resuelve sin
 * nuestra evidencia y la plata se pierde, aunque el trabajo se haya hecho y el
 * expediente esté completo.
 */

interface Contracargo {
  paymentId: string;
  contractId: string | null;
  monto: number;
  moneda: string;
  idPagoMercadoPago: string | null;
  idContracargo: string | null;
  tipo: string;
  recibidoEl: string;
  fechaLimite: string | null;
  horasRestantes: number | null;
  vencido: boolean;
  urgente: boolean;
  evidencia: string | null;
  clienteId: string | null;
  contracargosDelCliente: number;
  reincidente: boolean;
}

interface Retencion {
  contractId: string;
  monto: number;
  retenidoEl: string;
  motivo: string | null;
}

export default function Chargebacks() {
  const { token } = useAuth();
  const [contracargos, setContracargos] = useState<Contracargo[]>([]);
  const [retenciones, setRetenciones] = useState<Retencion[]>([]);
  const [resumen, setResumen] = useState<any>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'mal'; texto: string } | null>(null);

  const cargar = async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/hubs/chargebacks', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'No se pudo cargar');
      setContracargos(data.contracargos || []);
      setRetenciones(data.retencionesPorFraude || []);
      setResumen(data.resumen || {});
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (token) cargar();
  }, [token]);

  const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-AR')}`;

  /**
   * El tiempo restante se dice en la unidad que corresponde a la urgencia.
   * "Quedan 3 horas" y "quedan 6 días" se leen distinto, y esa diferencia de
   * lectura es justamente la que tiene que provocar una reacción distinta.
   */
  const tiempo = (horas: number | null) => {
    if (horas === null) return 'Sin fecha conocida';
    if (horas <= 0) return 'Vencido';
    if (horas < 48) return `Quedan ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
    return `Quedan ${Math.floor(horas / 24)} días`;
  };

  /**
   * Presentar el descargo.
   *
   * La confirmación no es un trámite: presentar un descargo es afirmar ante un
   * banco que el servicio se prestó. Si el expediente está flojo, mandarlo
   * igual deja registrado que sostuvimos algo que no podíamos sostener.
   */
  const presentar = async (c: Contracargo) => {
    if (!c.idContracargo) {
      setAviso({
        tipo: 'mal',
        texto: 'Este caso no tiene id de MercadoPago registrado. Buscalo en el panel de ellos.',
      });
      return;
    }

    const ok = window.confirm(
      `Vas a presentar el descargo del contracargo por ${pesos(c.monto)}.\n\n` +
        '¿Revisaste el expediente? Presentarlo es afirmar ante el banco que el servicio se prestó.\n\n' +
        'Si no lo miraste todavía, cancelá y abrí el PDF primero.',
    );
    if (!ok) return;

    setEnviando(c.paymentId);
    setAviso(null);
    try {
      const extra = (mensajes[c.paymentId] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`/api/admin/hubs/chargebacks/${c.paymentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ idContracargo: c.idContracargo, mensajes: extra, revisado: true }),
      });
      const data = await res.json();
      setAviso({
        tipo: data.success ? 'ok' : 'mal',
        texto: data.message || (data.success ? 'Presentado' : 'No se pudo presentar'),
      });
      if (data.success) cargar();
    } catch (e: any) {
      setAviso({ tipo: 'mal', texto: e.message });
    } finally {
      setEnviando(null);
    }
  };

  const levantarRetencion = async (r: Retencion) => {
    const justificacion = window.prompt(
      'Contá en una o dos frases por qué considerás que el pago puede liberarse.\n' +
        'Es lo único que va a quedar para entender esta decisión más adelante.',
    );
    if (!justificacion || justificacion.trim().length < 15) {
      if (justificacion !== null) {
        setAviso({ tipo: 'mal', texto: 'La justificación es muy corta. Contá un poco más.' });
      }
      return;
    }

    try {
      const res = await fetch(`/api/admin/contracts/${r.contractId}/clear-fraud-hold`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ justificacion: justificacion.trim() }),
      });
      const data = await res.json();
      setAviso({ tipo: data.success ? 'ok' : 'mal', texto: data.message });
      if (data.success) cargar();
    } catch (e: any) {
      setAviso({ tipo: 'mal', texto: e.message });
    }
  };

  return (
    <>
      <Helmet>
        <title>Contracargos - DOAPP</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Contracargos</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              Ordenados por vencimiento, no por fecha de entrada. Pasada la fecha límite el caso se
              resuelve sin nuestra evidencia y la plata se pierde, aunque el trabajo se haya hecho.
            </p>
          </div>
          <button
            onClick={cargar}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </button>
        </div>

        {/* Los contadores sólo aparecen si hay algo. Un panel que muestra ceros
            grandes todos los días enseña a ignorarlo. */}
        {(resumen.total > 0 || retenciones.length > 0) && (
          <div className="flex flex-wrap gap-3">
            {resumen.vencidos > 0 && (
              <div className="px-4 py-2 rounded-lg bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200">
                <span className="font-bold text-lg">{resumen.vencidos}</span>{' '}
                <span className="text-sm">vencidos</span>
              </div>
            )}
            {resumen.urgentes > 0 && (
              <div className="px-4 py-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200">
                <span className="font-bold text-lg">{resumen.urgentes}</span>{' '}
                <span className="text-sm">vencen en menos de 48 h</span>
              </div>
            )}
            <div className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              <span className="font-bold text-lg">{pesos(resumen.montoTotal || 0)}</span>{' '}
              <span className="text-sm">en juego</span>
            </div>
          </div>
        )}

        {aviso && (
          <div
            className={`rounded-lg border p-4 text-sm ${
              aviso.tipo === 'ok'
                ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200'
                : 'border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 text-rose-800 dark:text-rose-200'
            }`}
          >
            {aviso.texto}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 p-4 text-sm text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}

        {cargando ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          </div>
        ) : contracargos.length === 0 && retenciones.length === 0 ? (
          <p className="text-center py-16 text-slate-500 dark:text-slate-400">
            No hay contracargos ni retenciones abiertas.
          </p>
        ) : (
          <div className="space-y-4">
            {contracargos.map((c) => (
              <div
                key={c.paymentId}
                className={`rounded-lg border p-5 bg-white dark:bg-slate-900 ${
                  c.vencido
                    ? 'border-rose-400 dark:border-rose-700'
                    : c.urgente
                      ? 'border-amber-400 dark:border-amber-700'
                      : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg font-bold text-slate-900 dark:text-white">
                        {pesos(c.monto)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                          c.vencido
                            ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200'
                            : c.urgente
                              ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Clock className="h-3 w-3" />
                        {tiempo(c.horasRestantes)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {c.tipo} · recibido el {new Date(c.recibidoEl).toLocaleString('es-AR')}
                      {c.fechaLimite && (
                        <> · vence el {new Date(c.fechaLimite).toLocaleString('es-AR')}</>
                      )}
                    </p>
                    {c.contractId && (
                      <Link
                        to={`/contracts/${c.contractId}`}
                        className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
                      >
                        Ver contrato
                      </Link>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {c.evidencia && (
                      <a
                        href={
                          c.evidencia +
                          (mensajes[c.paymentId]
                            ? `&mensajes=${encodeURIComponent(mensajes[c.paymentId])}`
                            : '')
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <FileText className="h-4 w-4" />
                        Ver expediente
                      </a>
                    )}
                    <button
                      onClick={() => presentar(c)}
                      disabled={enviando === c.paymentId || c.vencido}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-sky-500 hover:bg-sky-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      title={c.vencido ? 'El plazo ya venció' : 'Presentar el descargo'}
                    >
                      {enviando === c.paymentId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      Presentar descargo
                    </button>
                  </div>
                </div>

                {/* El campo va junto al botón porque los mensajes que se agregan
                    son parte de la decisión de presentar, no una configuración
                    aparte que se recuerda en otro momento. */}
                <div className="mt-4">
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Mensajes del medio a incluir (opcional). Usá los números que muestra el PDF:
                    <span className="font-mono"> 40-52, 118</span>
                  </label>
                  <input
                    type="text"
                    value={mensajes[c.paymentId] || ''}
                    onChange={(e) =>
                      setMensajes((m) => ({ ...m, [c.paymentId]: e.target.value }))
                    }
                    placeholder="Ej: 40-52, 118"
                    className="w-full max-w-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                {/* Reincidencia: un contracargo aislado no dice nada — puede
                    ser una tarjeta robada de verdad. Dos o más es un patrón, y
                    ahí hay que mirar a la persona, no sólo el caso. */}
                {c.reincidente && (
                  <div className="mt-3 rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/20 p-3">
                    <p className="flex gap-2 text-sm font-medium text-rose-800 dark:text-rose-200">
                      <UserX className="h-4 w-4 shrink-0 mt-0.5" />
                      Este cliente generó {c.contracargosDelCliente} contracargos
                    </p>
                    <p className="text-xs text-rose-700 dark:text-rose-300 mt-1 ml-6">
                      Uno solo puede ser una tarjeta robada o un cargo que no reconoció. Dos o más
                      es un patrón: conviene revisar su historial y evaluar si corresponde
                      suspenderlo antes de que siga.
                    </p>
                    {c.clienteId && (
                      <Link
                        to={`/admin/users/${c.clienteId}`}
                        className="inline-block mt-2 ml-6 text-xs font-medium text-rose-800 dark:text-rose-200 underline"
                      >
                        Ver al cliente y decidir
                      </Link>
                    )}
                  </div>
                )}

                {c.vencido && (
                  <p className="mt-3 flex gap-2 text-xs text-rose-700 dark:text-rose-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    El plazo venció. El caso se resuelve sin nuestra evidencia.
                  </p>
                )}
              </div>
            ))}

            {retenciones.length > 0 && (
              <div className="pt-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                  Retenciones por alerta de fraude
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 max-w-2xl">
                  Nadie reclamó nada: MercadoPago reportó una señal automática y el pago al
                  trabajador quedó frenado. Si es un falso positivo, levantá la retención — el
                  trabajador está esperando su plata.
                </p>

                <div className="space-y-3">
                  {retenciones.map((r) => (
                    <div
                      key={r.contractId}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex items-start justify-between gap-4 flex-wrap"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <ShieldOff className="h-4 w-4 text-amber-600" />
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {pesos(r.monto)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Retenido el {new Date(r.retenidoEl).toLocaleString('es-AR')}
                          {r.motivo && <> · {r.motivo}</>}
                        </p>
                        <Link
                          to={`/contracts/${r.contractId}`}
                          className="text-xs text-sky-600 dark:text-sky-400 hover:underline"
                        >
                          Ver contrato
                        </Link>
                      </div>
                      <button
                        onClick={() => levantarRetencion(r)}
                        className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Levantar retención
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
