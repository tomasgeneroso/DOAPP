import { useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';

/**
 * El botón de emojis del chat (reporte del dueño, 2026-11-19: «no funcionan los iconos del chat»: el botón de la carita no hacía nada). Abre una grilla de emojis comunes y
 * agrega el elegido al mensaje. Con teclado: Enter abre, las flechas ya no hacen falta (cada emoji es un botón) y Escape cierra; tocar afuera también cierra.
 */
const EMOJIS = [
  '😀', '😁', '😂', '🙂', '😉', '😊', '😍', '🤝', '🙌', '👏', '👍', '👌', '🙏', '💪', '👋', '🤔',
  '😅', '😬', '😢', '😮', '😴', '🤞', '✅', '❌', '⚠️', '⭐', '🔥', '🎉', '💬', '📅', '⏰', '📍',
  '💰', '🧾', '📷', '📎', '🔧', '🛠️', '🏠', '🚗', '🧹', '🎨', '💡', '🌿', '☀️', '🌧️', '❤️', '😎',
];

export default function SelectorDeEmojis({ alElegir, className = '' }: { alElegir: (emoji: string) => void; className?: string }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alTocarAfuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('pointerdown', alTocarAfuera);
    document.addEventListener('keydown', alTeclear);
    return () => {
      document.removeEventListener('pointerdown', alTocarAfuera);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [abierto]);

  return (
    <div ref={caja} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Insertar emoji"
        aria-expanded={abierto}
        aria-haspopup="true"
        data-testid="boton-de-emojis"
        className="rounded-full p-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
      >
        <Smile className="h-5 w-5 text-slate-600 dark:text-slate-400" />
      </button>
      {abierto && (
        <div role="menu" aria-label="Emojis" className="absolute bottom-full left-0 z-30 mb-2 grid w-64 grid-cols-8 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-600 dark:bg-slate-800" data-testid="panel-de-emojis">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              role="menuitem"
              onClick={() => {
                alElegir(e);
                setAbierto(false);
              }}
              className="rounded-md p-1 text-xl hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
