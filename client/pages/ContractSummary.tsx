import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../hooks/useAuth";
import {
  ArrowLeft,
  Calendar,
  Clock,
  DollarSign,
  User,
  FileText,
  AlertCircle,
  Check,
  Loader2,
  CreditCard,
} from "lucide-react";

interface Contract {
  _id: string;
  job: {
    _id: string;
    title: string;
    description: string;
    startDate: string;
    endDate: string;
  };
  client: {
    _id: string;
    name: string;
    avatar: string;
    email: string;
  };
  doer: {
    _id: string;
    name: string;
    avatar: string;
    email: string;
  };
  price: number;
  commission: number;
  commissionPercentage?: number;
  totalPrice: number;
  status: string;
  startDate: string;
  endDate: string;
  createdAt: string;
}

export default function ContractSummary() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadContract();
    }
  }, [id]);

  const loadContract = async () => {
    try {
      const response = await fetch(`/api/contracts/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setContract(data.contract);
      } else {
        setError(data.message || "No se pudo cargar el contrato");
      }
    } catch (error) {
      console.error("Error loading contract:", error);
      setError("Error al cargar el contrato");
    } finally {
      setLoading(false);
    }
  };

  const handleProceedToPayment = async () => {
    if (!contract) return;

    setProcessingPayment(true);
    setError(null);

    try {
      // Create MercadoPago payment preference
      const response = await fetch(`/api/payments/contract/${contract._id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success && data.paymentUrl) {
        // Redirect to MercadoPago
        window.location.href = data.paymentUrl;
      } else {
        setError(data.message || "Error al procesar el pago");
      }
    } catch (error: any) {
      console.error("Error processing payment:", error);
      setError(error.message || "Error al procesar el pago");
    } finally {
      setProcessingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
            {error || "Contrato no encontrado"}
          </h2>
          <button
            onClick={() => navigate("/contracts")}
            className="mt-4 text-sky-600 hover:text-sky-700 dark:text-sky-400"
          >
            Volver a Contratos
          </button>
        </div>
      </div>
    );
  }

  const isClient = contract.client._id === user?._id;
  const otherParty = isClient ? contract.doer : contract.client;
  const commissionRate = contract.commission > 0 ? ((contract.commission / contract.price) * 100).toFixed(0) : "0";
  const isFreeContract = contract.commission === 0;

  return (
    <>
      <Helmet>
        <title>Resumen del Contrato - Do</title>
      </Helmet>

      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6">
            <button
              onClick={() => navigate("/contracts")}
              className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver a contratos
            </button>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Resumen del Contrato
            </h1>
            <p className="mt-2 text-slate-600 dark:text-slate-400">
              Revisa los detalles y procede al pago con escrow
            </p>
          </div>

          {/* Success Banner */}
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-green-900 dark:text-green-100">
                  ¡Contrato creado exitosamente!
                </h3>
                <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                  El contrato ha sido creado. Ahora debes realizar el pago para activar el servicio de escrow.
                </p>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            {/* Job Info */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-2">
                <FileText className="h-4 w-4" />
                Trabajo
              </div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {contract.job.title}
              </h2>
            </div>

            {/* Participants */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Client */}
              <div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-3">
                  <User className="h-4 w-4" />
                  Cliente
                </div>
                <div className="flex items-center gap-3">
                  {contract.client.avatar ? (
                    <img
                      src={contract.client.avatar}
                      alt={contract.client.name}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                      <User className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {contract.client.name}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {contract.client.email}
                    </p>
                  </div>
                </div>
              </div>

              {/* Doer */}
              <div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-3">
                  <User className="h-4 w-4" />
                  Freelancer
                </div>
                <div className="flex items-center gap-3">
                  {contract.doer.avatar ? (
                    <img
                      src={contract.doer.avatar}
                      alt={contract.doer.name}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                      <User className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {contract.doer.name}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {contract.doer.email}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-2">
                  <Calendar className="h-4 w-4" />
                  Fecha de inicio
                </div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {new Date(contract.startDate).toLocaleDateString("es-AR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              <div>
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-2">
                  <Clock className="h-4 w-4" />
                  Fecha de finalización
                </div>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {new Date(contract.endDate).toLocaleDateString("es-AR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>

            {/* Price Breakdown */}
            <div className="p-6 bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-4">
                <DollarSign className="h-4 w-4" />
                Desglose de costos
              </div>

              {/* Warning for contracts below minimum */}
              {contract.price < 8000 && contract.commission > 0 && (
                <div className="mb-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-orange-800 dark:text-orange-300">
                      <p className="font-semibold mb-1">Mínimo de contrato</p>
                      <p>
                        El precio del servicio es menor a $8,000 ARS. Se aplica una comisión mínima de $1,000 ARS.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {/* Service Price */}
                <div className="flex justify-between items-center">
                  <span className="text-slate-700 dark:text-slate-300">
                    Precio del servicio
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    ${contract.price.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS
                  </span>
                </div>

                {/* Platform Commission */}
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className="text-slate-700 dark:text-slate-300">
                      Comisión de plataforma ({contract.commissionPercentage || 8}%)
                      {contract.commission === 0 && (
                        <span className="ml-2 text-xs text-green-600 dark:text-green-400 font-semibold">
                          ¡GRATIS!
                        </span>
                      )}
                    </span>
                    {contract.price < 8000 && contract.commission > 0 && (
                      <span className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                        * Comisión mínima de $1,000 ARS
                      </span>
                    )}
                  </div>
                  <span className={`font-semibold ${contract.commission === 0 ? 'text-green-600 dark:text-green-400 line-through' : 'text-slate-900 dark:text-white'}`}>
                    ${contract.commission.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS
                  </span>
                </div>

                {/* Total */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                  <span className="text-lg font-semibold text-slate-900 dark:text-white">
                    Total a pagar
                  </span>
                  <span className="text-2xl font-bold text-sky-600 dark:text-sky-400">
                    ${contract.totalPrice.toLocaleString("es-AR", { minimumFractionDigits: 2 })} ARS
                  </span>
                </div>
              </div>

              {/* Membership Info */}
              {user && (
                <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                  <div className="text-sm">
                    <p className="font-semibold text-purple-900 dark:text-purple-100 mb-2">
                      {user.membershipTier === 'super_pro' && '🌟 Membresía SUPER PRO - Comisión 2%'}
                      {user.membershipTier === 'pro' && '👑 Membresía PRO - Comisión 3%'}
                      {(!user.membershipTier || user.membershipTier === 'free') && '💼 Usuario FREE - Comisión 8%'}
                    </p>
                    <p className="text-purple-700 dark:text-purple-300">
                      {user.membershipTier === 'super_pro' && 'Disfrutas de la comisión más baja de la plataforma.'}
                      {user.membershipTier === 'pro' && 'Tienes una comisión reducida gracias a tu membresía.'}
                      {(!user.membershipTier || user.membershipTier === 'free') && (
                        <>
                          Actualiza a PRO (3%) o SUPER PRO (2%) para reducir tus comisiones.{' '}
                          <Link to="/settings?tab=membership" className="underline font-semibold">
                            Ver planes
                          </Link>
                        </>
                      )}
                    </p>
                    {(user.freeContractsRemaining ?? 0) > 0 && (
                      <p className="mt-2 text-green-700 dark:text-green-300 font-semibold">
                        ✨ Tienes {user.freeContractsRemaining} contrato{(user.freeContractsRemaining ?? 0) > 1 ? 's' : ''} gratis disponible{(user.freeContractsRemaining ?? 0) > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Escrow Info */}
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                      Pago con Escrow (Garantía)
                    </p>
                    <p className="text-blue-700 dark:text-blue-300">
                      El dinero se retendrá de forma segura hasta que ambas partes confirmen
                      que el trabajo fue completado satisfactoriamente.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            {isClient && (
              <div className="p-6">
                <button
                  onClick={handleProceedToPayment}
                  disabled={processingPayment}
                  className="w-full bg-sky-600 hover:bg-sky-700 disabled:bg-slate-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                >
                  {processingPayment ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-5 w-5" />
                      Proceder al Pago con MercadoPago
                    </>
                  )}
                </button>

                <p className="mt-3 text-xs text-center text-slate-500 dark:text-slate-400">
                  Al hacer clic, serás redirigido a MercadoPago para completar el pago de forma segura
                </p>
              </div>
            )}

            {!isClient && (
              <div className="p-6">
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                        Esperando pago del cliente
                      </p>
                      <p className="text-amber-700 dark:text-amber-300">
                        El cliente debe realizar el pago para activar el contrato. Recibirás una
                        notificación cuando el pago sea confirmado.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Next Steps */}
          <div className="mt-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Próximos pasos
            </h3>
            <ol className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                  <span className="text-xs font-bold text-sky-600 dark:text-sky-400">1</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {isClient ? "Realiza" : "El cliente realiza"} el pago a través de MercadoPago
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                  <span className="text-xs font-bold text-sky-600 dark:text-sky-400">2</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  El dinero se retiene en escrow (garantía) de forma segura
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                  <span className="text-xs font-bold text-sky-600 dark:text-sky-400">3</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  El freelancer realiza el trabajo según lo acordado
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                  <span className="text-xs font-bold text-sky-600 dark:text-sky-400">4</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Ambas partes confirman que el trabajo fue completado satisfactoriamente
                </p>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center">
                  <span className="text-xs font-bold text-sky-600 dark:text-sky-400">5</span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  El dinero se libera al freelancer automáticamente
                </p>
              </li>
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
