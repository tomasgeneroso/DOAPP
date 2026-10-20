import { useEffect, useRef, useState } from "react";
import { Hash, Home, Loader2, MapPin, Route } from "lucide-react";
import { buscarSugerencias, MINIMO_PARA_BUSCAR, type CalleSugerida, type SugerenciaDeDireccion } from "../../../shared/geo/direcciones";
import { sanearCalle, sanearNumeroDePuerta } from "../../../shared/geo/lugares";

/**
 * «Calle» y «Número de puerta» del formulario de un trabajo.
 *
 *  - Ofrece calles REALES (con el rango de números que tienen) acotadas a la provincia y la localidad elegidas en «Ubicación».
 *  - Con un número, ofrece la dirección completa; al elegirla completa calle y número (y avisa al formulario para que complete
 *    el barrio, el código postal y la ubicación en el mapa).
 *  - Lo que queda guardado está limpio: el número de puerta son solo dígitos y el número no queda escrito dentro de la calle
 *    («Av Corrientes 1234» → calle «Av Corrientes», número «1234»).
 */
const campo =
  "block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6";

type Item = { tipo: "direccion"; s: SugerenciaDeDireccion } | { tipo: "calle"; c: CalleSugerida };

export interface DireccionElegida {
  calle: string;
  numero: string;
  ciudad: string;
  provincia: string;
  lat?: number;
  lon?: number;
}

export default function CalleYNumero({
  street,
  number,
  onStreetChange,
  onNumberChange,
  provincia,
  ciudad,
  onAddressResolved,
  labels,
}: {
  street: string;
  number: string;
  onStreetChange: (v: string) => void;
  onNumberChange: (v: string) => void;
  provincia?: string;
  ciudad?: string;
  /** Se llama al elegir una dirección completa (para completar barrio, código postal y mapa). */
  onAddressResolved?: (d: DireccionElegida) => void;
  labels: { street: string; number: string; streetPlaceholder: string; numberPlaceholder: string };
}) {
  const [itemsGuardados, setItems] = useState<Item[]>([]);
  const [abierta, setAbierta] = useState(false);
  const [buscandoGuardado, setBuscando] = useState(false);
  const [avisoGuardado, setAviso] = useState<string | null>(null);
  const [rango, setRango] = useState<{ desde: number; hasta: number } | null>(null);
  const [activa, setActiva] = useState(-1);
  const envoltorio = useRef<HTMLDivElement>(null);
  const saltar = useRef(false);
  // La lista solo se abre si la persona está escribiendo en la calle o el número: al cargar una dirección ya guardada (editar un trabajo)
  // se consulta igual para el aviso del rango, pero no se despliega sola.
  const foco = useRef(false);
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const control = useRef<AbortController | null>(null);

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (envoltorio.current && !envoltorio.current.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  // Lo que se busca es la calle con el número que se va escribiendo en el otro campo.
  const consulta = [street, number].filter(Boolean).join(" ").trim();
  // Con una consulta corta no hay nada que mostrar: se deriva, en vez de vaciar el estado dentro del efecto.
  const corta = consulta.length < MINIMO_PARA_BUSCAR;
  const items = corta ? [] : itemsGuardados;
  const buscando = !corta && buscandoGuardado;
  const aviso = corta ? null : avisoGuardado;

  useEffect(() => {
    if (saltar.current) {
      saltar.current = false;
      return;
    }
    if (espera.current) clearTimeout(espera.current);
    control.current?.abort();
    if (corta) return;
    espera.current = setTimeout(async () => {
      const c = new AbortController();
      control.current = c;
      setBuscando(true);
      const r = await buscarSugerencias(consulta, { signal: c.signal, provincia, ciudad });
      if (c.signal.aborted) return;
      const lista: Item[] = [...r.direcciones.map((s) => ({ tipo: "direccion" as const, s })), ...r.calles.map((cc) => ({ tipo: "calle" as const, c: cc }))];
      setItems(lista);
      setAviso(r.alturaInexistente ? `El número ${r.alturaInexistente.altura} no existe en esa calle: llega hasta el ${r.alturaInexistente.mayor}.` : null);
      setActiva(-1);
      setAbierta(foco.current);
      setBuscando(false);
    }, 450);
    return () => {
      if (espera.current) clearTimeout(espera.current);
    };
  }, [consulta, provincia, ciudad]);

  const elegir = (i: Item) => {
    saltar.current = true;
    setAbierta(false);
    setItems([]);
    setAviso(null);
    if (i.tipo === "calle") {
      onStreetChange(i.c.calle);
      setRango({ desde: i.c.desde, hasta: i.c.hasta });
      onAddressResolved?.({ calle: i.c.calle, numero: "", ciudad: i.c.ciudad, provincia: i.c.provincia });
      return;
    }
    // Georef devuelve «Av Corrientes 1234» junto: se separa en sus dos campos.
    const { calle, numero } = sanearCalle(i.s.calle);
    onStreetChange(calle || i.s.calle);
    onNumberChange(numero);
    setRango(null);
    onAddressResolved?.({ calle: calle || i.s.calle, numero, ciudad: i.s.ciudad, provincia: i.s.provincia, lat: i.s.lat, lon: i.s.lon });
  };

  const alSalirDeLaCalle = () => {
    // Si quedó el número escrito en la calle («Av Corrientes 1234») y el campo del número está vacío, se pasa a su lugar.
    const { calle, numero } = sanearCalle(street);
    if (numero && !number) {
      onStreetChange(calle);
      onNumberChange(numero);
    }
  };

  const teclas = (e: React.KeyboardEvent) => {
    if (!abierta || items.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiva((n) => (n + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiva((n) => (n <= 0 ? items.length - 1 : n - 1)); }
    else if (e.key === "Enter" && activa >= 0) { e.preventDefault(); elegir(items[activa]); }
    else if (e.key === "Escape") setAbierta(false);
  };

  const numeroFueraDeRango = rango && number && (Number(number) < rango.desde || Number(number) > rango.hasta);

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
      <div className="sm:col-span-3" ref={envoltorio}>
        <label className="block text-sm font-medium leading-6 text-gray-900 dark:text-slate-200 mb-2">
          <div className="flex items-center gap-2">
            <Home className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            {labels.street}
          </div>
        </label>
        <div className="relative">
          <input
            type="text"
            value={street}
            onChange={(e) => { onStreetChange(e.target.value.replace(/[<>]/g, "")); setRango(null); }}
            onBlur={() => { foco.current = false; alSalirDeLaCalle(); }}
            onFocus={() => { foco.current = true; if (items.length > 0) setAbierta(true); }}
            onKeyDown={teclas}
            placeholder={labels.streetPlaceholder}
            autoComplete="off"
            maxLength={120}
            role="combobox"
            aria-expanded={abierta}
            className={campo}
          />
          {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />}
          {abierta && (items.length > 0 || aviso) && (
            <ul role="listbox" className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg animate-fadeIn">
              {aviso && <li className="px-3 py-2 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20">{aviso}</li>}
              {items.map((i, n) => (
                <li
                  key={i.tipo === "direccion" ? `d:${i.s.etiqueta}` : `c:${i.c.etiqueta}`}
                  role="option"
                  aria-selected={n === activa}
                  onMouseDown={(e) => { e.preventDefault(); elegir(i); }}
                  onMouseEnter={() => setActiva(n)}
                  className={`flex items-start gap-2 px-3 py-2 text-sm cursor-pointer text-slate-900 dark:text-white ${n === activa ? "bg-sky-50 dark:bg-slate-700" : ""}`}
                >
                  {i.tipo === "direccion" ? <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-sky-600" aria-hidden="true" /> : <Route className="h-4 w-4 mt-0.5 flex-shrink-0 text-slate-500" aria-hidden="true" />}
                  <span>{i.tipo === "direccion" ? i.s.etiqueta : i.c.etiqueta}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {rango && !abierta && (
          <p className="mt-1 text-xs text-sky-700 dark:text-sky-400">Escribí el número de la casa en el otro campo: en esta calle existen del {rango.desde} al {rango.hasta}.</p>
        )}
      </div>

      <div className="sm:col-span-3">
        <label className="block text-sm font-medium leading-6 text-gray-900 dark:text-slate-200 mb-2">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
            {labels.number}
          </div>
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={number}
          onChange={(e) => onNumberChange(sanearNumeroDePuerta(e.target.value))}
          onFocus={() => { foco.current = true; }}
          onBlur={() => { foco.current = false; }}
          placeholder={labels.numberPlaceholder}
          maxLength={6}
          autoComplete="off"
          className={`${campo} ${numeroFueraDeRango ? "ring-red-400 dark:ring-red-500" : ""}`}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Solo números.</p>
        {numeroFueraDeRango && rango && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">Ese número no existe en la calle elegida: va del {rango.desde} al {rango.hasta}.</p>
        )}
      </div>
    </div>
  );
}
