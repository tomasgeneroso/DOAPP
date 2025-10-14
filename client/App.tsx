import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { HelmetProvider } from "react-helmet-async";
import { FacebookSDK } from "./components/FacebookSDK";
import { useEffect } from "react";
import { setupFetchInterceptor } from "./utils/fetchWithAuth";
import Index from "./pages/Index";
import LoginScreen from "./pages/LoginScreen";
import AuthCallback from "./pages/AuthCallback";
import CreateContractScreen from "./pages/CreateContractScreen";
import JobDetail from "./pages/JobDetail";
import ContractDetail from "./pages/ContractDetail";
import ContractsScreen from "./pages/ContractsScreen";
import PaymentsScreen from "./pages/PaymentsScreen";
import Dashboard from "./pages/Dashboard";
import ProposalsScreen from "./pages/ProposalsScreen";
import OnboardingScreen from "./pages/OnboardingScreen";
import UserSettings from "./pages/UserSettings";
import ProtectedRoute from "./components/app/ProtectedRoute";
import Layout from "./components/app/Layout";

// Admin pages
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminUsers from "./pages/admin/Users";
import AdminTickets from "./pages/admin/Tickets";
import TicketDetail from "./pages/admin/TicketDetail";

export default function App() {
  // Setup fetch interceptor for automatic token handling
  useEffect(() => {
    setupFetchInterceptor();
  }, []);

  return (
    <HelmetProvider>
      <AuthProvider>
        <FacebookSDK />
        <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Index />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route
                path="/contracts"
                element={
                  <ProtectedRoute>
                    <ContractsScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/contracts/create"
                element={
                  <ProtectedRoute>
                    <CreateContractScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/contracts/:id"
                element={
                  <ProtectedRoute>
                    <ContractDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/proposals"
                element={
                  <ProtectedRoute>
                    <ProposalsScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/payments"
                element={
                  <ProtectedRoute>
                    <PaymentsScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <UserSettings />
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <OnboardingScreen />
                </ProtectedRoute>
              }
            />

            {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="tickets" element={<AdminTickets />} />
              <Route path="tickets/:id" element={<TicketDetail />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </HelmetProvider>
  );
}
