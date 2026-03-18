import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Briefcase, MapPin, Calendar, DollarSign, ChevronRight, ChevronLeft, Plus, Clock, Eye, EyeOff, Trash2, ChevronDown, ChevronUp, List } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { updateSettings } from '../services/auth';
import { getMyJobs, getWorkerJobs } from '../services/jobs';
import { Job, AvailabilitySlot, AvailabilitySchedule } from '../types';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAY_NAMES_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const TIMETABLE_HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00 – 22:00

type TabType = 'published' | 'applied';
type ViewMode = 'list' | 'calendar';

export default function MyJobsScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { user, refreshUser, isAuthenticated, isLoading: authLoading } = useAuth();

  const [publishedJobs, setPublishedJobs] = useState<Job[]>([]);
  const [appliedJobs, setAppliedJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('published');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<Date | null>(null);

  // Drag-to-select availability on timetable
  const dragRangeRef = useRef<{ startHour: number; endHour: number } | null>(null);
  const [dragRange, setDragRange] = useState<{ startHour: number; endHour: number } | null>(null);

  // Availability
  const [showAvailability, setShowAvailability] = useState(false);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [isAvailabilityPublic, setIsAvailabilityPublic] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const availabilityDirty = useRef(false);
  const availabilitySlotsRef = useRef<AvailabilitySlot[]>([]);
  const isAvailabilityPublicRef = useRef(false);
  const availabilityLocallyModified = useRef(false);

  const fetchJobs = async () => {
    try {
      const [myJobsRes, workerJobsRes] = await Promise.all([
        getMyJobs(),
        getWorkerJobs(),
      ]);

      if (myJobsRes.success) {
        setPublishedJobs((myJobsRes as any).jobs || []);
      }

      if (workerJobsRes.success) {
        // Proposals endpoint returns { proposals: [...] }, each with a nested job
        const proposals = (workerJobsRes as any).proposals || [];
        const jobs = proposals
          .filter((p: any) => p.job)
          .map((p: any) => ({ ...p.job, _id: p.job.id || p.job._id, proposalStatus: p.status, proposedPrice: p.proposedPrice }));
        setAppliedJobs(jobs);
      }
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    fetchJobs();
  }, [isAuthenticated, authLoading]);

  useEffect(() => {
    if (user && !availabilityLocallyModified.current) {
      const slots = user.availabilitySchedule?.slots || [];
      const isPublic = user.isAvailabilityPublic || false;
      setAvailabilitySlots(slots);
      setIsAvailabilityPublic(isPublic);
      availabilitySlotsRef.current = slots;
      isAvailabilityPublicRef.current = isPublic;
    }
  }, [user]);

  // Refresh user data on mount, reset flag on unmount
  useEffect(() => {
    refreshUser().catch(() => {});
    return () => { availabilityLocallyModified.current = false; };
  }, []);

  const getSlotsForDay = (day: number) => availabilitySlots.filter((s) => s.day === day);

  const saveAvailabilityToServer = useCallback(async (slots: AvailabilitySlot[], isPublic: boolean) => {
    setSavingAvailability(true);
    try {
      await updateSettings({
        availabilitySchedule: { timezone: 'America/Argentina/Buenos_Aires', slots, exceptions: [] },
        isAvailabilityPublic: isPublic,
      });
    } catch {
      // Silent fail for auto-save
    } finally {
      setSavingAvailability(false);
    }
  }, []);

  const addSlot = (day: number) => {
    availabilityLocallyModified.current = true;
    const next = [...availabilitySlotsRef.current, { day, start: '09:00', end: '18:00' }];
    availabilitySlotsRef.current = next;
    setAvailabilitySlots(next);
    saveAvailabilityToServer(next, isAvailabilityPublicRef.current);
  };

  const removeSlot = (day: number, index: number) => {
    availabilityLocallyModified.current = true;
    const dayIndexes: number[] = [];
    availabilitySlotsRef.current.forEach((s, i) => { if (s.day === day) dayIndexes.push(i); });
    const globalIndex = dayIndexes[index];
    const next = availabilitySlotsRef.current.filter((_, i) => i !== globalIndex);
    availabilitySlotsRef.current = next;
    setAvailabilitySlots(next);
    saveAvailabilityToServer(next, isAvailabilityPublicRef.current);
  };

  const updateSlotTime = (day: number, slotIndex: number, field: 'start' | 'end', value: string) => {
    availabilityLocallyModified.current = true;
    availabilityDirty.current = true;
    const filtered = value.replace(/[^0-9:]/g, '').slice(0, 5);
    const dayIndexes: number[] = [];
    availabilitySlotsRef.current.forEach((s, i) => { if (s.day === day) dayIndexes.push(i); });
    const globalIndex = dayIndexes[slotIndex];
    const next = availabilitySlotsRef.current.map((s, i) => (i === globalIndex ? { ...s, [field]: filtered } : s));
    availabilitySlotsRef.current = next;
    setAvailabilitySlots(next);
  };

  const toggleAvailabilityPublic = (val: boolean) => {
    availabilityLocallyModified.current = true;
    isAvailabilityPublicRef.current = val;
    setIsAvailabilityPublic(val);
    saveAvailabilityToServer(availabilitySlotsRef.current, val);
  };

  // Debounce save for time input changes only
  useEffect(() => {
    if (!availabilityDirty.current) return;
    const timer = setTimeout(async () => {
      setSavingAvailability(true);
      try {
        await updateSettings({
          availabilitySchedule: { timezone: 'America/Argentina/Buenos_Aires', slots: availabilitySlotsRef.current, exceptions: [] },
          isAvailabilityPublic: isAvailabilityPublicRef.current,
        });
      } catch {
        // Silent fail
      } finally {
        availabilityDirty.current = false;
        setSavingAvailability(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [availabilitySlots]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return colors.success[500];
      case 'in_progress':
        return colors.primary[500];
      case 'completed':
        return colors.slate[500];
      case 'cancelled':
      case 'paused':
        return colors.danger[500];
      default:
        return colors.warning[500];
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      open: 'Abierto',
      in_progress: 'En progreso',
      completed: 'Completado',
      cancelled: 'Cancelado',
      draft: 'Borrador',
      pending_payment: 'Pago pendiente',
      pending_approval: 'En revisión',
      paused: 'Pausado',
      suspended: 'Suspendido',
    };
    return statusMap[status] || status;
  };

  const currentJobs = activeTab === 'published' ? publishedJobs : appliedJobs;

  // Calendar helpers
  const allJobs = useMemo(() => [...publishedJobs, ...appliedJobs], [publishedJobs, appliedJobs]);

  const daysWithJobs = useMemo(() => {
    const set = new Set<number>();
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    allJobs.forEach(job => {
      if (!job.startDate) return;
      const start = new Date(job.startDate);
      const end = job.endDate && !job.endDateFlexible ? new Date(job.endDate) : start;
      for (let d = 1; d <= daysInMonth; d++) {
        const day = new Date(year, month, d);
        if (day >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
            day <= new Date(end.getFullYear(), end.getMonth(), end.getDate())) {
          set.add(d);
        }
      }
    });
    return set;
  }, [allJobs, calendarDate]);

  const jobsForSelectedDay = useMemo(() => {
    if (!selectedCalendarDay) return [];
    return allJobs.filter(job => {
      if (!job.startDate) return false;
      const start = new Date(job.startDate);
      const end = job.endDate && !job.endDateFlexible ? new Date(job.endDate) : start;
      const sel = selectedCalendarDay;
      return sel >= new Date(start.getFullYear(), start.getMonth(), start.getDate()) &&
             sel <= new Date(end.getFullYear(), end.getMonth(), end.getDate());
    });
  }, [allJobs, selectedCalendarDay]);

  const parseHour = (timeStr: string): number => {
    const parts = timeStr.split(':');
    return parseInt(parts[0]) + parseInt(parts[1] || '0') / 60;
  };

  const TIMETABLE_ROW_H = 44;

  const handleTimetableGrant = useCallback((evt: any) => {
    const y = evt.nativeEvent.locationY;
    const idx = Math.max(0, Math.min(Math.floor(y / TIMETABLE_ROW_H), TIMETABLE_HOURS.length - 1));
    const hour = TIMETABLE_HOURS[idx];
    const range = { startHour: hour, endHour: hour };
    dragRangeRef.current = range;
    setDragRange(range);
  }, []);

  const handleTimetableMove = useCallback((evt: any) => {
    if (!dragRangeRef.current) return;
    const y = evt.nativeEvent.locationY;
    const idx = Math.max(0, Math.min(Math.floor(y / TIMETABLE_ROW_H), TIMETABLE_HOURS.length - 1));
    const range = { startHour: dragRangeRef.current.startHour, endHour: TIMETABLE_HOURS[idx] };
    dragRangeRef.current = range;
    setDragRange(range);
  }, []);

  const handleTimetableRelease = useCallback(() => {
    const range = dragRangeRef.current;
    if (range && selectedCalendarDay) {
      const startH = Math.min(range.startHour, range.endHour);
      const endH = Math.min(Math.max(range.startHour, range.endHour) + 1, 23);
      const day = selectedCalendarDay.getDay();
      const newSlot: AvailabilitySlot = {
        day,
        start: `${String(startH).padStart(2, '0')}:00`,
        end: `${String(endH).padStart(2, '0')}:00`,
      };
      availabilityLocallyModified.current = true;
      const next = [...availabilitySlotsRef.current, newSlot];
      availabilitySlotsRef.current = next;
      setAvailabilitySlots(next);
      saveAvailabilityToServer(next, isAvailabilityPublicRef.current);
    }
    dragRangeRef.current = null;
    setDragRange(null);
  }, [selectedCalendarDay, saveAvailabilityToServer]);

  const calendarGrid = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calendarDate]);

  // Weekdays (0-6) that have availability slots
  const availableWeekdays = useMemo(() => {
    const set = new Set<number>();
    availabilitySlots.forEach(slot => set.add(slot.day));
    return set;
  }, [availabilitySlots]);

  const renderJob = ({ item }: { item: Job }) => (
    <TouchableOpacity
      style={[styles.jobCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
      onPress={() => router.push(`/job/${item.id || item._id}`)}
    >
      <View style={styles.jobHeader}>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {getStatusText(item.status)}
          </Text>
        </View>
        <ChevronRight size={20} color={themeColors.text.muted} />
      </View>

      <Text style={[styles.jobTitle, { color: themeColors.text.primary }]} numberOfLines={2}>
        {item.title}
      </Text>

      <View style={[styles.categoryBadge, { backgroundColor: themeColors.primary[50] }]}>
        <Text style={[styles.categoryText, { color: themeColors.primary[600] }]}>
          {item.category}
        </Text>
      </View>

      <View style={styles.jobInfo}>
        <View style={styles.infoRow}>
          <DollarSign size={14} color={themeColors.text.muted} />
          <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>
            {formatPrice(item.price || item.budget)}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <MapPin size={14} color={themeColors.text.muted} />
          <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>
            {item.location}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Calendar size={14} color={themeColors.text.muted} />
          <Text style={[styles.infoText, { color: themeColors.text.secondary }]}>
            {formatDate(item.startDate)}
            {item.endDate && !item.endDateFlexible ? ` - ${formatDate(item.endDate)}` : ''}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
            Agenda Do
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.primary[600]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
          Agenda Do
        </Text>
        <View style={styles.topBarRight}>
          <TouchableOpacity
            onPress={() => setViewMode(viewMode === 'list' ? 'calendar' : 'list')}
            style={[styles.viewToggleBtn, { backgroundColor: themeColors.slate[100] }]}
          >
            {viewMode === 'list'
              ? <Calendar size={18} color={themeColors.primary[600]} />
              : <List size={18} color={themeColors.primary[600]} />
            }
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/create-job')} style={styles.backButton}>
            <Plus size={24} color={themeColors.primary[600]} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabsContainer, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'published' && styles.tabActive]}
          onPress={() => setActiveTab('published')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'published' ? themeColors.primary[600] : themeColors.text.muted }]}>
            Publicados ({publishedJobs.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'applied' && styles.tabActive]}
          onPress={() => setActiveTab('applied')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'applied' ? themeColors.primary[600] : themeColors.text.muted }]}>
            Aplicados ({appliedJobs.length})
          </Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'calendar' ? (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
          {/* Month navigation */}
          <View style={[styles.calMonthHeader, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <TouchableOpacity onPress={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))} style={styles.calNavBtn}>
              <ChevronLeft size={22} color={themeColors.primary[600]} />
            </TouchableOpacity>
            <Text style={[styles.calMonthTitle, { color: themeColors.text.primary }]}>
              {MONTH_NAMES[calendarDate.getMonth()]} {calendarDate.getFullYear()}
            </Text>
            <TouchableOpacity onPress={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))} style={styles.calNavBtn}>
              <ChevronRight size={22} color={themeColors.primary[600]} />
            </TouchableOpacity>
          </View>

          {/* Day-of-week headers */}
          <View style={[styles.calWeekRow, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            {DAY_NAMES.map(d => (
              <Text key={d} style={[styles.calWeekDay, { color: themeColors.text.muted }]}>{d}</Text>
            ))}
          </View>

          {/* Calendar grid */}
          <View style={[styles.calGrid, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            {calendarGrid.map((day, i) => {
              const today = new Date();
              const isToday = day !== null && today.getFullYear() === calendarDate.getFullYear() &&
                today.getMonth() === calendarDate.getMonth() && today.getDate() === day;
              const isSelected = day !== null && selectedCalendarDay !== null &&
                selectedCalendarDay.getFullYear() === calendarDate.getFullYear() &&
                selectedCalendarDay.getMonth() === calendarDate.getMonth() &&
                selectedCalendarDay.getDate() === day;
              const hasJob = day !== null && daysWithJobs.has(day);
              const weekday = day !== null ? new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day).getDay() : -1;
              const isAvailable = day !== null && availableWeekdays.has(weekday);
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.calCell,
                    isAvailable && !isSelected && { backgroundColor: colors.success[500] + '18' },
                    isSelected && { backgroundColor: themeColors.primary[600] },
                    isToday && !isSelected && { backgroundColor: themeColors.primary[50] },
                  ]}
                  onPress={() => {
                    if (!day) return;
                    const tapped = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
                    setSelectedCalendarDay(isSelected ? null : tapped);
                  }}
                  disabled={!day}
                >
                  {day !== null ? (
                    <>
                      <Text style={[
                        styles.calCellText,
                        { color: isSelected ? '#fff' : isToday ? themeColors.primary[600] : themeColors.text.primary },
                      ]}>
                        {day}
                      </Text>
                      <View style={styles.calDotRow}>
                        {hasJob && (
                          <View style={[styles.calDot, { backgroundColor: isSelected ? '#fff' : themeColors.primary[600] }]} />
                        )}
                        {isAvailable && (
                          <View style={[styles.calDot, { backgroundColor: isSelected ? '#fff' : colors.success[500] }]} />
                        )}
                      </View>
                    </>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.calLegend}>
            <View style={styles.calLegendItem}>
              <View style={[styles.calDot, { backgroundColor: themeColors.primary[600] }]} />
              <Text style={[styles.calLegendText, { color: themeColors.text.muted }]}>Trabajo</Text>
            </View>
            <View style={styles.calLegendItem}>
              <View style={[styles.calDot, { backgroundColor: colors.success[500] }]} />
              <Text style={[styles.calLegendText, { color: themeColors.text.muted }]}>Disponible</Text>
            </View>
          </View>

          {/* Upcoming jobs for current month when no day selected */}
          {!selectedCalendarDay && (() => {
            const monthStart = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
            const monthEnd = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0, 23, 59, 59);
            const monthJobs = allJobs
              .filter(job => {
                if (!job.startDate) return false;
                const start = new Date(job.startDate);
                return start >= monthStart && start <= monthEnd;
              })
              .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
            if (monthJobs.length === 0) return null;
            return (
              <View style={styles.calDayJobs}>
                <Text style={[styles.calDayTitle, { color: themeColors.text.primary }]}>
                  Trabajos del mes ({monthJobs.length})
                </Text>
                {monthJobs.map(job => {
                  const start = new Date(job.startDate);
                  return (
                    <TouchableOpacity
                      key={job.id || job._id}
                      style={[styles.upcomingJobCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
                      onPress={() => router.push(`/job/${job.id || job._id}`)}
                    >
                      <View style={[styles.upcomingJobDate, { backgroundColor: themeColors.primary[50] }]}>
                        <Text style={[styles.upcomingJobDay, { color: themeColors.primary[600] }]}>{start.getDate()}</Text>
                        <Text style={[styles.upcomingJobMonth, { color: themeColors.primary[500] }]}>{start.toLocaleDateString('es-AR', { month: 'short' })}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.upcomingJobTitle, { color: themeColors.text.primary }]} numberOfLines={1}>{job.title}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Clock size={12} color={themeColors.text.muted} />
                          <Text style={{ fontSize: 12, color: themeColors.text.secondary }}>
                            {start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                            {job.endDate && ` - ${new Date(job.endDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
                          </Text>
                        </View>
                      </View>
                      <ChevronRight size={16} color={themeColors.text.muted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })()}

          {/* Timetable for selected day */}
          {selectedCalendarDay && (
            <View style={styles.calDayJobs}>
              <Text style={[styles.calDayTitle, { color: themeColors.text.primary }]}>
                {selectedCalendarDay.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </Text>
              <View
                style={[styles.timetable, { borderColor: themeColors.border, backgroundColor: themeColors.card }]}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderTerminationRequest={() => false}
                onResponderGrant={handleTimetableGrant}
                onResponderMove={handleTimetableMove}
                onResponderRelease={handleTimetableRelease}
              >
                {TIMETABLE_HOURS.map((hour, idx) => {
                  const daySlots = availabilitySlots.filter(s => s.day === selectedCalendarDay.getDay());
                  const isAvail = daySlots.some(s => {
                    const start = parseHour(s.start);
                    const end = parseHour(s.end);
                    return hour >= start && hour < end;
                  });
                  const jobsHere = jobsForSelectedDay.filter(job => {
                    if (!job.startDate) return false;
                    return new Date(job.startDate).getHours() === hour;
                  });
                  const isLast = idx === TIMETABLE_HOURS.length - 1;
                  const inDrag = dragRange != null &&
                    hour >= Math.min(dragRange.startHour, dragRange.endHour) &&
                    hour <= Math.max(dragRange.startHour, dragRange.endHour);
                  return (
                    <View
                      key={hour}
                      style={[
                        styles.timetableRow,
                        !isLast && { borderBottomColor: themeColors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                        isAvail && { backgroundColor: colors.success[500] + '18' },
                        inDrag && { backgroundColor: colors.primary[500] + '25' },
                      ]}
                    >
                      <Text style={[styles.timetableHour, { color: inDrag ? colors.primary[600] : isAvail ? colors.success[700] : themeColors.text.muted }]}>
                        {String(hour).padStart(2, '0')}:00
                      </Text>
                      <View style={[styles.timetableTrack, { borderLeftColor: isAvail ? colors.success[400] : themeColors.border }]}>
                        {jobsHere.map(job => (
                          <TouchableOpacity
                            key={job.id || job._id}
                            style={[styles.timetableJobChip, { backgroundColor: themeColors.primary[50], borderColor: themeColors.primary[600] }]}
                            onPress={() => router.push(`/job/${job.id || job._id}`)}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.timetableJobTitle, { color: themeColors.primary[600] }]} numberOfLines={1}>
                                {job.title}
                              </Text>
                              <Text style={{ fontSize: 10, color: themeColors.primary[500] }}>
                                {new Date(job.startDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                {job.endDate && ` - ${new Date(job.endDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`}
                              </Text>
                            </View>
                            <ChevronRight size={12} color={themeColors.primary[600]} />
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
              <Text style={[styles.timetableHint, { color: themeColors.text.muted }]}>
                Arrastrá sobre las horas para agregar disponibilidad
              </Text>
            </View>
          )}
        </ScrollView>
      ) : (
      <FlatList
        data={currentJobs}
        renderItem={renderJob}
        keyExtractor={(item) => item.id || item._id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListHeaderComponent={
          <View style={[styles.availabilityCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <TouchableOpacity
              style={styles.availabilityToggle}
              onPress={() => setShowAvailability(!showAvailability)}
            >
              <View style={styles.availabilityToggleLeft}>
                <Clock size={18} color={themeColors.primary[600]} />
                <Text style={[styles.availabilityToggleTitle, { color: themeColors.text.primary }]}>Disponibilidad</Text>
                <View style={[styles.publicBadge, { backgroundColor: isAvailabilityPublic ? colors.success[50] : themeColors.slate[100] }]}>
                  {isAvailabilityPublic ? <Eye size={12} color={colors.success[600]} /> : <EyeOff size={12} color={themeColors.text.muted} />}
                  <Text style={{ fontSize: 10, color: isAvailabilityPublic ? colors.success[600] : themeColors.text.muted }}>
                    {isAvailabilityPublic ? 'Pública' : 'Privada'}
                  </Text>
                </View>
              </View>
              {showAvailability ? <ChevronUp size={20} color={themeColors.text.muted} /> : <ChevronDown size={20} color={themeColors.text.muted} />}
            </TouchableOpacity>

            {showAvailability && (
              <View style={[styles.availabilityBody, { borderTopColor: themeColors.border }]}>
                <View style={styles.publicToggleRow}>
                  <Text style={[styles.publicToggleLabel, { color: themeColors.text.secondary }]}>Visible en tu perfil</Text>
                  <Switch
                    value={isAvailabilityPublic}
                    onValueChange={toggleAvailabilityPublic}
                    trackColor={{ false: themeColors.slate[200], true: colors.primary[400] }}
                    thumbColor={isAvailabilityPublic ? colors.primary[600] : themeColors.slate[50]}
                  />
                </View>

                <View style={styles.daySelector}>
                  {DAY_NAMES.map((name, index) => {
                    const hasSlots = getSlotsForDay(index).length > 0;
                    const isSelected = selectedDay === index;
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[styles.dayBtn, {
                          backgroundColor: isSelected ? colors.primary[600] : hasSlots ? colors.primary[50] : themeColors.slate[100],
                          borderColor: isSelected ? colors.primary[600] : hasSlots ? colors.primary[300] : themeColors.border,
                        }]}
                        onPress={() => setSelectedDay(isSelected ? null : index)}
                      >
                        <Text style={[styles.dayBtnText, { color: isSelected ? '#fff' : hasSlots ? colors.primary[700] : themeColors.text.secondary }]}>{name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {selectedDay !== null && (
                  <View style={styles.slotsSection}>
                    <View style={styles.slotsDayHeader}>
                      <Text style={[styles.slotsDayTitle, { color: themeColors.text.primary }]}>{DAY_NAMES_FULL[selectedDay]}</Text>
                      <TouchableOpacity style={[styles.addSlotBtn, { backgroundColor: colors.primary[50] }]} onPress={() => addSlot(selectedDay)}>
                        <Plus size={14} color={colors.primary[600]} />
                        <Text style={{ fontSize: 11, color: colors.primary[600], fontWeight: '600' }}>Agregar</Text>
                      </TouchableOpacity>
                    </View>
                    {getSlotsForDay(selectedDay).length === 0 ? (
                      <Text style={{ textAlign: 'center', color: themeColors.text.muted, fontSize: 13, paddingVertical: 12 }}>Sin horarios</Text>
                    ) : (
                      getSlotsForDay(selectedDay).map((slot, i) => (
                        <View key={i} style={[styles.slotRow, { borderBottomColor: themeColors.border }]}>
                          <TextInput
                            style={[styles.timeInput, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border, color: themeColors.text.primary }]}
                            value={slot.start} onChangeText={(v) => updateSlotTime(selectedDay, i, 'start', v)}
                            placeholder="09:00" placeholderTextColor={themeColors.text.muted} maxLength={5} keyboardType="numeric"
                          />
                          <Text style={{ color: themeColors.text.secondary, fontSize: 13 }}>a</Text>
                          <TextInput
                            style={[styles.timeInput, { backgroundColor: themeColors.slate[50], borderColor: themeColors.border, color: themeColors.text.primary }]}
                            value={slot.end} onChangeText={(v) => updateSlotTime(selectedDay, i, 'end', v)}
                            placeholder="18:00" placeholderTextColor={themeColors.text.muted} maxLength={5} keyboardType="numeric"
                          />
                          <TouchableOpacity onPress={() => removeSlot(selectedDay, i)} style={{ padding: 6 }}>
                            <Trash2 size={16} color={colors.danger[500]} />
                          </TouchableOpacity>
                        </View>
                      ))
                    )}
                  </View>
                )}

                {savingAvailability && (
                  <View style={styles.autoSaveIndicator}>
                    <ActivityIndicator color={themeColors.text.muted} size="small" />
                    <Text style={{ color: themeColors.text.muted, fontSize: 12 }}>Guardando...</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Briefcase size={48} color={themeColors.text.muted} />
            <Text style={[styles.emptyTitle, { color: themeColors.text.primary }]}>
              No tienes trabajos
            </Text>
            <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>
              {activeTab === 'published'
                ? 'Publica tu primer trabajo para encontrar profesionales'
                : 'Aplica a trabajos para comenzar a ganar'}
            </Text>
            {activeTab === 'published' && (
              <TouchableOpacity
                style={styles.createButton}
                onPress={() => router.push('/create-job')}
              >
                <Plus size={20} color="#fff" />
                <Text style={styles.createButtonText}>Publicar trabajo</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary[600],
  },
  tabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  jobCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  jobTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  categoryText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  jobInfo: {
    gap: spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  infoText: {
    fontSize: fontSize.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.base,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  createButtonText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  availabilityCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  availabilityToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  availabilityToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  availabilityToggleTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  publicBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  availabilityBody: {
    padding: spacing.md,
    borderTopWidth: 1,
  },
  publicToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  publicToggleLabel: {
    fontSize: fontSize.sm,
  },
  daySelector: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: spacing.md,
  },
  dayBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  dayBtnText: {
    fontSize: 10,
    fontWeight: fontWeight.medium,
  },
  slotsSection: {
    marginBottom: spacing.md,
  },
  slotsDayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  slotsDayTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  addSlotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.md,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
  },
  timeInput: {
    flex: 1,
    height: 38,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  autoSaveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  viewToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calMonthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
  },
  calMonthTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  calNavBtn: {
    padding: spacing.sm,
  },
  calWeekRow: {
    flexDirection: 'row',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.xs,
    paddingVertical: spacing.sm,
  },
  calWeekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  calCell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  calCellText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  calDotRow: {
    flexDirection: 'row',
    gap: 3,
    marginTop: 2,
    minHeight: 7,
  },
  calDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  calLegend: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  calLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  calLegendText: {
    fontSize: fontSize.xs,
  },
  calDayJobs: {
    marginTop: spacing.sm,
  },
  upcomingJobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  upcomingJobDate: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  upcomingJobDay: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    lineHeight: 20,
  },
  upcomingJobMonth: {
    fontSize: 10,
    fontWeight: fontWeight.medium,
    textTransform: 'uppercase',
  },
  upcomingJobTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  calDayTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
    textTransform: 'capitalize',
  },
  timetable: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  timetableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 44,
  },
  timetableHour: {
    width: 48,
    fontSize: 11,
    fontWeight: fontWeight.semibold,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    textAlign: 'right',
  },
  timetableTrack: {
    flex: 1,
    borderLeftWidth: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: 4,
    minHeight: 44,
  },
  timetableJobChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  timetableJobTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    flex: 1,
  },
  timetableHint: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
    fontStyle: 'italic',
  },
});
