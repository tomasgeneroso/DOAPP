import { useEffect, useState } from "react";
import { paymentApi } from "@/lib/paymentApi";

interface PayPalButtonProps {
  contractId: string;
  amount: number;
  description?: string;
  onSuccess?: (captureId: string) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
}

declare global {
  interface Window {
    paypal?: any;
  }
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
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load PayPal SDK script
  useEffect(() => {
    if (window.paypal) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${import.meta.env.VITE_PAYPAL_CLIENT_ID}&currency=USD`;
    script.async = true;

    script.onload = () => {
      setScriptLoaded(true);
    };

    script.onerror = () => {
      setError("Failed to load PayPal SDK");
    };

    document.body.appendChild(script);

    return () => {
      // Cleanup if needed
    };
  }, []);

  // Render PayPal button when SDK is loaded
  useEffect(() => {
    if (!scriptLoaded || !window.paypal || disabled) return;

    const buttonContainer = document.getElementById("paypal-button-container");
    if (!buttonContainer) return;

    // Clear previous buttons
    buttonContainer.innerHTML = "";

    window.paypal
      .Buttons({
        style: {
          layout: "vertical",
          color: "blue",
          shape: "rect",
          label: "paypal",
        },
        createOrder: async () => {
          try {
            setLoading(true);
            setError(null);

            const result = await paymentApi.createOrder({
              contractId,
              amount,
              description,
            });

            return result.orderId;
          } catch (err: any) {
            const errorMessage = err.message || "Failed to create order";
            setError(errorMessage);
            onError?.(errorMessage);
            throw err;
          } finally {
            setLoading(false);
          }
        },
        onApprove: async (data: any) => {
          try {
            setLoading(true);
            setError(null);

            const result = await paymentApi.captureOrder({
              orderId: data.orderID,
            });

            onSuccess?.(result.captureId);
          } catch (err: any) {
            const errorMessage = err.message || "Failed to capture payment";
            setError(errorMessage);
            onError?.(errorMessage);
          } finally {
            setLoading(false);
          }
        },
        onCancel: () => {
          setLoading(false);
          onCancel?.();
        },
        onError: (err: any) => {
          const errorMessage = err.message || "PayPal error occurred";
          setError(errorMessage);
          onError?.(errorMessage);
          setLoading(false);
        },
      })
      .render("#paypal-button-container");
  }, [scriptLoaded, contractId, amount, description, disabled]);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800 text-sm">{error}</p>
      </div>
    );
  }

  if (!scriptLoaded) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  return (
    <div>
      {loading && (
        <div className="mb-4 text-center">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-sky-600"></div>
          <p className="text-sm text-gray-600 mt-2">Procesando pago...</p>
        </div>
      )}
      <div id="paypal-button-container"></div>
    </div>
  );
}
