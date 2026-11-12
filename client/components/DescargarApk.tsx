import { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Botón «Descargar APK» (regla del dueño, 2026-11-12: la app para Android se baja sin pasar por ninguna tienda).
 *
 * El archivo lo sirve `GET /api/app/android` (`server/routes/appAndroid.ts`) y `GET /api/app/android/estado` dice si ya hay uno. Mientras el servidor no lo
 * tenga el botón sale apagado con «próximamente» (nunca un enlace que termina en un error); si el pedido de estado falla por la red, se deja el enlace
 * activo: la descarga misma avisa si algo anda mal.
 *
 * `portada`: sobre fondo oscuro, junto a los botones principales. `pie`: en el pie de página, con la guía de instalación desplegable.
 */
interface EstadoDelApk {
  disponible: boolean;
  /** Producción: todavía no se ofrece (solo staging); no se dibuja nada. */
  oculto?: boolean;
  version?: string | null;
  tamanoMB?: number;
}

export default function DescargarApk({ variante = 'pie' }: { variante?: 'portada' | 'pie' }) {
  const { t } = useTranslation();
  const [estado, setEstado] = useState<EstadoDelApk | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch('/api/app/android/estado')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d && typeof d.disponible === 'boolean') setEstado(d as EstadoDelApk);
      })
      .catch(() => {
        /* sin red: el botón queda activo */
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (estado?.oculto) return null;
  const apagado = estado?.disponible === false;
  const detalle = estado?.disponible ? [estado.version ? `v${estado.version}` : null, estado.tamanoMB ? `${estado.tamanoMB} MB` : null].filter(Boolean).join(' · ') : '';
  const enPortada = variante === 'portada';

  const aspecto = enPortada
    ? 'border-2 border-slate-600 px-6 sm:px-10 py-4 text-base font-semibold text-slate-300 hover:border-sky-500 hover:text-white'
    : 'border border-sky-600 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 dark:border-sky-500 dark:text-sky-300 dark:hover:bg-slate-800';
  const base = `inline-flex items-center justify-center gap-2 rounded-xl transition-colors ${aspecto}`;
  const texto = t('apk.descargar', 'Descargar APK (Android)');

  return (
    <div className={enPortada ? 'flex flex-col items-center sm:items-start' : 'mt-4 flex flex-col items-start'}>
      {apagado ? (
        <span role="note" aria-disabled="true" className={`${base} cursor-not-allowed opacity-60`}>
          <Smartphone className="h-5 w-5" aria-hidden="true" />
          {t('apk.proximamente', 'App para Android: próximamente')}
        </span>
      ) : (
        <a href="/api/app/android" download="doapp.apk" className={base} data-testid="descargar-apk">
          <Download className="h-5 w-5" aria-hidden="true" />
          {texto}
        </a>
      )}
      {detalle && <span className={`mt-1 text-xs ${enPortada ? 'text-slate-500' : 'text-slate-500 dark:text-slate-400'}`}>{detalle}</span>}
      {!enPortada && !apagado && (
        <details className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          <summary className="cursor-pointer select-none hover:text-sky-600 dark:hover:text-sky-400">{t('apk.comoSeInstala', '¿Cómo se instala?')}</summary>
          <ol className="mt-1 list-decimal space-y-1 pl-4">
            <li>{t('apk.paso1', 'Tocá «Descargar APK» y esperá a que termine.')}</li>
            <li>{t('apk.paso2', 'Abrí el archivo descargado. Si Android lo pide, permití «instalar apps de esta fuente».')}</li>
            <li>{t('apk.paso3', 'Tocá «Instalar». Para actualizar, descargá la versión nueva e instalala encima.')}</li>
          </ol>
        </details>
      )}
    </div>
  );
}
