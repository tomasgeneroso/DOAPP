import { SlidersHorizontal } from 'lucide-react';
import { etiquetaDeRubro, parametrosParaMi, tieneAlgoParaMi, type PerfilParaElMuro as PerfilBase } from '../../../shared/perfiles/zonaDeTrabajo';

export { parametrosParaMi, tieneAlgoParaMi };

/**
 * «Para mí» en el muro de trabajos (pedido del dueño, 2026-11-12): quien ofrece servicios ve solo los trabajos de sus rubros y de su zona de trabajo.
 * Los rubros son los que eligió; la zona, su ciudad, las otras zonas que cargó y el radio desde su domicilio.
 */
export type PerfilParaElMuro = PerfilBase & { role?: string };

interface Props {
  perfil: PerfilParaElMuro;
  activo: boolean;
  onCambiar: (v: boolean) => void;
}

export default function ParaMi({ perfil, activo, onCambiar }: Props) {
  if (!tieneAlgoParaMi(perfil)) return null;
  const rubros = perfil.workAnyCategory ? ['Cualquier rubro'] : (perfil.workCategories || []).map(etiquetaDeRubro);
  const zona = [perfil.address?.city, ...(perfil.workZones || []).map((z) => z.name)].filter(Boolean).join(', ');

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-800 dark:bg-sky-900/10" data-testid="para-mi">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-sky-900 dark:text-sky-200">
        <input type="checkbox" checked={activo} onChange={(e) => onCambiar(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600" />
        <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
        Para mí
      </label>
      <p className="min-w-0 flex-1 text-xs text-slate-600 dark:text-slate-300">
        Solo trabajos de {rubros.join(', ') || 'todos los rubros'}
        {zona ? ` en ${zona}` : ''}
        {perfil.workRadiusKm ? ` (o hasta ${perfil.workRadiusKm} km de tu domicilio)` : ''}.{' '}
        <a href="/settings?tab=address" className="font-semibold text-sky-700 underline dark:text-sky-300">Cambiar</a>
      </p>
    </div>
  );
}
