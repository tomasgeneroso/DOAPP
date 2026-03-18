import { useState, useMemo, useRef, useEffect, memo, useCallback } from 'react';
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
  Download,
  ExternalLink,
  Share2,
  Plus,
  Trash2,
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

interface AvailabilitySlot {
  day: number;
  start: string;
  end: string;
}

interface JobsCalendarProps {
  jobs: CalendarJob[];
  title?: string;
  showFilters?: boolean;
  availabilitySlots?: AvailabilitySlot[];
  onAddAvailability?: (day: number, start: string, end: string) => void;
  onRemoveAvailability?: (day: number, index: number) => void;
}

type ViewMode = 'month' | 'week' | 'day' | 'list';

const HOUR_HEIGHT = 60; // px per hour row

// --- Google Calendar & iCal helpers ---

function formatDateForGoogleCal(dateStr: string): string {
  return new Date(dateStr).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function buildGoogleCalendarUrl(job: { title: string; startDate: string; endDate?: string; description?: string; location?: string; price?: number }): string {
  const start = formatDateForGoogleCal(job.startDate);
  const end = formatDateForGoogleCal(job.endDate || job.startDate);
  const description = [job.description || '', job.price ? `\nPrecio: $${job.price.toLocaleString('es-AR')} ARS` : ''].join('').trim();
  const params = new URLSearchParams({ action: 'TEMPLATE', text: job.title, dates: `${start}/${end}`, details: description });
  if (job.location) params.set('location', job.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function generateIcsEvents(jobs: Array<{ id: string; title: string; startDate: string; endDate?: string; description?: string; location?: string; price?: number }>): string {
  const now = formatDateForGoogleCal(new Date().toISOString());
  const events = jobs.map(job => {
    const start = formatDateForGoogleCal(job.startDate);
    const end = formatDateForGoogleCal(job.endDate || job.startDate);
    const desc = escapeIcsText([job.description || '', job.price ? `Precio: $${job.price.toLocaleString('es-AR')} ARS` : ''].filter(Boolean).join('\n'));
    return [
      'BEGIN:VEVENT',
      `UID:job-${job.id}@doapp.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escapeIcsText(job.title)}`,
      `DESCRIPTION:${desc}`,
      job.location ? `LOCATION:${escapeIcsText(job.location)}` : '',
      'STATUS:CONFIRMED',
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      'DESCRIPTION:Recordatorio de trabajo',
      'END:VALARM',
      'END:VEVENT',
    ].filter(Boolean).join('\r\n');
  });

  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DOAPP//Job Calendar//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:DOAPP - Trabajos', ...events, 'END:VCALENDAR'].join('\r\n');
}

const ICS_DAY_NAMES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const DAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function getNextDayOfWeek(dayOfWeek: number): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = (dayOfWeek - today.getDay() + 7) % 7 || 7;
  const next = new Date(today);
  next.setDate(today.getDate() + diff);
  return next;
}

function generateAvailabilityIcsEvents(slots: AvailabilitySlot[]): string[] {
  const now = formatDateForGoogleCal(new Date().toISOString());
  return slots.map((slot, i) => {
    const refDate = getNextDayOfWeek(slot.day);
    const [startH, startM] = slot.start.split(':').map(Number);
    const [endH, endM] = slot.end.split(':').map(Number);
    const dtStart = new Date(refDate);
    dtStart.setHours(startH, startM, 0, 0);
    const dtEnd = new Date(refDate);
    dtEnd.setHours(endH, endM, 0, 0);
    return [
      'BEGIN:VEVENT',
      `UID:availability-${slot.day}-${slot.start}-${slot.end}-${i}@doapp.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${formatDateForGoogleCal(dtStart.toISOString())}`,
      `DTEND:${formatDateForGoogleCal(dtEnd.toISOString())}`,
      `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAY_NAMES[slot.day]}`,
      `SUMMARY:Disponible (${DAY_LABELS[slot.day]} ${slot.start}-${slot.end})`,
      'DESCRIPTION:Horario de disponibilidad - DOAPP',
      'STATUS:CONFIRMED',
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    ].join('\r\n');
  });
}

function buildAvailabilityGoogleCalendarUrl(slot: AvailabilitySlot): string {
  const refDate = getNextDayOfWeek(slot.day);
  const [startH, startM] = slot.start.split(':').map(Number);
  const [endH, endM] = slot.end.split(':').map(Number);
  const dtStart = new Date(refDate);
  dtStart.setHours(startH, startM, 0, 0);
  const dtEnd = new Date(refDate);
  dtEnd.setHours(endH, endM, 0, 0);
  const start = formatDateForGoogleCal(dtStart.toISOString());
  const end = formatDateForGoogleCal(dtEnd.toISOString());
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Disponible (${DAY_LABELS[slot.day]} ${slot.start}-${slot.end})`,
    dates: `${start}/${end}`,
    details: 'Horario de disponibilidad - DOAPP',
    recur: `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAY_NAMES[slot.day]}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function generateCombinedIcs(
  jobs: Array<{ id: string; title: string; startDate: string; endDate?: string; description?: string; location?: string; price?: number }>,
  slots: AvailabilitySlot[]
): string {
  const now = formatDateForGoogleCal(new Date().toISOString());
  const jobEvents = jobs.map(job => {
    const start = formatDateForGoogleCal(job.startDate);
    const end = formatDateForGoogleCal(job.endDate || job.startDate);
    const desc = escapeIcsText([job.description || '', job.price ? `Precio: $${job.price.toLocaleString('es-AR')} ARS` : ''].filter(Boolean).join('\n'));
    return [
      'BEGIN:VEVENT', `UID:job-${job.id}@doapp.com`, `DTSTAMP:${now}`,
      `DTSTART:${start}`, `DTEND:${end}`,
      `SUMMARY:${escapeIcsText(job.title)}`, `DESCRIPTION:${desc}`,
      job.location ? `LOCATION:${escapeIcsText(job.location)}` : '',
      'STATUS:CONFIRMED',
      'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Recordatorio de trabajo', 'END:VALARM',
      'END:VEVENT',
    ].filter(Boolean).join('\r\n');
  });
  const availEvents = generateAvailabilityIcsEvents(slots);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DOAPP//Job Calendar//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:DOAPP - Trabajos y Disponibilidad', ...jobEvents, ...availEvents, 'END:VCALENDAR'].join('\r\n');
}

function downloadIcsBlob(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadIcsFile(jobs: Array<{ id: string; title: string; startDate: string; endDate?: string; description?: string; location?: string; price?: number }>, filename: string): void {
  downloadIcsBlob(generateIcsEvents(jobs), filename);
}

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

function JobsCalendar({ jobs, title = "Calendario de Trabajos", showFilters = true, availabilitySlots = [], onAddAvailability, onRemoveAvailability }: JobsCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedJob, setSelectedJob] = useState<CalendarJob | null>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showSyncMenu, setShowSyncMenu] = useState(false);

  // Filters
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [timeRange, setTimeRange] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Context menu for right-click on calendar cells
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    dayOfWeek: number;
    date?: Date;
    hour?: number;
    existingSlots: AvailabilitySlot[];
  } | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleCellContextMenu = useCallback((e: React.MouseEvent, dayOfWeek: number, date?: Date, hour?: number) => {
    e.preventDefault();
    const existingSlots = availabilitySlots.filter(s => s.day === dayOfWeek);
    const zoom = window.innerWidth > 769 ? 0.75 : 1;
    const x = e.clientX / zoom;
    const y = e.clientY / zoom;
    const maxW = window.innerWidth / zoom - 250;
    const maxH = window.innerHeight / zoom - 200;
    setContextMenu({
      x: Math.min(x, maxW),
      y: Math.min(y, maxH),
      dayOfWeek,
      date,
      hour,
      existingSlots,
    });
  }, [availabilitySlots]);

  // Close context menu on click outside / Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [contextMenu]);

  // Auto-scroll to 6 AM when switching to week/day view
  useEffect(() => {
    if (scrollContainerRef.current && (viewMode === 'day' || viewMode === 'week')) {
      scrollContainerRef.current.scrollTop = 6 * HOUR_HEIGHT;
    }
  }, [viewMode]);

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
            const dayOfWeek = date.getDay();
            const dayAvailability = availabilitySlots.filter(s => s.day === dayOfWeek);

            return (
              <div
                key={date.toISOString()}
                onContextMenu={(e) => handleCellContextMenu(e, dayOfWeek, date)}
                className={`min-h-[100px] p-1 border-b border-r border-slate-200 dark:border-slate-700 cursor-context-menu ${
                  today ? 'bg-sky-50 dark:bg-sky-900/20' : dayAvailability.length > 0 ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  {dayAvailability.length > 0 ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Disponible" />
                  ) : <div />}
                  <span className={`text-sm ${
                    today
                      ? 'font-bold text-sky-600 dark:text-sky-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}>
                    {date.getDate()}
                  </span>
                </div>
                {dayAvailability.length > 0 && (
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mb-0.5 truncate">
                    {dayAvailability.map(s => `${s.start}-${s.end}`).join(', ')}
                  </div>
                )}
                <div className="space-y-0.5 overflow-y-auto max-h-[55px]">
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
    const hours = Array.from({ length: 24 }, (_, i) => i); // 0-23 full day

    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div ref={scrollContainerRef} className="max-h-[600px] overflow-y-auto">
          {/* Day headers - sticky inside scroll container */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 sticky top-0 z-10 bg-white dark:bg-slate-800">
            <div className="w-[60px] flex-shrink-0 p-2" />
            {days.map(day => (
              <div
                key={day.toISOString()}
                className={`flex-1 p-2 text-center border-l border-slate-200 dark:border-slate-700 ${
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

          {/* Time grid with day columns */}
          <div className="flex">
            {/* Time labels column */}
            <div className="w-[60px] flex-shrink-0">
              {hours.map(hour => (
                <div
                  key={hour}
                  style={{ height: HOUR_HEIGHT }}
                  className="flex items-start justify-end pr-2 pt-1 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700/50"
                >
                  {hour.toString().padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {/* Day columns with job overlays */}
            {days.map(day => {
              const dayJobs = getJobsForDate(day);
              const dayOfWeek = day.getDay();

              return (
                <div key={day.toISOString()} className="flex-1 relative border-l border-slate-200 dark:border-slate-700">
                  {/* Hour cells background */}
                  {hours.map(hour => {
                    const isAvailable = availabilitySlots.some(slot => {
                      if (slot.day !== dayOfWeek) return false;
                      const startH = parseInt(slot.start.split(':')[0], 10);
                      const endH = parseInt(slot.end.split(':')[0], 10);
                      return hour >= startH && hour < endH;
                    });

                    return (
                      <div
                        key={hour}
                        style={{ height: HOUR_HEIGHT }}
                        onContextMenu={(e) => handleCellContextMenu(e, dayOfWeek, day, hour)}
                        className={`border-b border-slate-100 dark:border-slate-700/50 cursor-context-menu ${
                          isAvailable
                            ? 'bg-emerald-50 dark:bg-emerald-900/20'
                            : isToday(day)
                            ? 'bg-sky-50/50 dark:bg-sky-900/10'
                            : ''
                        }`}
                      />
                    );
                  })}

                  {/* Jobs overlay - absolutely positioned to span duration */}
                  {dayJobs.map(job => {
                    const start = new Date(job.startDate);
                    const end = job.endDate ? new Date(job.endDate) : new Date(start.getTime() + 3600000);

                    const dayStart = new Date(day);
                    dayStart.setHours(0, 0, 0, 0);
                    const dayEnd = new Date(day);
                    dayEnd.setHours(23, 59, 59, 999);

                    const effectiveStart = start < dayStart ? dayStart : start;
                    const effectiveEnd = end > dayEnd ? dayEnd : end;

                    const startMinutes = effectiveStart.getHours() * 60 + effectiveStart.getMinutes();
                    const endMinutes = effectiveEnd.getHours() * 60 + effectiveEnd.getMinutes();
                    const topPx = (startMinutes / 60) * HOUR_HEIGHT;
                    const heightPx = Math.max(((endMinutes - startMinutes) / 60) * HOUR_HEIGHT, 28);

                    const categoryInfo = getCategoryInfo(job.category);

                    return (
                      <button
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        className={`absolute left-0.5 right-0.5 ${getCategoryColor(job.category)} text-white rounded px-1 py-0.5 text-[10px] hover:opacity-90 transition-opacity overflow-hidden z-[1] leading-tight cursor-pointer`}
                        style={{ top: topPx, height: heightPx }}
                        title={`${job.title} - ${effectiveStart.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}${job.endDate ? ` a ${effectiveEnd.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : ''}`}
                      >
                        <div className="truncate font-medium">{categoryInfo?.icon} {job.title}</div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // Render day view
  const renderDayView = () => {
    const dayJobs = getJobsForDate(currentDate);
    const hours = Array.from({ length: 24 }, (_, i) => i); // 0-23 full day

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

        <div ref={scrollContainerRef} className="max-h-[600px] overflow-y-auto">
          <div className="relative">
            {/* Hour grid background */}
            {hours.map(hour => {
              const dayOfWeek = currentDate.getDay();
              const isAvailable = availabilitySlots.some(slot => {
                if (slot.day !== dayOfWeek) return false;
                const startH = parseInt(slot.start.split(':')[0], 10);
                const endH = parseInt(slot.end.split(':')[0], 10);
                return hour >= startH && hour < endH;
              });

              return (
                <div key={hour} className="flex border-b border-slate-100 dark:border-slate-700/50" style={{ height: HOUR_HEIGHT }}>
                  <div className="w-20 flex-shrink-0 pt-1 pr-3 text-sm text-slate-500 dark:text-slate-400 text-right border-r border-slate-200 dark:border-slate-700">
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                  <div
                    onContextMenu={(e) => handleCellContextMenu(e, dayOfWeek, currentDate, hour)}
                    className={`flex-1 cursor-context-menu ${isAvailable ? 'bg-emerald-50 dark:bg-emerald-900/20' : ''}`}
                  />
                </div>
              );
            })}

            {/* Jobs overlay - absolutely positioned to span duration */}
            <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: '5rem', right: 0 }}>
              {dayJobs.map(job => {
                const start = new Date(job.startDate);
                const end = job.endDate ? new Date(job.endDate) : new Date(start.getTime() + 3600000);

                const dayStart = new Date(currentDate);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(currentDate);
                dayEnd.setHours(23, 59, 59, 999);

                const effectiveStart = start < dayStart ? dayStart : start;
                const effectiveEnd = end > dayEnd ? dayEnd : end;

                const startMinutes = effectiveStart.getHours() * 60 + effectiveStart.getMinutes();
                const endMinutes = effectiveEnd.getHours() * 60 + effectiveEnd.getMinutes();
                const topPx = (startMinutes / 60) * HOUR_HEIGHT;
                const heightPx = Math.max(((endMinutes - startMinutes) / 60) * HOUR_HEIGHT, 40);

                const categoryInfo = getCategoryInfo(job.category);

                return (
                  <button
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className={`absolute left-1 right-1 ${getCategoryColor(job.category)} text-white rounded-lg p-2 pointer-events-auto hover:opacity-90 transition-opacity overflow-hidden z-[1] cursor-pointer`}
                    style={{ top: topPx, height: heightPx }}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span>{categoryInfo?.icon}</span>
                      <span className="font-medium truncate text-sm">{job.title}</span>
                    </div>
                    {heightPx >= 50 && (
                      <div className="flex items-center gap-1 text-xs opacity-90">
                        <Clock className="h-3 w-3" />
                        <span>
                          {effectiveStart.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                          {job.endDate && ` - ${effectiveEnd.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
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

          {/* Sync / Export dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSyncMenu(!showSyncMenu)}
              className={`p-2 rounded-lg border ${
                showSyncMenu
                  ? 'bg-sky-500 text-white border-sky-500'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              title="Sincronizar calendario"
            >
              <Share2 className="h-4 w-4" />
            </button>

            {showSyncMenu && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl z-50 overflow-hidden">
                <div className="p-3 border-b border-slate-200 dark:border-slate-700">
                  <h4 className="font-semibold text-sm text-slate-900 dark:text-white">Sincronizar calendario</h4>
                </div>
                <div className="p-2 space-y-1">
                  {/* Exportar todo (trabajos + disponibilidad) */}
                  <button
                    onClick={() => {
                      downloadIcsBlob(generateCombinedIcs(filteredJobs, availabilitySlots), 'doapp-calendario.ics');
                      setShowSyncMenu(false);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
                  >
                    <Download className="h-4 w-4 text-slate-500" />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Exportar todo (.ics)</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Trabajos + disponibilidad</p>
                    </div>
                  </button>
                  {/* Exportar solo trabajos */}
                  <button
                    onClick={() => {
                      downloadIcsFile(filteredJobs, 'doapp-trabajos.ics');
                      setShowSyncMenu(false);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
                  >
                    <CalendarIcon className="h-4 w-4 text-slate-500" />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Solo trabajos (.ics)</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{filteredJobs.length} trabajo{filteredJobs.length !== 1 ? 's' : ''}</p>
                    </div>
                  </button>
                  {/* Exportar solo disponibilidad */}
                  {availabilitySlots.length > 0 && (
                    <button
                      onClick={() => {
                        const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DOAPP//Job Calendar//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:DOAPP - Disponibilidad', ...generateAvailabilityIcsEvents(availabilitySlots), 'END:VCALENDAR'].join('\r\n');
                        downloadIcsBlob(ics, 'doapp-disponibilidad.ics');
                        setShowSyncMenu(false);
                      }}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
                    >
                      <Clock className="h-4 w-4 text-emerald-500" />
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">Solo disponibilidad (.ics)</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{availabilitySlots.length} horario{availabilitySlots.length !== 1 ? 's' : ''} recurrente{availabilitySlots.length !== 1 ? 's' : ''}</p>
                      </div>
                    </button>
                  )}
                  {/* Separador */}
                  <div className="border-t border-slate-200 dark:border-slate-700 my-1" />
                  {/* Suscripción al feed */}
                  <button
                    onClick={async () => {
                      try {
                        const token = localStorage.getItem('token');
                        const res = await fetch('/api/jobs/calendar/subscription-url', {
                          headers: { Authorization: `Bearer ${token}` },
                          credentials: 'include',
                        });
                        const data = await res.json();
                        if (data.success) {
                          await navigator.clipboard.writeText(data.data.feedUrl);
                          alert('URL del feed copiada al portapapeles.\n\nEn Google Calendar:\n1. Click en "+" al lado de "Otros calendarios"\n2. Seleccionar "Desde una URL"\n3. Pegar la URL copiada');
                        }
                      } catch {
                        alert('Error al obtener la URL del feed');
                      }
                      setShowSyncMenu(false);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
                  >
                    <ExternalLink className="h-4 w-4 text-slate-500" />
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-white">Suscribirse al feed</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Sincronización automática</p>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
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

      {/* Availability legend with Google Calendar links */}
      {availabilitySlots.length > 0 && viewMode !== 'list' && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700" />
            <span>Tu disponibilidad</span>
          </div>
          {availabilitySlots.map((slot, i) => (
            <a
              key={i}
              href={buildAvailabilityGoogleCalendarUrl(slot)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
              title={`Agregar ${DAY_LABELS[slot.day]} ${slot.start}-${slot.end} a Google Calendar`}
            >
              <CalendarIcon className="h-3 w-3" />
              {DAY_LABELS[slot.day].substring(0, 3)} {slot.start}-{slot.end}
            </a>
          ))}
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

              {/* Calendar sync */}
              <div className="flex gap-2">
                <a
                  href={buildGoogleCalendarUrl(selectedJob)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors text-sm"
                >
                  <CalendarIcon className="h-4 w-4" />
                  Google Calendar
                </a>
                <button
                  onClick={() => downloadIcsFile([selectedJob], `doapp-${selectedJob.id}.ics`)}
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-xl hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors text-sm"
                  title="Descargar .ics"
                >
                  <Download className="h-4 w-4" />
                </button>
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

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl z-[100] overflow-hidden w-56"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
        >
          <div className="p-1.5">
            {/* Add availability */}
            {onAddAvailability && contextMenu.existingSlots.length === 0 && (
              <button
                onClick={() => {
                  const start = contextMenu.hour !== undefined ? `${String(contextMenu.hour).padStart(2, '0')}:00` : '09:00';
                  const endH = contextMenu.hour !== undefined ? contextMenu.hour + 1 : 18;
                  const end = `${String(Math.min(endH, 23)).padStart(2, '0')}:00`;
                  onAddAvailability(contextMenu.dayOfWeek, start, end);
                  closeContextMenu();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-left transition-colors"
              >
                <Plus className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-slate-700 dark:text-slate-200">
                  {contextMenu.hour !== undefined
                    ? `Disponible ${String(contextMenu.hour).padStart(2, '0')}:00-${String(Math.min(contextMenu.hour + 1, 23)).padStart(2, '0')}:00`
                    : 'Marcar disponible'}
                </span>
              </button>
            )}

            {/* Add more availability (when day already has slots) */}
            {onAddAvailability && contextMenu.existingSlots.length > 0 && contextMenu.hour !== undefined && (
              <button
                onClick={() => {
                  const start = `${String(contextMenu.hour).padStart(2, '0')}:00`;
                  const end = `${String(Math.min((contextMenu.hour || 0) + 1, 23)).padStart(2, '0')}:00`;
                  onAddAvailability(contextMenu.dayOfWeek, start, end);
                  closeContextMenu();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-left transition-colors"
              >
                <Plus className="h-4 w-4 text-emerald-500" />
                <span className="text-sm text-slate-700 dark:text-slate-200">
                  Agregar {String(contextMenu.hour).padStart(2, '0')}:00-{String(Math.min(contextMenu.hour + 1, 23)).padStart(2, '0')}:00
                </span>
              </button>
            )}

            {/* Remove availability for each existing slot */}
            {onRemoveAvailability && contextMenu.existingSlots.map((slot, i) => (
              <button
                key={i}
                onClick={() => {
                  const globalIndex = availabilitySlots.findIndex(s => s.day === slot.day && s.start === slot.start && s.end === slot.end);
                  if (globalIndex !== -1) onRemoveAvailability(slot.day, globalIndex);
                  closeContextMenu();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-left transition-colors"
              >
                <Trash2 className="h-4 w-4 text-red-500" />
                <span className="text-sm text-slate-700 dark:text-slate-200">
                  Quitar {slot.start}-{slot.end}
                </span>
              </button>
            ))}

            {/* View navigation */}
            {contextMenu.date && viewMode === 'month' && (
              <>
                <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                <button
                  onClick={() => {
                    if (contextMenu.date) setCurrentDate(contextMenu.date);
                    setViewMode('week');
                    closeContextMenu();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
                >
                  <Grid3X3 className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-700 dark:text-slate-200">Ver semana</span>
                </button>
                <button
                  onClick={() => {
                    if (contextMenu.date) setCurrentDate(contextMenu.date);
                    setViewMode('day');
                    closeContextMenu();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
                >
                  <CalendarIcon className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-700 dark:text-slate-200">Ver día</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(JobsCalendar);
