import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import Transicion from './Transicion';

/**
 * Un bloque que se despliega y se pliega tocando su título (pedido del dueño, 2026-11-19: «Mis puntuaciones» y «¿Qué es el Centro Profesional?» deben ser
 * desplegables). Un solo diseño para todos: el título es un botón con `aria-expanded`, la flecha gira y el contenido entra y sale con una transición
 * (`Transicion`). Si se le da una `clave`, recuerda en el navegador cómo lo dejó la persona (si el almacenamiento está bloqueado, funciona igual y no recuerda).
 */
const leer = (clave: string): string | null => {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
};
const guardar = (clave: string, valor: string) => {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
};

export default function Desplegable({
  titulo,
  icono,
  abiertoAlInicio = true,
  clave,
  className = '',
  encabezado = 'h2',
  children,
}: {
  titulo: ReactNode;
  icono?: ReactNode;
  abiertoAlInicio?: boolean;
  /** Para recordar cómo lo dejó la persona (por ejemplo `doapp:desplegable:puntuaciones:<usuario>`). */
  clave?: string;
  className?: string;
  encabezado?: 'h2' | 'h3';
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(() => {
    if (!clave) return abiertoAlInicio;
    const guardado = leer(clave);
    return guardado === null ? abiertoAlInicio : guardado === 'abierto';
  });
  const alternar = () =>
    setAbierto((a) => {
      if (clave) guardar(clave, a ? 'plegado' : 'abierto');
      return !a;
    });
  const Encabezado = encabezado;

  return (
    <section className={`rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800 ${className}`}>
      <Encabezado className="m-0 text-base font-semibold text-slate-900 dark:text-white">
        <button
          type="button"
          onClick={alternar}
          aria-expanded={abierto}
          className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            {icono}
            <span className="min-w-0">{titulo}</span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </Encabezado>
      <Transicion mostrar={abierto}>
        <div className="border-t border-slate-100 px-4 py-4 dark:border-slate-700">{children}</div>
      </Transicion>
    </section>
  );
}
