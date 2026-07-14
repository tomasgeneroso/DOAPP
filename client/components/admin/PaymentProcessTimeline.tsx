import { CheckCircle, Circle, Loader2, Clock, X, ArrowRight } from 'lucide-react';

interface Step {
  key: string;
  label: string;
  description: string;
  done: boolean;
  current: boolean;
  at?: string | null;
  by?: string | null;
}

interface Props {
  payment: any;
  busy?: boolean;
  onVerify: (payment: any) => void;      // pending_verification -> verified
  onEscrow: (paymentId: string) => void; // verified -> held_escrow
  onPayout: (paymentId: string) => void; // held_escrow -> confirmed_for_payout
  onReject: (payment: any) => void;
  onViewProof: (payment: any) => void;
  onClose: () => void;
}

const ORDER = ['pending_verification', 'verified', 'held_escrow', 'confirmed_for_payout', 'completed'];

export default function PaymentProcessTimeline({ payment, busy, onVerify, onEscrow, onPayout, onReject, onViewProof, onClose }: Props) {
  const status: string = payment?.status || 'pending_verification';
  const rank = (s: string) => {
    const i = ORDER.indexOf(s);
    return i === -1 ? 0 : i;
  };
  const cur = rank(status);
  const proof = payment?.proofs?.[0];
  const isRejected = status === 'rejected';

  const steps: Step[] = [
    {
      key: 'created',
      label: 'Pago iniciado',
      description: 'El cliente generó el pago (MercadoPago o transferencia).',
      done: true,
      current: false,
      at: payment?.createdAt,
    },
    {
      key: 'proof',
      label: 'Comprobante recibido',
      description: 'El cliente subió el comprobante de la transferencia.',
      done: !!proof || cur >= rank('verified'),
      current: false,
      at: proof?.uploadedAt,
    },
    {
      key: 'verified',
      label: 'Comprobante verificado',
      description: 'Un admin confirmó que el pago fue efectivamente recibido en la cuenta.',
      done: cur >= rank('verified'),
      current: status === 'pending_verification',
      at: proof?.verifiedAt,
    },
    {
      key: 'held_escrow',
      label: 'En escrow',
      description: 'Los fondos quedan retenidos en escrow hasta completar y confirmar el trabajo.',
      done: cur >= rank('held_escrow'),
      current: status === 'verified',
    },
    {
      key: 'confirmed_for_payout',
      label: 'Confirmado para pago',
      description: 'Listo para transferir al trabajador (aparece en Pagos a Trabajadores).',
      done: cur >= rank('confirmed_for_payout'),
      current: status === 'held_escrow',
    },
    {
      key: 'completed',
      label: 'Completado',
      description: 'El flujo del pago finalizó.',
      done: status === 'completed',
      current: status === 'confirmed_for_payout',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Proceso del pago</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {payment?.payer?.name || 'Cliente'} · ${Number(payment?.amount || 0).toLocaleString('es-AR')} ARS
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {isRejected && (
            <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300">
              Este pago fue <strong>rechazado</strong>. {payment?.adminNotes || ''}
            </div>
          )}

          <ol className="relative border-l border-gray-200 dark:border-gray-700 ml-3">
            {steps.map((s) => (
              <li key={s.key} className="mb-6 ml-6">
                <span className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full ring-4 ring-white dark:ring-gray-800 ${
                  s.done ? 'bg-green-500' : s.current ? 'bg-sky-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}>
                  {s.done ? <CheckCircle className="w-4 h-4 text-white" /> : s.current ? <Clock className="w-3.5 h-3.5 text-white" /> : <Circle className="w-3 h-3 text-white" />}
                </span>
                <div className="flex items-center gap-2">
                  <h4 className={`text-sm font-semibold ${s.current ? 'text-sky-700 dark:text-sky-300' : 'text-gray-900 dark:text-white'}`}>{s.label}</h4>
                  {s.current && <span className="text-[10px] uppercase font-bold tracking-wide text-sky-600 dark:text-sky-400">Actual</span>}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.description}</p>
                {s.at && <p className="text-[11px] text-gray-400 mt-0.5">{new Date(s.at).toLocaleString('es-AR')}</p>}

                {/* Attached proof at the verification step — opens the in-app viewer */}
                {s.key === 'proof' && proof && (
                  <button type="button" onClick={() => onViewProof(payment)} className="mt-1 inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:underline">
                    Ver comprobante <ArrowRight className="w-3 h-3" />
                  </button>
                )}

                {/* Inline action for the current step */}
                {s.current && !isRejected && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {status === 'pending_verification' && (
                      <>
                        <button onClick={() => onVerify(payment)} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-green-600 hover:bg-green-700 text-white disabled:opacity-50">
                          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />} Verificar comprobante
                        </button>
                        <button onClick={() => onReject(payment)} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                          <X className="w-3.5 h-3.5" /> Rechazar
                        </button>
                      </>
                    )}
                    {status === 'verified' && (
                      <button onClick={() => onEscrow(payment.id)} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />} Pasar a escrow
                      </button>
                    )}
                    {status === 'held_escrow' && (
                      <button onClick={() => onPayout(payment.id)} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50">
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />} Confirmar para pago
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>

          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Para supervisión al detalle o consultas específicas, usá las tablas de esta sección.
          </p>
        </div>
      </div>
    </div>
  );
}
