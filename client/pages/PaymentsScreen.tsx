import { useState } from "react";
import { useTranslation } from "react-i18next";
import Pestanas from "../components/ui/Pestanas";
import { Helmet } from "react-helmet-async";
import { PaymentHistory } from "@/components/payments/PaymentHistory";
import { ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";

export default function PaymentsScreen() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"all" | "sent" | "received">("all");

  return (
    <>
      <Helmet>
        <title>Mis Pagos - Do</title>
      </Helmet>

      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <Wallet className="h-8 w-8 text-sky-600" />
              {t('payments.title')}
            </h1>
            <p className="text-gray-600 dark:text-slate-400 mt-2">
              {t('payments.subtitle')}
            </p>
          </div>

          {/* Filter Tabs */}
          <Pestanas
            className="mb-6"
            ariaLabel="Filtrar pagos"
            valor={filter}
            onCambiar={setFilter}
            opciones={[
              { id: "all" as const, texto: t('payments.all'), icono: <Wallet className="h-4 w-4" /> },
              { id: "sent" as const, texto: t('payments.sent'), icono: <ArrowUpCircle className="h-4 w-4" /> },
              { id: "received" as const, texto: t('payments.received'), icono: <ArrowDownCircle className="h-4 w-4" /> },
            ]}
          />

          {/* Payment History */}
          <PaymentHistory type={filter} />
        </div>
      </div>
    </>
  );
}
