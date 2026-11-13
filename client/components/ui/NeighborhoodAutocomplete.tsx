import { useState, useRef, useEffect } from "react";
import { useTranslation } from 'react-i18next';
import { MapPin } from "lucide-react";
import { getNeighborhoodSuggestions, type NeighborhoodEntry } from "@/data/argNeighborhoods";
import type { AvisoDeDireccion } from "@/hooks/useCoherenciaDeDireccion";

interface Props {
  locationValue: string;
  neighborhood: string;
  postalCode: string;
  onNeighborhoodChange: (value: string) => void;
  onPostalCodeChange: (value: string) => void;
  /**
   * La persona terminó de elegir o escribir el barrio (eligió uno de la lista, o salió del campo con otro texto): hay que dejar la dirección congruente
   * (código postal, ciudad y mapa). Si lo eligió de la lista viene el código postal de esa lista.
   */
  onNeighborhoodCommit?: (barrio: string, codigoDeLaLista?: string) => void;
  /** La persona terminó de escribir un código postal distinto: hay que actualizar el barrio, la ciudad y el mapa. */
  onPostalCodeCommit?: (codigo: string) => void;
  /** Qué se hizo (o qué no se pudo) al dejar la dirección congruente. */
  aviso?: AvisoDeDireccion | null;
  ubicando?: boolean;
  disabled?: boolean;
  inputClassName?: string;
}

export default function NeighborhoodAutocomplete({
  locationValue,
  neighborhood,
  postalCode,
  onNeighborhoodChange,
  onPostalCodeChange,
  onNeighborhoodCommit,
  onPostalCodeCommit,
  aviso,
  ubicando,
  disabled,
  inputClassName,
}: Props) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<NeighborhoodEntry[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Lo que había en el campo al entrar: solo si al salir es otra cosa se vuelve a ubicar.
  const barrioAlEntrar = useRef("");
  const codigoAlEntrar = useRef("");
  // Elegir de la lista se hace con el botón del mouse apretado, y el campo pierde el foco después: ese blur no es un texto nuevo.
  const eligiendoDeLaLista = useRef(false);
  const baseInputClass =
    inputClassName ||
    "block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6 disabled:opacity-50 disabled:cursor-not-allowed";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNeighborhoodInput = (value: string) => {
    onNeighborhoodChange(value);
    const results = getNeighborhoodSuggestions(locationValue, value);
    setSuggestions(results);
    setShowSuggestions(results.length > 0);
  };

  const handleFocus = () => {
    barrioAlEntrar.current = neighborhood;
    const results = getNeighborhoodSuggestions(locationValue, neighborhood);
    if (results.length > 0) {
      setSuggestions(results);
      setShowSuggestions(true);
    }
  };

  const handleSelect = (entry: NeighborhoodEntry) => {
    eligiendoDeLaLista.current = true;
    onNeighborhoodChange(entry.neighborhood);
    onPostalCodeChange(entry.postalCode);
    setShowSuggestions(false);
    onNeighborhoodCommit?.(entry.neighborhood, entry.postalCode);
  };

  const handleBlur = () => {
    if (eligiendoDeLaLista.current) {
      eligiendoDeLaLista.current = false;
      return;
    }
    const escrito = neighborhood.trim();
    if (escrito.length >= 3 && escrito !== barrioAlEntrar.current.trim()) onNeighborhoodCommit?.(escrito);
  };

  const handlePostalBlur = () => {
    const cp = postalCode.trim();
    if (cp.length >= 4 && cp !== codigoAlEntrar.current.trim()) onPostalCodeCommit?.(cp);
  };

  const hasSuggestions = getNeighborhoodSuggestions(locationValue, "").length > 0;

  return (
    <div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Neighborhood field */}
      <div ref={wrapperRef} className="relative">
        <label className="block text-sm font-medium leading-6 text-gray-900 dark:text-slate-200 mb-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            {t("location.neighborhood", "Barrio")}
          </div>
        </label>
        <input
          type="text"
          value={neighborhood}
          onChange={(e) => handleNeighborhoodInput(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            // Enter confirma el barrio (sale del campo, que lo ubica) sin mandar el formulario.
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          placeholder={hasSuggestions ? t("location.neighborhoodSuggestPlaceholder", "Escribí para ver sugerencias…") : t("location.neighborhoodPlaceholder", "Ej: Palermo, Villa Crespo")}
          disabled={disabled}
          className={baseInputClass}
          autoComplete="off"
          data-testid="campo-barrio"
        />
        {showSuggestions && (
          <ul className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg max-h-52 overflow-y-auto">
            {suggestions.map((entry) => (
              <li
                key={`${entry.neighborhood}-${entry.postalCode}`}
                onMouseDown={() => handleSelect(entry)}
                className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-sky-50 dark:hover:bg-sky-900/30 text-sm text-slate-800 dark:text-slate-200"
              >
                <span>{entry.neighborhood}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">{entry.postalCode}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Postal code field */}
      <div>
        <label className="block text-sm font-medium leading-6 text-gray-900 dark:text-slate-200 mb-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            {t("location.postalCode", "Código Postal")}
          </div>
        </label>
        <input
          type="text"
          value={postalCode}
          onChange={(e) => onPostalCodeChange(e.target.value.replace(/[^0-9A-Za-z]/g, ""))}
          onFocus={() => { codigoAlEntrar.current = postalCode; }}
          onBlur={handlePostalBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          placeholder={t("location.postalCodePlaceholder", "Ej: C1425 o 1425")}
          maxLength={8}
          disabled={disabled}
          className={baseInputClass}
          data-testid="campo-codigo-postal"
        />
      </div>
    </div>
    {ubicando && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400" role="status">Ubicando la zona en el mapa…</p>}
    {!ubicando && aviso && (
      <p
        className={`mt-2 text-xs ${aviso.tipo === "problema" ? "text-amber-700 dark:text-amber-400" : "text-sky-700 dark:text-sky-300"}`}
        role="status"
        data-testid="aviso-de-direccion"
      >
        {aviso.texto}
      </p>
    )}
    </div>
  );
}
