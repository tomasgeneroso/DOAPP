import { useAuth } from "../hooks/useAuth";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

export default function Index() {
  const { user, isLoading } = useAuth();

  return (
    <>
      <Helmet>
        <title>Bienvenido a Doers</title>
        <meta
          name="description"
          content="Doers - La plataforma para conectar clientes con profesionales."
        />
      </Helmet>
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
          {user ? (
            `¡Hola de nuevo, ${user.name}!`
          ) : (
            <>
              Encuentra al{" "}
              <span className="text-sky-600">profesional perfecto</span>
            </>
          )}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-gray-600">
          {isLoading
            ? "Cargando..."
            : user
            ? "¿Listo para empezar un nuevo proyecto o buscar oportunidades? Estás en el lugar correcto."
            : "La plataforma que conecta clientes con los mejores profesionales. Publica un trabajo o encuentra tu próximo proyecto. Fácil, rápido y seguro."}
        </p>
        {!user && !isLoading && (
          <div className="mt-10 flex items-center justify-center gap-x-6">
            <Link
              to="/login"
              className="rounded-md bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
            >
              Regístrate gratis
            </Link>
            <Link
              to="/login"
              className="text-sm font-semibold leading-6 text-gray-900"
            >
              Iniciar sesión <span aria-hidden="true">→</span>
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
