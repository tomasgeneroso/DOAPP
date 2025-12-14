import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  Calendar,
  Clock,
  DollarSign,
  FileText,
  ImageIcon,
  MapPin,
  Tag,
  X,
  AlertTriangle,
  Info,
  Users,
  Home,
  Hash,
  CreditCard,
  Settings,
  ArrowRight,
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

export default function CreateContractScreen() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [location, setLocation] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [maxWorkers, setMaxWorkers] = useState(1);
  const [endDateFlexible, setEndDateFlexible] = useState(false);
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressDetails, setAddressDetails] = useState("");

  // Banking prompt modal state
  const [showBankingModal, setShowBankingModal] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);

  // Check if user has banking info configured
  const hasBankingInfo = !!(
    user?.bankingInfo?.cbu ||
    user?.bankingInfo?.alias
  );

  // Check if user opted out of banking prompts
  const dontAskBankingInfo = user?.dontAskBankingInfo || false;

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

  // Build FormData from form
  const buildFormData = (formDataFromForm: FormData): FormData => {
    const submitData = new FormData();

    submitData.append("title", formDataFromForm.get("title") as string);
    submitData.append("summary", formDataFromForm.get("summary") as string);
    submitData.append("description", formDataFromForm.get("description") as string);
    submitData.append("price", formDataFromForm.get("budget") as string);
    submitData.append("category", selectedCategory);
    submitData.append("tags", JSON.stringify(selectedTags));
    submitData.append("location", formDataFromForm.get("location") as string);
    submitData.append("addressStreet", addressStreet);
    submitData.append("addressNumber", addressNumber);
    submitData.append("addressDetails", addressDetails);
    submitData.append("startDate", formDataFromForm.get("startDate") as string);
    submitData.append("endDateFlexible", endDateFlexible.toString());
    if (!endDateFlexible) {
      submitData.append("endDate", formDataFromForm.get("endDate") as string);
    }
    submitData.append("remoteOk", formDataFromForm.get("remoteOk") === "on" ? "true" : "false");
    submitData.append("maxWorkers", maxWorkers.toString());

    selectedFiles.forEach((file) => {
      submitData.append("images", file);
    });

    return submitData;
  };

  // Actually submit the job
  const submitJob = async (formData: FormData) => {
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        credentials: 'include',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Error al crear el trabajo");
      }

      await refreshUser();

      if (data.requiresPayment) {
        navigate(`/jobs/${data.job.id || data.job._id}/payment`);
      } else {
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

  // Handle "Don't ask again" for banking prompt
  const handleDontAskAgain = async () => {
    try {
      await fetch("/api/auth/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify({ dontAskBankingInfo: true }),
      });
      await refreshUser();
    } catch (err) {
      console.error("Error saving preference:", err);
    }
    setShowBankingModal(false);
    if (pendingFormData) {
      submitJob(pendingFormData);
    }
  };

  // Continue without adding banking info
  const handleContinueWithoutBanking = () => {
    setShowBankingModal(false);
    if (pendingFormData) {
      submitJob(pendingFormData);
    }
  };

  // Go to settings to add banking info
  const handleGoToSettings = () => {
    setShowBankingModal(false);
    navigate("/settings?tab=banking");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formDataFromForm = new FormData(event.currentTarget);
    const submitData = buildFormData(formDataFromForm);

    // If user doesn't have banking info and hasn't opted out, show the modal
    if (!hasBankingInfo && !dontAskBankingInfo) {
      setPendingFormData(submitData);
      setShowBankingModal(true);
      setIsSubmitting(false);
      return;
    }

    // Otherwise proceed with submission
    await submitJob(submitData);
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

            {/* Address details */}
            <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <FormField label="Calle" icon={Home}>
                  <input
                    type="text"
                    value={addressStreet}
                    onChange={(e) => setAddressStreet(e.target.value)}
                    placeholder="Ej: Av. Santa Fe"
                    className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
                  />
                </FormField>
              </div>
              <div className="sm:col-span-3">
                <FormField label="Número" icon={Hash}>
                  <input
                    type="text"
                    value={addressNumber}
                    onChange={(e) => setAddressNumber(e.target.value)}
                    placeholder="Ej: 1234"
                    className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
                  />
                </FormField>
              </div>
            </div>

            <FormField
              label="Detalles de la dirección (opcional)"
              icon={MapPin}
              description="Piso, departamento, entre calles u otras referencias para encontrar el lugar"
            >
              <input
                type="text"
                value={addressDetails}
                onChange={(e) => setAddressDetails(e.target.value)}
                placeholder="Ej: Piso 3, Depto B, timbre 302"
                className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 dark:text-white dark:bg-slate-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-slate-600 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-sky-600 sm:text-sm sm:leading-6"
              />
            </FormField>

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
                  {!endDateFlexible && (
                    <CustomDateInput
                      name="endDate"
                      type="datetime"
                      required
                      placeholder="Selecciona fecha y hora de fin"
                      minDate={new Date()}
                    />
                  )}
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={endDateFlexible}
                      onChange={(e) => setEndDateFlexible(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500 dark:bg-slate-700"
                    />
                    <span className="text-sm text-gray-600 dark:text-slate-400">
                      Todavía no lo sé
                    </span>
                  </label>
                  {endDateFlexible && (
                    <div className="mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="inline h-4 w-4 mr-1" />
                        Deberás definir la fecha de fin antes de las 24 horas previas al inicio del trabajo, de lo contrario el trabajo quedará suspendido.
                      </p>
                    </div>
                  )}
                </FormField>
              </div>
            </div>

            <FormField
              label="Cantidad de trabajadores"
              icon={Users}
              description="¿Cuántas personas necesitas para este trabajo? (1-5)"
            >
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMaxWorkers(Math.max(1, maxWorkers - 1))}
                    disabled={maxWorkers <= 1}
                    className="w-10 h-10 rounded-lg border border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    -
                  </button>
                  <span className="w-12 text-center text-xl font-semibold text-gray-900 dark:text-white">
                    {maxWorkers}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMaxWorkers(Math.min(5, maxWorkers + 1))}
                    disabled={maxWorkers >= 5}
                    className="w-10 h-10 rounded-lg border border-gray-300 dark:border-slate-600 flex items-center justify-center text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    +
                  </button>
                </div>
                <span className="text-sm text-gray-500 dark:text-slate-400">
                  {maxWorkers === 1 ? "1 trabajador" : `${maxWorkers} trabajadores`}
                </span>
              </div>
              {maxWorkers > 1 && (
                <div className="mt-3 p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
                  <p className="text-sm text-sky-700 dark:text-sky-300">
                    <Users className="inline h-4 w-4 mr-1" />
                    Se creará un chat grupal con todos los trabajadores seleccionados
                  </p>
                </div>
              )}
            </FormField>

            <FormField
              label="Fotos (opcional)"
              icon={ImageIcon}
            >
              <FileUploadWithPreview
                label=""
                description="PNG, JPG, GIF hasta 10MB"
                name="images"
                maxSizeMB={10}
                maxFiles={5}
                accept="image/*"
                onChange={setSelectedFiles}
              />
            </FormField>
          </div>

          {/* Aviso de condiciones importantes */}
          <div className="rounded-xl border border-sky-300 dark:border-sky-500/50 bg-sky-50 dark:bg-sky-900/20 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-sky-500 dark:text-sky-400 shrink-0 mt-0.5" />
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-700 dark:text-gray-300">
                  Condiciones importantes al publicar
                </h3>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                  <li className="flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-sky-500 dark:text-sky-400" />
                    <span>
                      <strong className="text-gray-700 dark:text-gray-300">Selección de trabajador:</strong> Una vez que recibas postulaciones, deberás seleccionar un trabajador antes de las 24 horas previas al inicio del trabajo.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-sky-500 dark:text-sky-400" />
                    <span>
                      <strong className="text-gray-700 dark:text-gray-300">Auto-selección:</strong> Si no seleccionas un trabajador a tiempo, se asignará automáticamente al primer postulante.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-sky-500 dark:text-sky-400" />
                    <span>
                      <strong className="text-gray-700 dark:text-gray-300">Cancelación:</strong> Si cancelas el trabajo después de publicarlo, perderás la comisión de publicación pagada.
                    </span>
                  </li>
                </ul>
              </div>
            </div>
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

      {/* Banking Info Modal */}
      {showBankingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Header */}
            <div className="bg-sky-50 dark:bg-sky-900/30 p-6 border-b border-sky-100 dark:border-sky-800">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-sky-100 dark:bg-sky-800 flex items-center justify-center">
                  <CreditCard className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Datos bancarios no configurados
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Para recibir pagos de tus trabajos
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                No tienes configurados tus datos bancarios. Cuando completes trabajos como profesional, necesitarás estos datos para recibir tus pagos.
              </p>

              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    <strong>Tip:</strong> Si usas Mercado Pago, los pagos se acreditan en 48hs. Otros bancos pueden demorar hasta fin de mes.
                  </span>
                </p>
              </div>

              <p className="text-sm text-gray-500 dark:text-gray-400">
                ¿Deseas agregar tus datos bancarios ahora?
              </p>
            </div>

            {/* Actions */}
            <div className="p-6 bg-gray-50 dark:bg-slate-900/50 border-t border-gray-200 dark:border-slate-700 space-y-3">
              <button
                onClick={handleGoToSettings}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-medium transition-colors"
              >
                <Settings className="h-4 w-4" />
                Agregar datos bancarios
                <ArrowRight className="h-4 w-4" />
              </button>

              <div className="flex gap-3">
                <button
                  onClick={handleContinueWithoutBanking}
                  className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg font-medium transition-colors"
                >
                  Continuar sin agregar
                </button>
                <button
                  onClick={handleDontAskAgain}
                  className="flex-1 px-4 py-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg text-sm transition-colors"
                >
                  No preguntar de nuevo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
