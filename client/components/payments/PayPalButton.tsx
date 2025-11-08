import { useState } from "react";
import { paymentApi } from "@/lib/paymentApi";
import { Loader2, CreditCard } from "lucide-react";

interface PayPalButtonProps {
  contractId: string;
  amount: number;
  description?: string;
  onSuccess?: (captureId: string) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
}

export function PayPalButton({
  contractId,
  amount,
  description,
  onSuccess,
  onError,
  onCancel,
  disabled = false,
}: PayPalButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePayPalRedirect = async () => {
    try {
      setLoading(true);
      setError(null);

      // Create PayPal order
      const result = await paymentApi.createOrder({
        contractId,
        amount,
        description,
      });

      console.log("✅ PayPal order created:", result);
      console.log("🔗 Approval URL:", result.approvalUrl);

      // Redirect to PayPal approval URL
      if (result.approvalUrl) {
        window.location.href = result.approvalUrl;
      } else {
        throw new Error("No se recibió URL de aprobación de PayPal");
      }
    } catch (err: any) {
      const errorMessage = err.message || "Error al crear orden de PayPal";
      console.error("❌ PayPal error:", err);
      setError(errorMessage);
      onError?.(errorMessage);
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 text-sm font-medium">Error al procesar el pago</p>
          <p className="text-red-700 text-sm mt-1">{error}</p>
        </div>
        <button
          onClick={handlePayPalRedirect}
          disabled={loading}
          className="w-full bg-sky-600 hover:bg-sky-700 disabled:bg-slate-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handlePayPalRedirect}
        disabled={disabled || loading}
        className="w-full bg-[#0070ba] hover:bg-[#005ea6] disabled:bg-slate-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Redirigiendo a PayPal...
          </>
        ) : (
          <>
            <CreditCard className="h-5 w-5" />
            Pagar con PayPal
          </>
        )}
      </button>

      {loading && (
        <div className="mt-3 text-center">
          <p className="text-sm text-gray-600">
            Serás redirigido a PayPal Sandbox para completar el pago...
          </p>
        </div>
      )}

      <div className="mt-2 text-xs text-gray-500 text-center">
        <p>🔒 Pago seguro procesado por PayPal Sandbox</p>
        <p className="mt-1">
          Ambiente de pruebas - Utiliza credenciales de sandbox
        </p>
      </div>
    </div>
  );
}
