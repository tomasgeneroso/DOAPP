import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import {
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Image as ImageIcon,
  MapPin,
  Upload,
} from "lucide-react";

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
      <label className="block text-sm font-medium leading-6 text-gray-900 mb-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          {label}
        </div>
      </label>
      {children}
      {description && (
        <p className="mt-2 text-xs text-gray-500">{description}</p>
      )}
    </div>
  );
}

export default function CreateContractScreen() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    // Aquí iría la lógica para enviar el formulario al backend
    try {
      // Simulación de una llamada a la API
      await new Promise((resolve) => setTimeout(resolve, 1500));
      // alert('¡Trabajo publicado exitosamente!');
      navigate("/"); // Redirigir a la página principal después de publicar
    } catch (err: any) {
      setError(
        err.message || "No se pudo publicar el trabajo. Inténtalo de nuevo.",
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
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            &larr; Volver al inicio
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Publicar un nuevo trabajo
        </h1>
        <p className="mt-2 text-lg leading-8 text-gray-600">
          Describe el servicio que necesitas para que los Doers puedan
          postularse.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-8">
          <div className="space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
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
                className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
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
                className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
              />
            </FormField>

            <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-6">
              <div className="sm:col-span-3">
                <FormField label="Presupuesto (ARS)" icon={DollarSign}>
                  <input
                    name="budget"
                    type="number"
                    required
                    placeholder="15000"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </FormField>
              </div>
              <div className="sm:col-span-3">
                <FormField label="Ubicación" icon={MapPin}>
                  <input
                    name="location"
                    type="text"
                    required
                    placeholder="Ej: Palermo, CABA"
                    className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                  />
                </FormField>
              </div>
            </div>

            <FormField
              label="Fotos (opcional)"
              icon={ImageIcon}
              description="Una imagen vale más que mil palabras. Ayuda a los Doers a entender el trabajo."
            >
              <div className="mt-2 flex justify-center rounded-lg border border-dashed border-gray-900/25 px-6 py-10">
                <div className="text-center">
                  <Upload
                    className="mx-auto h-12 w-12 text-gray-300"
                    aria-hidden="true"
                  />
                  <div className="mt-4 flex text-sm leading-6 text-gray-600">
                    <label
                      htmlFor="file-upload"
                      className="relative cursor-pointer rounded-md bg-white font-semibold text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-2 hover:text-indigo-500"
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
                  <p className="text-xs leading-5 text-gray-600">
                    PNG, JPG, GIF hasta 10MB
                  </p>
                </div>
              </div>
            </FormField>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-end gap-x-6">
            <button
              type="button"
              className="text-sm font-semibold leading-6 text-gray-900"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50"
            >
              {isSubmitting ? "Publicando..." : "Publicar trabajo"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
