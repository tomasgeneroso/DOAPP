import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface ImageViewerModalProps {
  open: boolean;
  src: string;
  alt?: string;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const STEP = 0.5;

/**
 * Full-screen image lightbox with zoom & pan that stays CONTAINED inside the
 * modal: the image lives in an `overflow-hidden` viewport, so zooming never
 * spills onto the page. Zoom with the wheel, the +/- buttons, or double-click;
 * pan by dragging once zoomed in. Close with X, the backdrop, or Escape.
 */
export default function ImageViewerModal({ open, src, alt = '', onClose }: ImageViewerModalProps) {
  const { t } = useTranslation();
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Reset transform whenever a new image opens.
  useEffect(() => {
    if (open) reset();
  }, [open, src, reset]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const clamp = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));

  const zoomTo = useCallback((next: number) => {
    const s = clamp(next);
    setScale(s);
    if (s === 1) setOffset({ x: 0, y: 0 }); // recenter when fully zoomed out
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomTo(scale + (e.deltaY < 0 ? STEP : -STEP));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return;
    dragging.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setOffset({
      x: dragging.current.ox + (e.clientX - dragging.current.startX),
      y: dragging.current.oy + (e.clientY - dragging.current.startY),
    });
  };

  const onPointerUp = () => {
    dragging.current = null;
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      {/* Toolbar */}
      <div
        className="absolute top-3 right-3 z-10 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => zoomTo(scale - STEP)}
          disabled={scale <= MIN_SCALE}
          title={t('imageViewer.zoomOut', 'Alejar')}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-40"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <span className="min-w-[3.5rem] text-center text-sm font-medium text-white/80 tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => zoomTo(scale + STEP)}
          disabled={scale >= MAX_SCALE}
          title={t('imageViewer.zoomIn', 'Acercar')}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-40"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
        <button
          onClick={reset}
          disabled={scale === 1 && offset.x === 0 && offset.y === 0}
          title={t('imageViewer.reset', 'Restablecer')}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-40"
        >
          <RotateCcw className="h-5 w-5" />
        </button>
        <button
          onClick={onClose}
          title={t('common.close', 'Cerrar')}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Bounded viewport: zoom is clipped here, never on the page */}
      <div
        ref={viewportRef}
        className="relative flex h-[92vh] w-[92vw] items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
        onDoubleClick={() => zoomTo(scale >= MAX_SCALE ? 1 : scale + 1)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ cursor: scale > 1 ? (dragging.current ? 'grabbing' : 'grab') : 'auto', touchAction: 'none' }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain will-change-transform"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transition: dragging.current ? 'none' : 'transform 0.15s ease-out',
          }}
        />
      </div>
    </div>
  );
}
