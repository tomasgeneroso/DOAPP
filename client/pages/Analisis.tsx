import { Suspense, lazy } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, Calculator, TrendingUp, LogOut, ShieldCheck, BookOpen } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { decidirAccesoAnalisis } from "../../shared/auth/accesoAnalisis";

/**
 * Los números del negocio, en una sola pantalla y sin el panel de admin.
 *
 * Para quién: gente que colabora proyectando el presupuesto unitario y
 * analizando el negocio. Entran con Google como cualquier usuario, y lo único
 * que ven es esto. No usuarios, no pagos, no disputas, no documentación de
 * identidad.
 *
 * Por qué una ruta aparte y no una sección más del panel: porque el panel es
 * la puerta a treinta pantallas y el rol que la abre abre todas. Darle `admin`
 * a un contador para que mire dos tableros es la forma más común de que una
 * base de datos con DNI y CBU termine accesible para alguien que nunca lo
 * pidió. Acá el acceso se concede por lo que la persona necesita hacer.
 *
 * El owner también entra —es su negocio— y además lo tiene adentro del panel,
 * en /admin/unit-economics y /admin/business-plan. Son las mismas pantallas:
 * se reusan los componentes en vez de copiarlos, para que no puedan divergir.
 */

const UnitEconomics = lazy(() => import("./admin/UnitEconomics"));
const BusinessPlan = lazy(() => import("./admin/BusinessPlan"));
const GuiaDelAnalisis = lazy(() => import("../components/admin/GuiaDelAnalisis"));

type Pestana = "unidad" | "proyeccion" | "guia";

const PESTANAS: Array<{ id: Pestana; icono: typeof Calculator; texto: string; ayuda: string }> = [
  {
    id: "unidad",
    icono: Calculator,
    texto: "Economía unitaria",
    ayuda: "Si conseguir un cliente cuesta menos de lo que deja",
  },
  {
    id: "proyeccion",
    icono: TrendingUp,
    texto: "Proyección",
    ayuda: "Costos, runway y punto de equilibrio",
  },
  {
    id: "guia",
    icono: BookOpen,
    texto: "Guía",
    ayuda: "Qué es este análisis y cómo se lee",
  },
];

/** La pestaña vive en la URL (?tab=guia): se puede enlazar y sobrevive a recargar. */
const pestanaDe = (valor: string | null): Pestana =>
  PESTANAS.some((p) => p.id === valor) ? (valor as Pestana) : "unidad";

export default function Analisis() {
  const { user, isLoading, logout } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const pestana = pestanaDe(params.get("tab"));

  const acceso = decidirAccesoAnalisis({ isLoading, user });

  // Esperar mientras se resuelve la sesión: mandar al login a alguien que sí
  // tiene permiso es peor que esperar un cuadro más.
  if (acceso === "cargando") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" aria-hidden="true" />
      </div>
    );
  }

  // Sin sesión: al login. Antes esto caía en el spinner y no salía nunca.
  if (acceso === "login") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Con sesión pero sin rol: ni la ve.
  if (acceso === "inicio" || !user) {
    return <Navigate to="/" replace />;
  }

  const esOwner = user.adminRole === "owner";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Helmet>
        <title>Análisis del negocio — DoApp</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/logo.svg?v=4" alt="" className="h-7 w-7" aria-hidden="true" />
            <span className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
              D<span className="text-sky-500">o</span>App
            </span>
            <span className="ml-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              Análisis
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 dark:text-slate-400 sm:inline">
              {user.name || user.email}
            </span>
            {esOwner && (
              <a
                href="/admin"
                className="text-sm font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400"
              >
                Panel completo
              </a>
            )}
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Salir
            </button>
          </div>
        </div>

        <div className="container mx-auto flex gap-1 px-4">
          {PESTANAS.map(({ id, icono: Icono, texto, ayuda }) => (
            <button
              key={id}
              type="button"
              onClick={() => setParams({ tab: id }, { replace: true })}
              title={ayuda}
              aria-current={pestana === id}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                pestana === id
                  ? "border-sky-500 text-sky-600 dark:text-sky-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Icono className="h-4 w-4" aria-hidden="true" />
              {texto}
            </button>
          ))}
        </div>
      </header>

      {/*
        Qué puede ver y qué no, dicho de frente. Quien colabora con los números
        no tiene por qué adivinar hasta dónde llega su acceso, y decirlo evita
        la pregunta "¿y los usuarios dónde están?" todas las semanas.
      */}
      {!esOwner && (
        <div className="container mx-auto px-4 pt-4">
          <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <span>
              Tu acceso llega hasta acá: los números del negocio y los supuestos con los que se
              proyectan. No incluye usuarios, pagos, contratos ni documentación de identidad.
            </span>
          </p>
        </div>
      )}

      <main>
        <Suspense
          fallback={
            <div className="flex min-h-[50vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-sky-500" aria-hidden="true" />
            </div>
          }
        >
          {pestana === "unidad" && <UnitEconomics />}
          {pestana === "proyeccion" && <BusinessPlan />}
          {pestana === "guia" && <GuiaDelAnalisis />}
        </Suspense>
      </main>
    </div>
  );
}
