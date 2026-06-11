import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Cropper, { Area } from 'react-easy-crop';
import { RotateCw, ZoomIn, ZoomOut, X, Check, Loader2 } from 'lucide-react';

interface ImageEditorModalProps {
  /** Object URL or data URL of the picked image */
  imageSrc: string;
  /** Crop aspect ratio (width / height). 1 = square avatar, 3 = wide cover. */
  aspect: number;
  /** 'round' for avatars, 'rect' for covers */
  cropShape?: 'rect' | 'round';
  title?: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void | Promise<void>;
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
  const { t } = useTranslation();
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

/** Renders the rotated image to a canvas and extracts the cropped region as a JPEG blob. */
async function getCroppedBlob(imageSrc: string, pixelCrop: Area, rotation: number): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');

  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(image.width, image.height, rotation);
  canvas.width = bBoxWidth;
  canvas.height = bBoxHeight;

  ctx.translate(bBoxWidth / 2, bBoxHeight / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-image.width / 2, -image.height / 2);
  ctx.drawImage(image, 0, 0);

  const data = ctx.getImageData(pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height);
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.putImageData(data, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas is empty'))),
      'image/jpeg',
      0.92,
    );
  });
}

export default function ImageEditorModal({
  imageSrc,
  aspect,
  cropShape = 'rect',
  title = 'Editar imagen',
  onCancel,
  onConfirm,
}: ImageEditorModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedAreaPixels) return;
    setSaving(true);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels, rotation);
      await onConfirm(blob);
    } catch (err) {
      console.error('Error cropping image:', err);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 p-4">
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
        <div className="relative h-72 bg-slate-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            cropShape={cropShape}
            showGrid={cropShape === 'rect'}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Controls */}
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-sky-500"
              aria-label="Zoom"
            />
            <ZoomIn className="w-4 h-4 text-slate-400 shrink-0" />
            <button
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="ml-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              <RotateCw className="w-4 h-4" />
              Rotar
            </button>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-sm font-medium disabled:opacity-50"
            >
              Cancelar
            </button>
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
