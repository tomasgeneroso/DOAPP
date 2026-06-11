import { useEffect } from "react";
import { useScrollDepth } from "../hooks/useScrollDepth";

interface EventRow {
  event_name: string;
  trigger: string;
  parameters: string;
  location: string;
}

const EVENTS: EventRow[] = [
  // Page views
  {
    event_name: "page_view",
    trigger: "Every route change",
    parameters: "page_location, page_title",
    location: "GoogleAnalytics.tsx (automatic)",
  },
  // Navigation
  {
    event_name: "nav_click",
    trigger: "User clicks a navigation link",
    parameters: "destination (path), nav_location (header | footer | sidebar | mobile_tab)",
    location: "Header.tsx, Footer.tsx",
  },
  // Search & Filters
  {
    event_name: "search",
    trigger: "User submits the search form",
    parameters: "search_term, category, location",
    location: "SearchBar.tsx → handleSubmit",
  },
  {
    event_name: "filter_apply",
    trigger: "User changes a filter or sort option",
    parameters: "filter_name (category | location | sort_by | search_type), filter_value, context",
    location: "SearchBar.tsx → handleCategoryChange, setSortBy, setSearchType",
  },
  // Clipboard
  {
    event_name: "clipboard_copy",
    trigger: "User copies text to clipboard (e.g. pairing code, CBU)",
    parameters: "content_type, content_value",
    location: "analytics.clipboardCopy() — call on copy buttons",
  },
  // Scroll depth
  {
    event_name: "scroll_depth",
    trigger: "User scrolls past 25%, 50%, 75%, 100% of page height",
    parameters: "percent_scrolled (25|50|75|100), page_path",
    location: "useScrollDepth hook (mounted in Layout.tsx)",
  },
  // Auth
  {
    event_name: "login",
    trigger: "Successful login",
    parameters: "method (email | google | facebook)",
    location: "analytics.login()",
  },
  {
    event_name: "sign_up",
    trigger: "Successful registration",
    parameters: "method (email | google | facebook)",
    location: "analytics.signup()",
  },
  // Jobs
  {
    event_name: "view_item (job)",
    trigger: "User opens a job detail page",
    parameters: "item_id, item_category, price, item_location",
    location: "analytics.jobView()",
  },
  {
    event_name: "create_job",
    trigger: "User submits the create-job form",
    parameters: "category, value (price), urgency",
    location: "analytics.jobCreate()",
  },
  {
    event_name: "job_publish",
    trigger: "User pays to publish a job",
    parameters: "job_id, value (price), category",
    location: "analytics.jobPublish()",
  },
  // Proposals
  {
    event_name: "create_proposal",
    trigger: "Worker submits a proposal",
    parameters: "job_id, value (proposed amount)",
    location: "analytics.proposalCreate()",
  },
  {
    event_name: "accept_proposal",
    trigger: "Client accepts a proposal",
    parameters: "proposal_id, value",
    location: "analytics.proposalAccept()",
  },
  // Contracts
  {
    event_name: "create_contract",
    trigger: "Contract is created from an approved proposal",
    parameters: "contract_id, value, item_category",
    location: "analytics.contractCreate()",
  },
  {
    event_name: "contract_complete",
    trigger: "Contract is confirmed as complete",
    parameters: "contract_id, value, rating",
    location: "analytics.contractComplete()",
  },
  // Payments
  {
    event_name: "begin_checkout",
    trigger: "User initiates a payment flow",
    parameters: "value, currency (ARS), payment_method, payment_type",
    location: "analytics.paymentInitiate()",
  },
  {
    event_name: "purchase",
    trigger: "Payment confirmed / contract payment success",
    parameters: "transaction_id, value, currency (ARS), payment_method",
    location: "analytics.paymentSuccess()",
  },
  // Membership
  {
    event_name: "view_membership",
    trigger: "User views the membership pricing page",
    parameters: "tier (pro | super_pro), price",
    location: "analytics.membershipView()",
  },
  {
    event_name: "purchase_membership",
    trigger: "User completes a membership upgrade",
    parameters: "tier, price, transaction_id",
    location: "analytics.membershipPurchase()",
  },
  // Disputes
  {
    event_name: "dispute_create",
    trigger: "User opens a dispute on a contract",
    parameters: "contract_id, category",
    location: "analytics.disputeCreate()",
  },
  // Withdrawals
  {
    event_name: "withdrawal_request",
    trigger: "User requests a balance withdrawal",
    parameters: "value (ARS), method (CBU)",
    location: "analytics.withdrawalRequest()",
  },
  // Errors
  {
    event_name: "exception",
    trigger: "Application error caught",
    parameters: "description, fatal, page",
    location: "analytics.error()",
  },
];

export default function AnalyticsReference() {
  useScrollDepth();

  useEffect(() => {
    document.title = "GA4 Events Reference — DoApp";
  }, []);

  return (
    <div className="min-h-screen bg-[#F5F5F5] dark:bg-slate-900 py-10 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
          GA4 Events Reference
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8">
          All tracked events for the DoApp web application.{" "}
          <span className="font-mono text-sm bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">
            VITE_GOOGLE_ANALYTICS_ID=G-XK7XZFVGK3
          </span>
        </p>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-left">
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200 w-48">
                  Event Name
                </th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                  Trigger
                </th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                  Parameters
                </th>
                <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200 w-56">
                  Source
                </th>
              </tr>
            </thead>
            <tbody>
              {EVENTS.map((ev, i) => (
                <tr
                  key={ev.event_name + i}
                  className={`border-t border-slate-200 dark:border-slate-700 ${
                    i % 2 === 0
                      ? "bg-white dark:bg-slate-900"
                      : "bg-slate-50 dark:bg-slate-800/50"
                  }`}
                >
                  <td className="px-4 py-3 font-mono text-sky-700 dark:text-sky-400 whitespace-nowrap">
                    {ev.event_name}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {ev.trigger}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs">
                    {ev.parameters}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-500 font-mono text-xs">
                    {ev.location}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 p-4 rounded-xl bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
          <h2 className="font-semibold text-sky-800 dark:text-sky-300 mb-2">
            How to add a new event
          </h2>
          <ol className="list-decimal list-inside space-y-1 text-sm text-sky-700 dark:text-sky-400">
            <li>
              Add a named function to the <code className="bg-sky-100 dark:bg-sky-800 px-1 rounded">analytics</code> object in{" "}
              <code className="bg-sky-100 dark:bg-sky-800 px-1 rounded">client/utils/analytics.ts</code>
            </li>
            <li>
              Call <code className="bg-sky-100 dark:bg-sky-800 px-1 rounded">window.gtag('event', 'event_name', &#123; ...params &#125;)</code> inside it
            </li>
            <li>Import <code className="bg-sky-100 dark:bg-sky-800 px-1 rounded">analytics</code> and call the function from the relevant component</li>
            <li>Add a row to this reference page</li>
          </ol>
        </div>

        <div className="mt-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <h2 className="font-semibold text-amber-800 dark:text-amber-300 mb-1">
            Naming conventions
          </h2>
          <ul className="list-disc list-inside space-y-1 text-sm text-amber-700 dark:text-amber-400">
            <li>snake_case for event names and parameters</li>
            <li>Use GA4 recommended events when applicable (e.g. <code>purchase</code>, <code>sign_up</code>, <code>search</code>)</li>
            <li>Custom events: <code>noun_verb</code> pattern (e.g. <code>dispute_create</code>, <code>filter_apply</code>)</li>
            <li>Parameter names max 40 chars, values max 100 chars</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
