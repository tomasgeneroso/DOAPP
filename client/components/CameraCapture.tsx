import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Camera, SwitchCamera, AlertCircle } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
  label?: string;
}

export default function CameraCapture({ onCapture, onClose, label = 'Foto' }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);

  const startCamera = async (mode: 'environment' | 'user') => {
    // Stop any existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setReady(false);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setReady(true);
        };
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Permiso de cámara denegado. Habilitá el acceso en la configuración del navegador.');
      } else if (err.name === 'NotFoundError') {
        setError('No se encontró ninguna cámara en este dispositivo.');
      } else if (mode === 'environment') {
        // Fallback to any available camera
        startCamera('user');
      } else {
        setError('No se pudo acceder a la cámara: ' + err.message);
      }
    }
  };

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFlip = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    startCamera(next);
  };

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current || !ready) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `${label.replace(/\s/g, '_')}_${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
        onClose();
      },
      'image/jpeg',
      0.92,
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <span className="text-white font-semibold text-sm">{label}</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleFlip}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
            title="Cambiar cámara"
          >
            <SwitchCamera className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Camera view */}
      <div className="flex-1 relative flex items-center justify-center bg-black overflow-hidden">
        {error ? (
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <AlertCircle className="w-12 h-12 text-red-400" />
            <p className="text-white text-sm">{error}</p>
            <button
              type="button"
              onClick={() => startCamera(facingMode)}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-sm transition"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
            />
            {/* DNI guide overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="border-2 border-white/70 rounded-lg"
                style={{ width: '85%', aspectRatio: '1.58 / 1' }}
              >
                <div className="absolute -top-5 left-0 right-0 text-center">
                  <span className="text-white text-xs bg-black/50 px-2 py-0.5 rounded">
                    Encuadrá el DNI dentro del rectángulo
                  </span>
                </div>
                {/* Corner marks */}
                {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map(pos => (
                  <div key={pos} className={`absolute ${pos} w-5 h-5 border-white`}
                    style={{
                      borderTopWidth: pos.includes('top') ? 3 : 0,
                      borderBottomWidth: pos.includes('bottom') ? 3 : 0,
                      borderLeftWidth: pos.includes('left') ? 3 : 0,
                      borderRightWidth: pos.includes('right') ? 3 : 0,
                    }}
                  />
                ))}
              </div>
            </div>
            {!ready && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </>
        )}
      </div>

      {/* Capture button */}
      <div className="flex items-center justify-center py-6 bg-black/80">
        <button
          type="button"
          onClick={handleCapture}
          disabled={!ready || !!error}
          className="w-16 h-16 rounded-full bg-white hover:bg-gray-100 disabled:opacity-40 flex items-center justify-center shadow-lg transition active:scale-95"
        >
          <Camera className="w-8 h-8 text-black" />
        </button>
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>,
    document.body,
  );
}
