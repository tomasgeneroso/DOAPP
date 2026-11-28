import { useEffect, useRef } from 'react';
import { useToast } from './ui/Toast';
import { EVENTO_ERROR_SIN_MOSTRAR } from '../utils/redDeErrores';

/** Muestra en un cartel lo que ninguna pantalla mostró (ver `utils/redDeErrores.ts`). El mismo texto no se repite dentro de unos segundos. */
export default function RedDeErrores() {
  const { error } = useToast();
  const mostrar = useRef(error);
  mostrar.current = error;
  useEffect(() => {
    const vistos = new Map<string, number>();
    const oir = (e: Event) => {
      const mensaje = String((e as CustomEvent).detail || '');
      if (!mensaje || Date.now() - (vistos.get(mensaje) ?? 0) < 6000) return;
      vistos.set(mensaje, Date.now());
      mostrar.current('Algo no salió bien', mensaje);
    };
    window.addEventListener(EVENTO_ERROR_SIN_MOSTRAR, oir);
    return () => window.removeEventListener(EVENTO_ERROR_SIN_MOSTRAR, oir);
  }, []);
  return null;
}
