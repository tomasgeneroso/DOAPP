import { Button } from "@/components/ui/Button";
import {
  ArrowLeft,
  Calendar,
  Clock,
  DollarSign,
  MapPin,
  MessageSquare,
  Share2,
  Star,
  User,
} from "lucide-react";

import type { JobItem, ScreenId } from "./types";

interface JobDetailScreenProps {
  job: JobItem;
  onNavigate: (screen: ScreenId) => void;
}

export function JobDetailScreen({ job, onNavigate }: JobDetailScreenProps) {
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
        {/* Main Content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Header Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex-1">
                <h1 className="mb-2 text-2xl font-bold text-slate-900 sm:text-3xl">
                  {job.title}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    <span>{job.location}</span>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                    4.2
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="rounded-full bg-gradient-to-r from-sky-500 to-sky-600 px-4 py-2 text-xl font-bold text-white shadow-lg shadow-sky-500/30">
                  ${job.price.toLocaleString("es-AR")}
                </div>
                <Button variant="ghost" className="h-8 w-8">
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="my-4 h-px bg-slate-200"></div>

            {/* Time Info */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoBlock
                icon={Calendar}
                label="Fecha de inicio"
                value={job.start.split(" ")[0]}
              />
              <InfoBlock
                icon={Clock}
                label="Hora de inicio"
                value={job.start.split(" ")[1]}
              />
              <InfoBlock
                icon={Calendar}
                label="Fecha de fin"
                value={job.end.split(" ")[0]}
              />
              <InfoBlock
                icon={Clock}
                label="Hora de fin"
                value={job.end.split(" ")[1]}
              />
            </div>
          </div>

          {/* Description */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-bold text-slate-900">
              Descripción del trabajo
            </h2>
            <p className="whitespace-pre-line leading-relaxed text-slate-600">
              {job.description}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800">
                Carpintería
              </span>
              <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800">
                Bricolaje
              </span>
              <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-800">
                Urgente
              </span>
            </div>
          </div>

          {/* Location Map */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-slate-900">
              <MapPin className="h-5 w-5 text-sky-500" />
              Ubicación
            </h2>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <iframe
                title={`Ubicación de ${job.title}`}
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3282.873991253504!2d-58.44415832333131!3d-34.633907172935526!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x95bccbc523d4f129%3A0x7f661d476d1e6779!2sParque%20Chacabuco!5e0!3m2!1ses-419!2sar!4v1718035414770!5m2!1ses-419!2sar"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-64 w-full"
              />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Client Info */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-bold text-slate-900">
              Publicado por
            </h2>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 overflow-hidden rounded-full bg-sky-100">
                <img
                  src="https://api.dicebear.com/7.x/avataaars/svg?seed=Maria"
                  alt="María Castro"
                  className="h-full w-full object-cover"
                />
              </div>
              <div>
                <p className="font-semibold text-slate-900">María Castro</p>
                <div className="flex items-center gap-1 text-sm text-slate-600">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                  <span>4.8 (23 reviews)</span>
                </div>
              </div>
            </div>
            <div className="my-4 h-px bg-slate-200"></div>
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" />
                <span>Miembro desde 2023</span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                <span>12 trabajos completados</span>
              </div>
            </div>
            <Button className="mt-4 w-full gap-2" variant="outline">
              <MessageSquare className="h-4 w-4" />
              Enviar mensaje
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button className="w-full gap-2 py-6 text-lg" size="lg">
              Aplicar al trabajo
            </Button>
            <Button variant="outline" className="w-full">
              Guardar para después
            </Button>
          </div>

          {/* Tips */}
          <div className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
            <h3 className="mb-2 font-semibold text-sky-900">
              💡 Consejo
            </h3>
            <p className="text-sm text-sky-800">
              Lee bien la descripción y asegúrate de tener las herramientas
              necesarias antes de aplicar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface InfoBlockProps {
  icon: React.ElementType;
  label: string;
  value: string;
}

function InfoBlock({ icon: Icon, label, value }: InfoBlockProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
}
