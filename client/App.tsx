import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { HelmetProvider } from "react-helmet-async";
import { FacebookSDK } from "./components/FacebookSDK";
import LoadingScreen from "./components/LoadingScreen";
import Index from "./pages/Index";
import LoginScreen from "./pages/LoginScreen";
import AuthCallback from "./pages/AuthCallback";
import CreateContractScreen from "./pages/CreateContractScreen";
import JobDetail from "./pages/JobDetail";
import ContractDetail from "./pages/ContractDetail";
import PaymentsScreen from "./pages/PaymentsScreen";
import ChatScreen from "./pages/ChatScreen";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyWhatsAppCode from "./pages/VerifyWhatsAppCode";
import ProtectedRoute from "./components/app/ProtectedRoute";
import Layout from "./components/app/Layout";

// Admin pages
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminUsers from "./pages/admin/Users";
import AdminTickets from "./pages/admin/Tickets";
import TicketDetail from "./pages/admin/TicketDetail";

export default function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate initial app loading time
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <LoadingScreen onLoadingComplete={() => setIsLoading(false)} />;
  }

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
                path="/payments"
                element={
                  <ProtectedRoute>
                    <PaymentsScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chat/:conversationId"
                element={
                  <ProtectedRoute>
                    <ChatScreen />
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-whatsapp-code" element={<VerifyWhatsAppCode />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

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
