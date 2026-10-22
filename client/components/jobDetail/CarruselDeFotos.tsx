import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { getImageUrl } from "../../utils/imageUrl";

/**
 * Las fotos de un trabajo en un carrusel: una foto grande, flechas, miniaturas y un contador. Se pasa de foto con las flechas, con
 * las teclas ← →, deslizando con el dedo o tocando una miniatura; tocar la foto grande la abre ampliada.
 *
 * Una foto que ya no está en el servidor se saca del carrusel (no queda un cuadro vacío). Con una sola foto no se dibujan flechas ni
 * miniaturas. Respeta «reducir movimiento»: pasa de una foto a otra sin deslizarse.
 */
export default function CarruselDeFotos({
  fotos,
  titulo,
  alAbrir,
  encabezado,
  avisarSiNoCargan = false,
  editarHref,
}: {
  fotos: string[];
  titulo: string;
  /** Se llama al tocar la foto grande, con su dirección y su texto alternativo (para abrirla ampliada). */
  alAbrir?: (url: string, alt: string) => void;
  /** Si se pasa, el carrusel se dibuja dentro de su propia tarjeta con este título, y la tarjeta entera desaparece si no hay fotos que mostrar. */
  encabezado?: string;
  /** Con `encabezado`: si NINGUNA foto carga, en vez de desaparecer avisa (para el dueño, que subió fotos y las tiene que ver). */
  avisarSiNoCargan?: boolean;
  /** Adónde lleva «Editar» en el aviso de fotos que ya no están (la pantalla de edición del trabajo). */
  editarHref?: string;
}) {
  const [rotas, setRotas] = useState<Set<string>>(new Set());
  const [actual, setActual] = useState(0);
  const inicioDelDedo = useRef<number | null>(null);
  const miniaturaActiva = useRef<HTMLButtonElement | null>(null);

  const visibles = fotos.filter((f) => !rotas.has(f));
  const total = visibles.length;
  const indice = Math.min(actual, Math.max(0, total - 1));

  const ir = useCallback(
    (destino: number) => {
      if (total === 0) return;
      setActual(((destino % total) + total) % total);
    },
    [total],
  );

  // La miniatura de la foto abierta se mantiene a la vista en la tira.
  useEffect(() => {
    miniaturaActiva.current?.scrollIntoView?.({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [indice]);

  if (total === 0) {
    if (!encabezado || !avisarSiNoCargan || fotos.length === 0) return null;
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">{encabezado}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Las fotos de este trabajo no se pueden mostrar porque los archivos ya no están en el servidor. Podés subirlas de nuevo desde{" "}
          {editarHref ? (
            <Link to={editarHref} className="font-semibold text-sky-600 underline hover:text-sky-700 dark:text-sky-400">
              «Editar»
            </Link>
          ) : (
            "«Editar»"
          )}
          .
        </p>
      </div>
    );
  }

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      ir(indice + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      ir(indice - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      ir(0);
    } else if (e.key === "End") {
      e.preventDefault();
      ir(total - 1);
    }
  };

  const alTerminarDeslizar = (x: number) => {
    if (inicioDelDedo.current === null) return;
    const dx = x - inicioDelDedo.current;
    inicioDelDedo.current = null;
    if (Math.abs(dx) > 40) ir(indice + (dx < 0 ? 1 : -1));
  };

  const marcarRota = (foto: string) => setRotas((prev) => new Set(prev).add(foto));
  const alt = (i: number) => `${titulo} — foto ${i + 1} de ${total}`;

  const carrusel = (
    <section aria-roledescription="carrusel" aria-label={`Fotos de ${titulo}`} onKeyDown={alTeclear}>
      <div
        className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-900"
        onTouchStart={(e) => (inicioDelDedo.current = e.touches[0].clientX)}
        onTouchEnd={(e) => alTerminarDeslizar(e.changedTouches[0].clientX)}
      >
        <div
          className="flex transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${indice * 100}%)` }}
        >
          {visibles.map((foto, i) => (
            <button
              key={foto}
              type="button"
              tabIndex={i === indice ? 0 : -1}
              aria-hidden={i === indice ? undefined : true}
              aria-label={`Ampliar ${alt(i)}`}
              onClick={() => alAbrir?.(getImageUrl(foto), alt(i))}
              className={`aspect-[4/3] w-full shrink-0 ${alAbrir ? "cursor-zoom-in" : "cursor-default"}`}
            >
              <img
                src={getImageUrl(foto)}
                alt={i === indice ? alt(i) : ""}
                loading={i === 0 ? "eager" : "lazy"}
                draggable={false}
                className="h-full w-full object-cover"
                onError={() => marcarRota(foto)}
              />
            </button>
          ))}
        </div>

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => ir(indice - 1)}
              aria-label="Foto anterior"
              className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:bg-slate-800/90 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => ir(indice + 1)}
              aria-label="Foto siguiente"
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:bg-slate-800/90 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium tabular-nums text-white" aria-hidden>
              {indice + 1} / {total}
            </span>
          </>
        )}
      </div>

      {/* Lo lee el lector de pantalla cada vez que cambia la foto */}
      <p className="sr-only" aria-live="polite">{`Foto ${indice + 1} de ${total}`}</p>

      {total > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Miniaturas">
          {visibles.map((foto, i) => (
            <button
              key={foto}
              ref={i === indice ? miniaturaActiva : undefined}
              type="button"
              role="tab"
              aria-selected={i === indice}
              aria-label={`Ver foto ${i + 1}`}
              onClick={() => ir(i)}
              className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                i === indice ? "border-sky-500 opacity-100" : "border-transparent opacity-60 hover:opacity-100"
              }`}
            >
              <img src={getImageUrl(foto)} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </section>
  );

  if (!encabezado) return carrusel;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-white">{encabezado}</h2>
      {carrusel}
    </div>
  );
}
