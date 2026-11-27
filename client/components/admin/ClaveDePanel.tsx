import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Check, Copy, KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import Transicion from '@/components/ui/Transicion';
import { generarClaveFuerte } from '../../../shared/seguridad/clave';

/**
 * La clave de panel (pedido del dueño, 2026-11-26): además de la contraseña de su cuenta, cada persona con un rol pone su clave para usar la administración.
 * La genera el sistema, se ve una sola vez y se puede copiar. Quien la pierde genera otra con un código que llega a su correo.
 */

export interface EstadoDeLaClave {
  exigida: boolean;
  creada: boolean;
  abierta: boolean;
  desde: string | null;
  tieneContrasena: boolean;
  horas: number;
}

async function pedir(ruta: string, cuerpo?: unknown): Promise<{ ok: boolean; message?: string; data?: any }> {
  try {
    const r = await fetch(`/api/clave-de-panel/${ruta}`, {
      method: cuerpo === undefined ? 'GET' : 'POST',
      credentials: 'include',
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const d = await r.json().catch(() => null);
    return { ok: !!d?.success, message: d?.message, data: d?.data };
  } catch {
    return { ok: false, message: 'No pudimos conectar con DOAPP. Revisá tu conexión y probá de nuevo.' };
  }
}

const CAMPO = 'w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-sky-500';
const PRINCIPAL = 'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50';
const ENLACE = 'text-sm font-medium text-sky-700 dark:text-sky-300 hover:underline disabled:opacity-50';

function Aviso({ texto }: { texto: string }) {
  return (
    <Transicion mostrar={!!texto}>
      <p role="status" className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-900 dark:text-amber-200">{texto}</p>
    </Transicion>
  );
}

/** Una clave recién generada: se ve esta única vez. */
export function ClaveGenerada({ clave, onGuardada, textoDelBoton }: { clave: string; onGuardada: () => void; textoDelBoton: string }) {
  const [copiada, setCopiada] = useState(false);
  const [guardada, setGuardada] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(clave);
      setCopiada(true);
    } catch {
      setCopiada(false);
    }
  };
  return (
    <div className="space-y-3" data-testid="clave-generada">
      <p className="text-sm text-slate-700 dark:text-slate-200">Esta es tu clave. <strong>Se muestra una sola vez</strong>: copiala y guardala en un administrador de contraseñas o en otro lugar seguro.</p>
      <code className="block select-all break-all rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 p-3 text-center font-mono text-base text-slate-900 dark:text-white">{clave}</code>
      <button type="button" onClick={() => { void copiar(); }} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-600 px-4 py-2.5 text-sm font-semibold text-sky-700 dark:text-sky-300">
        {copiada ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
        {copiada ? 'Copiada' : 'Copiar la clave'}
      </button>
      <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={guardada} onChange={(e) => setGuardada(e.target.checked)} className="mt-0.5 h-4 w-4" />
        Ya la guardé en un lugar seguro
      </label>
      <button type="button" disabled={!guardada} onClick={onGuardada} className={PRINCIPAL}>{textoDelBoton}</button>
    </div>
  );
}

type Paso = 'crear' | 'entrar' | 'recuperar';

/** Envuelve el panel: mientras la clave no esté puesta, no se dibuja nada de la administración. */
export default function PuertaDelPanel({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const conRol = !!(user as any)?.adminRole;
  const { pathname } = useLocation();
  const [estado, setEstado] = useState<EstadoDeLaClave | null>(null);
  const [sinRespuesta, setSinRespuesta] = useState('');
  const [paso, setPaso] = useState<Paso | null>(null);
  const [claveNueva, setClaveNueva] = useState('');
  const [clave, setClave] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [codigo, setCodigo] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  const revisar = useCallback(async () => {
    const r = await pedir('estado');
    if (r.ok && r.data) {
      setEstado(r.data);
      setSinRespuesta('');
    } else setSinRespuesta(r.message || 'No pudimos comprobar tu clave de panel.');
  }, []);

  // El pase vence solo: se vuelve a mirar al cambiar de pantalla, al volver a la pestaña y cada 5 minutos.
  useEffect(() => { if (conRol) void revisar(); }, [conRol, pathname, revisar]);
  useEffect(() => {
    if (!conRol) return;
    const alVolver = () => { if (document.visibilityState === 'visible') void revisar(); };
    document.addEventListener('visibilitychange', alVolver);
    const reloj = window.setInterval(() => { void revisar(); }, 5 * 60_000);
    return () => { document.removeEventListener('visibilitychange', alVolver); window.clearInterval(reloj); };
  }, [conRol, revisar]);

  // Quien no tiene rol: de eso se ocupa el panel (lo manda al inicio).
  if (!conRol) return <>{children}</>;
  if (estado && (estado.abierta || !estado.exigida)) return <>{children}</>;

  const actual: Paso = paso || (estado?.creada ? 'entrar' : 'crear');
  const enviar = async (e: FormEvent, ruta: string, cuerpo: unknown, alLograrlo: (data: any) => void) => {
    e.preventDefault();
    setEnviando(true);
    setAviso('');
    const r = await pedir(ruta, cuerpo);
    setEnviando(false);
    if (r.ok) alLograrlo(r.data);
    else setAviso(r.message || 'No pudimos completar eso.');
  };
  const pedirCodigo = async () => {
    setEnviando(true);
    const r = await pedir('pedir-codigo', {});
    setEnviando(false);
    setAviso(r.message || (r.ok ? 'Te mandamos un código.' : 'No pudimos mandar el código.'));
  };
  const mostrarClave = (data: any) => { setClaveNueva(data.clave); setContrasena(''); setCodigo(''); setClave(''); };
  const spinner = <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;

  const campoDeContrasena = (
    <label className="block text-sm text-slate-700 dark:text-slate-200">
      Contraseña de tu cuenta
      <input type="password" autoComplete="current-password" value={contrasena} onChange={(e) => setContrasena(e.target.value)} className={`mt-1 ${CAMPO}`} />
    </label>
  );
  const campoDeCodigo = (
    <div className="space-y-2">
      <label className="block text-sm text-slate-700 dark:text-slate-200">
        Código que llegó a tu correo
        <input inputMode="text" autoComplete="one-time-code" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} className={`mt-1 tracking-widest ${CAMPO}`} />
      </label>
      <button type="button" disabled={enviando} onClick={() => { void pedirCodigo(); }} className={ENLACE}>Mandarme un código</button>
    </div>
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 dark:bg-slate-900 p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-xl" data-testid="puerta-del-panel">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 dark:bg-sky-900/40"><KeyRound className="h-5 w-5 text-sky-700 dark:text-sky-300" aria-hidden="true" /></span>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            {claveNueva ? 'Guardá tu clave de panel' : actual === 'crear' ? 'Creá tu clave de panel' : actual === 'recuperar' ? 'Generar una clave nueva' : 'Ingresá tu clave de panel'}
          </h1>
        </div>

        {!estado && !sinRespuesta && <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">{spinner} Comprobando…</p>}
        {!estado && sinRespuesta && (
          <>
            <Aviso texto={sinRespuesta} />
            <button type="button" onClick={() => { void revisar(); }} className={PRINCIPAL}>Probar de nuevo</button>
          </>
        )}

        {estado && claveNueva && (
          <ClaveGenerada clave={claveNueva} textoDelBoton="Continuar" onGuardada={() => { setClaveNueva(''); setPaso('entrar'); setAviso(''); setEstado({ ...estado, creada: true }); }} />
        )}

        {estado && !claveNueva && actual === 'crear' && (
          <form className="space-y-3" onSubmit={(e) => { void enviar(e, 'crear', { contrasena, codigo }, mostrarClave); }}>
            <p className="text-sm text-slate-600 dark:text-slate-300">Para usar la administración necesitás una segunda clave, solo tuya. La genera DOAPP y es imposible de adivinar.</p>
            {estado.tieneContrasena ? campoDeContrasena : campoDeCodigo}
            <button type="submit" disabled={enviando || (estado.tieneContrasena ? !contrasena : !codigo)} className={PRINCIPAL}>{enviando ? spinner : 'Generar mi clave'}</button>
          </form>
        )}

        {estado && !claveNueva && actual === 'entrar' && (
          <form className="space-y-3" onSubmit={(e) => { void enviar(e, 'abrir', { clave }, () => window.location.reload()); }}>
            <p className="text-sm text-slate-600 dark:text-slate-300">El panel queda abierto {estado.horas} horas en este navegador.</p>
            <label className="block text-sm text-slate-700 dark:text-slate-200">
              Tu clave de panel
              <input type="password" name="clave-de-panel" autoComplete="off" value={clave} onChange={(e) => setClave(e.target.value)} autoFocus className={`mt-1 font-mono ${CAMPO}`} />
            </label>
            <button type="submit" disabled={enviando || !clave} className={PRINCIPAL}>{enviando ? spinner : 'Entrar al panel'}</button>
            <button type="button" onClick={() => { setPaso('recuperar'); setAviso(''); }} className={ENLACE}>Perdí mi clave</button>
          </form>
        )}

        {estado && !claveNueva && actual === 'recuperar' && (
          <form className="space-y-3" onSubmit={(e) => { void enviar(e, 'recuperar', { contrasena, codigo }, mostrarClave); }}>
            <p className="text-sm text-slate-600 dark:text-slate-300">La clave anterior no se puede ver: DOAPP no la guarda. Con el código de tu correo{estado.tieneContrasena ? ' y la contraseña de tu cuenta' : ''} generás una nueva y la anterior deja de servir.</p>
            {campoDeCodigo}
            {estado.tieneContrasena && campoDeContrasena}
            <button type="submit" disabled={enviando || !codigo || (estado.tieneContrasena && !contrasena)} className={PRINCIPAL}>{enviando ? spinner : 'Generar una clave nueva'}</button>
            <button type="button" onClick={() => { setPaso('entrar'); setAviso(''); }} className={ENLACE}>Volver</button>
          </form>
        )}

        <Aviso texto={aviso} />
        <Link to="/" className="block text-center text-sm text-slate-500 dark:text-slate-400 hover:underline">Volver a DOAPP</Link>
      </div>
    </main>
  );
}

/** «Tu clave de panel», en «Contraseñas de seguridad»: generar una nueva (pide la actual) y cerrar el panel. */
export function TarjetaDeTuClaveDePanel() {
  const [abierta, setAbierta] = useState(false);
  const [claveActual, setClaveActual] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [aviso, setAviso] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cambiar = async (e: FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setAviso('');
    const r = await pedir('cambiar', { claveActual });
    setEnviando(false);
    if (r.ok) {
      setClaveActual('');
      setClaveNueva(r.data.clave);
    } else setAviso(r.message || 'No pudimos cambiar la clave.');
  };

  return (
    <section aria-label="Tu clave de panel" data-testid="tu-clave-de-panel" className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-white">Tu clave de panel</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">La segunda clave, solo tuya, para usar la administración. La genera DOAPP.</p>
        </div>
        {!claveNueva && (
          <button type="button" onClick={() => { setAbierta((v) => !v); setAviso(''); }} className="rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            {abierta ? 'Cerrar' : 'Generar una nueva'}
          </button>
        )}
      </div>
      <Transicion mostrar={abierta && !claveNueva}>
        <form onSubmit={(e) => { void cambiar(e); }} className="space-y-3">
          <label className="block text-sm text-slate-700 dark:text-slate-200">
            Tu clave de panel actual
            <input type="password" autoComplete="off" value={claveActual} onChange={(e) => setClaveActual(e.target.value)} className={`mt-1 font-mono ${CAMPO}`} />
          </label>
          <button type="submit" disabled={enviando || !claveActual} className={PRINCIPAL}>{enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generar clave nueva'}</button>
        </form>
      </Transicion>
      {claveNueva && <ClaveGenerada clave={claveNueva} textoDelBoton="Entrar de nuevo con la clave nueva" onGuardada={() => window.location.reload()} />}
      <Aviso texto={aviso} />
    </section>
  );
}

/** «Generar contraseña segura»: la escribe en los campos del formulario y la deja a la vista para copiarla antes de guardar. */
export function GenerarContrasenaSegura({ valorActual, onGenerar }: { valorActual: string; onGenerar: (contrasena: string) => void }) {
  const [generada, setGenerada] = useState('');
  const [copiada, setCopiada] = useState(false);
  // Si después se escribe otra a mano (o se guarda y el campo se vacía), la que se había generado deja de mostrarse.
  const aLaVista = !!generada && generada === valorActual;
  return (
    <div className="space-y-2">
      <button type="button" data-testid="generar-contrasena" onClick={() => { const c = generarClaveFuerte(); setGenerada(c); setCopiada(false); onGenerar(c); }} className={ENLACE}>
        Generar contraseña segura
      </button>
      <Transicion mostrar={aLaVista}>
        <div className="space-y-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 p-3">
          <code className="block select-all break-all font-mono text-sm text-slate-900 dark:text-white">{generada}</code>
          <button type="button" onClick={() => { navigator.clipboard.writeText(generada).then(() => setCopiada(true)).catch(() => setCopiada(false)); }} className={ENLACE}>
            {copiada ? 'Copiada' : 'Copiar'}
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400">Copiala y guardala en un lugar seguro antes de tocar «Guardar»: después no se puede ver.</p>
        </div>
      </Transicion>
    </div>
  );
}

/** Cierra el panel en este navegador (la sesión de la cuenta sigue abierta). */
export async function bloquearElPanel(): Promise<void> {
  await pedir('cerrar', {});
  window.location.assign('/');
}
