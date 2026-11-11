import { armarCorreo, type PlantillaDeCorreo } from '../../../../shared/correos/plantillas';

/**
 * Cómo le va a llegar el correo a una persona: el MISMO armado que usa el servidor (`shared/correos/plantillas.ts`), con datos de ejemplo. Va en un marco aislado (`sandbox`
 * sin permisos) para que lo que se escriba no pueda tocar la pantalla.
 */
const EJEMPLO = {
  nombre: 'Ana López',
  enlaceRegistro: 'https://doapparg.com/complete-registration',
  enlaceApp: 'https://doapparg.com',
  enlaceDeBaja: 'https://doapparg.com/baja-de-correos/ejemplo',
};

export default function VistaPrevia({ plantilla, alto = 420 }: { plantilla: PlantillaDeCorreo; alto?: number }) {
  const correo = armarCorreo(plantilla, EJEMPLO);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-900">
      <div className="px-4 py-2 text-xs border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300">
        <span className="font-semibold">Asunto:</span> {correo.asunto || <span className="italic text-slate-400">(vacío)</span>}
      </div>
      <iframe title="Vista previa del correo" sandbox="" srcDoc={correo.html} style={{ width: '100%', height: alto, border: 0, background: '#f1f5f9' }} />
    </div>
  );
}
