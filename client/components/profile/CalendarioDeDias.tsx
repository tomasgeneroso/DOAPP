import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";

export interface DiaDelCalendario {
  /** ISO del día (el servidor lo manda como inicio del día): la fecha es lo primero, AAAA-MM-DD. */
  start: string;
  ocupada: boolean;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const SEMANA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

const clave = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Calendario mensual para elegir días: se corre de mes en mes hacia adelante, hasta donde el servidor deja reservar. Un día se puede elegir si
 * el servidor lo ofrece y no está tomado; los demás (pasados, fuera del plazo, tomados) se ven apagados.
 */
export default function CalendarioDeDias({
  dias,
  elegidas,
  onToggle,
  onElegirVarios,
  deshabilitado,
}: {
  dias: DiaDelCalendario[];
  elegidas: string[];
  /** Recibe el `start` completo del día, tal como lo mandó el servidor. */
  onToggle: (start: string) => void;
  /** «Elegir todo el mes» / «Quitar el mes»: recibe los `start` de los días libres del mes que se ve. */
  onElegirVarios?: (starts: string[], elegir: boolean) => void;
  deshabilitado?: boolean;
}) {
  const porFecha = useMemo(() => new Map(dias.map((d) => [d.start.slice(0, 10), d])), [dias]);
  const primera = dias[0]?.start.slice(0, 10);
  const ultima = dias[dias.length - 1]?.start.slice(0, 10);
  const mesDe = (f: string) => ({ a: Number(f.slice(0, 4)), m: Number(f.slice(5, 7)) - 1 });
  const [vista, setVista] = useState(() => (primera ? mesDe(primera) : { a: new Date().getFullYear(), m: new Date().getMonth() }));
  if (!primera || !ultima) return null;

  const ini = mesDe(primera);
  const fin = mesDe(ultima);
  const indice = (v: { a: number; m: number }) => v.a * 12 + v.m;
  const puedeAtras = indice(vista) > indice(ini);
  const puedeAdelante = indice(vista) < indice(fin);
  const mover = (n: number) => {
    const i = indice(vista) + n;
    setVista({ a: Math.floor(i / 12), m: i % 12 });
  };

  // Celdas del mes: la semana empieza en lunes
  const primeroDelMes = new Date(Date.UTC(vista.a, vista.m, 1));
  const huecos = (primeroDelMes.getUTCDay() + 6) % 7;
  const diasDelMes = new Date(Date.UTC(vista.a, vista.m + 1, 0)).getUTCDate();
  const celdas: Array<DiaDelCalendario | null | { vacio: true; n: number }> = [];
  for (let i = 0; i < huecos; i++) celdas.push(null);
  for (let n = 1; n <= diasDelMes; n++) {
    const f = clave(new Date(Date.UTC(vista.a, vista.m, n)));
    celdas.push(porFecha.get(f) ?? { vacio: true, n });
  }

  const libresDelMes = celdas.filter((c): c is DiaDelCalendario => !!c && "start" in c && !c.ocupada);
  const todosElegidos = libresDelMes.length > 0 && libresDelMes.every((d) => elegidas.includes(d.start));

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => mover(-1)}
          disabled={!puedeAtras}
          aria-label="Mes anterior"
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <p className="text-sm font-semibold capitalize text-slate-900 dark:text-white" aria-live="polite">
          {MESES[vista.m]} {vista.a}
        </p>
        <button
          type="button"
          onClick={() => mover(1)}
          disabled={!puedeAdelante}
          aria-label="Mes siguiente"
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {SEMANA.map((s) => (
          <span key={s} className="py-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            {s}
          </span>
        ))}
        {celdas.map((c, i) => {
          if (!c) return <span key={`h${i}`} />;
          if ("vacio" in c) {
            return (
              <span key={`v${c.n}`} className="rounded-lg py-2 text-sm text-slate-300 dark:text-slate-600" aria-hidden>
                {c.n}
              </span>
            );
          }
          const n = Number(c.start.slice(8, 10));
          const sel = elegidas.includes(c.start);
          return (
            <button
              key={c.start}
              type="button"
              disabled={c.ocupada || deshabilitado}
              onClick={() => onToggle(c.start)}
              aria-pressed={sel}
              aria-label={`${n} de ${MESES[vista.m]}${c.ocupada ? ", tomado" : ""}`}
              className={`relative rounded-lg py-2 text-sm transition ${
                c.ocupada
                  ? "cursor-not-allowed bg-slate-50 text-slate-300 line-through dark:bg-slate-900 dark:text-slate-600"
                  : sel
                    ? "bg-amber-500 font-semibold text-white"
                    : "text-slate-700 hover:bg-amber-50 dark:text-slate-200 dark:hover:bg-amber-900/20"
              } disabled:opacity-70`}
            >
              {n}
              {sel && <Check className="absolute right-0.5 top-0.5 h-2.5 w-2.5" aria-hidden />}
            </button>
          );
        })}
      </div>

      {onElegirVarios && libresDelMes.length > 0 && !deshabilitado && (
        <button
          type="button"
          onClick={() => onElegirVarios(libresDelMes.map((d) => d.start), !todosElegidos)}
          className="mt-2 text-xs font-medium text-amber-700 underline dark:text-amber-300"
        >
          {todosElegidos ? "Quitar los días de este mes" : "Elegir todos los días libres de este mes"}
        </button>
      )}
    </div>
  );
}
