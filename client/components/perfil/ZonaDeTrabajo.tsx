import { useState } from 'react';
import { MapPin, Plus, X } from 'lucide-react';
import { RADIOS_DE_TRABAJO_KM, MAXIMO_DE_ZONAS } from '../../../shared/perfiles/zonaDeTrabajo';

/**
 * Zona de trabajo (pedido del dueño, 2026-11-12): el domicilio fija la zona base; además se puede elegir un radio en km desde el domicilio y sumar otras zonas
 * (cada una con un radio opcional). Controlado: Configuración guarda los valores junto con el resto del perfil.
 */
export interface Zona {
  name: string;
  radiusKm?: number;
}

interface Props {
  ciudad: string;
  provincia: string;
  radioKm: number | null;
  onRadio: (r: number | null) => void;
  zonas: Zona[];
  onZonas: (z: Zona[]) => void;
}

export default function ZonaDeTrabajo({ ciudad, provincia, radioKm, onRadio, zonas, onZonas }: Props) {
  const [nueva, setNueva] = useState('');
  const base = [ciudad, provincia].filter(Boolean).join(', ');

  const agregar = () => {
    const name = nueva.replace(/\s+/g, ' ').trim();
    if (name.length < 2 || zonas.length >= MAXIMO_DE_ZONAS) return;
    if (zonas.some((z) => z.name.toLowerCase() === name.toLowerCase())) {
      setNueva('');
      return;
    }
    onZonas([...zonas, { name }]);
    setNueva('');
  };

  return (
    <section className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700" data-testid="zona-de-trabajo">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Zona de trabajo
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Tu domicilio define tu zona base{base ? <>: <strong>{base}</strong></> : '. Completá la ciudad arriba para que se vea'}. Sumá un radio y otras zonas donde también trabajás.
        </p>
      </div>

      <div>
        <label htmlFor="radioDeTrabajo" className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
          Radio de trabajo desde tu domicilio
        </label>
        <select
          id="radioDeTrabajo"
          value={radioKm ?? ''}
          onChange={(e) => onRadio(e.target.value ? Number(e.target.value) : null)}
          className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-900 focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-700 dark:text-white"
        >
          <option value="">Sin definir</option>
          {RADIOS_DE_TRABAJO_KM.map((km) => (
            <option key={km} value={km}>Hasta {km} km</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="otraZona" className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">Otras zonas donde trabajás</label>
        <div className="flex gap-2">
          <input
            id="otraZona"
            type="text"
            value={nueva}
            maxLength={80}
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                agregar();
              }
            }}
            placeholder="Ej.: Palermo, Zona Norte, Rosario"
            className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-900 focus:ring-2 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-700 dark:text-white"
          />
          <button
            type="button"
            onClick={agregar}
            disabled={nueva.trim().length < 2 || zonas.length >= MAXIMO_DE_ZONAS}
            className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Agregar
          </button>
        </div>
        {zonas.length > 0 && (
          <ul className="mt-3 space-y-2">
            {zonas.map((z, i) => (
              <li key={z.name} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-slate-900 dark:text-white">{z.name}</span>
                <select
                  aria-label={`Radio alrededor de ${z.name}`}
                  value={z.radiusKm ?? ''}
                  onChange={(e) => onZonas(zonas.map((x, j) => (j === i ? { name: x.name, ...(e.target.value ? { radiusKm: Number(e.target.value) } : {}) } : x)))}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                >
                  <option value="">Sin radio</option>
                  {RADIOS_DE_TRABAJO_KM.map((km) => (
                    <option key={km} value={km}>{km} km</option>
                  ))}
                </select>
                <button type="button" onClick={() => onZonas(zonas.filter((_, j) => j !== i))} aria-label={`Quitar ${z.name}`} className="text-slate-400 hover:text-red-500">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
