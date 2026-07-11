import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * Compact, copyable ID shown in admin tables. Renders a truncated monospace id
 * with a copy button; clicking copies the full id to the clipboard.
 */
export default function IdBadge({ id, className = '' }: { id?: string | null; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!id) return null;
  const short = id.length > 10 ? `${id.slice(0, 8)}…` : id;

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard may be unavailable */
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copiar ID: ${id}`}
      className={`inline-flex items-center gap-1 font-mono text-[11px] text-gray-400 hover:text-sky-500 transition-colors ${className}`}
    >
      <span>{short}</span>
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 opacity-60" />}
    </button>
  );
}
