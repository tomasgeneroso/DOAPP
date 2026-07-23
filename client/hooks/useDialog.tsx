import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import ConfirmModal, { ConfirmModalTone } from '@/components/ui/ConfirmModal';

interface ConfirmOptions {
  title?: string;
  message: string;
  tone?: ConfirmModalTone;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
}

interface DialogState {
  tone: ConfirmModalTone;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void | Promise<void>;
  acknowledge?: boolean;
}

/**
 * Drop-in replacement for the native `alert()` / `confirm()`.
 *
 *   const { notify, confirm, dialog } = useDialog();
 *   notify('Something went wrong');                      // was: alert(...)
 *   confirm({ message: 'Delete?', onConfirm: doDelete }); // was: if (confirm(...))
 *
 * Render `{dialog}` anywhere in the component's tree.
 */
export function useDialog() {
  const { t } = useTranslation();
  const [state, setState] = useState<DialogState | null>(null);
  const [loading, setLoading] = useState(false);

  const notify = useCallback(
    (message: string, tone: ConfirmModalTone = 'danger') =>
      setState({
        tone,
        title: t(tone === 'success' ? 'common.important' : 'common.attention', tone === 'success' ? 'Listo' : 'Atención'),
        message,
        acknowledge: true,
      }),
    [t],
  );

  const confirm = useCallback((opts: ConfirmOptions) => {
    setState({
      tone: opts.tone || 'warning',
      title: opts.title || '',
      message: opts.message,
      confirmLabel: opts.confirmLabel,
      cancelLabel: opts.cancelLabel,
      onConfirm: opts.onConfirm,
    });
  }, []);

  const close = useCallback(() => {
    setState(null);
    setLoading(false);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!state?.onConfirm) {
      close();
      return;
    }
    setLoading(true);
    try {
      await state.onConfirm();
    } finally {
      setState(null);
      setLoading(false);
    }
  }, [state, close]);

  const dialog = (
    <ConfirmModal
      open={!!state}
      tone={state?.tone || 'warning'}
      title={state?.title || ''}
      message={state?.message || ''}
      loading={loading}
      confirmLabel={state?.acknowledge ? t('common.accept', 'Aceptar') : state?.confirmLabel}
      cancelLabel={state?.cancelLabel}
      hideCancel={state?.acknowledge}
      onConfirm={handleConfirm}
      onClose={close}
    />
  );

  return { notify, confirm, dialog, closeDialog: close };
}

export default useDialog;
