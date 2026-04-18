import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        throw new Error(data.message || t('contracts.errorRequestingExtension', 'Error requesting extension'));
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
          {t('contracts.alreadyExtended', 'This contract has already been extended. Only 1 extension per contract is allowed. If you need more time, you must create a new contract.')}
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
        {t('contracts.requestExtension', 'Request Contract Extension')}
      </h3>

      <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          <strong>{t('common.important', 'Important')}:</strong> {t('contracts.extensionLimit', 'You can only extend this contract once. If you need more extensions, you must create a new contract.')}
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
            {t('contracts.extensionDays', 'Extension days')} *
          </label>
          <Input
            type="number"
            min="1"
            value={extensionDays}
            onChange={(e) => setExtensionDays(Number(e.target.value))}
            required
            placeholder={t('common.egNumber', 'E.g.: 7')}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('contracts.newEndDate', 'New end date')}: {new Date(new Date(contract.endDate).getTime() + extensionDays * 24 * 60 * 60 * 1000).toLocaleDateString('es-AR')}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('contracts.additionalAmountOptional', 'Additional amount (optional)')}
          </label>
          <Input
            type="number"
            min="0"
            value={extensionAmount}
            onChange={(e) => setExtensionAmount(Number(e.target.value))}
            placeholder={t('common.egAmount', 'E.g.: 5000')}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('contracts.additionalPaymentHint', 'If the extension requires additional payment, specify it here (ARS)')}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('contracts.notesOptional', 'Notes (optional)')}
          </label>
          <Textarea
            value={extensionNotes}
            onChange={(e) => setExtensionNotes(e.target.value)}
            placeholder={t('contracts.extensionReasonPlaceholder', 'Explain why you need the extension...')}
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
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={loading}
          >
            {loading ? t('common.sending', 'Sending...') : t('contracts.requestExtension', 'Request Extension')}
          </Button>
        </div>
      </form>
    </div>
  );
}
