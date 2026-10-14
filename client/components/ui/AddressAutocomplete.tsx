import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { buscarDirecciones, MINIMO_PARA_BUSCAR, type SugerenciaDeDireccion } from "../../../shared/geo/direcciones";

/**
 * Campo «Calle y número» con sugerencias (Georef, Argentina). Elegir una sugerencia completa la calle, la ciudad y la provincia;
 * escribir a mano siempre funciona (si no hay sugerencias o la API no responde, no pasa nada).
 */
export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  className,
  id,
}: {
  value: string;
  onChange: (texto: string) => void;
  onSelect: (s: SugerenciaDeDireccion) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const [sugerencias, setSugerencias] = useState<SugerenciaDeDireccion[]>([]);
  const [abierta, setAbierta] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [sinResultados, setSinResultados] = useState(false);
  const envoltorio = useRef<HTMLDivElement>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const control = useRef<AbortController | null>(null);
  // Elegir una sugerencia cambia el texto: no hay que volver a buscar por eso
  const saltarBusqueda = useRef(false);

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (envoltorio.current && !envoltorio.current.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  useEffect(() => {
    if (saltarBusqueda.current) {
      saltarBusqueda.current = false;
      return;
    }
    if (espera.current) clearTimeout(espera.current);
    control.current?.abort();
    if (value.trim().length < MINIMO_PARA_BUSCAR) {
      setSugerencias([]);
      setSinResultados(false);
      setBuscando(false);
      return;
    }
    espera.current = setTimeout(async () => {
      const c = new AbortController();
      control.current = c;
      setBuscando(true);
      const r = await buscarDirecciones(value, { signal: c.signal });
      if (c.signal.aborted) return;
      setSugerencias(r);
      setSinResultados(r.length === 0);
      setActiva(-1);
      setAbierta(true);
      setBuscando(false);
    }, 400);
    return () => {
      if (espera.current) clearTimeout(espera.current);
    };
  }, [value]);

  const elegir = (s: SugerenciaDeDireccion) => {
    saltarBusqueda.current = true;
    onSelect(s);
    setAbierta(false);
    setSugerencias([]);
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (!abierta || sugerencias.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiva((i) => (i + 1) % sugerencias.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiva((i) => (i <= 0 ? sugerencias.length - 1 : i - 1)); }
    else if (e.key === "Enter" && activa >= 0) { e.preventDefault(); elegir(sugerencias[activa]); }
    else if (e.key === "Escape") setAbierta(false);
  };

  return (
    <div ref={envoltorio} className="relative">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => sugerencias.length > 0 && setAbierta(true)}
        onKeyDown={teclas}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={abierta}
        aria-autocomplete="list"
        className={className}
      />
      {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />}
      {abierta && (sugerencias.length > 0 || sinResultados) && (
        <ul role="listbox" className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
          {sugerencias.map((s, i) => (
            <li
              key={s.etiqueta}
              role="option"
              aria-selected={i === activa}
              onMouseDown={(e) => { e.preventDefault(); elegir(s); }}
              onMouseEnter={() => setActiva(i)}
              className={`flex items-start gap-2 px-3 py-2 text-sm cursor-pointer text-slate-900 dark:text-white ${i === activa ? "bg-sky-50 dark:bg-slate-700" : ""}`}
            >
              <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-sky-600" aria-hidden="true" />
              <span>{s.etiqueta}</span>
            </li>
          ))}
          {sinResultados && <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Sin sugerencias: podés completar la dirección a mano.</li>}
        </ul>
      )}
    </div>
  );
}
