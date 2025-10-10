import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { PaymentHistory } from "@/components/payments/PaymentHistory";
import { ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";

export default function PaymentsScreen() {
  const [filter, setFilter] = useState<"all" | "sent" | "received">("all");

  return (
    <>
      <Helmet>
        <title>Mis Pagos - Do</title>
      </Helmet>

      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Wallet className="h-8 w-8 text-sky-600" />
              Historial de Pagos
            </h1>
            <p className="text-gray-600 mt-2">
              Gestiona y revisa todos tus pagos y transacciones
            </p>
          </div>

          {/* Filter Tabs */}
          <div className="bg-white rounded-lg shadow mb-6">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setFilter("all")}
                  className={`py-4 px-6 text-sm font-medium border-b-2 transition ${
                    filter === "all"
                      ? "border-sky-600 text-sky-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" />
                    Todos
                  </div>
                </button>
                <button
                  onClick={() => setFilter("sent")}
                  className={`py-4 px-6 text-sm font-medium border-b-2 transition ${
                    filter === "sent"
                      ? "border-sky-600 text-sky-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ArrowUpCircle className="h-4 w-4" />
                    Enviados
                  </div>
                </button>
                <button
                  onClick={() => setFilter("received")}
                  className={`py-4 px-6 text-sm font-medium border-b-2 transition ${
                    filter === "received"
                      ? "border-sky-600 text-sky-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ArrowDownCircle className="h-4 w-4" />
                    Recibidos
                  </div>
                </button>
              </nav>
            </div>
          </div>

          {/* Payment History */}
          <PaymentHistory type={filter} />
        </div>
      </div>
    </>
  );
}
