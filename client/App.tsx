import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { HelmetProvider } from "react-helmet-async";
import { ToastProvider } from "./components/ui/Toast";
import { FacebookSDK } from "./components/FacebookSDK";
import { GoogleAnalytics } from "./components/GoogleAnalytics";
import { OnboardingProvider } from "./hooks/useOnboarding";
import OnboardingTooltip from "./components/onboarding/OnboardingTooltip";
import { useEffect } from "react";
import { setupFetchInterceptor } from "./utils/fetchWithAuth";
import ErrorBoundary from "./components/ErrorBoundary";
import Index from "./pages/Index";
import LoginScreen from "./pages/LoginScreen";
import AuthCallback from "./pages/AuthCallback";
import CreateContractScreen from "./pages/CreateContractScreen";
import JobDetail from "./pages/JobDetail";
import JobApplicationSummary from "./pages/JobApplicationSummary";
import ContractDetail from "./pages/ContractDetail";
import ContractSummary from "./pages/ContractSummary";
import ContractChangeRequestDetail from "./pages/ContractChangeRequestDetail";
import ContractsScreen from "./pages/ContractsScreen";
import MyJobsScreen from "./pages/MyJobsScreen";
import PaymentsScreen from "./pages/PaymentsScreen";
import JobPayment from "./pages/JobPayment";
import Dashboard from "./pages/Dashboard";
import EarningsDetail from "./pages/dashboard/EarningsDetail";
import ExpensesDetail from "./pages/dashboard/ExpensesDetail";
import ActiveContractsDetail from "./pages/dashboard/ActiveContractsDetail";
import ProposalsDetail from "./pages/dashboard/ProposalsDetail";
import ProposalsScreen from "./pages/ProposalsScreen";
import ProposalDetail from "./pages/ProposalDetail";
import MessagesScreen from "./pages/MessagesScreen";
import OnboardingScreen from "./pages/OnboardingScreen";
import UserSettings from "./pages/UserSettings";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ContactPage from "./pages/ContactPage";
import ReferralsScreen from "./pages/ReferralsScreen";
import BlogsScreen from "./pages/BlogsScreen";
import BlogDetailScreen from "./pages/BlogDetailScreen";
import CreateBlogScreen from "./pages/CreateBlogScreen";
import ChatScreen from "./pages/ChatScreen";
import CreateTicket from "./pages/CreateTicket";
import TicketDetail from "./pages/TicketDetail";
import CreateDispute from "./pages/CreateDispute";
import DisputeDetail from "./pages/DisputeDetail";
import HelpPage from "./pages/HelpPage";
import PortfolioManager from "./pages/PortfolioManager";
import CreatePortfolioPost from "./pages/CreatePortfolioPost";
import PortfolioItemDetail from "./pages/PortfolioItemDetail";
import ProUsageDashboard from "./pages/ProUsageDashboard";
import BalancePage from "./pages/BalancePage";
import WithdrawalRequestPage from "./pages/WithdrawalRequestPage";
import MembershipCheckout from "./pages/MembershipCheckout";
import TermsAndConditions from "./pages/legal/TermsAndConditions";
import PrivacyPolicy from "./pages/legal/PrivacyPolicy";
import CookiesPolicy from "./pages/legal/CookiesPolicy";
import DisputeResolution from "./pages/legal/DisputeResolution";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancel from "./pages/PaymentCancel";
import MembershipPaymentSuccess from "./pages/MembershipPaymentSuccess";
import ProfilePage from "./pages/ProfilePage";
import BannedUserScreen from "./pages/BannedUserScreen";
import ProtectedRoute from "./components/app/ProtectedRoute";
import Layout from "./components/app/Layout";

// Admin pages
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminUsers from "./pages/admin/Users";
import AdminRoles from "./pages/admin/RoleManagement";
import AdminRolePermissions from "./pages/admin/RolePermissions";
import AdminAnalytics from "./pages/admin/Analytics";
import AdminAnalyticsUsers from "./pages/admin/AnalyticsUsers";
import AdminAnalyticsContracts from "./pages/admin/AnalyticsContracts";
import AdminAnalyticsTickets from "./pages/admin/AnalyticsTickets";
import AdminAnalyticsUserActivity from "./pages/admin/AnalyticsUserActivity";
import AdminAnalyticsUserActivityDetail from "./pages/admin/AnalyticsUserActivityDetail";
import AdminSettings from "./pages/admin/Settings";
import AdminContracts from "./pages/admin/Contracts";
import AdminCreateContract from "./pages/admin/CreateContract";
import AdminTickets from "./pages/admin/Tickets";
import AdminTicketDetail from "./pages/admin/TicketDetail";
import AdminCreateTicket from "./pages/admin/CreateTicket";
import AdminDisputeManager from "./pages/admin/AdminDisputeManager";
import AdminCreateDispute from "./pages/admin/CreateDispute";
import AdminDisputeDetail from "./pages/admin/AdminDisputeDetail";
import AdminWithdrawalManager from "./pages/admin/AdminWithdrawalManager";
import FinancialTransactions from "./pages/admin/FinancialTransactions";
import PendingPayments from "./pages/admin/PendingPayments";
import AdminJobManager from "./pages/admin/JobManager";
import AdminFamilyCodes from "./pages/admin/FamilyCodes";
import AdminPerformanceMonitor from "./pages/admin/PerformanceMonitor";
import EditJobScreen from "./pages/EditJobScreen";
import NotificationsScreen from "./pages/NotificationsScreen";
import CompleteRegistration from "./pages/CompleteRegistration";
import SiteMap from "./pages/SiteMap";

export default function App() {
  // Setup fetch interceptor for automatic token handling
  useEffect(() => {
    setupFetchInterceptor();
  }, []);

  return (
    <ErrorBoundary>
      <HelmetProvider>
        <AuthProvider>
          <ToastProvider>
            <FacebookSDK />
            <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
              <GoogleAnalytics />
              <OnboardingProvider>
                <OnboardingTooltip />
                <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Index />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route
                path="/jobs/:id/edit"
                element={
                  <ProtectedRoute>
                    <EditJobScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/jobs/:id/apply"
                element={
                  <ProtectedRoute>
                    <JobApplicationSummary />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/jobs/:id/payment"
                element={
                  <ProtectedRoute>
                    <JobPayment />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/my-jobs"
                element={
                  <ProtectedRoute>
                    <MyJobsScreen />
                  </ProtectedRoute>
                }
              />
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
                path="/contracts/:id/summary"
                element={
                  <ProtectedRoute>
                    <ContractSummary />
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
                path="/contracts/:contractId/change-requests/:id"
                element={
                  <ProtectedRoute>
                    <ContractChangeRequestDetail />
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
                path="/proposals/:id"
                element={
                  <ProtectedRoute>
                    <ProposalDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/messages"
                element={
                  <ProtectedRoute>
                    <MessagesScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/portfolio"
                element={
                  <ProtectedRoute>
                    <PortfolioManager />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/portfolio/create"
                element={
                  <ProtectedRoute>
                    <CreatePortfolioPost />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/portfolio/:id"
                element={<PortfolioItemDetail />}
              />
              {/* Profile routes - username takes precedence */}
              <Route path="/u/:username" element={<ProfilePage />} />
              <Route path="/profile/:userId" element={<ProfilePage />} />
              <Route
                path="/pro/usage"
                element={
                  <ProtectedRoute>
                    <ProUsageDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/messages/:id"
                element={
                  <ProtectedRoute>
                    <MessagesScreen />
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
              <Route path="/payment/success" element={<PaymentSuccess />} />
              <Route path="/payment/cancel" element={<PaymentCancel />} />
              <Route
                path="/membership/pricing"
                element={
                  <ProtectedRoute>
                    <MembershipCheckout />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/membership/checkout"
                element={
                  <ProtectedRoute>
                    <MembershipCheckout />
                  </ProtectedRoute>
                }
              />
              <Route path="/membership/payment-success" element={<MembershipPaymentSuccess />} />
              <Route path="/membership/payment/success" element={<MembershipPaymentSuccess />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/earnings"
                element={
                  <ProtectedRoute>
                    <EarningsDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/expenses"
                element={
                  <ProtectedRoute>
                    <ExpensesDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/active-contracts"
                element={
                  <ProtectedRoute>
                    <ActiveContractsDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/proposals"
                element={
                  <ProtectedRoute>
                    <ProposalsDetail />
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
              <Route
                path="/notifications"
                element={
                  <ProtectedRoute>
                    <NotificationsScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/referrals"
                element={
                  <ProtectedRoute>
                    <ReferralsScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/chat/:id"
                element={
                  <ProtectedRoute>
                    <ChatScreen />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/balance"
                element={
                  <ProtectedRoute>
                    <BalancePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/withdrawals"
                element={
                  <ProtectedRoute>
                    <WithdrawalRequestPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/membership/checkout"
                element={
                  <ProtectedRoute>
                    <MembershipCheckout />
                  </ProtectedRoute>
                }
              />
              <Route path="/blog" element={<BlogsScreen />} />
              <Route path="/blog/create" element={<CreateBlogScreen />} />
              <Route path="/blog/:slug" element={<BlogDetailScreen />} />
              <Route path="/sitemap" element={<SiteMap />} />
              <Route
                path="/tickets/new"
                element={
                  <ProtectedRoute>
                    <CreateTicket />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/tickets/:id"
                element={
                  <ProtectedRoute>
                    <TicketDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/my-disputes"
                element={<Navigate to="/help" replace />}
              />
              <Route
                path="/disputes"
                element={<Navigate to="/help" replace />}
              />
              <Route
                path="/disputes/create"
                element={
                  <ProtectedRoute>
                    <CreateDispute />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/disputes/new"
                element={
                  <ProtectedRoute>
                    <CreateDispute />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/disputes/:id"
                element={
                  <ProtectedRoute>
                    <DisputeDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/help"
                element={
                  <ProtectedRoute>
                    <HelpPage />
                  </ProtectedRoute>
                }
              />
            </Route>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/register" element={<LoginScreen />} />
            <Route path="/banned" element={<BannedUserScreen />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/legal/terminos-y-condiciones" element={<TermsAndConditions />} />
            <Route path="/legal/privacidad" element={<PrivacyPolicy />} />
            <Route path="/legal/cookies" element={<CookiesPolicy />} />
            <Route path="/legal/disputas" element={<DisputeResolution />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route
              path="/complete-registration"
              element={
                <ProtectedRoute>
                  <CompleteRegistration />
                </ProtectedRoute>
              }
            />
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
              <Route path="roles" element={<AdminRoles />} />
              <Route path="role-permissions" element={<AdminRolePermissions />} />
              <Route path="analytics" element={<AdminAnalytics />} />
              <Route path="analytics/users" element={<AdminAnalyticsUsers />} />
              <Route path="analytics/contracts" element={<AdminAnalyticsContracts />} />
              <Route path="analytics/tickets" element={<AdminAnalyticsTickets />} />
              <Route path="analytics/user-activity" element={<AdminAnalyticsUserActivity />} />
              <Route path="analytics/user/:userId" element={<AdminAnalyticsUserActivityDetail />} />
              <Route path="settings" element={<AdminSettings />} />
              <Route path="contracts" element={<AdminContracts />} />
              <Route path="contracts/create" element={<AdminCreateContract />} />
              <Route path="disputes" element={<AdminDisputeManager />} />
              <Route path="disputes/create" element={<AdminCreateDispute />} />
              <Route path="disputes/:id" element={<AdminDisputeDetail />} />
              <Route path="withdrawals" element={<AdminWithdrawalManager />} />
              <Route path="pending-payments" element={<PendingPayments />} />
              <Route path="financial-transactions" element={<FinancialTransactions />} />
              <Route path="tickets" element={<AdminTickets />} />
              <Route path="tickets/create" element={<AdminCreateTicket />} />
              <Route path="tickets/:id" element={<AdminTicketDetail />} />
              <Route path="jobs" element={<AdminJobManager />} />
              <Route path="family-codes" element={<AdminFamilyCodes />} />
              <Route path="performance" element={<AdminPerformanceMonitor />} />
            </Route>
                </Routes>
              </OnboardingProvider>
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}
