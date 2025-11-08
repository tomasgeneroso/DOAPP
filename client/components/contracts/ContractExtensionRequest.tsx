import React, { useState } from 'react';
import { Contract } from '../../types';
import { useAuth } from '../../hooks/useAuth';
import Input from '../ui/Input';
import Textarea from '../ui/Textarea';
import Button from '../ui/Button';

interface ContractExtensionRequestProps {
  contract: Contract;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ContractExtensionRequest({
  contract,
  onSuccess,
  onCancel,
}: ContractExtensionRequestProps) {
  const { user } = useAuth();
  const [extensionDays, setExtensionDays] = useState<number>(1);
  const [extensionAmount, setExtensionAmount] = useState<number>(0);
  const [extensionNotes, setExtensionNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/contracts/${contract._id}/request-extension`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          extensionDays,
          extensionAmount: extensionAmount || 0,
          extensionNotes,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error al solicitar extensión');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (contract.hasBeenExtended) {
    return (
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
        <p className="text-yellow-800 dark:text-yellow-200">
          Este contrato ya fue extendido. Solo se permite 1 extensión por contrato.
          Si necesitas más tiempo, debes crear un nuevo contrato.
        </p>
      </div>
    );
  }

  const isClient = typeof contract.client === 'object'
    ? contract.client._id === user?._id
    : contract.client === user?._id;
  const isDoer = typeof contract.doer === 'object'
    ? contract.doer._id === user?._id
    : contract.doer === user?._id;

  if (!isClient && !isDoer) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
        Solicitar Extensión de Contrato
      </h3>

      <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>Importante:</strong> Solo puedes extender este contrato 1 vez.
          Si necesitas más extensiones, deberás crear un nuevo contrato.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Días de extensión *
          </label>
          <Input
            type="number"
            min="1"
            value={extensionDays}
            onChange={(e) => setExtensionDays(Number(e.target.value))}
            required
            placeholder="Ej: 7"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Nueva fecha de fin: {new Date(new Date(contract.endDate).getTime() + extensionDays * 24 * 60 * 60 * 1000).toLocaleDateString('es-AR')}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Monto adicional (opcional)
          </label>
          <Input
            type="number"
            min="0"
            value={extensionAmount}
            onChange={(e) => setExtensionAmount(Number(e.target.value))}
            placeholder="Ej: 5000"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Si la extensión requiere pago adicional, especifícalo aquí (ARS)
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Notas (opcional)
          </label>
          <Textarea
            value={extensionNotes}
            onChange={(e) => setExtensionNotes(e.target.value)}
            placeholder="Explica por qué necesitas la extensión..."
            rows={3}
          />
        </div>

        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={loading}
          >
            {loading ? 'Enviando...' : 'Solicitar Extensión'}
          </Button>
        </div>
      </form>
    </div>
  );
}
