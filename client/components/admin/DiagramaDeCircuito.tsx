import { useMemo } from 'react';
import { columnasDelCircuito, renglones, type FlechaDeCircuito, type PasoDeCircuito, type Quien } from '../../utils/diagramaDeCircuito';

export type { FlechaDeCircuito, PasoDeCircuito, Quien, Forma } from '../../utils/diagramaDeCircuito';

/**
 * Dibuja un circuito (diagrama de flujo) a partir de sus pasos y flechas, sin que haya que poner coordenadas a mano: los pasos se ordenan en columnas según qué tan lejos
 * están del inicio (siguiendo las flechas que avanzan) y, dentro de cada columna, en el orden en que se escribieron. Las flechas que vuelven atrás (`atras: true`) se dibujan por
 * debajo. Es SVG (se ve igual en claro y en oscuro) y, si el circuito es ancho, se desplaza solo el dibujo, no la página.
 *
 * Los colores indican quién hace cada paso: la persona que contrata (cliente), quien trabaja, la plataforma, el equipo de DOAPP o un tercero (Mercado Pago, Didit, el banco).
 */
export const QUIEN: Record<Quien, { nombre: string; relleno: string; borde: string; texto: string }> = {
  cliente: { nombre: 'Cliente', relleno: 'fill-sky-100 dark:fill-sky-900/50', borde: 'stroke-sky-500', texto: 'fill-sky-950 dark:fill-sky-50' },
  trabajador: { nombre: 'Trabajador', relleno: 'fill-emerald-100 dark:fill-emerald-900/50', borde: 'stroke-emerald-500', texto: 'fill-emerald-950 dark:fill-emerald-50' },
  plataforma: { nombre: 'Plataforma (automático)', relleno: 'fill-slate-100 dark:fill-slate-700', borde: 'stroke-slate-500', texto: 'fill-slate-900 dark:fill-slate-50' },
  equipo: { nombre: 'Equipo de DOAPP', relleno: 'fill-amber-100 dark:fill-amber-900/50', borde: 'stroke-amber-500', texto: 'fill-amber-950 dark:fill-amber-50' },
  externo: { nombre: 'Tercero (Mercado Pago, Didit, banco)', relleno: 'fill-violet-100 dark:fill-violet-900/50', borde: 'stroke-violet-500', texto: 'fill-violet-950 dark:fill-violet-50' },
};

const ANCHO = 156;
const ALTO = 64;
const ALTO_DECISION = 84;
const PASO_X = 200;
const PASO_Y = 112;
const MARGEN = 24;

interface Colocado extends PasoDeCircuito {
  x: number;
  y: number;
  alto: number;
}

export default function DiagramaDeCircuito({ pasos, flechas, titulo }: { pasos: PasoDeCircuito[]; flechas: FlechaDeCircuito[]; titulo: string }) {
  const diseno = useMemo(() => {
    const columna = columnasDelCircuito(pasos, flechas);
    const columnas = Math.max(...Object.values(columna)) + 1;
    const porColumna: Record<number, PasoDeCircuito[]> = {};
    for (const p of pasos) (porColumna[columna[p.id]] ||= []).push(p);
    const filasMax = Math.max(...Object.values(porColumna).map((l) => l.length));
    const colocados: Record<string, Colocado> = {};
    for (const [c, lista] of Object.entries(porColumna)) {
      lista.forEach((p, i) => {
        const alto = p.forma === 'decision' ? ALTO_DECISION : ALTO;
        const fila = i + (filasMax - lista.length) / 2;
        colocados[p.id] = { ...p, x: MARGEN + Number(c) * PASO_X, y: MARGEN + fila * PASO_Y + (ALTO_DECISION - alto) / 2, alto };
      });
    }
    const hayAtras = flechas.some((f) => f.atras);
    const ancho = MARGEN * 2 + (columnas - 1) * PASO_X + ANCHO;
    const baseY = MARGEN * 2 + (filasMax - 1) * PASO_Y + ALTO_DECISION;
    const alto = baseY + (hayAtras ? 44 : 0);
    return { colocados, ancho, alto, baseY };
  }, [pasos, flechas]);

  const { colocados, ancho, alto, baseY } = diseno;
  const usados = Array.from(new Set(pasos.map((p) => p.quien).filter(Boolean))) as Quien[];

  return (
    <figure className="m-0">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <svg role="img" aria-label={titulo} width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} className="block min-w-full">
          <defs>
            <marker id="punta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className="fill-slate-500 dark:fill-slate-400" />
            </marker>
          </defs>

          {flechas.map((f, i) => {
            const a = colocados[f.de];
            const b = colocados[f.a];
            if (!a || !b) return null;
            let d: string;
            let lx: number;
            let ly: number;
            if (f.atras) {
              const x1 = a.x + ANCHO / 2;
              const y1 = a.y + a.alto;
              const x2 = b.x + ANCHO / 2;
              const y2 = b.y + b.alto;
              const fondo = baseY + 20;
              d = `M ${x1} ${y1} C ${x1} ${fondo}, ${x2} ${fondo}, ${x2} ${y2 + 2}`;
              lx = (x1 + x2) / 2;
              ly = fondo - 4;
            } else if (Math.abs(a.x - b.x) < 1) {
              // Dos pasos de la misma columna: la flecha va derecha, de uno al otro.
              const abajo = b.y > a.y;
              const x = a.x + ANCHO / 2;
              const y1 = abajo ? a.y + a.alto : a.y;
              const y2 = abajo ? b.y - 2 : b.y + b.alto + 2;
              d = `M ${x} ${y1} L ${x} ${y2}`;
              lx = x + 6;
              ly = (y1 + y2) / 2;
            } else {
              const x1 = a.x + ANCHO;
              const y1 = a.y + a.alto / 2;
              const x2 = b.x - 2;
              const y2 = b.y + b.alto / 2;
              const k = Math.max(40, (x2 - x1) / 2);
              d = `M ${x1} ${y1} C ${x1 + k} ${y1}, ${x2 - k} ${y2}, ${x2} ${y2}`;
              lx = (x1 + x2) / 2;
              ly = (y1 + y2) / 2 - 6;
            }
            return (
              <g key={`${f.de}-${f.a}-${i}`}>
                <path d={d} fill="none" className="stroke-slate-500 dark:stroke-slate-400" strokeWidth={1.6} markerEnd="url(#punta)" />
                {f.texto && (
                  <text x={lx} y={ly} textAnchor="middle" fontSize={11} className="fill-slate-700 dark:fill-slate-200" style={{ paintOrder: 'stroke' }} stroke="var(--fondo-del-circuito, transparent)" strokeWidth={0}>
                    {f.texto}
                  </text>
                )}
              </g>
            );
          })}

          {Object.values(colocados).map((p) => {
            const estilo = QUIEN[p.quien || 'plataforma'];
            const lineas = renglones(p.texto, p.forma === 'decision' ? 16 : 22);
            const cx = p.x + ANCHO / 2;
            const cy = p.y + p.alto / 2;
            const forma = p.forma || 'paso';
            const clases = `${estilo.relleno} ${estilo.borde}`;
            return (
              <g key={p.id}>
                {forma === 'decision' ? (
                  <polygon points={`${cx},${p.y} ${p.x + ANCHO},${cy} ${cx},${p.y + p.alto} ${p.x},${cy}`} className={clases} strokeWidth={1.8} />
                ) : forma === 'inicio' || forma === 'fin' ? (
                  <rect x={p.x} y={p.y} width={ANCHO} height={p.alto} rx={p.alto / 2} className={clases} strokeWidth={forma === 'fin' ? 3 : 1.8} />
                ) : forma === 'espera' ? (
                  <g>
                    <rect x={p.x} y={p.y} width={ANCHO} height={p.alto} rx={6} className={clases} strokeWidth={1.8} strokeDasharray="5 3" />
                  </g>
                ) : (
                  <rect x={p.x} y={p.y} width={ANCHO} height={p.alto} rx={8} className={clases} strokeWidth={1.8} />
                )}
                <text textAnchor="middle" fontSize={12} fontWeight={600} className={estilo.texto}>
                  {lineas.map((l, i) => (
                    <tspan key={i} x={cx} y={cy - ((lineas.length - 1) * 7) + i * 14 + 4}>
                      {l}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        {usados.map((q) => (
          <span key={q} className="inline-flex items-center gap-1.5">
            <svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" rx="3" className={`${QUIEN[q].relleno} ${QUIEN[q].borde}`} strokeWidth={1.5} /></svg>
            {QUIEN[q].nombre}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <svg width="16" height="14" aria-hidden="true"><polygon points="8,0 16,7 8,14 0,7" className="fill-white stroke-slate-500 dark:fill-slate-800" strokeWidth={1.5} /></svg>
          Decisión
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="14" aria-hidden="true"><rect width="18" height="14" rx="3" className="fill-white stroke-slate-500 dark:fill-slate-800" strokeWidth={1.5} strokeDasharray="4 2" /></svg>
          Espera
        </span>
      </figcaption>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Si el dibujo es más ancho que la pantalla, deslizalo hacia los costados.</p>
    </figure>
  );
}
