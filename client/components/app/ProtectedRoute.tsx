import { Navigate, useLocation } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { useAuth } from "../../hooks/useAuth";

interface ProtectedRouteProps {
  children: JSX.Element;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-solid border-sky-500 border-t-transparent"></div>
      </div>
    );
  }

  return user ? (
    children
  ) : (
    <Navigate to="/login" state={{ from: location }} replace />
  );
}
