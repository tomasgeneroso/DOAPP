import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { HelmetProvider } from "react-helmet-async";
import { ToastProvider } from "./components/ui/Toast";
import { FacebookSDK } from "./components/FacebookSDK";
import { GoogleAnalytics } from "./components/GoogleAnalytics";
import { OnboardingProvider } from "./hooks/useOnboarding";
import OnboardingTooltip from "./components/onboarding/OnboardingTooltip";
import FirstContractGuide from "./components/FirstContractGuide";
import { useEffect, lazy, Suspense } from "react";
import { setupFetchInterceptor } from "./utils/fetchWithAuth";
import ErrorBoundary from "./components/ErrorBoundary";
import { features } from "../shared/featureFlags";
import ProtectedRoute from "./components/app/ProtectedRoute";
import Layout from "./components/app/Layout";

// Landing kept eager to avoid a loading flash on first paint
import Index from "./pages/Index";

// All other pages are code-split (React.lazy) — each becomes its own chunk,
// so the initial bundle no longer ships all ~90 screens at once.
const LoginScreen = lazy(() => import("./pages/LoginScreen"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const CreateContractScreen = lazy(() => import("./pages/CreateContractScreen"));
const JobDetail = lazy(() => import("./pages/JobDetail"));
const JobApplicationSummary = lazy(() => import("./pages/JobApplicationSummary"));
const ContractDetail = lazy(() => import("./pages/ContractDetail"));
const ContractSummary = lazy(() => import("./pages/ContractSummary"));
const ContractChangeRequestDetail = lazy(() => import("./pages/ContractChangeRequestDetail"));
const ContractsScreen = lazy(() => import("./pages/ContractsScreen"));
const MyJobsScreen = lazy(() => import("./pages/MyJobsScreen"));
const PaymentsScreen = lazy(() => import("./pages/PaymentsScreen"));
const JobPayment = lazy(() => import("./pages/JobPayment"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const EarningsDetail = lazy(() => import("./pages/dashboard/EarningsDetail"));
const ExpensesDetail = lazy(() => import("./pages/dashboard/ExpensesDetail"));
const ActiveContractsDetail = lazy(() => import("./pages/dashboard/ActiveContractsDetail"));
const ProposalsDetail = lazy(() => import("./pages/dashboard/ProposalsDetail"));
const ProposalsScreen = lazy(() => import("./pages/ProposalsScreen"));
const ProposalDetail = lazy(() => import("./pages/ProposalDetail"));
const MessagesScreen = lazy(() => import("./pages/MessagesScreen"));
const OnboardingScreen = lazy(() => import("./pages/OnboardingScreen"));
const UserSettings = lazy(() => import("./pages/UserSettings"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ContactPage = lazy(() => import("./pages/ContactPage"));
const ReferralsScreen = lazy(() => import("./pages/ReferralsScreen"));
const BlogsScreen = lazy(() => import("./pages/BlogsScreen"));
const BlogDetailScreen = lazy(() => import("./pages/BlogDetailScreen"));
const CreateBlogScreen = lazy(() => import("./pages/CreateBlogScreen"));
const PostDetail = lazy(() => import("./pages/PostDetail"));
const ChatScreen = lazy(() => import("./pages/ChatScreen"));
const CreateTicket = lazy(() => import("./pages/CreateTicket"));
const TicketDetail = lazy(() => import("./pages/TicketDetail"));
const CreateDispute = lazy(() => import("./pages/CreateDispute"));
const DisputeDetail = lazy(() => import("./pages/DisputeDetail"));
const HelpPage = lazy(() => import("./pages/HelpPage"));
const PortfolioManager = lazy(() => import("./pages/PortfolioManager"));
const CreatePortfolioPost = lazy(() => import("./pages/CreatePortfolioPost"));
const PortfolioItemDetail = lazy(() => import("./pages/PortfolioItemDetail"));
const ProUsageDashboard = lazy(() => import("./pages/ProUsageDashboard"));
const FinancePanel = lazy(() => import("./pages/FinancePanel"));
const BalancePage = lazy(() => import("./pages/BalancePage"));
const WithdrawalRequestPage = lazy(() => import("./pages/WithdrawalRequestPage"));
const MembershipCheckout = lazy(() => import("./pages/MembershipCheckout"));
const TermsAndConditions = lazy(() => import("./pages/legal/TermsAndConditions"));
const PrivacyPolicy = lazy(() => import("./pages/legal/PrivacyPolicy"));
const CookiesPolicy = lazy(() => import("./pages/legal/CookiesPolicy"));
const DisputeResolution = lazy(() => import("./pages/legal/DisputeResolution"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentCancel = lazy(() => import("./pages/PaymentCancel"));
const MembershipPaymentSuccess = lazy(() => import("./pages/MembershipPaymentSuccess"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const BannedUserScreen = lazy(() => import("./pages/BannedUserScreen"));

// Admin pages (lazy — only loaded for admin users)
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminUsers = lazy(() => import("./pages/admin/Users"));
const AdminRoles = lazy(() => import("./pages/admin/RoleManagement"));
const AdminRolePermissions = lazy(() => import("./pages/admin/RolePermissions"));
const AdminAnalytics = lazy(() => import("./pages/admin/Analytics"));
const AdminAnalyticsUsers = lazy(() => import("./pages/admin/AnalyticsUsers"));
const AdminAnalyticsContracts = lazy(() => import("./pages/admin/AnalyticsContracts"));
const AdminAnalyticsTickets = lazy(() => import("./pages/admin/AnalyticsTickets"));
const AdminAnalyticsUserActivity = lazy(() => import("./pages/admin/AnalyticsUserActivity"));
const AdminAnalyticsUserActivityDetail = lazy(() => import("./pages/admin/AnalyticsUserActivityDetail"));
const AdminSettings = lazy(() => import("./pages/admin/Settings"));
const AdminContracts = lazy(() => import("./pages/admin/Contracts"));
const AdminCreateContract = lazy(() => import("./pages/admin/CreateContract"));
const AdminTickets = lazy(() => import("./pages/admin/Tickets"));
const AdminTicketDetail = lazy(() => import("./pages/admin/TicketDetail"));
const AdminCreateTicket = lazy(() => import("./pages/admin/CreateTicket"));
const AdminDisputeManager = lazy(() => import("./pages/admin/AdminDisputeManager"));
const AdminCreateDispute = lazy(() => import("./pages/admin/CreateDispute"));
const AdminDisputeDetail = lazy(() => import("./pages/admin/AdminDisputeDetail"));
const AdminWithdrawalManager = lazy(() => import("./pages/admin/AdminWithdrawalManager"));
const FinancialTransactions = lazy(() => import("./pages/admin/FinancialTransactions"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const PendingPayments = lazy(() => import("./pages/admin/PendingPayments"));
const AdminJobManager = lazy(() => import("./pages/admin/JobManager"));
const AdminFamilyCodes = lazy(() => import("./pages/admin/FamilyCodes"));
const AdminPerformanceMonitor = lazy(() => import("./pages/admin/PerformanceMonitor"));
const AdminSearch = lazy(() => import("./pages/admin/AdminSearch"));
const DatabaseDiagram = lazy(() => import("./pages/admin/DatabaseDiagram"));
const SecurityPanel = lazy(() => import("./pages/admin/SecurityPanel"));
const ModulesManager = lazy(() => import("./pages/admin/ModulesManager"));
const ModerationHub = lazy(() => import("./pages/admin/ModerationHub"));
const FinancialHub = lazy(() => import("./pages/admin/FinancialHub"));
const GrowthHub = lazy(() => import("./pages/admin/GrowthHub"));
const EditJobScreen = lazy(() => import("./pages/EditJobScreen"));
const NotificationsScreen = lazy(() => import("./pages/NotificationsScreen"));
const CompleteRegistration = lazy(() => import("./pages/CompleteRegistration"));
const SiteMap = lazy(() => import("./pages/SiteMap"));
const QuoteForm = lazy(() => import("./pages/QuoteForm"));
const QuoteDetail = lazy(() => import("./pages/QuoteDetail"));
const AnalyticsReference = lazy(() => import("./pages/AnalyticsReference"));

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
                <FirstContractGuide />
                <Suspense fallback={
                  <div className="min-h-screen flex items-center justify-center">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
                  </div>
                }>
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
                path="/pro/finanzas"
                element={
                  <ProtectedRoute>
                    <FinancePanel />
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
                path="/quotes/new"
                element={
                  <ProtectedRoute>
                    <QuoteForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/quotes/:id/edit"
                element={
                  <ProtectedRoute>
                    <QuoteForm />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/quotes/:id"
                element={
                  <ProtectedRoute>
                    <QuoteDetail />
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
              {features.blog && <Route path="/blog" element={<BlogsScreen />} />}
              {features.blog && <Route path="/blog/create" element={<CreateBlogScreen />} />}
              {features.blog && <Route path="/blog/:slug" element={<BlogDetailScreen />} />}
              <Route path="/posts/:id" element={<PostDetail />} />
              {features.sitemap && <Route path="/sitemap" element={<SiteMap />} />}
              <Route path="/analytics-reference" element={<AnalyticsReference />} />
              <Route path="/tickets/new" element={<CreateTicket />} />
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
              <Route path="/help" element={<HelpPage />} />
              <Route path="/legal/terminos-y-condiciones" element={<TermsAndConditions />} />
              <Route path="/legal/privacidad" element={<PrivacyPolicy />} />
              <Route path="/legal/cookies" element={<CookiesPolicy />} />
              <Route path="/legal/disputas" element={<DisputeResolution />} />
            </Route>
            <Route path="/login" element={<LoginScreen />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/register" element={<LoginScreen />} />
            <Route path="/banned" element={<BannedUserScreen />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
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
              <Route path="audit-logs" element={<AuditLogs />} />
              {/* Legacy/hub links without a dedicated page → redirect to where that
                  info actually lives (nothing was deleted, only relocated). */}
              <Route path="payments" element={<Navigate to="/admin/pending-payments" replace />} />
              <Route path="payments/*" element={<Navigate to="/admin/pending-payments" replace />} />
              <Route path="company-balance" element={<Navigate to="/admin/financial-transactions" replace />} />
              <Route path="marketing" element={<Navigate to="/admin/analytics" replace />} />
              <Route path="blogs" element={<Navigate to="/blog" replace />} />
              <Route path="tickets" element={<AdminTickets />} />
              <Route path="tickets/create" element={<AdminCreateTicket />} />
              <Route path="tickets/:id" element={<AdminTicketDetail />} />
              <Route path="jobs" element={<AdminJobManager />} />
              <Route path="family-codes" element={<AdminFamilyCodes />} />
              <Route path="performance" element={<AdminPerformanceMonitor />} />
              <Route path="search" element={<AdminSearch />} />
              <Route path="database" element={<DatabaseDiagram />} />
              <Route path="security" element={<SecurityPanel />} />
              <Route path="modules" element={<ModulesManager />} />
              <Route path="hubs/moderation" element={<ModerationHub />} />
              <Route path="hubs/financial" element={<FinancialHub />} />
              <Route path="hubs/growth" element={<GrowthHub />} />
            </Route>
                </Routes>
                </Suspense>
              </OnboardingProvider>
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </HelmetProvider>
    </ErrorBoundary>
  );
}
