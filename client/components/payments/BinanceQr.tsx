import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * QR for the platform's Binance Pay ID.
 *
 * Generated locally — no merchant API involved. Until the Binance Pay merchant
 * account exists there is no order to encode, so this carries the payee ID
 * itself: the user scans instead of hand-copying a long numeric ID into another
 * app, which is where the current manual flow loses people.
 *
 * Deliberately NOT a `bnc://` deeplink: those belong to a real Binance Pay
 * order and inventing one would produce a link that silently fails.
 */
export default function BinanceQr({ value, label }: { value: string; label?: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: 320, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [value]);

  // The copyable field is always on screen, so a QR failure is not worth an
  // error state — just render nothing.
  if (failed || !dataUrl) return null;

  return (
    <div className="flex flex-col items-center gap-2 pt-1">
      <div className="rounded-xl bg-white p-2 border border-slate-200 dark:border-slate-700">
        <img src={dataUrl} alt={label || 'QR Binance'} className="h-32 w-32" />
      </div>
      {label && <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>}
    </div>
  );
}
