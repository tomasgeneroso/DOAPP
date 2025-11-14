import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Image as ImageIcon,
  MapPin,
  Upload,
  Tag,
  X,
} from "lucide-react";
import { JOB_CATEGORIES, JOB_TAGS } from "../../shared/constants/categories";
import { CustomDateInput } from "@/components/ui/CustomDatePicker";
import LocationAutocomplete from "@/components/ui/LocationAutocomplete";

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

export default function CreateContractScreen() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [location, setLocation] = useState("");

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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);

    const jobData = {
      title: formData.get("title"),
      summary: formData.get("summary"),
      description: formData.get("description"),
      price: Number(formData.get("budget")),
      category: selectedCategory,
      tags: selectedTags,
      location: formData.get("location"),
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
      remoteOk: formData.get("remoteOk") === "on",
    };

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: 'include', // Importante: envía las cookies automáticamente
        body: JSON.stringify(jobData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al crear el trabajo");
      }

      // Refresh user data to update contract counts
      await refreshUser();

      // Check if payment is required (for FREE users)
      if (data.requiresPayment) {
        // Redirect to payment page for job publication
        navigate(`/jobs/${data.job.id || data.job._id}/payment`);
      } else {
        // PRO users go directly to home (job is auto-published)
        navigate("/");
      }
    } catch (err: any) {
      setError(
        err.message || "No se pudo publicar el trabajo. Inténtalo de nuevo."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Crear Nuevo Contrato - Doers</title>
        <meta
          name="description"
          content="Publica un nuevo trabajo o servicio en Doers."
        />
      </Helmet>
      <div className="container mx-auto max-w-4xl py-8 px-4">
        <div className="mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white"
          >
            &larr; Volver al inicio
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          Publicar un nuevo trabajo
        </h1>
        <p className="mt-2 text-lg leading-8 text-gray-600 dark:text-slate-400">
          Describe el servicio que necesitas para que los Doers puedan
          postularse.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-8">
          <div className="space-y-6 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-6 shadow-sm">
            <FormField
              label="Título del trabajo"
              icon={FileText}
              description="Sé claro y específico."
            >
              <input
                name="title"
                type="text"
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
                name="summary"
                type="text"
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
                name="description"
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
                {/* Selected tags */}
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

                {/* Quick tags */}
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

                {/* Custom tag input */}
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
                    name="budget"
                    type="number"
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
                  />
                </FormField>
              </div>
            </div>

            <FormField
              label="Fotos (opcional)"
              icon={ImageIcon}
              description="Una imagen vale más que mil palabras. Ayuda a los Doers a entender el trabajo."
            >
              <div className="mt-2 flex justify-center rounded-lg border border-dashed border-gray-900/25 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 px-6 py-10">
                <div className="text-center">
                  <Upload
                    className="mx-auto h-12 w-12 text-gray-300 dark:text-slate-500"
                    aria-hidden="true"
                  />
                  <div className="mt-4 flex text-sm leading-6 text-gray-600 dark:text-slate-400">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer rounded-md font-semibold text-sky-600 dark:text-sky-400 focus-within:outline-none focus-within:ring-2 focus-within:ring-sky-600 focus-within:ring-offset-2 hover:text-sky-500"
                    >
                      <span>Sube un archivo</span>
                      <input
                        id="file-upload"
                        name="file-upload"
                        type="file"
                        className="sr-only"
                        multiple
                      />
                    </label>
                    <p className="pl-1">o arrástralo aquí</p>
                  </div>
                  <p className="text-xs leading-5 text-gray-600 dark:text-slate-400">
                    PNG, JPG, GIF hasta 10MB
                  </p>
                </div>
              </div>
            </FormField>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex items-center justify-end gap-x-6">
            <Link
              to="/"
              className="text-sm font-semibold leading-6 text-gray-900 dark:text-slate-300 hover:text-gray-700 dark:hover:text-white"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 hover:from-sky-600 hover:to-sky-700 hover:shadow-sky-500/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isSubmitting ? "Publicando..." : "Publicar trabajo"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
