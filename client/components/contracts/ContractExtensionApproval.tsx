import React, { useState } from 'react';
import { Contract, User } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Button from '../ui/Button';
import Textarea from '../ui/Textarea';

interface ContractExtensionApprovalProps {
  contract: Contract;
  onSuccess: () => void;
}

export default function ContractExtensionApproval({
  contract,
  onSuccess,
}: ContractExtensionApprovalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [showRejectForm, setShowRejectForm] = useState(false);

  if (!contract.extensionRequestedBy || contract.extensionApprovedBy) {
    return null;
  }

  const isRequester = contract.extensionRequestedBy === user?._id;
  if (isRequester) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <p className="text-yellow-800 dark:text-yellow-200 text-sm">
          ⏳ Esperando aprobación de la otra parte para la extensión solicitada...
        </p>
      </div>
    );
  }

  const handleApprove = async () => {
    setError(null);
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/contracts/${contract._id}/approve-extension`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al aprobar extensión');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setError(null);
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/contracts/${contract._id}/reject-extension`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: rejectionReason }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al rechazar extensión');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const requesterName = typeof contract.client === 'object' && contract.extensionRequestedBy === contract.client._id
    ? contract.client.name
    : typeof contract.doer === 'object' && contract.extensionRequestedBy === (contract.doer as User)._id
    ? (contract.doer as User).name
    : 'La otra parte';

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 border-2 border-blue-500">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
            Solicitud de Extensión de Contrato
          </h3>

          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <p>
              <strong>{requesterName}</strong> solicita extender el contrato:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li><strong>Días adicionales:</strong> {contract.extensionDays} días</li>
              {contract.extensionAmount && contract.extensionAmount > 0 && (
                <li><strong>Monto adicional:</strong> ${contract.extensionAmount?.toLocaleString('es-AR')} ARS</li>
              )}
              <li>
                <strong>Nueva fecha de fin:</strong>{' '}
                {contract.originalEndDate && contract.extensionDays
                  ? new Date(new Date(contract.originalEndDate).getTime() + contract.extensionDays * 24 * 60 * 60 * 1000).toLocaleDateString('es-AR')
                  : 'N/A'}
              </li>
            </ul>
            {contract.extensionNotes && (
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notas:</p>
                <p className="text-sm">{contract.extensionNotes}</p>
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {!showRejectForm ? (
            <div className="mt-4 flex gap-3">
              <Button
                variant="primary"
                onClick={handleApprove}
                disabled={loading}
                className="flex-1"
              >
                {loading ? 'Procesando...' : 'Aprobar Extensión'}
              </Button>
              <Button
                variant="error"
                onClick={() => setShowRejectForm(true)}
                disabled={loading}
                className="flex-1"
              >
                Rechazar
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explica por qué rechazas la extensión..."
                rows={3}
              />
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setShowRejectForm(false)}
                  disabled={loading}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  variant="error"
                  onClick={handleReject}
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? 'Procesando...' : 'Confirmar Rechazo'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
