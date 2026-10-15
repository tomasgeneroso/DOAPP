import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Route } from "lucide-react";
import {
  buscarCodigoPostal,
  buscarSugerencias,
  MINIMO_PARA_BUSCAR,
  type CalleSugerida,
  type ResultadoDeBusqueda,
  type SugerenciaDeDireccion,
} from "../../../shared/geo/direcciones";

/**
 * Campo «Calle y número» con sugerencias de direcciones que EXISTEN (Georef, Argentina):
 *  - escribiendo la calle, ofrece las calles con el rango de números que tienen («Av Corrientes 1–6900»);
 *  - con el número, ofrece la dirección completa (y avisa si ese número no existe en la calle);
 *  - al elegir una dirección completa, pide el código postal de esa ubicación y lo entrega por `onCodigoPostal`.
 * Escribir a mano siempre funciona: si no hay sugerencias o la API no responde, no pasa nada.
 */
type Item = { tipo: "direccion"; s: SugerenciaDeDireccion } | { tipo: "calle"; c: CalleSugerida };

const clave = (i: Item) => (i.tipo === "direccion" ? `d:${i.s.etiqueta}` : `c:${i.c.etiqueta}`);

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  onCodigoPostal,
  placeholder,
  className,
  id,
}: {
  value: string;
  onChange: (texto: string) => void;
  onSelect: (s: SugerenciaDeDireccion) => void;
  onCodigoPostal?: (codigoPostal: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [abierta, setAbierta] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [sinResultados, setSinResultados] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pista, setPista] = useState<string | null>(null);
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
      setItems([]);
      setSinResultados(false);
      setAviso(null);
      setBuscando(false);
      return;
    }
    espera.current = setTimeout(async () => {
      const c = new AbortController();
      control.current = c;
      setBuscando(true);
      const r: ResultadoDeBusqueda = await buscarSugerencias(value, { signal: c.signal });
      if (c.signal.aborted) return;
      const lista: Item[] = [...r.direcciones.map((s) => ({ tipo: "direccion" as const, s })), ...r.calles.map((cc) => ({ tipo: "calle" as const, c: cc }))];
      setItems(lista);
      setSinResultados(lista.length === 0);
      setAviso(r.alturaInexistente ? `El número ${r.alturaInexistente.altura} no existe en esa calle: llega hasta el ${r.alturaInexistente.mayor}.` : null);
      setPista(null);
      setActiva(-1);
      setAbierta(true);
      setBuscando(false);
    }, 400);
    return () => {
      if (espera.current) clearTimeout(espera.current);
    };
  }, [value]);

  const elegir = async (i: Item) => {
    saltarBusqueda.current = true;
    setAbierta(false);
    setItems([]);
    setAviso(null);
    if (i.tipo === "calle") {
      // Falta el número: se completa la calle, la ciudad y la provincia, y se dice qué números existen.
      onSelect({ etiqueta: i.c.etiqueta, calle: i.c.calle, ciudad: i.c.ciudad, provincia: i.c.provincia });
      setPista(`Escribí el número de la casa: en esta calle existen del ${i.c.desde} al ${i.c.hasta}.`);
      return;
    }
    onSelect(i.s);
    setPista(null);
    // El código postal no lo da Georef: se pide por la ubicación de la dirección elegida (una consulta por elección, nunca al escribir).
    if (onCodigoPostal && i.s.lat !== undefined && i.s.lon !== undefined) {
      const cp = await buscarCodigoPostal(i.s.lat, i.s.lon);
      if (cp) onCodigoPostal(cp);
    }
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (!abierta || items.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiva((i) => (i + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiva((i) => (i <= 0 ? items.length - 1 : i - 1)); }
    else if (e.key === "Enter" && activa >= 0) { e.preventDefault(); void elegir(items[activa]); }
    else if (e.key === "Escape") setAbierta(false);
  };

  return (
    <div ref={envoltorio} className="relative">
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => items.length > 0 && setAbierta(true)}
        onKeyDown={teclas}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={abierta}
        aria-autocomplete="list"
        className={className}
      />
      {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />}
      {pista && !abierta && <p className="mt-1 text-xs text-sky-700 dark:text-sky-400">{pista}</p>}
      {abierta && (items.length > 0 || sinResultados || aviso) && (
        <ul role="listbox" className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
          {aviso && <li className="px-3 py-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20">{aviso}</li>}
          {items.map((i, n) => (
            <li
              key={clave(i)}
              role="option"
              aria-selected={n === activa}
              onMouseDown={(e) => { e.preventDefault(); void elegir(i); }}
              onMouseEnter={() => setActiva(n)}
              className={`flex items-start gap-2 px-3 py-2 text-sm cursor-pointer text-slate-900 dark:text-white ${n === activa ? "bg-sky-50 dark:bg-slate-700" : ""}`}
            >
              {i.tipo === "direccion" ? (
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-sky-600" aria-hidden="true" />
              ) : (
                <Route className="h-4 w-4 mt-0.5 flex-shrink-0 text-slate-500" aria-hidden="true" />
              )}
              <span>{i.tipo === "direccion" ? i.s.etiqueta : i.c.etiqueta}</span>
            </li>
          ))}
          {sinResultados && !aviso && <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Sin sugerencias: podés completar la dirección a mano.</li>}
        </ul>
      )}
    </div>
  );
}
