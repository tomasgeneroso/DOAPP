import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { TermsModal } from "@/components/ui/TermsModal";
import { CustomDateInput } from "@/components/ui/CustomDatePicker";
import {
  ArrowLeft,
  Calendar,
  Clock,
  DollarSign,
  Image as ImageIcon,
  MapPin,
  Tag,
  Upload,
} from "lucide-react";

import type { JobItem, ScreenId } from "./types";

interface CreateContractScreenProps {
  draft: JobItem;
  onNavigate: (screen: ScreenId) => void;
}

export function CreateContractScreen({
  draft,
  onNavigate,
}: CreateContractScreenProps) {
  const [contractTermsAccepted, setContractTermsAccepted] = useState(false);
  const [showContractTerms, setShowContractTerms] = useState(false);

  const handlePublish = () => {
    if (!contractTermsAccepted) {
      alert("Debes aceptar los términos y condiciones del contrato para publicar");
      return;
    }
    // Aquí iría la lógica de publicación
    alert("¡Trabajo publicado exitosamente!");
    onNavigate("jobs");
  };
  return (
    <div className="flex h-full flex-col">
      {/* Back Button */}
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => onNavigate("jobs")}
          className="gap-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a trabajos
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Form */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="mb-2 text-2xl font-bold text-slate-900 sm:text-3xl">
              Publicar Nuevo Trabajo
            </h1>
            <p className="mb-6 text-sm text-slate-600">
              Completa los detalles para encontrar el profesional ideal
            </p>

            <div className="mb-6 h-px bg-slate-200"></div>

            <form className="space-y-6">
              {/* Title */}
              <Field
                label="Título del trabajo"
                icon={Tag}
                description="Sé claro y específico"
              >
                <Input
                  placeholder="Ej: Armar caja de madera"
                  defaultValue={draft.title}
                  className="h-12 rounded-xl border-slate-300 focus-visible:border-sky-500 focus-visible:ring-sky-200"
                />
              </Field>

              {/* Description */}
              <Field
                label="Descripción detallada"
                icon={Tag}
                description="Incluye todos los detalles importantes"
              >
                <Textarea
                  rows={6}
                  placeholder="Describe el trabajo, materiales necesarios, herramientas, etc."
                  defaultValue={draft.description}
                  className="rounded-xl border-slate-300 focus-visible:border-sky-500 focus-visible:ring-sky-200"
                />
              </Field>

              {/* Price */}
              <Field
                label="Presupuesto"
                icon={DollarSign}
                description="Precio sugerido para el trabajo"
              >
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                    $
                  </span>
                  <Input
                    type="number"
                    placeholder="0"
                    defaultValue={draft.price}
                    className="h-12 pl-8"
                  />
                </div>
              </Field>

              {/* Date and Time */}
              <div className="grid gap-6 sm:grid-cols-2">
                <Field label="Fecha y hora de inicio" icon={Calendar}>
                  <CustomDateInput
                    name="startDate"
                    type="datetime"
                    placeholder="Selecciona fecha y hora"
                    minDate={new Date()}
                  />
                </Field>
                <Field label="Fecha y hora de fin" icon={Clock}>
                  <CustomDateInput
                    name="endDate"
                    type="datetime"
                    placeholder="Selecciona fecha y hora"
                    minDate={new Date()}
                  />
                </Field>
              </div>

              {/* Location */}
              <Field
                label="Ubicación"
                icon={MapPin}
                description="Donde se realizará el trabajo"
              >
                <div className="space-y-3">
                  <Input
                    placeholder="Dirección completa"
                    defaultValue={draft.location}
                    className="h-12"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                  >
                    <MapPin className="h-4 w-4" />
                    Usar mi ubicación actual
                  </Button>
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <iframe
                      title="Ubicación"
                      src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3282.848307755387!2d-58.445353523331274!3d-34.634545072935396!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x95bccbc522642cb9%3A0xb0a0fcab5a82bbf3!2sBuenos%20Aires!5e0!3m2!1ses-419!2sar!4v1718035414769!5m2!1ses-419!2sar"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      className="h-48 w-full"
                    />
                  </div>
                </div>
              </Field>

              {/* Images */}
              <Field
                label="Fotos"
                icon={ImageIcon}
                description="Agrega fotos para dar más contexto (opcional)"
              >
                <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-8 transition hover:border-sky-400">
                  <div className="text-center">
                    <Upload className="mx-auto h-12 w-12 text-slate-400" />
                    <p className="mt-2 text-sm text-slate-600">
                      Arrastra fotos aquí o{" "}
                      <button
                        type="button"
                        className="font-semibold text-sky-500 hover:text-sky-600"
                      >
                        selecciona archivos
                      </button>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      PNG, JPG hasta 5MB
                    </p>
                  </div>
                </div>
              </Field>
            </form>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Preview Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-900">
              Vista previa
            </h2>
            <div className="space-y-3 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Presupuesto:</span>
                <span className="font-bold text-sky-600">
                  ${draft.price.toLocaleString("es-AR")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Duración:</span>
                <span className="font-semibold">8 horas</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Ubicación:</span>
                <span className="font-semibold">{draft.location}</span>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
            <h3 className="mb-2 font-semibold text-sky-900">
              💡 Consejos para publicar
            </h3>
            <ul className="space-y-1 text-sm text-sky-800">
              <li>• Sé específico en la descripción</li>
              <li>• Agrega fotos del lugar</li>
              <li>• Define un presupuesto justo</li>
              <li>• Indica las herramientas necesarias</li>
            </ul>
          </div>

          {/* Terms and Conditions */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={contractTermsAccepted}
                onChange={(e) => setContractTermsAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500"
              />
              <span>
                Acepto los{" "}
                <button
                  type="button"
                  onClick={() => setShowContractTerms(true)}
                  className="font-semibold text-sky-500 hover:text-sky-600 hover:underline"
                >
                  términos y condiciones del contrato
                </button>
                {" "}y entiendo mis responsabilidades como cliente
              </span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              className="w-full gap-2 py-6 text-lg"
              size="lg"
              onClick={handlePublish}
            >
              Publicar trabajo
            </Button>
            <Button variant="outline" className="w-full">
              Guardar como borrador
            </Button>
          </div>
        </div>
      </div>

      {/* Modal de Términos del Contrato */}
      <TermsModal
        isOpen={showContractTerms}
        onClose={() => setShowContractTerms(false)}
        type="contract"
      />
    </div>
  );
}

interface FieldProps {
  label: string;
  icon: React.ElementType;
  description?: string;
  children: React.ReactNode;
}

function Field({ label, icon: Icon, description, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Icon className="h-4 w-4 text-sky-500" />
        {label}
      </label>
      {description && (
        <p className="text-xs text-slate-600">{description}</p>
      )}
      {children}
    </div>
  );
}
