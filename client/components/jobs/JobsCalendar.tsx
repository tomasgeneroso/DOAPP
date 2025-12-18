import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  List,
  Grid3X3,
  Filter,
  X,
  MapPin,
  Clock,
  DollarSign,
} from 'lucide-react';
import { JOB_CATEGORIES } from '../../../shared/constants/categories';

interface CalendarJob {
  id: string;
  title: string;
  description?: string;
  price: number;
  category: string;
  location: string;
  startDate: string;
  endDate?: string;
  status: string;
  proposalStatus?: string;
}

interface JobsCalendarProps {
  jobs: CalendarJob[];
  title?: string;
  showFilters?: boolean;
}

type ViewMode = 'month' | 'week' | 'day' | 'list';

const CATEGORY_COLORS: Record<string, string> = {
  plomeria: 'bg-blue-500',
  construccion: 'bg-orange-500',
  limpieza: 'bg-green-500',
  electricidad: 'bg-yellow-500',
  pintura: 'bg-purple-500',
  carpinteria: 'bg-amber-600',
  jardineria: 'bg-emerald-500',
  armado_muebles: 'bg-indigo-500',
  mudanzas: 'bg-red-500',
  tecnologia: 'bg-cyan-500',
  reparaciones: 'bg-slate-500',
  climatizacion: 'bg-sky-500',
  seguridad: 'bg-rose-500',
  decoracion: 'bg-pink-500',
  mascotas: 'bg-teal-500',
  automotriz: 'bg-zinc-500',
  otros: 'bg-gray-500',
};

export default function JobsCalendar({ jobs, title = "Calendario de Trabajos", showFilters = true }: JobsCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedJob, setSelectedJob] = useState<CalendarJob | null>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);

  // Filters
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [timeRange, setTimeRange] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');

  // Get unique locations from jobs
  const locations = useMemo(() => {
    const locs = new Set(jobs.map(j => j.location).filter(Boolean));
    return Array.from(locs).sort();
  }, [jobs]);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter(job => {
      // Category filter
      if (selectedCategories.length > 0 && !selectedCategories.includes(job.category)) {
        return false;
      }
      // Location filter
      if (selectedLocation && !job.location.toLowerCase().includes(selectedLocation.toLowerCase())) {
        return false;
      }
      // Time range filter
      if (timeRange !== 'all' && job.startDate) {
        const hour = new Date(job.startDate).getHours();
        if (timeRange === 'morning' && (hour < 6 || hour >= 12)) return false;
        if (timeRange === 'afternoon' && (hour < 12 || hour >= 18)) return false;
        if (timeRange === 'evening' && (hour < 18 || hour >= 24)) return false;
      }
      return true;
    });
  }, [jobs, selectedCategories, selectedLocation, timeRange]);

  // Get jobs for a specific date
  const getJobsForDate = (date: Date) => {
    return filteredJobs.filter(job => {
      const jobStart = new Date(job.startDate);
      const jobEnd = job.endDate ? new Date(job.endDate) : jobStart;

      const dateStart = new Date(date);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(date);
      dateEnd.setHours(23, 59, 59, 999);

      return jobStart <= dateEnd && jobEnd >= dateStart;
    });
  };

  // Calendar navigation
  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (viewMode === 'month') {
        newDate.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1));
      } else if (viewMode === 'week') {
        newDate.setDate(prev.getDate() + (direction === 'next' ? 7 : -7));
      } else if (viewMode === 'day') {
        newDate.setDate(prev.getDate() + (direction === 'next' ? 1 : -1));
      }
      return newDate;
    });
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Get calendar days for month view
  const getCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay(); // 0 = Sunday
    const daysInMonth = lastDay.getDate();

    const days: (Date | null)[] = [];

    // Add empty slots for days before first of month
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }

    // Add days of month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  // Get week days
  const getWeekDays = () => {
    const days: Date[] = [];
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    for (let i = 0; i < 7; i++) {
      const day = new Date(startOfWeek);
      day.setDate(startOfWeek.getDate() + i);
      days.push(day);
    }

    return days;
  };

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-AR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatMonthYear = (date: Date) => {
    return date.toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'long'
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const getCategoryColor = (category: string) => {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS.otros;
  };

  const getCategoryInfo = (categoryId: string) => {
    return JOB_CATEGORIES.find(c => c.id === categoryId);
  };

  // Render job pill
  const renderJobPill = (job: CalendarJob, compact = false) => {
    const categoryInfo = getCategoryInfo(job.category);

    if (compact) {
      return (
        <button
          key={job.id}
          onClick={() => setSelectedJob(job)}
          className={`w-full text-left text-xs truncate px-1.5 py-0.5 rounded ${getCategoryColor(job.category)} text-white hover:opacity-80 transition-opacity`}
          title={job.title}
        >
          {categoryInfo?.icon} {job.title}
        </button>
      );
    }

    return (
      <button
        key={job.id}
        onClick={() => setSelectedJob(job)}
        className={`w-full text-left p-2 rounded-lg ${getCategoryColor(job.category)} text-white hover:opacity-90 transition-opacity`}
      >
        <div className="flex items-center gap-2 mb-1">
          <span>{categoryInfo?.icon}</span>
          <span className="font-medium truncate">{job.title}</span>
        </div>
        <div className="flex items-center gap-2 text-xs opacity-90">
          <Clock className="h-3 w-3" />
          <span>
            {new Date(job.startDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </button>
    );
  };

  // Render month view
  const renderMonthView = () => {
    const days = getCalendarDays();
    const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Week day headers */}
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-700">
          {weekDays.map(day => (
            <div key={day} className="p-2 text-center text-sm font-medium text-slate-600 dark:text-slate-400">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {days.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="min-h-[100px] bg-slate-50 dark:bg-slate-900/50 border-b border-r border-slate-200 dark:border-slate-700" />;
            }

            const dayJobs = getJobsForDate(date);
            const today = isToday(date);

            return (
              <div
                key={date.toISOString()}
                className={`min-h-[100px] p-1 border-b border-r border-slate-200 dark:border-slate-700 ${
                  today ? 'bg-sky-50 dark:bg-sky-900/20' : ''
                }`}
              >
                <div className={`text-right text-sm mb-1 ${
                  today
                    ? 'font-bold text-sky-600 dark:text-sky-400'
                    : 'text-slate-600 dark:text-slate-400'
                }`}>
                  {date.getDate()}
                </div>
                <div className="space-y-0.5 overflow-y-auto max-h-[70px]">
                  {dayJobs.slice(0, 3).map(job => renderJobPill(job, true))}
                  {dayJobs.length > 3 && (
                    <div className="text-xs text-slate-500 dark:text-slate-400 text-center">
                      +{dayJobs.length - 3} más
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render week view
  const renderWeekView = () => {
    const days = getWeekDays();
    const hours = Array.from({ length: 18 }, (_, i) => i + 6); // 6 AM to 11 PM

    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-8 border-b border-slate-200 dark:border-slate-700">
          <div className="p-2" /> {/* Empty corner */}
          {days.map(day => (
            <div
              key={day.toISOString()}
              className={`p-2 text-center border-l border-slate-200 dark:border-slate-700 ${
                isToday(day) ? 'bg-sky-50 dark:bg-sky-900/20' : ''
              }`}
            >
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {day.toLocaleDateString('es-AR', { weekday: 'short' })}
              </div>
              <div className={`text-lg font-semibold ${
                isToday(day) ? 'text-sky-600 dark:text-sky-400' : 'text-slate-900 dark:text-white'
              }`}>
                {day.getDate()}
              </div>
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div className="max-h-[600px] overflow-y-auto">
          {hours.map(hour => (
            <div key={hour} className="grid grid-cols-8 border-b border-slate-100 dark:border-slate-700/50">
              <div className="p-2 text-xs text-slate-500 dark:text-slate-400 text-right pr-3">
                {hour.toString().padStart(2, '0')}:00
              </div>
              {days.map(day => {
                const dayJobs = getJobsForDate(day).filter(job => {
                  const jobHour = new Date(job.startDate).getHours();
                  return jobHour === hour;
                });

                return (
                  <div
                    key={`${day.toISOString()}-${hour}`}
                    className={`min-h-[60px] p-1 border-l border-slate-200 dark:border-slate-700 ${
                      isToday(day) ? 'bg-sky-50/50 dark:bg-sky-900/10' : ''
                    }`}
                  >
                    {dayJobs.map(job => renderJobPill(job, true))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render day view
  const renderDayView = () => {
    const dayJobs = getJobsForDate(currentDate);
    const hours = Array.from({ length: 18 }, (_, i) => i + 6);

    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white capitalize">
            {formatDate(currentDate)}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {dayJobs.length} trabajo{dayJobs.length !== 1 ? 's' : ''} programado{dayJobs.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="max-h-[600px] overflow-y-auto">
          {hours.map(hour => {
            const hourJobs = dayJobs.filter(job => {
              const jobHour = new Date(job.startDate).getHours();
              return jobHour === hour;
            });

            return (
              <div key={hour} className="flex border-b border-slate-100 dark:border-slate-700/50">
                <div className="w-20 p-3 text-sm text-slate-500 dark:text-slate-400 text-right border-r border-slate-200 dark:border-slate-700">
                  {hour.toString().padStart(2, '0')}:00
                </div>
                <div className="flex-1 p-2 space-y-2 min-h-[60px]">
                  {hourJobs.map(job => renderJobPill(job))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render list view
  const renderListView = () => {
    const sortedJobs = [...filteredJobs].sort((a, b) =>
      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );

    // Group by date
    const groupedJobs: Record<string, CalendarJob[]> = {};
    sortedJobs.forEach(job => {
      const dateKey = new Date(job.startDate).toLocaleDateString('es-AR');
      if (!groupedJobs[dateKey]) {
        groupedJobs[dateKey] = [];
      }
      groupedJobs[dateKey].push(job);
    });

    return (
      <div className="space-y-4">
        {Object.entries(groupedJobs).map(([dateKey, dateJobs]) => (
          <div key={dateKey} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="p-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                {dateKey}
              </h3>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-700">
              {dateJobs.map(job => {
                const categoryInfo = getCategoryInfo(job.category);
                return (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className="w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg ${getCategoryColor(job.category)} flex items-center justify-center text-xl`}>
                        {categoryInfo?.icon || '📋'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-slate-900 dark:text-white truncate">
                          {job.title}
                        </h4>
                        <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-slate-600 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {new Date(job.startDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                            {job.endDate && (
                              <> - {new Date(job.endDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</>
                            )}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {job.location}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-semibold text-sky-600 dark:text-sky-400">
                          ${job.price.toLocaleString('es-AR')}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {Object.keys(groupedJobs).length === 0 && (
          <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
            <CalendarIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">
              No hay trabajos que coincidan con los filtros
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          {title}
        </h2>

        <div className="flex items-center gap-2">
          {/* View mode toggles */}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-sm ${viewMode === 'month' ? 'bg-sky-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              Mes
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-sm border-l border-slate-200 dark:border-slate-700 ${viewMode === 'week' ? 'bg-sky-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              Semana
            </button>
            <button
              onClick={() => setViewMode('day')}
              className={`px-3 py-1.5 text-sm border-l border-slate-200 dark:border-slate-700 ${viewMode === 'day' ? 'bg-sky-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              Día
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-sm border-l border-slate-200 dark:border-slate-700 ${viewMode === 'list' ? 'bg-sky-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {showFilters && (
            <button
              onClick={() => setShowFilterPanel(!showFilterPanel)}
              className={`p-2 rounded-lg border ${
                showFilterPanel || selectedCategories.length > 0 || selectedLocation || timeRange !== 'all'
                  ? 'bg-sky-500 text-white border-sky-500'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              <Filter className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      {viewMode !== 'list' && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigateMonth('prev')}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white capitalize">
              {viewMode === 'day' ? formatDate(currentDate) : formatMonthYear(currentDate)}
            </h3>
            <button
              onClick={goToToday}
              className="px-3 py-1 text-sm bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
            >
              Hoy
            </button>
          </div>

          <button
            onClick={() => navigateMonth('next')}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Filter Panel */}
      {showFilterPanel && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-white">Filtros</h3>
            <button
              onClick={() => {
                setSelectedCategories([]);
                setSelectedLocation('');
                setTimeRange('all');
              }}
              className="text-sm text-sky-600 hover:text-sky-700"
            >
              Limpiar filtros
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Category filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Categorías
              </label>
              <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto">
                {JOB_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategories(prev =>
                        prev.includes(cat.id)
                          ? prev.filter(c => c !== cat.id)
                          : [...prev, cat.id]
                      );
                    }}
                    className={`px-2 py-1 text-xs rounded-full transition-colors ${
                      selectedCategories.includes(cat.id)
                        ? `${getCategoryColor(cat.id)} text-white`
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {cat.icon} {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Location filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Ubicación
              </label>
              <input
                type="text"
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                placeholder="Filtrar por barrio..."
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400"
              />
              {locations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {locations.slice(0, 5).map(loc => (
                    <button
                      key={loc}
                      onClick={() => setSelectedLocation(loc)}
                      className="px-2 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 rounded hover:bg-slate-200 dark:hover:bg-slate-600"
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Time range filter */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Franja Horaria
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'all', label: 'Todas' },
                  { id: 'morning', label: 'Mañana (6-12)' },
                  { id: 'afternoon', label: 'Tarde (12-18)' },
                  { id: 'evening', label: 'Noche (18-24)' },
                ].map(range => (
                  <button
                    key={range.id}
                    onClick={() => setTimeRange(range.id as typeof timeRange)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      timeRange === range.id
                        ? 'bg-sky-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Calendar View */}
      {viewMode === 'month' && renderMonthView()}
      {viewMode === 'week' && renderWeekView()}
      {viewMode === 'day' && renderDayView()}
      {viewMode === 'list' && renderListView()}

      {/* Job Detail Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelectedJob(null)}>
          <div
            className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`p-4 ${getCategoryColor(selectedJob.category)}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{getCategoryInfo(selectedJob.category)?.icon || '📋'}</span>
                  <div>
                    <h3 className="text-lg font-bold text-white">{selectedJob.title}</h3>
                    <p className="text-sm text-white/80">{getCategoryInfo(selectedJob.category)?.label}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="p-1 rounded-lg hover:bg-white/20 text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Price */}
              <div className="flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-700 rounded-xl">
                <span className="text-slate-600 dark:text-slate-400">Precio</span>
                <span className="text-xl font-bold text-sky-600 dark:text-sky-400">
                  ${selectedJob.price.toLocaleString('es-AR')} ARS
                </span>
              </div>

              {/* Details */}
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                  <CalendarIcon className="h-5 w-5 text-slate-400" />
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {new Date(selectedJob.startDate).toLocaleDateString('es-AR', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </p>
                    <p className="text-sm">
                      {new Date(selectedJob.startDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      {selectedJob.endDate && (
                        <> - {new Date(selectedJob.endDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                  <MapPin className="h-5 w-5 text-slate-400" />
                  <span>{selectedJob.location}</span>
                </div>

                {selectedJob.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
                    {selectedJob.description}
                  </p>
                )}
              </div>

              {/* Action */}
              <Link
                to={`/jobs/${selectedJob.id}`}
                className="block w-full text-center py-3 bg-sky-500 hover:bg-sky-600 text-white font-semibold rounded-xl transition-colors"
              >
                Ver detalles completos
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
