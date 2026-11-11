import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CheckCircle2, Loader2, MailX, AlertCircle } from 'lucide-react';

/**
 * Darse de baja de los correos de DOAPP (módulo de correos, 2026-11-11). Es la página a la que lleva el enlace del pie de cada correo. No hace falta iniciar sesión: el enlace lleva
 * un token firmado. Dar de baja es un botón (y no pasa solo al abrir el enlace) porque los programas que revisan los correos abren los enlaces antes que la persona.
 */
type Estado = 'cargando' | 'activo' | 'de_baja' | 'invalido' | 'error';

export default function BajaDeCorreos() {
  const { token = '' } = useParams();
  const [estado, setEstado] = useState<Estado>('cargando');
  const [trabajando, setTrabajando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/correos/baja/${encodeURIComponent(token)}`)
      .then(async (r) => ({ ok: r.ok, estado: r.status, d: await r.json().catch(() => ({})) }))
      .then((r) => {
        if (!vivo) return;
        if (r.ok && r.d?.success) setEstado(r.d.data.deBaja ? 'de_baja' : 'activo');
        else setEstado(r.estado === 404 ? 'invalido' : 'error');
      })
      .catch(() => vivo && setEstado('error'));
    return () => {
      vivo = false;
    };
  }, [token]);

  const cambiar = async (accion: 'baja' | 'alta') => {
    setTrabajando(true);
    setMensaje(null);
    try {
      const r = await fetch(`/api/correos/${accion}/${encodeURIComponent(token)}`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.success) {
        setEstado(accion === 'baja' ? 'de_baja' : 'activo');
        setMensaje(d.message ?? null);
      } else setMensaje(d?.message || 'No pudimos completar la acción. Probá de nuevo.');
    } catch {
      setMensaje('Error de conexión. Probá de nuevo.');
    } finally {
      setTrabajando(false);
    }
  };

  const boton = 'w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold disabled:opacity-60';
  return (
    <>
      <Helmet>
        <title>Darte de baja de los correos · DOAPP</title>
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="fixed inset-0 -z-10 bg-slate-50 dark:bg-slate-900" aria-hidden="true" />
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          <h1 className="mb-6 text-center text-3xl font-bold text-sky-600 dark:text-sky-400">DOAPP</h1>
          <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg dark:border-slate-700 dark:bg-slate-800">
            {estado === 'cargando' && <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" aria-label="Cargando" />}

            {estado === 'activo' && (
              <>
                <MailX className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">¿Querés dejar de recibir estos correos?</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">Dejás de recibir recordatorios y novedades de DOAPP. Los avisos de tus pagos, contratos y de seguridad de la cuenta siguen llegando.</p>
                <button type="button" onClick={() => cambiar('baja')} disabled={trabajando} className={`${boton} bg-sky-600 text-white hover:bg-sky-700`}>
                  {trabajando && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />} Sí, darme de baja
                </button>
              </>
            )}

            {estado === 'de_baja' && (
              <>
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden="true" />
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Listo, ya no vas a recibir estos correos</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">Los avisos de tus pagos, contratos y de seguridad de la cuenta siguen llegando.</p>
                <button type="button" onClick={() => cambiar('alta')} disabled={trabajando} className={`${boton} border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700`}>
                  {trabajando && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />} Me equivoqué: volver a recibirlos
                </button>
              </>
            )}

            {(estado === 'invalido' || estado === 'error') && (
              <>
                <AlertCircle className="mx-auto h-10 w-10 text-amber-500" aria-hidden="true" />
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{estado === 'invalido' ? 'Este enlace no es válido' : 'No pudimos cargar la página'}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {estado === 'invalido' ? 'Puede que esté cortado o incompleto. Abrilo de nuevo desde el correo, o escribinos desde el Centro de ayuda y te damos de baja nosotros.' : 'Probá de nuevo en un rato.'}
                </p>
              </>
            )}

            {mensaje && <p role="status" className="text-sm text-slate-600 dark:text-slate-300">{mensaje}</p>}
          </div>
        </div>
      </div>
    </>
  );
}
