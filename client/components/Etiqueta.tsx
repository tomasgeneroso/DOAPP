import { Link, useNavigate } from 'react-router-dom';
import { rutaDeEtiqueta, textoDeEtiqueta } from '../../shared/etiquetas';

const ESTILO = 'inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-sky-100 hover:text-sky-800 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-sky-900/40 dark:hover:text-sky-200';

/** Una #etiqueta que lleva a todo lo que la usa. `anidada`: adentro de una tarjeta que ya es un enlace (un enlace dentro de otro no es válido). */
export default function Etiqueta({ etiqueta, anidada = false, className = '' }: { etiqueta: string; anidada?: boolean; className?: string }) {
  const navigate = useNavigate();
  if (anidada) {
    return (
      <button type="button" data-testid="etiqueta" onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(rutaDeEtiqueta(etiqueta)); }} className={`${ESTILO} ${className}`}>
        {textoDeEtiqueta(etiqueta)}
      </button>
    );
  }
  return (
    <Link to={rutaDeEtiqueta(etiqueta)} data-testid="etiqueta" className={`${ESTILO} ${className}`}>
      {textoDeEtiqueta(etiqueta)}
    </Link>
  );
}
