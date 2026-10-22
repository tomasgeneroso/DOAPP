import { useCallback, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { RotateCw, RotateCcw, ZoomIn, ZoomOut, X, Check, Loader2, Crosshair } from 'lucide-react';

interface ImageEditorModalProps {
  /** Object URL or data URL of the picked image */
  imageSrc: string;
  /** Crop aspect ratio (width / height). 1 = square avatar, 3 = wide cover. */
  aspect: number;
  /** 'round' for avatars, 'rect' for covers */
  cropShape?: 'rect' | 'round';
  title?: string;
  /**
   * true (por defecto): la proporción es la de `aspect` y no se puede cambiar (avatar, portada).
   * false: se puede elegir entre original, cuadrada, 4:3 y 16:9 (fotos de un trabajo, de una publicación).
   */
  aspectLocked?: boolean;
  /** Formato de salida: se conserva PNG si la foto era PNG (transparencias); si no, JPEG. */
  outputType?: 'image/jpeg' | 'image/png';
  /** Si se pasa, aparece «Usar original» y se llama sin tocar la foto. */
  onUseOriginal?: () => void;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
}

/** Lado más largo de la foto que se guarda: una foto de celular de 12 MP no hace falta entera para mostrarse en la app. */
const LADO_MAXIMO = 2400;
/** Lado más largo del lienzo de trabajo (los navegadores de celular fallan con lienzos de más de ~16 millones de píxeles). */
const LADO_MAXIMO_DEL_CANVAS = 4000;

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (e) => reject(e));
    image.src = url;
  });
}

function rotateSize(width: number, height: number, rotation: number) {
  const rad = (rotation * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(rad) * width) + Math.abs(Math.sin(rad) * height),
    height: Math.abs(Math.sin(rad) * width) + Math.abs(Math.cos(rad) * height),
  };
}

/** Dibuja la foto rotada y recorta la zona elegida (achicándola si es enorme). */
async function getCroppedBlob(imageSrc: string, pixelCrop: Area, rotation: number, type: 'image/jpeg' | 'image/png'): Promise<Blob> {
  const image = await createImage(imageSrc);
  const rotated = document.createElement('canvas');
  const ctx = rotated.getContext('2d');
  if (!ctx) throw new Error('No 2d context');

  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation);
  // Un celular de 48 MP no entra en un canvas de iPhone (tope ~16 MP): se trabaja con la foto achicada y el recorte se escala igual.
  const k = Math.min(1, LADO_MAXIMO_DEL_CANVAS / Math.max(bBoxWidth, bBoxHeight));
  rotated.width = Math.round(bBoxWidth * k);
  rotated.height = Math.round(bBoxHeight * k);
  pixelCrop = { x: pixelCrop.x * k, y: pixelCrop.y * k, width: pixelCrop.width * k, height: pixelCrop.height * k };
  ctx.scale(k, k);
  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  const escala = Math.min(1, LADO_MAXIMO / Math.max(pixelCrop.width, pixelCrop.height));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(pixelCrop.width * escala));
  out.height = Math.max(1, Math.round(pixelCrop.height * escala));
  const octx = out.getContext('2d');
  if (!octx) throw new Error('No 2d context');
  if (type === 'image/jpeg') {
    // JPEG no tiene transparencia: sin esto un PNG con fondo transparente quedaría negro.
    octx.fillStyle = '#fff';
    octx.fillRect(0, 0, out.width, out.height);
  }
  octx.drawImage(rotated, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, out.width, out.height);

  return new Promise((resolve, reject) => {
    out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas is empty'))), type, type === 'image/jpeg' ? 0.9 : undefined);
  });
}

type Proporcion = 'orig' | '1:1' | '4:3' | '16:9';
const PROPORCIONES: Array<{ id: Proporcion; label: string; valor?: number }> = [
  { id: 'orig', label: 'Original' },
  { id: '1:1', label: '1:1', valor: 1 },
  { id: '4:3', label: '4:3', valor: 4 / 3 },
  { id: '16:9', label: '16:9', valor: 16 / 9 },
];

export default function ImageEditorModal({
  imageSrc,
  aspect,
  cropShape = 'rect',
  title = 'Editar imagen',
  aspectLocked = true,
  outputType = 'image/jpeg',
  onUseOriginal,
  onCancel,
  onConfirm,
}: ImageEditorModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [proporcion, setProporcion] = useState<Proporcion>('orig');
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  // Con proporción «original» el recorte es la foto entera (girada, si se giró): se puede mover y acercar pero no se pierde nada de entrada.
  const girada = rotation % 180 !== 0;
  const aspectActual = aspectLocked
    ? aspect
    : proporcion === 'orig'
      ? natural ? (girada ? natural.h / natural.w : natural.w / natural.h) : aspect
      : PROPORCIONES.find((p) => p.id === proporcion)?.valor ?? aspect;

  const centrar = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels, rotation, outputType);
      await onConfirm(blob);
    } catch (err) {
      console.error('Error cropping image:', err);
      setSaving(false);
    }
  };

  const boton =
    'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50';

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-800 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button
            onClick={onCancel}
            disabled={saving}
            className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cropper area */}
        <div className="relative h-72 sm:h-80 bg-slate-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspectActual}
            cropShape={cropShape}
            showGrid={cropShape === 'rect'}
            minZoom={1}
            maxZoom={4}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
            onMediaLoaded={(m) => setNatural({ w: m.naturalWidth, h: m.naturalHeight })}
          />
        </div>

        {/* Controls */}
        <div className="px-5 py-4 space-y-4">
          {!aspectLocked && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Proporción">
              {PROPORCIONES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProporcion(p.id);
                    centrar();
                  }}
                  aria-pressed={proporcion === p.id}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    proporcion === p.id
                      ? 'bg-sky-500 border-sky-500 text-white'
                      : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="range"
              min={1}
              max={4}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-sky-500"
              aria-label="Zoom"
            />
            <ZoomIn className="w-4 h-4 text-slate-400 shrink-0" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setRotation((r) => (r + 270) % 360)} className={boton} aria-label="Rotar a la izquierda">
              <RotateCcw className="w-4 h-4" />
              Izquierda
            </button>
            <button type="button" onClick={() => setRotation((r) => (r + 90) % 360)} className={boton} aria-label="Rotar a la derecha">
              <RotateCw className="w-4 h-4" />
              Derecha
            </button>
            <button type="button" onClick={centrar} className={boton}>
              <Crosshair className="w-4 h-4" />
              Centrar
            </button>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              onClick={onCancel}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium disabled:opacity-50"
            >
              Cancelar
            </button>
            {onUseOriginal && (
              <button
                onClick={onUseOriginal}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium disabled:opacity-50"
              >
                Usar original
              </button>
            )}
            <button
              onClick={handleConfirm}
              disabled={saving || !croppedAreaPixels}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium disabled:opacity-60"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
