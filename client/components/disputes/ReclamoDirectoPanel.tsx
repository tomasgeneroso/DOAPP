import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Clock, Handshake, ShieldAlert, Undo2, Check, X, Loader2 } from "lucide-react";
import { estadoDelReclamo, TIPOS_DE_ACUERDO } from "../../../shared/disputes/reclamo";
import { POLITICAS } from "../../../shared/constants/policies";

const API_URL = import.meta.env.VITE_API_URL || "/api";

type TipoAcuerdo = keyof typeof TIPOS_DE_ACUERDO;

interface Propuesta {
  tipo: TipoAcuerdo;
  monto?: number;
  nota: string;
  propuestoPor: string;
  propuestaEl: string | Date;
}

interface DisputaMinima {
  id: string;
  status: string;
  initiatedBy: string;
  against: string;
  createdAt: string | Date;
  negotiationDeadline?: string | Date | null;
  messages?: Array<{ from: string | { id?: string; _id?: string }; isAdmin?: boolean; createdAt: string | Date }>;
  agreementProposal?: Propuesta | null;
  escalatedAt?: string | Date | null;
  escalationReason?: string | null;
  contract?: { price?: number; allocatedAmount?: number } | null;
}

const $ = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

/**
 * Reclamo directo: el reloj de 72 h a la vista, la propuesta vigente, y lo que
 * quien mira puede hacer (proponer, aceptar, rechazar, retirar, escalar).
 *
 * Los permisos los decide el servidor (`reclamo` en la respuesta). Aca se
 * recalcula solo el reloj cada minuto con la misma funcion compartida, para
 * que el numero baje sin recargar y coincida con lo que hara el cron.
 */
export default function ReclamoDirectoPanel({
  dispute,
  userId,
  token,
  onChanged,
}: {
  dispute: DisputaMinima;
  userId: string;
  token: string | null;
  onChanged: (d: any) => void;
}) {
  const [ahora, setAhora] = useState(() => new Date());
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abrirPropuesta, setAbrirPropuesta] = useState(false);
  const [tipo, setTipo] = useState<TipoAcuerdo>("reembolso_parcial");
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const estado = useMemo(() => {
    const mensajes = (dispute.messages || []).map((m) => ({
      from: typeof m.from === "string" ? m.from : String(m.from?.id || m.from?._id || ""),
      isAdmin: m.isAdmin,
      createdAt: m.createdAt,
    }));
    return estadoDelReclamo({ ...dispute, messages: mensajes }, userId, ahora);
  }, [dispute, userId, ahora]);

  const escalada = dispute.status !== "negotiation" && !!dispute.escalatedAt;
  const propuesta = dispute.agreementProposal;
  const precio = Number(dispute.contract?.allocatedAmount ?? dispute.contract?.price) || 0;

  const llamar = async (ruta: string, body: Record<string, unknown> = {}, etiqueta = ruta) => {
    setEnviando(etiqueta);
    setError(null);
    try {
      const res = await axios.post(`${API_URL}/disputes/${dispute.id}${ruta}`, body, {
        headers: { Authorization: `Bearer ${token}` },
      });
      onChanged(res.data.data);
      setAbrirPropuesta(false);
      setMonto("");
      setNota("");
    } catch (e: any) {
      setError(e?.response?.data?.message || "No se pudo completar");
    } finally {
      setEnviando(null);
    }
  };

  // Acordaron y la plata la mueve el equipo: es otro estado, no una disputa.
  if (dispute.escalationReason === "acuerdo_aceptado" && propuesta) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-100">
        <div className="flex items-center gap-2 font-semibold">
          <Check className="h-4 w-4" aria-hidden="true" /> Acuerdo aceptado
        </div>
        <p className="mt-1">
          Acordaron: <strong>{TIPOS_DE_ACUERDO[propuesta.tipo].titulo.toLowerCase()}</strong>
          {propuesta.monto ? ` (${$(propuesta.monto)})` : ""}. Un administrador de DOAPP tiene que ejecutar la transacción; te avisamos cuando la plata se haya movido.
          Ningún pago sale de la plataforma sin que una persona lo revise.
        </p>
      </div>
    );
  }

  // Ya paso a manos de un admin: solo se explica por que.
  if (escalada) {
    const porque =
      dispute.escalationReason === "plazo_vencido"
        ? `Pasaron las ${POLITICAS.RECLAMO_DIRECTO_HORAS} horas sin acuerdo.`
        : dispute.escalationReason === "intervencion_admin"
          ? "Un administrador decidió intervenir antes del plazo."
          : dispute.escalationReason === "silencio_vencido"
            ? `Pasaron ${POLITICAS.DISPUTA_DIAS_PARA_RESPONDER} días sin respuesta de una de las partes (T&C 10.10).`
            : "Una de las partes pidió que intervenga un administrador.";
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
        <div className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="h-4 w-4" aria-hidden="true" /> Interviene un administrador
        </div>
        <p className="mt-1">
          {porque} Un administrador va a revisar el reclamo con lo que hay acá y decidir. Podés seguir escribiendo y adjuntando pruebas.
          El equipo se propone resolver en {POLITICAS.DISPUTA_OBJETIVO_RESOLUCION_DIAS} días. Si una parte deja de responder, aplica la regla de los {POLITICAS.DISPUTA_DIAS_PARA_RESPONDER} días (T&C 10.10).
        </p>
      </div>
    );
  }

  if (!estado.enReclamoDirecto) return null;

  const nivel = estado.horasRestantes <= 6 ? "red" : estado.horasRestantes <= 24 ? "amber" : "sky";
  const clases = {
    red: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100",
    amber: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100",
    sky: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-100",
  }[nivel];

  return (
    <div className={`rounded-lg border p-4 text-sm ${clases}`} aria-live="polite">
      {/* Reloj */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-semibold">
          <Handshake className="h-5 w-5" aria-hidden="true" />
          Reclamo directo: todavía lo pueden arreglar entre ustedes
        </div>
        <div className="flex items-center gap-1 rounded-full bg-white/70 px-3 py-1 font-mono text-base font-bold dark:bg-black/30" title={`Vence el ${estado.plazo.toLocaleString("es-AR")}`}>
          <Clock className="h-4 w-4" aria-hidden="true" /> {estado.textoRestante}
        </div>
      </div>
      <p className="mt-2 opacity-90">
        {estado.esReclamante
          ? `La otra parte tiene hasta el ${estado.plazo.toLocaleString("es-AR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} para responder. `
          : `Tenés hasta el ${estado.plazo.toLocaleString("es-AR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} para responder. `}
        Si al vencer no hay acuerdo, interviene un administrador y decide con lo que haya acá. El pago está congelado mientras tanto.
        {estado.laOtraRespondio && " La otra parte ya respondió."}
      </p>

      {/* Propuesta vigente */}
      {propuesta && (
        <div className="mt-3 rounded-md border border-current/20 bg-white/70 p-3 dark:bg-black/30">
          <div className="text-xs uppercase tracking-wide opacity-70">
            Propuesta de {String(propuesta.propuestoPor) === userId ? "tu parte" : "la otra parte"} · {new Date(propuesta.propuestaEl).toLocaleString("es-AR")}
          </div>
          <div className="mt-1 font-semibold">
            {TIPOS_DE_ACUERDO[propuesta.tipo].titulo}
            {propuesta.monto ? ` — ${$(propuesta.monto)}` : ""}
          </div>
          <div className="mt-1 text-xs opacity-80">{TIPOS_DE_ACUERDO[propuesta.tipo].explicacion}</div>
          {propuesta.nota && <p className="mt-2 italic">"{propuesta.nota}"</p>}
          {estado.puedeAceptarPropuesta && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  const conPlata = propuesta.tipo !== "rehacer";
                  const aviso = conPlata
                    ? `¿Aceptar "${TIPOS_DE_ACUERDO[propuesta.tipo].titulo}${propuesta.monto ? ` (${$(propuesta.monto)})` : ""}"? Queda cerrado el acuerdo y un administrador de DOAPP ejecuta la transacción. No se puede deshacer.`
                    : `¿Aceptar "${TIPOS_DE_ACUERDO[propuesta.tipo].titulo}"? El reclamo se cierra y el contrato sigue en curso.`;
                  if (window.confirm(aviso)) {
                    llamar("/acuerdo/aceptar", {}, "aceptar");
                  }
                }}
                disabled={!!enviando}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {enviando === "aceptar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aceptar y cerrar el reclamo
              </button>
              <button
                onClick={() => {
                  const n = window.prompt("¿Por qué no? (opcional, lo ve la otra parte)") ?? undefined;
                  llamar("/acuerdo/rechazar", { nota: n }, "rechazar");
                }}
                disabled={!!enviando}
                className="inline-flex items-center gap-1 rounded-lg border border-current/30 px-3 py-2 font-semibold hover:bg-white/50 disabled:opacity-60 dark:hover:bg-black/20"
              >
                <X className="h-4 w-4" /> No acepto
              </button>
            </div>
          )}
          {String(propuesta.propuestoPor) === userId && (
            <p className="mt-2 text-xs opacity-70">Esperando a la otra parte. Podés reemplazarla proponiendo otra cosa.</p>
          )}
        </div>
      )}

      {/* Acciones */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => setAbrirPropuesta((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 font-semibold text-slate-800 shadow-sm hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          aria-expanded={abrirPropuesta}
        >
          <Handshake className="h-4 w-4" /> {propuesta && String(propuesta.propuestoPor) === userId ? "Cambiar mi propuesta" : "Proponer un acuerdo"}
        </button>
        {estado.esReclamante && (
          <button
            onClick={() => {
              if (window.confirm("¿Retirar el reclamo? El contrato sigue como estaba y el pago deja de estar congelado.")) llamar("/retirar", {}, "retirar");
            }}
            disabled={!!enviando}
            className="inline-flex items-center gap-1 rounded-lg border border-current/30 px-3 py-2 font-semibold hover:bg-white/50 disabled:opacity-60 dark:hover:bg-black/20"
          >
            {enviando === "retirar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />} Retirar el reclamo
          </button>
        )}
        <button
          onClick={() => {
            if (window.confirm("¿Pedir que intervenga un administrador ahora? El reclamo pasa a disputa y decide con lo que haya acá.")) llamar("/escalar", {}, "escalar");
          }}
          disabled={!estado.puedeEscalar || !!enviando}
          title={estado.puedeEscalar ? "Pasa a manos de un administrador" : estado.motivoNoEscalar}
          className="inline-flex items-center gap-1 rounded-lg border border-current/30 px-3 py-2 font-semibold hover:bg-white/50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-black/20"
        >
          {enviando === "escalar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />} Que intervenga un administrador
        </button>
      </div>
      {!estado.puedeEscalar && estado.motivoNoEscalar && <p className="mt-1 text-xs opacity-70">{estado.motivoNoEscalar}</p>}

      {/* Formulario de propuesta */}
      {abrirPropuesta && (
        <form
          className="mt-3 space-y-3 rounded-md border border-current/20 bg-white/80 p-3 dark:bg-black/30"
          onSubmit={(e) => {
            e.preventDefault();
            llamar("/acuerdo", { tipo, monto: tipo === "reembolso_parcial" ? Number(monto) : undefined, nota }, "proponer");
          }}
        >
          <fieldset>
            <legend className="mb-1 font-semibold">¿Qué proponés?</legend>
            <div className="space-y-2">
              {(Object.keys(TIPOS_DE_ACUERDO) as TipoAcuerdo[]).map((k) => (
                <label key={k} className="flex cursor-pointer items-start gap-2 rounded-md p-2 hover:bg-white/60 dark:hover:bg-black/20">
                  <input type="radio" name="tipo" value={k} checked={tipo === k} onChange={() => setTipo(k)} className="mt-1" />
                  <span>
                    <span className="font-medium">{TIPOS_DE_ACUERDO[k].titulo}</span>
                    <span className="block text-xs opacity-80">{TIPOS_DE_ACUERDO[k].explicacion}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {tipo === "reembolso_parcial" && (
            <label className="block">
              <span className="font-medium">Cuánto vuelve al cliente</span>
              <input
                type="number"
                min={1}
                max={Math.max(1, precio - 1)}
                step="1"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                placeholder={precio ? `menos de ${$(precio)}` : "monto en pesos"}
              />
              {precio > 0 && Number(monto) > 0 && Number(monto) < precio && (
                <span className="mt-1 block text-xs opacity-80">
                  El trabajador cobraría {$(precio - Number(monto))} menos el costo de pasarela.
                </span>
              )}
            </label>
          )}
          <label className="block">
            <span className="font-medium">Explicá la propuesta</span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              maxLength={1000}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              placeholder="Qué pasó y por qué esto lo arregla"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={!!enviando} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-2 font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
              {enviando === "proponer" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Handshake className="h-4 w-4" />} Enviar propuesta
            </button>
            <button type="button" onClick={() => setAbrirPropuesta(false)} className="rounded-lg px-3 py-2 font-semibold hover:bg-white/50 dark:hover:bg-black/20">
              Cancelar
            </button>
          </div>
          <p className="text-xs opacity-70">Si la otra parte acepta, se aplica en el momento y el reclamo se cierra sin administrador. La comisión de publicación no se devuelve (T&C 7.5).</p>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-md bg-red-100 px-3 py-2 text-red-800 dark:bg-red-900/40 dark:text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
