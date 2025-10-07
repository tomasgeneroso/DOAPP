import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { HelmetProvider } from "react-helmet-async";
import Index from "./pages/Index";
import LoginScreen from "./pages/LoginScreen";
import CreateContractScreen from "./pages/CreateContractScreen";
import ProtectedRoute from "./components/app/ProtectedRoute";
import Layout from "./components/app/Layout";

export default function App() {
  return (
    <HelmetProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Index />} />
              <Route
                path="/contracts/create"
                element={
                  <ProtectedRoute>
                    <CreateContractScreen />
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="/login" element={<LoginScreen />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </HelmetProvider>
  );
}
