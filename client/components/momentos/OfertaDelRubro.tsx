import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { textoDeOferta } from '../../../shared/momentos/momentos';
import { esRubroValido, etiquetaDeRubro } from '../../../shared/perfiles/zonaDeTrabajo';
import { pedirMomentos } from './api';

/** Al elegir el rubro, cuántas personas lo ofrecen (solo si son 3 o más). Da calma a quien publica con apuro, sin prometer plazos ni cercanía. */
export default function OfertaDelRubro({ rubro }: { rubro: string }) {
  const [texto, setTexto] = useState('');
  useEffect(() => {
    let vigente = true;
    setTexto('');
    if (!esRubroValido(rubro)) return;
    void pedirMomentos<{ personas: number }>(`/oferta?rubro=${encodeURIComponent(rubro)}`).then((r) => {
      if (vigente && r.ok && r.data && r.data.personas > 0) setTexto(textoDeOferta(r.data.personas, etiquetaDeRubro(rubro)));
    });
    return () => { vigente = false; };
  }, [rubro]);
  if (!texto) return null;
  return (
    <p data-testid="oferta-del-rubro" className="animate-fadeIn mt-2 flex items-start gap-2 text-sm text-emerald-800 dark:text-emerald-300">
      <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{texto}
    </p>
  );
}
