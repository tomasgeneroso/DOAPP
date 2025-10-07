import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { clsx } from "clsx";
import {
  Calendar,
  Clock,
  Filter,
  MapPin,
  Plus,
  Search,
  Star,
} from "lucide-react";

import type { JobItem, ScreenId } from "./types";

interface JobsScreenProps {
  jobs: JobItem[];
  activeJobId: string;
  onSelectJob: (jobId: string) => void;
  onNavigate: (screen: ScreenId) => void;
}

export function JobsScreen({
  jobs,
  activeJobId,
  onSelectJob,
  onNavigate,
}: JobsScreenProps) {
  return (
    <div className="flex h-full flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Trabajos Disponibles
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {jobs.length} oportunidades cerca tuyo
          </p>
        </div>
        <Button
          onClick={() => onNavigate("create")}
          className="w-full gap-2 sm:w-auto"
          size="lg"
        >
          <Plus className="h-4 w-4" />
          Publicar trabajo
        </Button>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar trabajos..."
            className="h-12 pl-10"
          />
        </div>
        <Button
          variant="outline"
          className="h-12 gap-2"
        >
          <Filter className="h-4 w-4" />
          Filtros
        </Button>
      </div>

      {/* Jobs Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => (
          <article
            key={job.id}
            className={clsx(
              "group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-sky-300 hover:shadow-lg",
              activeJobId === job.id &&
                "border-sky-400 shadow-lg shadow-sky-100"
            )}
            onClick={() => {
              onSelectJob(job.id);
              onNavigate("detail");
            }}
          >
            {/* Price Badge */}
            <div className="absolute right-4 top-4 rounded-full bg-gradient-to-r from-sky-500 to-sky-600 px-3 py-1 text-sm font-bold text-white shadow-lg shadow-sky-500/30">
              ${job.price.toLocaleString("es-AR")}
            </div>

            {/* Title and Rating */}
            <div className="mb-3">
              <h3 className="mb-2 pr-20 text-lg font-bold text-slate-900 group-hover:text-sky-600">
                {job.title}
              </h3>
              <div className="flex items-center gap-1 text-amber-500">
                <Star className="h-4 w-4 fill-current" />
                <Star className="h-4 w-4 fill-current" />
                <Star className="h-4 w-4 fill-current" />
                <Star className="h-4 w-4 fill-current" />
                <Star className="h-4 w-4" />
                <span className="ml-1 text-xs text-slate-600">(4.2)</span>
              </div>
            </div>

            {/* Description */}
            <p className="mb-4 line-clamp-2 text-sm text-slate-600">
              {job.summary}
            </p>

            {/* Details */}
            <div className="mt-auto space-y-2 border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <MapPin className="h-4 w-4 text-slate-400" />
                <span>{job.location}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <span>{job.start.split(" ")[0]}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span>{job.start.split(" ")[1]}</span>
                </div>
              </div>
            </div>

            {/* Hover Button */}
            <div className="absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-r from-sky-500 to-sky-600 py-3 text-center text-sm font-semibold text-white transition-transform group-hover:translate-y-0">
              Ver detalles
            </div>
          </article>
        ))}
      </div>

      {/* Load More */}
      <div className="flex justify-center py-4">
        <Button variant="outline">
          Cargar más trabajos
        </Button>
      </div>
    </div>
  );
}
