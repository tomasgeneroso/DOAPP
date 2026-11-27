import { useState } from 'react';
import { MapPin } from 'lucide-react';
import LocationAutocomplete from '@/components/ui/LocationAutocomplete';
import CalleYNumero from '@/components/ui/CalleYNumero';
import InfoIcono from '@/components/ui/InfoIcono';
import { detallesDeUbicacion, type LugarSugerido } from '../../../shared/geo/lugares';
import type { Destino } from '../../../shared/jobs/destinoYPies';

const VACIO: Destino = { location: '', neighborhood: '', postalCode: '', street: '', number: '', details: '', latitude: null, longitude: null };
const CAMPO = 'block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm dark:bg-slate-700 dark:text-white dark:ring-slate-600';

/** Para mudanzas, fletes y mandados: la dirección de siempre es el origen y acá se agrega el destino. `null`: el trabajo no tiene destino. */
export default function DireccionDeDestino({ destino, onChange, disabled = false }: { destino: Destino | null; onChange: (d: Destino | null) => void; disabled?: boolean }) {
  const [provincia, setProvincia] = useState('');
  const d = destino ?? VACIO;
  const poner = (cambio: Partial<Destino>) => onChange({ ...d, ...cambio });

  const alElegirLugar = async (l: LugarSugerido) => {
    setProvincia(l.provincia || '');
    const cambio: Partial<Destino> = { location: [l.ciudad, l.provincia].filter((x, i, a) => x && a.indexOf(x) === i).join(', ') || d.location, latitude: l.lat, longitude: l.lon, neighborhood: l.barrio || '', postalCode: l.codigoPostal || '' };
    if (l.calle) Object.assign(cambio, { street: l.calle, number: l.numero });
    if ((!l.barrio || !l.codigoPostal) && l.lat !== undefined) {
      const det = await detallesDeUbicacion(l.lat, l.lon);
      if (det) Object.assign(cambio, { neighborhood: l.barrio || det.barrio || '', postalCode: l.codigoPostal || det.codigoPostal || '' });
    }
    onChange({ ...d, ...cambio });
  };

  return (
    <fieldset disabled={disabled} className="m-0 min-w-0 space-y-3 rounded-xl border border-slate-200 p-4 disabled:opacity-60 dark:border-slate-700" data-testid="direccion-de-destino">
      <label className="flex items-start gap-2 text-sm text-gray-800 dark:text-slate-200">
        <input type="checkbox" checked={!!destino} onChange={(e) => onChange(e.target.checked ? { ...VACIO } : null)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-700" />
        <span>
          <strong>Agregar dirección de destino</strong> (mudanzas, fletes y mandados) <InfoIcono ayuda="Origen y destino" />
        </span>
      </label>
      {destino && (
        <div className="animate-fadeIn space-y-3">
          <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><MapPin className="h-3.5 w-3.5" aria-hidden="true" />La dirección de arriba es el origen. Acá va adónde hay que llegar.</p>
          <label className="block text-sm font-medium text-gray-900 dark:text-slate-200">
            Ciudad o localidad de destino
            <div className="mt-1">
              <LocationAutocomplete value={d.location} onChange={(valor) => poner({ location: valor })} onPlaceSelect={alElegirLugar} placeholder="Ej: Resistencia, Chaco" name="destinationLocation" />
            </div>
          </label>
          <CalleYNumero
            street={d.street ?? ''}
            number={d.number ?? ''}
            onStreetChange={(v) => poner({ street: v })}
            onNumberChange={(v) => poner({ number: v })}
            provincia={provincia || undefined}
            ciudad={d.location.split(',')[0] || undefined}
            onAddressResolved={(r) => onChange({ ...d, street: r.calle, number: r.numero || d.number || '', location: d.location || [r.ciudad, r.provincia].filter(Boolean).join(', '), latitude: r.lat ?? d.latitude, longitude: r.lon ?? d.longitude })}
            labels={{ street: 'Calle de destino', number: 'Número', streetPlaceholder: 'Ej: San Martín', numberPlaceholder: 'Ej: 742' }}
          />
          <label className="block text-sm font-medium text-gray-900 dark:text-slate-200">
            Indicaciones del destino (opcional)
            <input type="text" value={d.details ?? ''} maxLength={200} onChange={(e) => poner({ details: e.target.value })} placeholder="Piso, departamento, entre calles" className={`mt-1 ${CAMPO}`} />
          </label>
        </div>
      )}
    </fieldset>
  );
}

/** El destino tal como se ve en el trabajo. La calle solo llega a quien puede verla (el servidor la saca para los demás). */
export function DestinoDelTrabajo({ destino }: { destino?: Destino | null }) {
  if (!destino?.location) return null;
  const calle = [destino.street, destino.number].filter(Boolean).join(' ');
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800" data-testid="destino-del-trabajo">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white"><MapPin className="h-4 w-4 text-sky-500" aria-hidden="true" />Destino</h2>
      <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{[calle, destino.neighborhood, destino.postalCode ? `CP ${destino.postalCode}` : null, destino.location].filter(Boolean).join(', ')}</p>
      {destino.details && <p className="text-sm text-slate-500 dark:text-slate-400">{destino.details}</p>}
      {!calle && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">La calle y el número se comparten con quien se contrate, igual que los del origen.</p>}
    </div>
  );
}
