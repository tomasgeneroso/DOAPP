import { useState } from "react";
import { DollarSign, AlertCircle, Loader2 } from "lucide-react";
import type { Contract } from "@/types";

interface Props {
  contract: Contract;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function PriceModificationForm({ contract, onSuccess, onCancel }: Props) {
  const [newPrice, setNewPrice] = useState(contract.price);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresPayment, setRequiresPayment] = useState(false);
  const [paymentInfo, setPaymentInfo] = useState<any>(null);

  const priceDifference = newPrice - contract.price;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/contracts/${contract._id}/modify-price`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ newPrice, reason }),
      });

      const data = await response.json();

      if (response.status === 402) {
        // Payment required
        setRequiresPayment(true);
        setPaymentInfo(data);
        setError(`Necesitas pagar $${data.amountRequired.toLocaleString("es-AR")} adicionales. Saldo actual: $${data.currentBalance.toLocaleString("es-AR")}`);
        return;
      }

      if (!data.success) {
        throw new Error(data.message || "Error al modificar precio");
      }

      alert(data.message);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Error al modificar precio");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
        <DollarSign className="h-5 w-5 text-sky-600" />
        Modificar Precio del Contrato
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Current Price */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Precio Actual
          </label>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            ${contract.price.toLocaleString("es-AR")}
          </div>
        </div>

        {/* New Price */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Nuevo Precio *
          </label>
          <input
            type="number"
            value={newPrice}
            onChange={(e) => setNewPrice(Number(e.target.value))}
            min={5000}
            step={100}
            required
            className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Mínimo: $5,000 ARS</p>
        </div>

        {/* Price Difference */}
        {priceDifference !== 0 && (
          <div className={`p-4 rounded-lg ${priceDifference > 0 ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'}`}>
            <p className={`text-sm font-medium ${priceDifference > 0 ? 'text-red-900 dark:text-red-200' : 'text-green-900 dark:text-green-200'}`}>
              {priceDifference > 0 ? (
                <>Deberás pagar ${ Math.abs(priceDifference).toLocaleString("es-AR")} adicionales</>
              ) : (
                <>Se reembolsarán ${Math.abs(priceDifference).toLocaleString("es-AR")} a tu saldo</>
              )}
            </p>
          </div>
        )}

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Razón del cambio (opcional)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={200}
            className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500"
            placeholder="Ej: Ajuste por cambios en el alcance del trabajo"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{reason.length}/200</p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            <p className="text-sm text-red-900 dark:text-red-200">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || newPrice === contract.price || newPrice < 5000}
            className="flex-1 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? "Procesando..." : "Confirmar Cambio"}
          </button>
        </div>
      </form>

      {/* Info */}
      <div className="mt-4 p-4 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg">
        <p className="text-xs text-sky-800 dark:text-sky-300">
          <strong>Nota:</strong> Solo puedes modificar el precio antes de que alguien se haya postulado al trabajo.
        </p>
      </div>
    </div>
  );
}
