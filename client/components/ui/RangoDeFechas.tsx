import { useEffect, useMemo, useRef, useState } from "react";
import ReactDatePicker, { registerLocale } from "react-datepicker";
import { es } from "date-fns/locale/es";
import "react-datepicker/dist/react-datepicker.css";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

registerLocale("es", es);

/**
 * Inicio y fin sobre UN solo calendario (como al elegir un vuelo): se toca el primer día y después el último, y las horas
 * se eligen debajo. Con el fin «todavía no lo sé» (`finOpcional`) solo se elige el inicio.
 *
 * Lleva dos campos ocultos (`nameInicio` y `nameFin`) con la fecha y hora en ISO para los formularios que leen con FormData.
 */
const HORAS = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

const aMinutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const deMinutos = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const hhmmDe = (d: Date | null, porDefecto: string) => (d ? `${String(d.getHours()).padStart(2, "0")}:${String(Math.floor(d.getMinutes() / 15) * 15).padStart(2, "0")}` : porDefecto);
const conHora = (dia: Date, hhmm: string) => {
  const d = new Date(dia);
  d.setHours(Number(hhmm.slice(0, 2)), Number(hhmm.slice(3, 5)), 0, 0);
  return d;
};
const mismoDia = (a: Date | null, b: Date | null) => !!a && !!b && a.toDateString() === b.toDateString();

const formato = (d: Date | null) =>
  d ? d.toLocaleString("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", "") : "";

export default function RangoDeFechas({
  inicio,
  fin,
  onChange,
  nameInicio,
  nameFin,
  finOpcional = false,
  required = false,
  minDate,
  placeholder = "Elegí cuándo empieza y cuándo termina",
}: {
  inicio: Date | null;
  fin: Date | null;
  onChange: (inicio: Date | null, fin: Date | null) => void;
  nameInicio: string;
  nameFin: string;
  finOpcional?: boolean;
  required?: boolean;
  minDate?: Date;
  placeholder?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [horaInicio, setHoraInicio] = useState(hhmmDe(inicio, "09:00"));
  const [horaFin, setHoraFin] = useState(hhmmDe(fin, "18:00"));
  const envoltorio = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (envoltorio.current && !envoltorio.current.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  /** Arma inicio y fin con sus horas; si el mismo día el fin no es posterior al inicio, el fin pasa a una hora después. */
  const emitir = (diaInicio: Date | null, diaFin: Date | null, hi: string, hf: string) => {
    const i = diaInicio ? conHora(diaInicio, hi) : null;
    let f: Date | null = null;
    if (!finOpcional && diaFin) {
      let hfFinal = hf;
      if (mismoDia(diaInicio, diaFin) && aMinutos(hf) <= aMinutos(hi)) {
        hfFinal = deMinutos(Math.min(aMinutos(hi) + 60, 23 * 60 + 45));
        setHoraFin(hfFinal);
      }
      f = conHora(diaFin, hfFinal);
    }
    onChange(i, f);
  };

  const alElegirDias = (rango: Date | [Date | null, Date | null] | null) => {
    if (finOpcional) {
      const d = Array.isArray(rango) ? rango[0] : rango;
      emitir(d ?? null, null, horaInicio, horaFin);
      return;
    }
    const [a, b] = Array.isArray(rango) ? rango : [rango, null];
    // Con el inicio ya elegido, el segundo toque fija el fin; sin fin todavía, el fin queda vacío.
    emitir(a ?? null, b ?? null, horaInicio, horaFin);
  };

  const cambiarHoraInicio = (hhmm: string) => {
    setHoraInicio(hhmm);
    if (inicio) emitir(inicio, fin, hhmm, horaFin);
  };
  const cambiarHoraFin = (hhmm: string) => {
    setHoraFin(hhmm);
    if (inicio && fin) emitir(inicio, fin, horaInicio, hhmm);
  };

  const limpiar = () => onChange(null, null);

  const texto = useMemo(() => {
    if (!inicio) return "";
    if (finOpcional || !fin) return finOpcional ? `Desde ${formato(inicio)}` : `${formato(inicio)} → elegí el último día`;
    return `${formato(inicio)}  →  ${formato(fin)}`;
  }, [inicio, fin, finOpcional]);

  const dias = Math.max(1, Math.round(((fin ? new Date(fin).setHours(0, 0, 0, 0) : 0) - (inicio ? new Date(inicio).setHours(0, 0, 0, 0) : 0)) / 86_400_000) + 1);

  return (
    <div ref={envoltorio} className="relative">
      <div
        onClick={() => setAbierto(true)}
        className={`relative flex items-center w-full min-h-12 px-4 py-2 bg-white dark:bg-gray-800 border-2 rounded-xl transition-all duration-200 cursor-pointer ${
          abierto ? "border-sky-500 ring-4 ring-sky-500/10 dark:ring-sky-400/20" : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
        }`}
      >
        <Calendar className="h-5 w-5 mr-3 text-gray-400 dark:text-gray-500 flex-shrink-0" aria-hidden="true" />
        <input
          readOnly
          required={required}
          value={inicio && (finOpcional || fin) ? texto : ""}
          placeholder={inicio && !finOpcional && !fin ? texto : placeholder}
          onFocus={() => setAbierto(true)}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          className="flex-1 bg-transparent border-0 outline-none text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 cursor-pointer text-sm"
        />
        {inicio && (
          <button type="button" onClick={(e) => { e.stopPropagation(); limpiar(); }} className="ml-2 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors" aria-label="Borrar las fechas">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        )}
      </div>

      <input type="hidden" name={nameInicio} value={inicio ? inicio.toISOString() : ""} />
      <input type="hidden" name={nameFin} value={fin && !finOpcional ? fin.toISOString() : ""} />

      {abierto && (
        <div role="dialog" aria-label="Elegir fechas" className="absolute z-40 mt-2 max-w-[calc(100vw-2rem)] overflow-x-auto rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl animate-fadeIn">
          <ReactDatePicker
            inline
            locale="es"
            {...(finOpcional
              ? { selected: inicio, onChange: (d: Date | null) => alElegirDias(d) }
              : { selectsRange: true as const, startDate: inicio, endDate: fin, onChange: (r: [Date | null, Date | null]) => alElegirDias(r) })}
            minDate={minDate}
            monthsShown={2}
            calendarClassName="custom-datepicker-calendar rango-calendario"
            renderCustomHeader={({ monthDate, customHeaderCount, decreaseMonth, increaseMonth }) => (
              <div className="flex items-center justify-between px-3 py-2">
                <button type="button" onClick={decreaseMonth} className={`p-1.5 rounded-lg bg-white/20 hover:bg-white/35 transition-colors ${customHeaderCount === 0 ? "" : "invisible"}`} aria-label="Mes anterior">
                  <ChevronLeft className="h-4 w-4 text-white" />
                </button>
                <span className="text-white font-semibold text-base capitalize">{monthDate.toLocaleString("es", { month: "long", year: "numeric" })}</span>
                <button type="button" onClick={increaseMonth} className={`p-1.5 rounded-lg bg-white/20 hover:bg-white/35 transition-colors ${customHeaderCount === 1 ? "" : "invisible"}`} aria-label="Mes siguiente">
                  <ChevronRight className="h-4 w-4 text-white" />
                </button>
              </div>
            )}
          />

          <div className="flex flex-wrap items-end gap-4 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
              Hora de inicio
              <select value={horaInicio} onChange={(e) => cambiarHoraInicio(e.target.value)} disabled={!inicio} className="mt-1 block rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm text-gray-900 dark:text-white disabled:opacity-50">
                {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
            {!finOpcional && (
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Hora de fin
                <select value={horaFin} onChange={(e) => cambiarHoraFin(e.target.value)} disabled={!fin} className="mt-1 block rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm text-gray-900 dark:text-white disabled:opacity-50">
                  {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            )}
            <p className="flex-1 min-w-[10rem] text-xs text-gray-500 dark:text-gray-400">
              {!inicio ? "Tocá el primer día." : finOpcional ? "Elegí la hora de inicio." : !fin ? "Ahora tocá el último día (o el mismo día si dura un día)." : `${dias} ${dias === 1 ? "día" : "días"}`}
            </p>
            <button type="button" onClick={() => setAbierto(false)} disabled={!inicio || (!finOpcional && !fin)} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 transition-colors">
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
