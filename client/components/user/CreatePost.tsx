import { useState, useMemo } from "react";
import { X, Upload, Image as ImageIcon, Video, DollarSign, Tag, Info } from "lucide-react";
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import Button from "../ui/Button";

interface CreatePostProps {
  initialType?: 'post' | 'article';
  onClose: () => void;
  onSuccess: () => void;
  embedded?: boolean; // If true, renders as embedded component instead of modal
}

interface GalleryFile {
  file: File;
  preview: string;
  caption: string;
}

export default function CreatePost({ initialType = 'post', onClose, onSuccess, embedded = false }: CreatePostProps) {
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    price: "",
    currency: "ARS",
    type: initialType,
    tags: [] as string[],
  });
  const [tagInput, setTagInput] = useState("");
  const [galleryFiles, setGalleryFiles] = useState<GalleryFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Quill modules for rich text editor
  const modules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],
      ['link'],
      [{ 'align': [] }],
      ['clean']
    ],
  }), []);

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'list', 'bullet', 'indent',
    'link', 'align'
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);

    if (selectedFiles.length + galleryFiles.length > 10) {
      setError("Máximo 10 archivos permitidos");
      return;
    }

    const validFiles = selectedFiles.filter((file) => {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      return isImage || isVideo;
    });

    if (validFiles.length !== selectedFiles.length) {
      setError("Solo se permiten imágenes y videos");
      return;
    }

    const newGalleryFiles: GalleryFile[] = validFiles.map((file) => {
      const reader = new FileReader();
      const preview = URL.createObjectURL(file);

      return {
        file,
        preview,
        caption: "",
      };
    });

    setGalleryFiles([...galleryFiles, ...newGalleryFiles]);
    setError("");
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(galleryFiles[index].preview);
    setGalleryFiles(galleryFiles.filter((_, i) => i !== index));
  };

  const updateCaption = (index: number, caption: string) => {
    const updated = [...galleryFiles];
    updated[index].caption = caption;
    setGalleryFiles(updated);
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim().toLowerCase())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tagInput.trim().toLowerCase()],
      });
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter((t) => t !== tag),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.title.trim()) {
      setError("El título es requerido");
      return;
    }

    if (!formData.description.trim()) {
      setError("La descripción es requerida");
      return;
    }

    setIsSubmitting(true);

    try {
      const submitData = new FormData();
      submitData.append("title", formData.title);
      submitData.append("description", formData.description);
      submitData.append("type", formData.type);
      submitData.append("currency", formData.currency);

      // Only add price for posts, not articles
      if (formData.type === 'post' && formData.price) {
        submitData.append("price", formData.price);
      }

      if (formData.tags.length > 0) {
        submitData.append("tags", JSON.stringify(formData.tags));
      }

      // Add gallery files with captions
      galleryFiles.forEach((item, index) => {
        submitData.append("gallery", item.file);
      });

      // Send captions separately
      const captions = galleryFiles.map(item => item.caption);
      submitData.append("captions", JSON.stringify(captions));

      const response = await fetch("/api/posts", {
        method: "POST",
        credentials: "include",
        body: submitData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al crear la publicación");
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Error al crear la publicación");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isArticle = formData.type === 'article';

  const content = (
    <>
      {/* Header - only show in modal mode */}
      {!embedded && (
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isArticle ? 'Nuevo Artículo' : 'Nuevo Post'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
      )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Título *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              maxLength={200}
              required
            />
          </div>

          {/* Description - Textarea for Posts, Rich Editor for Articles */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {isArticle ? 'Contenido del Artículo *' : 'Descripción *'}
            </label>
            {isArticle ? (
              <div className="prose-editor">
                <ReactQuill
                  theme="snow"
                  value={formData.description}
                  onChange={(value) => setFormData({ ...formData, description: value })}
                  modules={modules}
                  formats={formats}
                  className="bg-white dark:bg-slate-700 rounded-lg"
                  placeholder="Escribe tu artículo aquí... Usa las herramientas de formato para dar estilo."
                />
              </div>
            ) : (
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={5}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                maxLength={5000}
                required
              />
            )}
          </div>

          {/* Price (Only for Posts) */}
          {!isArticle && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                <DollarSign className="h-4 w-4 inline mr-1" />
                Precio (Opcional)
              </label>
              <div className="flex gap-3">
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ARS">ARS</option>
                  <option value="USD">USD</option>
                </select>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <Tag className="h-4 w-4 inline mr-1" />
              Etiquetas
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddTag())}
                placeholder="Agregar etiqueta"
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
              <Button type="button" onClick={handleAddTag} variant="secondary">
                Agregar
              </Button>
            </div>
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm flex items-center gap-2"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Gallery Upload with Captions */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              <ImageIcon className="h-4 w-4 inline mr-1" />
              {isArticle ? 'Imágenes del Artículo (con descripciones)' : 'Galería'} (Máx. 10 archivos)
            </label>
            <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-6 text-center">
              <input
                type="file"
                id="gallery"
                multiple
                accept="image/*,video/*"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="gallery"
                className="cursor-pointer flex flex-col items-center gap-2"
              >
                <Upload className="h-8 w-8 text-slate-400" />
                <span className="text-slate-600 dark:text-slate-400">
                  Haz clic para subir imágenes o videos
                </span>
              </label>
            </div>

            {/* Previews with Captions */}
            {galleryFiles.length > 0 && (
              <div className="mt-4 space-y-4">
                {galleryFiles.map((item, index) => (
                  <div key={index} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                    <div className="flex gap-4">
                      <div className="relative group flex-shrink-0">
                        {item.file.type.startsWith("image/") ? (
                          <img
                            src={item.preview}
                            alt={`Preview ${index + 1}`}
                            className="w-32 h-32 object-cover rounded-lg"
                          />
                        ) : (
                          <div className="relative w-32 h-32 bg-slate-900 rounded-lg flex items-center justify-center">
                            <Video className="h-8 w-8 text-white" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex-1">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                          <Info className="h-3 w-3 inline mr-1" />
                          Descripción de la imagen {index + 1}
                        </label>
                        <input
                          type="text"
                          value={item.caption}
                          onChange={(e) => updateCaption(index, e.target.value)}
                          placeholder="Agrega una descripción..."
                          maxLength={500}
                          className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {item.caption.length}/500 caracteres
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 sticky bottom-0 bg-white dark:bg-slate-800 pb-4">
            <Button
              type="button"
              onClick={onClose}
              variant="error"
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              variant="success"
              className="flex-1"
            >
              {isSubmitting ? "Publicando..." : `Publicar ${isArticle ? 'Artículo' : 'Post'}`}
            </Button>
          </div>
        </form>
    </>
  );

  // If embedded, render without modal wrapper
  if (embedded) {
    return content;
  }

  // Modal wrapper
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto my-8">
        {content}
      </div>
    </div>
  );
}
