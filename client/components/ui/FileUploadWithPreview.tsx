import { useState, useRef, ChangeEvent } from 'react';
import { Upload, X, FileIcon, Image as ImageIcon } from 'lucide-react';

interface FileWithPreview extends File {
  preview?: string;
}

interface FileUploadWithPreviewProps {
  /** Texto del label */
  label?: string;
  /** Texto descriptivo */
  description?: string;
  /** Nombre del input */
  name?: string;
  /** Acepta múltiples archivos */
  multiple?: boolean;
  /** Tipos de archivo permitidos (ej: "image/*", ".pdf,.doc") */
  accept?: string;
  /** Tamaño máximo en MB */
  maxSizeMB?: number;
  /** Máximo número de archivos */
  maxFiles?: number;
  /** Callback cuando cambian los archivos */
  onChange?: (files: File[]) => void;
  /** Archivos iniciales (URLs) */
  initialFiles?: string[];
  /** Clase CSS adicional */
  className?: string;
}

export default function FileUploadWithPreview({
  label = "Fotos (opcional)",
  description = "PNG, JPG, GIF hasta 10MB",
  name = "files",
  multiple = true,
  accept = "image/*",
  maxSizeMB = 10,
  maxFiles = 10,
  onChange,
  initialFiles = [],
  className = ""
}: FileUploadWithPreviewProps) {
  const [selectedFiles, setSelectedFiles] = useState<FileWithPreview[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>(initialFiles);
  const [error, setError] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      processFiles(files);
    }
    // Reset input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeFile = (index: number) => {
    // Liberar URL del preview
    if (selectedFiles[index]?.preview) {
      URL.revokeObjectURL(selectedFiles[index].preview!);
    }

    const newFiles = selectedFiles.filter((_, i) => i !== index);
    const newPreviews = previewUrls.filter((_, i) => i !== index);

    setSelectedFiles(newFiles);
    setPreviewUrls(newPreviews);

    // Notificar al padre
    if (onChange) {
      onChange(newFiles);
    }

    // Limpiar error si ya no hay problema
    if (newFiles.length <= maxFiles) {
      setError("");
    }
  };

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);

    // Filtrar solo archivos del tipo aceptado
    const validFiles = droppedFiles.filter(file => {
      if (accept === 'image/*') {
        return file.type.startsWith('image/');
      }
      return true;
    });

    if (validFiles.length === 0) {
      setError('Tipo de archivo no permitido');
      return;
    }

    // Procesar archivos directamente
    processFiles(validFiles);
  };

  const processFiles = (files: File[]) => {
    setError("");

    // Validar número de archivos
    if (files.length + selectedFiles.length > maxFiles) {
      setError(`Máximo ${maxFiles} archivos permitidos`);
      return;
    }

    // Validar tamaño de archivos
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    const oversizedFiles = files.filter(file => file.size > maxSizeBytes);
    if (oversizedFiles.length > 0) {
      const oversizedNames = oversizedFiles.map(f => f.name).join(', ');
      setError(`Los siguientes archivos superan ${maxSizeMB}MB: ${oversizedNames}`);
      return;
    }

    // Crear previsualizaciones para imágenes
    const filesWithPreviews: FileWithPreview[] = files.map(file => {
      const fileWithPreview = file as FileWithPreview;
      if (file.type.startsWith('image/')) {
        fileWithPreview.preview = URL.createObjectURL(file);
      }
      return fileWithPreview;
    });

    const newFiles = [...selectedFiles, ...filesWithPreviews];
    setSelectedFiles(newFiles);

    // Actualizar URLs de preview
    const newPreviews = filesWithPreviews
      .filter(f => f.preview)
      .map(f => f.preview!);
    setPreviewUrls([...previewUrls, ...newPreviews]);

    // Notificar al padre
    if (onChange) {
      onChange(newFiles);
    }
  };

  const isImage = (file: FileWithPreview) => {
    return file.type.startsWith('image/') || file.preview;
  };

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}

      {/* Zona de drop */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
          isDragging
            ? 'border-sky-500 bg-sky-50 dark:bg-sky-900/20'
            : 'border-gray-300 dark:border-gray-600 hover:border-sky-500 bg-gray-50 dark:bg-gray-700/30'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          name={name}
          multiple={multiple}
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="flex flex-col items-center">
          <Upload className={`w-12 h-12 mb-3 ${isDragging ? 'text-sky-500' : 'text-gray-400 dark:text-gray-500'}`} />
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
            {isDragging ? (
              <span className="text-sky-600 font-medium">Suelta los archivos aquí</span>
            ) : (
              <>
                <span className="text-sky-600 dark:text-sky-400 font-medium">Sube un archivo</span> o arrástralo aquí
              </>
            )}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      {/* Descripción adicional */}
      {!error && (
        <p className="mt-2 text-xs text-gray-500">
          Una imagen vale más que mil palabras. Ayuda a los profesionales a entender el trabajo.
        </p>
      )}

      {/* Previsualizaciones */}
      {(selectedFiles.length > 0 || previewUrls.length > 0) && (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Archivos seleccionados ({selectedFiles.length})
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {selectedFiles.map((file, index) => (
              <div key={index} className="relative group">
                {isImage(file) ? (
                  // Preview de imagen
                  <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                    <img
                      src={file.preview || URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  // Preview de archivo no-imagen
                  <div className="aspect-square rounded-lg bg-gray-100 border border-gray-200 flex flex-col items-center justify-center p-3">
                    <FileIcon className="w-8 h-8 text-gray-400 mb-2" />
                    <p className="text-xs text-gray-600 text-center truncate w-full px-1">
                      {file.name}
                    </p>
                  </div>
                )}

                {/* Botón de eliminar */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600"
                  aria-label="Eliminar archivo"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Nombre del archivo en hover */}
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs p-2 opacity-0 group-hover:opacity-100 transition-opacity truncate rounded-b-lg">
                  {file.name}
                </div>

                {/* Tamaño del archivo */}
                <div className="absolute top-2 left-2 bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
