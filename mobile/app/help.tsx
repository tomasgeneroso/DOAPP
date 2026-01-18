import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Plus,
  HelpCircle,
  MessageSquare,
  AlertTriangle,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Bug,
  DollarSign,
  Briefcase,
  BookOpen,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { get } from '../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';

interface Dispute {
  id: string;
  category: string;
  priority: string;
  status: string;
  reason: string;
  createdAt: string;
  contract?: {
    id: string;
    title?: string;
  };
  messagesCount?: number;
}

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  messagesCount?: number;
}

type TabType = 'overview' | 'disputes' | 'tickets';

const categoryLabels: Record<string, { label: string; icon: any; color: string }> = {
  service_not_delivered: { label: 'Servicio no entregado', icon: Briefcase, color: colors.danger[500] },
  incomplete_work: { label: 'Trabajo incompleto', icon: FileText, color: colors.warning[500] },
  quality_issues: { label: 'Problemas de calidad', icon: AlertTriangle, color: colors.warning[500] },
  payment_issues: { label: 'Problema de pago', icon: DollarSign, color: colors.danger[500] },
  breach_of_contract: { label: 'Incumplimiento de contrato', icon: Clock, color: colors.primary[500] },
  bug_report: { label: 'Reporte de bug', icon: Bug, color: colors.primary[600] },
  bug: { label: 'Bug', icon: Bug, color: colors.danger[500] },
  feature: { label: 'Sugerencia', icon: HelpCircle, color: colors.primary[500] },
  support: { label: 'Soporte', icon: HelpCircle, color: colors.primary[500] },
  report_user: { label: 'Reportar usuario', icon: AlertCircle, color: colors.warning[500] },
  report_contract: { label: 'Reportar contrato', icon: FileText, color: colors.warning[500] },
  payment: { label: 'Pago', icon: DollarSign, color: colors.success[500] },
  other: { label: 'Otro', icon: HelpCircle, color: colors.slate[500] },
};

const statusLabels: Record<string, { label: string; color: string }> = {
  open: { label: 'Abierto', color: colors.primary[500] },
  in_progress: { label: 'En progreso', color: colors.warning[500] },
  in_review: { label: 'En revisión', color: colors.warning[500] },
  waiting_response: { label: 'Esperando respuesta', color: colors.warning[500] },
  awaiting_info: { label: 'Esperando info', color: colors.warning[500] },
  resolved: { label: 'Resuelto', color: colors.success[500] },
  resolved_released: { label: 'Resuelto', color: colors.success[500] },
  resolved_refunded: { label: 'Reembolsado', color: colors.success[500] },
  resolved_partial: { label: 'Parcial', color: colors.success[500] },
  closed: { label: 'Cerrado', color: colors.slate[500] },
  cancelled: { label: 'Cancelado', color: colors.slate[500] },
};

const priorityLabels: Record<string, { label: string; color: string }> = {
  low: { label: 'Baja', color: colors.slate[500] },
  medium: { label: 'Media', color: colors.primary[500] },
  high: { label: 'Alta', color: colors.warning[500] },
  urgent: { label: 'Urgente', color: colors.danger[500] },
};

export default function HelpScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [disputesRes, ticketsRes] = await Promise.all([
        get<{ data: Dispute[] }>('/disputes/my-disputes'),
        get<{ tickets: Ticket[] }>('/tickets'),
      ]);

      if (disputesRes.success && disputesRes.data) {
        setDisputes(disputesRes.data);
      }
      if (ticketsRes.success && ticketsRes.tickets) {
        setTickets(ticketsRes.tickets);
      }
    } catch (error) {
      console.error('Error loading help data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const openDisputes = disputes.filter(d =>
    !['resolved_released', 'resolved_refunded', 'resolved_partial', 'cancelled'].includes(d.status)
  );
  const openTickets = tickets.filter(t =>
    !['resolved', 'closed'].includes(t.status)
  );

  const renderTabButton = (tab: TabType, label: string, count?: number) => (
    <TouchableOpacity
      key={tab}
      style={[
        styles.tabButton,
        activeTab === tab && { backgroundColor: colors.primary[500] }
      ]}
      onPress={() => setActiveTab(tab)}
    >
      <Text style={[
        styles.tabButtonText,
        { color: activeTab === tab ? '#fff' : themeColors.text.secondary }
      ]}>
        {label}
        {count !== undefined && count > 0 && ` (${count})`}
      </Text>
    </TouchableOpacity>
  );

  const renderOverview = () => (
    <View style={styles.overviewContainer}>
      {/* Quick Actions */}
      <Text style={[styles.sectionTitle, { color: themeColors.text.muted }]}>
        Acciones rápidas
      </Text>

      <View style={styles.quickActionsRow}>
        <TouchableOpacity
          style={[styles.quickActionCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
          onPress={() => router.push('/tickets/new')}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: colors.primary[100] }]}>
            <MessageSquare size={24} color={colors.primary[600]} />
          </View>
          <Text style={[styles.quickActionTitle, { color: themeColors.text.primary }]}>
            Nuevo Ticket
          </Text>
          <Text style={[styles.quickActionDesc, { color: themeColors.text.muted }]}>
            Soporte, bugs, sugerencias
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.quickActionCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
          onPress={() => router.push('/disputes/create')}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: colors.warning[100] }]}>
            <AlertTriangle size={24} color={colors.warning[600]} />
          </View>
          <Text style={[styles.quickActionTitle, { color: themeColors.text.primary }]}>
            Nueva Disputa
          </Text>
          <Text style={[styles.quickActionDesc, { color: themeColors.text.muted }]}>
            Problemas con contratos
          </Text>
        </TouchableOpacity>
      </View>

      {/* Active Issues Summary */}
      <Text style={[styles.sectionTitle, { color: themeColors.text.muted, marginTop: spacing.xl }]}>
        Resumen
      </Text>

      <View style={[styles.summaryCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <TouchableOpacity
          style={styles.summaryRow}
          onPress={() => setActiveTab('disputes')}
        >
          <View style={styles.summaryLeft}>
            <AlertTriangle size={20} color={openDisputes.length > 0 ? colors.warning[500] : themeColors.text.muted} />
            <Text style={[styles.summaryLabel, { color: themeColors.text.primary }]}>
              Disputas activas
            </Text>
          </View>
          <View style={styles.summaryRight}>
            <Text style={[styles.summaryCount, { color: openDisputes.length > 0 ? colors.warning[500] : themeColors.text.muted }]}>
              {openDisputes.length}
            </Text>
            <ChevronRight size={20} color={themeColors.text.muted} />
          </View>
        </TouchableOpacity>

        <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

        <TouchableOpacity
          style={styles.summaryRow}
          onPress={() => setActiveTab('tickets')}
        >
          <View style={styles.summaryLeft}>
            <MessageSquare size={20} color={openTickets.length > 0 ? colors.primary[500] : themeColors.text.muted} />
            <Text style={[styles.summaryLabel, { color: themeColors.text.primary }]}>
              Tickets abiertos
            </Text>
          </View>
          <View style={styles.summaryRight}>
            <Text style={[styles.summaryCount, { color: openTickets.length > 0 ? colors.primary[500] : themeColors.text.muted }]}>
              {openTickets.length}
            </Text>
            <ChevronRight size={20} color={themeColors.text.muted} />
          </View>
        </TouchableOpacity>
      </View>

      {/* FAQ Section */}
      <Text style={[styles.sectionTitle, { color: themeColors.text.muted, marginTop: spacing.xl }]}>
        Preguntas frecuentes
      </Text>

      <View style={[styles.faqCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
        <View style={styles.faqItem}>
          <BookOpen size={16} color={themeColors.text.muted} />
          <View style={styles.faqContent}>
            <Text style={[styles.faqQuestion, { color: themeColors.text.primary }]}>
              ¿Cuándo crear una disputa?
            </Text>
            <Text style={[styles.faqAnswer, { color: themeColors.text.muted }]}>
              Cuando tienes problemas con un contrato: trabajo no entregado, calidad, pagos, etc.
            </Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: themeColors.border }]} />

        <View style={styles.faqItem}>
          <BookOpen size={16} color={themeColors.text.muted} />
          <View style={styles.faqContent}>
            <Text style={[styles.faqQuestion, { color: themeColors.text.primary }]}>
              ¿Cuándo crear un ticket?
            </Text>
            <Text style={[styles.faqAnswer, { color: themeColors.text.muted }]}>
              Para reportar bugs, hacer sugerencias, o cualquier consulta no relacionada con un contrato.
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderDisputeItem = (dispute: Dispute) => {
    const category = categoryLabels[dispute.category] || categoryLabels.other;
    const status = statusLabels[dispute.status] || statusLabels.open;
    const priority = priorityLabels[dispute.priority] || priorityLabels.medium;
    const CategoryIcon = category.icon;

    return (
      <TouchableOpacity
        key={dispute.id}
        style={[styles.listItem, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
        onPress={() => router.push(`/disputes/${dispute.id}`)}
      >
        <View style={[styles.listItemIcon, { backgroundColor: `${category.color}20` }]}>
          <CategoryIcon size={20} color={category.color} />
        </View>
        <View style={styles.listItemContent}>
          <Text style={[styles.listItemTitle, { color: themeColors.text.primary }]} numberOfLines={1}>
            {dispute.reason || 'Sin motivo especificado'}
          </Text>
          {dispute.contract && (
            <Text style={[styles.listItemSubtitle, { color: themeColors.text.muted }]} numberOfLines={1}>
              Contrato: {dispute.contract.title || `#${dispute.contract.id.slice(0, 8)}`}
            </Text>
          )}
          <View style={styles.listItemMeta}>
            <View style={[styles.badge, { backgroundColor: `${status.color}20` }]}>
              <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: `${priority.color}20` }]}>
              <Text style={[styles.badgeText, { color: priority.color }]}>{priority.label}</Text>
            </View>
          </View>
        </View>
        <ChevronRight size={20} color={themeColors.text.muted} />
      </TouchableOpacity>
    );
  };

  const renderTicketItem = (ticket: Ticket) => {
    const category = categoryLabels[ticket.category] || categoryLabels.other;
    const status = statusLabels[ticket.status] || statusLabels.open;
    const priority = priorityLabels[ticket.priority] || priorityLabels.medium;
    const CategoryIcon = category.icon;

    return (
      <TouchableOpacity
        key={ticket.id}
        style={[styles.listItem, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}
        onPress={() => router.push(`/tickets/${ticket.id}`)}
      >
        <View style={[styles.listItemIcon, { backgroundColor: `${category.color}20` }]}>
          <CategoryIcon size={20} color={category.color} />
        </View>
        <View style={styles.listItemContent}>
          <View style={styles.listItemHeader}>
            <Text style={[styles.ticketNumber, { color: themeColors.text.muted }]}>
              {ticket.ticketNumber}
            </Text>
          </View>
          <Text style={[styles.listItemTitle, { color: themeColors.text.primary }]} numberOfLines={1}>
            {ticket.subject}
          </Text>
          <View style={styles.listItemMeta}>
            <View style={[styles.badge, { backgroundColor: `${status.color}20` }]}>
              <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: `${priority.color}20` }]}>
              <Text style={[styles.badgeText, { color: priority.color }]}>{priority.label}</Text>
            </View>
          </View>
        </View>
        <ChevronRight size={20} color={themeColors.text.muted} />
      </TouchableOpacity>
    );
  };

  const renderDisputes = () => (
    <View style={styles.listContainer}>
      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, { color: themeColors.text.primary }]}>
          Mis Disputas ({disputes.length})
        </Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary[500] }]}
          onPress={() => router.push('/disputes/create')}
        >
          <Plus size={16} color="#fff" />
          <Text style={styles.addButtonText}>Nueva</Text>
        </TouchableOpacity>
      </View>

      {disputes.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <AlertTriangle size={40} color={themeColors.text.muted} />
          <Text style={[styles.emptyStateText, { color: themeColors.text.muted }]}>
            No tienes disputas
          </Text>
        </View>
      ) : (
        disputes.map(renderDisputeItem)
      )}
    </View>
  );

  const renderTickets = () => (
    <View style={styles.listContainer}>
      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, { color: themeColors.text.primary }]}>
          Mis Tickets ({tickets.length})
        </Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary[500] }]}
          onPress={() => router.push('/tickets/new')}
        >
          <Plus size={16} color="#fff" />
          <Text style={styles.addButtonText}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      {tickets.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <MessageSquare size={40} color={themeColors.text.muted} />
          <Text style={[styles.emptyStateText, { color: themeColors.text.muted }]}>
            No tienes tickets
          </Text>
        </View>
      ) : (
        tickets.map(renderTicketItem)
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
            Centro de Ayuda
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
          Centro de Ayuda
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={[styles.tabsContainer, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
        {renderTabButton('overview', 'Inicio')}
        {renderTabButton('disputes', 'Disputas', openDisputes.length)}
        {renderTabButton('tickets', 'Tickets', openTickets.length)}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary[500]]}
            tintColor={colors.primary[500]}
          />
        }
      >
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'disputes' && renderDisputes()}
        {activeTab === 'tickets' && renderTickets()}
      </ScrollView>
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
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
  },
  tabButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overviewContainer: {
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickActionCard: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    alignItems: 'center',
    gap: spacing.sm,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  quickActionDesc: {
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
  summaryCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  summaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  summaryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summaryCount: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  divider: {
    height: 1,
    marginLeft: spacing.lg + 28,
  },
  faqCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    padding: spacing.lg,
    gap: spacing.md,
  },
  faqItem: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  faqContent: {
    flex: 1,
    gap: spacing.xs,
  },
  faqQuestion: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  faqAnswer: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  listContainer: {
    gap: spacing.md,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  listTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  addButtonText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    gap: spacing.md,
  },
  listItemIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listItemContent: {
    flex: 1,
    gap: spacing.xs,
  },
  listItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ticketNumber: {
    fontSize: fontSize.xs,
    fontFamily: 'monospace',
  },
  listItemTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  listItemSubtitle: {
    fontSize: fontSize.sm,
  },
  listItemMeta: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  emptyState: {
    padding: spacing['2xl'],
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyStateText: {
    fontSize: fontSize.base,
  },
});
