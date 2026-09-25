import { useTranslation } from "react-i18next";

/**
 * Tres trabajos de ejemplo en la portada: así se ve una publicación en DoApp.
 *
 * Antes había uno solo, de plomería, y dejaba la impresión de que la app es
 * para arreglos de casa. Son tres —un oficio presencial, un servicio por hora
 * y uno remoto— porque el rubro es lo primero que alguien busca para decidir
 * si esto es para él, y con un único ejemplo la mitad de los visitantes
 * concluye que no.
 *
 * Las ilustraciones son SVG dentro del bundle, no fotos.
 *
 *   - No agregan pedidos de red ni dependen de un CDN ajeno que puede caerse o
 *     cambiar una licencia.
 *   - No hay salto de layout: el alto está fijo desde el primer pintado. La
 *     portada ya tuvo un problema de CLS y no conviene volver a abrirlo.
 *   - Una foto de banco genérica dice "plantilla"; un dibujo propio, aunque
 *     simple, dice que alguien lo hizo a propósito.
 *
 * Los datos son fijos y no salen de la base a propósito: es una muestra de
 * cómo se ve la información, no un trabajo real. Si saliera de la base, la
 * portada mostraría el trabajo de alguien —con su barrio y su precio— a
 * cualquiera que entre sin cuenta.
 */

type Acento = "sky" | "emerald" | "violet";

const ACENTOS: Record<Acento, { chip: string; precio: string; barra: string; halo: string; borde: string }> = {
  sky: {
    chip: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    precio: "bg-sky-500 shadow-sky-500/20 group-hover/card:shadow-sky-500/50",
    barra: "bg-sky-500",
    halo: "hover:border-sky-500/40 hover:shadow-sky-500/10",
    borde: "group-hover/card:ring-sky-400/50",
  },
  emerald: {
    chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    precio: "bg-emerald-500 shadow-emerald-500/20 group-hover/card:shadow-emerald-500/50",
    barra: "bg-emerald-500",
    halo: "hover:border-emerald-500/40 hover:shadow-emerald-500/10",
    borde: "group-hover/card:ring-emerald-400/50",
  },
  violet: {
    chip: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    precio: "bg-violet-500 shadow-violet-500/20 group-hover/card:shadow-violet-500/50",
    barra: "bg-violet-500",
    halo: "hover:border-violet-500/40 hover:shadow-violet-500/10",
    borde: "group-hover/card:ring-violet-400/50",
  },
};

/** Llave inglesa y caño: reparaciones. */
function IlustracionReparaciones() {
  return (
    <svg viewBox="0 0 320 120" className="w-full h-full" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="repFondo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0c4a6e" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
      </defs>
      <rect width="320" height="120" fill="url(#repFondo)" />
      <circle cx="268" cy="28" r="52" fill="#0ea5e9" opacity="0.12" />
      {/* Caño con codo */}
      <path d="M40 86 H150 a14 14 0 0 0 14-14 V40" stroke="#38bdf8" strokeWidth="11" fill="none" strokeLinecap="round" opacity="0.85" />
      <rect x="150" y="60" width="16" height="26" rx="3" fill="#7dd3fc" opacity="0.9" />
      <rect x="36" y="76" width="14" height="20" rx="3" fill="#7dd3fc" opacity="0.9" />
      {/* Gota */}
      <path d="M158 96 c0 6 -4 9 -8 9 s-8 -3 -8 -9 c0 -5 8 -13 8 -13 s8 8 8 13 z" fill="#bae6fd" opacity="0.95" />
      {/* Llave inglesa */}
      <g transform="rotate(-32 232 62)">
        <rect x="200" y="54" width="86" height="15" rx="7" fill="#cbd5e1" />
        <path d="M196 47 h20 v29 h-20 a15 15 0 0 1 0 -29 z" fill="#e2e8f0" />
        <rect x="204" y="55" width="9" height="13" rx="2" fill="#0f172a" opacity="0.55" />
      </g>
    </svg>
  );
}

/** Balde, burbujas y paño: limpieza. */
function IlustracionLimpieza() {
  return (
    <svg viewBox="0 0 320 120" className="w-full h-full" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="limFondo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#064e3b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
      </defs>
      <rect width="320" height="120" fill="url(#limFondo)" />
      <circle cx="54" cy="26" r="48" fill="#10b981" opacity="0.12" />
      {/* Balde */}
      <path d="M96 56 h68 l-9 50 h-50 z" fill="#34d399" opacity="0.9" />
      <rect x="92" y="48" width="76" height="12" rx="6" fill="#6ee7b7" />
      <path d="M100 48 a30 22 0 0 1 60 0" stroke="#a7f3d0" strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* Espuma */}
      <circle cx="118" cy="44" r="9" fill="#d1fae5" opacity="0.9" />
      <circle cx="136" cy="40" r="6" fill="#d1fae5" opacity="0.75" />
      <circle cx="150" cy="46" r="4" fill="#d1fae5" opacity="0.6" />
      {/* Botella de spray */}
      <g transform="translate(206 34)">
        <rect x="14" y="26" width="34" height="52" rx="7" fill="#6ee7b7" opacity="0.92" />
        <rect x="20" y="12" width="16" height="16" rx="3" fill="#a7f3d0" />
        <path d="M20 16 h-14 l-6 -7" stroke="#a7f3d0" strokeWidth="5" fill="none" strokeLinecap="round" />
        <rect x="20" y="40" width="22" height="14" rx="3" fill="#ecfdf5" opacity="0.75" />
      </g>
      {/* Brillos */}
      <path d="M262 22 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" fill="#d1fae5" opacity="0.85" />
      <path d="M186 90 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2 z" fill="#d1fae5" opacity="0.6" />
    </svg>
  );
}

/** Lienzo, paleta y cursor: diseño. */
function IlustracionDiseno() {
  return (
    <svg viewBox="0 0 320 120" className="w-full h-full" role="img" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="disFondo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4c1d95" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
      </defs>
      <rect width="320" height="120" fill="url(#disFondo)" />
      <circle cx="270" cy="92" r="50" fill="#8b5cf6" opacity="0.14" />
      {/* Lienzo con bloques de maqueta */}
      <rect x="44" y="24" width="112" height="76" rx="8" fill="#1e1b4b" stroke="#a78bfa" strokeWidth="2" />
      <rect x="56" y="36" width="56" height="9" rx="4" fill="#c4b5fd" />
      <rect x="56" y="52" width="88" height="6" rx="3" fill="#a78bfa" opacity="0.6" />
      <rect x="56" y="64" width="70" height="6" rx="3" fill="#a78bfa" opacity="0.45" />
      <rect x="56" y="78" width="34" height="12" rx="6" fill="#8b5cf6" />
      {/* Paleta */}
      <g transform="translate(188 30)">
        <path d="M40 0 a40 34 0 1 0 0 68 c8 0 6 -8 10 -12 c4 -5 14 -2 18 -8 a38 34 0 0 0 -28 -48 z" fill="#ddd6fe" opacity="0.92" />
        <circle cx="26" cy="20" r="6" fill="#f472b6" />
        <circle cx="46" cy="14" r="6" fill="#38bdf8" />
        <circle cx="58" cy="32" r="6" fill="#fbbf24" />
        <circle cx="28" cy="44" r="6" fill="#34d399" />
      </g>
      {/* Cursor */}
      <path d="M152 78 l30 12 -12 4 -4 12 z" fill="#f8fafc" />
    </svg>
  );
}

interface TrabajoDeEjemplo {
  id: string;
  acento: Acento;
  ilustracion: () => JSX.Element;
  rubro: string;
  titulo: string;
  descripcion: string;
  precio: string;
  fechaInicio: string;
  horaInicio: string;
  fechaFin: string;
  horaFin: string;
  partes: string;
  pago: string;
  ubicacion: string;
  iniciales: string;
  publicadoPor: string;
  puntajes: [number, number, number];
}

export default function TrabajosDeEjemplo() {
  const { t } = useTranslation();

  const trabajos: TrabajoDeEjemplo[] = [
    {
      id: "reparaciones",
      acento: "sky",
      ilustracion: IlustracionReparaciones,
      rubro: t("home.demoCat1", "Reparaciones"),
      titulo: t("home.demoJobTitle", "Reparación de plomería urgente"),
      descripcion: t(
        "home.demoJobDesc",
        "Necesito un plomero para arreglar una pérdida de agua en la cocina. Trabajo de media jornada.",
      ),
      precio: "$18.000",
      fechaInicio: t("home.demoDate1", "15 Feb 2025"),
      horaInicio: "09:00 hs",
      fechaFin: t("home.demoDate1", "15 Feb 2025"),
      horaFin: "14:00 hs",
      partes: t("home.demoPartiesValue", "1 cliente · 1 profesional"),
      pago: t("home.demoPaymentValue", "Garantizado en escrow"),
      ubicacion: "Palermo, CABA",
      iniciales: "MC",
      publicadoPor: "María C.",
      puntajes: [92, 88, 95],
    },
    {
      id: "limpieza",
      acento: "emerald",
      ilustracion: IlustracionLimpieza,
      rubro: t("home.demoCat2", "Limpieza"),
      titulo: t("home.demoJobTitle2", "Limpieza profunda de oficina"),
      descripcion: t(
        "home.demoJobDesc2",
        "Oficina de 80 m² con cocina y dos baños. Se necesitan productos propios. Ideal fin de semana.",
      ),
      precio: "$34.500",
      fechaInicio: t("home.demoDate2", "22 Feb 2025"),
      horaInicio: "08:00 hs",
      fechaFin: t("home.demoDate2", "22 Feb 2025"),
      horaFin: "13:00 hs",
      partes: t("home.demoPartiesValue2", "1 cliente · 2 profesionales"),
      pago: t("home.demoPaymentValue", "Garantizado en escrow"),
      ubicacion: "Villa Crespo, CABA",
      iniciales: "JR",
      publicadoPor: "Javier R.",
      puntajes: [96, 91, 89],
    },
    {
      id: "diseno",
      acento: "violet",
      ilustracion: IlustracionDiseno,
      rubro: t("home.demoCat3", "Diseño"),
      titulo: t("home.demoJobTitle3", "Identidad visual para panadería"),
      descripcion: t(
        "home.demoJobDesc3",
        "Logo, paleta y cartelería para un local nuevo. Entrega de archivos editables. Trabajo remoto.",
      ),
      precio: "$96.000",
      fechaInicio: t("home.demoDate3", "3 Mar 2025"),
      horaInicio: t("home.demoRemote", "A convenir"),
      fechaFin: t("home.demoDate4", "17 Mar 2025"),
      horaFin: t("home.demoRemote", "A convenir"),
      partes: t("home.demoPartiesValue", "1 cliente · 1 profesional"),
      pago: t("home.demoPaymentValue", "Garantizado en escrow"),
      ubicacion: t("home.demoRemoteLocation", "Remoto · toda Argentina"),
      iniciales: "LF",
      publicadoPor: "Lucía F.",
      puntajes: [99, 94, 97],
    },
  ];

  const etiquetas = {
    abierto: t("home.demoStatusOpen", "Abierto"),
    fechaInicio: t("home.demoStartDate", "Fecha inicio"),
    horaInicio: t("home.demoStartTime", "Hora inicio"),
    fechaFin: t("home.demoEndDate", "Fecha fin"),
    horaFin: t("home.demoEndTime", "Hora fin"),
    partes: t("home.demoParties", "Partes"),
    pago: t("home.demoPayment", "Pago"),
    ubicacion: t("home.demoLocation", "Ubicación"),
    publicadoPor: t("home.demoPostedBy", "Publicado por"),
    calidad: t("home.demoRatingQuality", "Calidad"),
    trato: t("home.demoRatingTreatment", "Trato"),
    puntualidad: t("home.demoRatingPunctuality", "Puntualidad"),
  };

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {trabajos.map((j) => {
        const a = ACENTOS[j.acento];
        const Ilustracion = j.ilustracion;
        return (
          <article
            key={j.id}
            className={`bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl shadow-black/40 hover:-translate-y-2 ${a.halo} transition-all duration-500 cursor-default group/card flex flex-col`}
          >
            {/* Alto fijo: la ilustración no puede mover el contenido al aparecer. */}
            <div className="relative h-28 shrink-0">
              <Ilustracion />
              <span
                className={`absolute top-3 left-3 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border backdrop-blur-sm ${a.chip}`}
              >
                {j.rubro}
              </span>
            </div>

            <div className="p-5 flex flex-col flex-1">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-green-400 inline-block animate-pulse" />
                    <span className="text-xs font-semibold text-green-400 uppercase tracking-wide">
                      {etiquetas.abierto}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white leading-tight">{j.titulo}</h3>
                </div>
                <span
                  className={`flex-shrink-0 text-white text-sm font-bold px-3 py-1.5 rounded-full shadow-lg group-hover/card:scale-105 transition-all duration-300 ${a.precio}`}
                >
                  {j.precio}
                </span>
              </div>

              <p className="text-slate-400 text-sm mb-4 line-clamp-2">{j.descripcion}</p>

              <div className="grid grid-cols-2 gap-2 mb-4">
                {[
                  { label: etiquetas.fechaInicio, value: j.fechaInicio },
                  { label: etiquetas.horaInicio, value: j.horaInicio },
                  { label: etiquetas.fechaFin, value: j.fechaFin },
                  { label: etiquetas.horaFin, value: j.horaFin },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 hover:border-slate-600 hover:bg-slate-800/80 transition-colors duration-200"
                  >
                    <p className="text-[11px] text-slate-500 mb-0.5">{label}</p>
                    <p className="text-[13px] font-semibold text-white truncate">{value}</p>
                  </div>
                ))}
              </div>

              {/*
                Estos tres van apilados y no en columnas como en la card
                original: a un tercio del ancho, "1 cliente · 1 profesional"
                entraba cortado o en tres renglones.
              */}
              <dl className="bg-slate-900 border border-slate-700 rounded-xl divide-y divide-slate-800 mb-4">
                {[
                  { label: etiquetas.partes, value: j.partes },
                  { label: etiquetas.pago, value: j.pago },
                  { label: etiquetas.ubicacion, value: j.ubicacion },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-baseline justify-between gap-3 px-3 py-2">
                    <dt className="text-[11px] text-slate-500 shrink-0">{label}</dt>
                    <dd className="text-[12px] font-medium text-slate-300 text-right leading-tight">{value}</dd>
                  </div>
                ))}
              </dl>

              <div className="flex items-center gap-3 pt-4 mt-auto border-t border-slate-700">
                <div
                  className={`w-10 h-10 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 group-hover/card:ring-2 transition-all duration-300 ${a.borde}`}
                >
                  {j.iniciales}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-500">{etiquetas.publicadoPor}</p>
                  <p className="text-sm font-semibold text-white truncate">{j.publicadoPor}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {[
                      { label: etiquetas.calidad, width: j.puntajes[0] },
                      { label: etiquetas.trato, width: j.puntajes[1] },
                      { label: etiquetas.puntualidad, width: j.puntajes[2] },
                    ].map(({ label, width }) => (
                      <div key={label} className="flex-1 min-w-0">
                        <span className="text-[10px] text-slate-500 block truncate">{label}</span>
                        <div className="h-1 bg-[#1e2d42] rounded-full overflow-hidden mt-0.5">
                          <div className={`h-full rounded-full ${a.barra}`} style={{ width: `${width}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
