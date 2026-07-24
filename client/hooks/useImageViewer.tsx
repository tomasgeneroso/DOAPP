import { useState, useCallback } from 'react';
import ImageViewerModal from '@/components/ui/ImageViewerModal';

/**
 * Opens any image in the zoomable lightbox.
 *
 *   const { openImage, viewer } = useImageViewer();
 *   <img ... onClick={() => openImage(src, alt)} className="cursor-zoom-in" />
 *   {viewer}
 */
export function useImageViewer() {
  const [state, setState] = useState<{ src: string; alt?: string } | null>(null);

  const openImage = useCallback((src: string, alt?: string) => {
    if (src) setState({ src, alt });
  }, []);

  const close = useCallback(() => setState(null), []);

  const viewer = (
    <ImageViewerModal open={!!state} src={state?.src || ''} alt={state?.alt} onClose={close} />
  );

  return { openImage, viewer, closeImage: close };
}

export default useImageViewer;
