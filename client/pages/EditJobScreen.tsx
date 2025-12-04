import { useState, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/ui/Toast";
import {
  Calendar,
  Clock,
  DollarSign,
  FileText,
  ImageIcon,
  MapPin,
  Tag,
  X,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { JOB_CATEGORIES, JOB_TAGS } from "../../shared/constants/categories";
import { CustomDateInput } from "@/components/ui/CustomDatePicker";
import LocationAutocomplete from "@/components/ui/LocationAutocomplete";
import FileUploadWithPreview from "@/components/ui/FileUploadWithPreview";

interface FormFieldProps {
  label: string;
  icon: React.ElementType;
  description?: string;
  children: React.ReactNode;
}

function FormField({
  label,
  icon: Icon,
  description,
  children,
}: FormFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium leading-6 text-gray-900 dark:text-slate-200 mb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
          {label}
        </div>
      </label>
      {children}
      {description && (
        <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">{description}</p>
      )}
    </div>
  );
}

export default function EditJobScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { success: toastSuccess } = useToast();
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [jobStatus, setJobStatus] = useState("");

  // Fetch job data
  useEffect(() => {
    const fetchJob = async () => {
      try {
        const response = await fetch(`/api/jobs/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data = await response.json();

        if (data.success && data.job) {
          const job = data.job;

          // Check if user is the owner
          const clientId = typeof job.client === 'string' ? job.client : (job.client?.id || job.client?._id);
          const userId = user?.id || user?._id;

          if (clientId !== userId) {
            setError("No tienes permiso para editar este trabajo");
            setLoading(false);
            return;
          }

          // Populate form fields
          setTitle(job.title || "");
          setSummary(job.summary || "");
          setDescription(job.description || "");
          setPrice(job.price?.toString() || "");
          setSelectedCategory(job.category || "");
          setSelectedTags(job.tags || []);
          setLocation(job.location || "");
          setStartDate(job.startDate ? new Date(job.startDate).toISOString().slice(0, 16) : "");
          setEndDate(job.endDate ? new Date(job.endDate).toISOString().slice(0, 16) : "");
          setExistingImages(job.images || []);
          setJobStatus(job.status || "");
        } else {
          setError(data.message || "No se pudo cargar el trabajo");
        }
      } catch (err) {
        setError("Error al cargar el trabajo");
        console.error("Error fetching job:", err);
      } finally {
        setLoading(false);
      }
    };

    if (id && token) {
      fetchJob();
    }
  }, [id, token, user]);

  const handleAddTag = (tag: string) => {
    if (tag && !selectedTags.includes(tag) && selectedTags.length < 10) {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setSelectedTags(selectedTags.filter((tag) => tag !== tagToRemove));
  };

  const handleAddCustomTag = () => {
    if (customTag.trim()) {
      handleAddTag(customTag.trim().toLowerCase());
      setCustomTag("");
    }
  };

  const handleRemoveExistingImage = (imageUrl: string) => {
    setExistingImages(existingImages.filter(img => img !== imageUrl));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const submitData = new FormData();

    submitData.append("title", title);
    submitData.append("summary", summary);
    submitData.append("description", description);
    submitData.append("price", price);
    submitData.append("category", selectedCategory);
    submitData.append("tags", JSON.stringify(selectedTags));
    submitData.append("location", location);
    submitData.append("startDate", startDate);
    submitData.append("endDate", endDate);
    submitData.append("existingImages", JSON.stringify(existingImages));

    // Add new files
    selectedFiles.forEach((file) => {
      submitData.append("images", file);
    });

    try {
      const response = await fetch(`/api/jobs/${id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        credentials: 'include',
        body: submitData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al actualizar el trabajo");
      }

      // Show success message based on whether it needs approval
      if (data.requiresApproval) {
        toastSuccess(
          'Trabajo enviado para aprobación',
          'Tu trabajo ha sido actualizado y será revisado por nuestro equipo antes de publicarse.'
        );
      } else {
        toastSuccess('Trabajo actualizado', 'Los cambios han sido guardados exitosamente.');
      }

      // Redirect back to job detail
      navigate(`/jobs/${id}`);
    } catch (err: any) {
      setError(err.message || "No se pudo actualizar el trabajo. Inténtalo de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-sky-500" />
      </div>
    );
  }

  if (error && !title) {
    return (
      <div className="container mx-auto px-4 py-12">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Link
            to="/"
            className="text-sky-600 hover:text-sky-700 font-medium"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Editar Trabajo - Doers</title>
        <meta name="description" content="Edita tu publicación de trabajo en Doers." />
      </Helmet>
      <div className="container mx-auto max-w-4xl py-8 px-4">
        <div className="mb-6">
          <Link
            to={`/jobs/${id}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al trabajo
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          Editar trabajo
        </h1>
        <p className="mt-2 text-lg leading-8 text-gray-600 dark:text-slate-400">
          Modifica los detalles de tu publicación.
        </p>

        {(jobStatus === 'cancelled' || jobStatus === 'rejected') && (
          <div className="mt-4 rounded-xl border border-amber-500/50 bg-amber-50 dark:bg-amber-900/20 p-4">
            <p className="text-amber-700 dark:text-amber-300 text-sm">
              <strong>Nota:</strong> Este trabajo fue {jobStatus === 'cancelled' ? 'cancelado' : 'rechazado'}.
              Al guardar los cambios, será enviado automáticamente para revisión y aprobación antes de publicarse.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-10 space-y-8">
          <div className="space-y-6 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-6 shadow-sm">
            <FormField
              label="Título del trabajo"
              icon={FileText}
              description="Sé claro y específico."
            >
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Ej: Reparación de cañería en cocina"
                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
              />
            </FormField>

            <FormField
              label="Resumen breve"
              icon={FileText}
              description="Un resumen corto del trabajo (máximo 200 caracteres)"
            >
              <input
                type="text"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                required
                maxLength={200}
                placeholder="Ej: Necesito arreglar una pérdida de agua en la cocina"
                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
              />
            </FormField>

            <FormField
              label="Descripción detallada"
              icon={FileText}
              description="Incluye todos los detalles importantes del servicio requerido."
            >
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                required
                placeholder="Describe el problema, qué esperas que se haga, si se necesitan materiales especiales, etc."
                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
              />
            </FormField>

            <FormField
              label="Categoría"
              icon={Tag}
              description="Selecciona la categoría que mejor describe tu trabajo"
            >
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                required
                className="block w-full rounded-md border-0 py-2 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
              >
                <option value="">Seleccionar categoría...</option>
                {JOB_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              label="Etiquetas"
              icon={Tag}
              description="Agrega etiquetas para ayudar a que tu trabajo sea encontrado (máximo 10)"
            >
              <div className="space-y-3">
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300 text-sm"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag)}
                          className="hover:text-sky-600 dark:hover:text-sky-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {JOB_TAGS.slice(0, 20).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleAddTag(tag)}
                      disabled={selectedTags.includes(tag) || selectedTags.length >= 10}
                      className="px-3 py-1 rounded-full border border-gray-300 dark:border-slate-600 text-sm hover:bg-sky-50 dark:hover:bg-sky-900/20 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 dark:text-slate-300"
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddCustomTag())}
                    placeholder="O agrega una etiqueta personalizada"
                    disabled={selectedTags.length >= 10}
                    className="block flex-1 rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomTag}
                    disabled={!customTag.trim() || selectedTags.length >= 10}
                    className="px-4 py-2 bg-sky-500 text-white rounded-md hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    Agregar
                  </button>
                </div>
              </div>
            </FormField>

            <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <FormField label="Presupuesto (ARS)" icon={DollarSign}>
                  <input
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                    min="0"
                    step="1"
                    placeholder="15000"
                    onKeyPress={(e) => {
                      if (!/[0-9]/.test(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
                  />
                </FormField>
              </div>
              <div className="sm:col-span-3">
                <FormField label="Ubicación" icon={MapPin}>
                  <LocationAutocomplete
                    value={location}
                    onChange={setLocation}
                    placeholder="Ej: Palermo, CABA"
                    required
                    name="location"
                  />
                </FormField>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <FormField label="Fecha de inicio" icon={Calendar}>
                  <CustomDateInput
                    name="startDate"
                    type="datetime"
                    required
                    placeholder="Selecciona fecha y hora de inicio"
                    minDate={new Date()}
                    defaultValue={startDate}
                  />
                </FormField>
              </div>
              <div className="sm:col-span-3">
                <FormField label="Fecha de finalización estimada" icon={Clock}>
                  <CustomDateInput
                    name="endDate"
                    type="datetime"
                    required
                    placeholder="Selecciona fecha y hora de fin"
                    minDate={new Date()}
                    defaultValue={endDate}
                  />
                </FormField>
              </div>
            </div>

            {/* Existing Images */}
            {existingImages.length > 0 && (
              <FormField label="Imágenes existentes" icon={ImageIcon}>
                <div className="flex flex-wrap gap-3">
                  {existingImages.map((img, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={img}
                        alt={`Imagen ${index + 1}`}
                        className="h-24 w-24 object-cover rounded-lg border border-slate-600"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveExistingImage(img)}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </FormField>
            )}

            <FormField
              label="Agregar nuevas fotos (opcional)"
              icon={ImageIcon}
            >
              <FileUploadWithPreview
                label=""
                description="PNG, JPG, GIF hasta 10MB"
                name="images"
                maxSizeMB={10}
                maxFiles={5 - existingImages.length}
                accept="image/*"
                onChange={setSelectedFiles}
              />
            </FormField>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex items-center justify-end gap-x-6">
            <Link
              to={`/jobs/${id}`}
              className="text-sm font-semibold leading-6 text-gray-900 dark:text-slate-300 hover:text-gray-700 dark:hover:text-white"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 hover:from-sky-600 hover:to-sky-700 hover:shadow-sky-500/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isSubmitting ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
