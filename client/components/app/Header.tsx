import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { LogOut, User as UserIcon, PlusCircle } from "lucide-react";

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-lg">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 text-lg font-bold text-white shadow-lg shadow-sky-500/30">
            D
          </div>
          <h1 className="hidden text-xl font-bold text-slate-900 sm:block">
            Doers
          </h1>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            to="/contracts/create"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-black focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
          >
            <PlusCircle className="h-4 w-4" />
            Publicar trabajo
          </Link>

          {user ? (
            <div className="relative">
              <button className="flex items-center gap-2 rounded-full bg-slate-100 p-2 text-sm hover:bg-slate-200">
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="h-8 w-8 rounded-full"
                />
                <span className="hidden font-medium text-slate-700 md:block">
                  {user.name}
                </span>
              </button>
              {/* Aquí iría un menú desplegable con opciones de perfil y logout */}
              <button
                onClick={handleLogout}
                className="ml-2 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
                title="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Iniciar Sesión
              </Link>
              <Link
                to="/login"
                className="rounded-xl bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
              >
                Registro
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
