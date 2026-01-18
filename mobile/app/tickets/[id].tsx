import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Send,
  Clock,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  User,
  Bug,
  HelpCircle,
  FileText,
  DollarSign,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { get, post } from '../../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

interface TicketMessage {
  id?: string;
  author: string;
  authorName?: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
}

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolution?: string;
  messages: TicketMessage[];
  creator?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
  assignee?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
}

const categoryLabels: Record<string, { label: string; icon: any; color: string }> = {
  bug: { label: 'Bug', icon: Bug, color: colors.danger[500] },
  feature: { label: 'Sugerencia', icon: HelpCircle, color: colors.primary[500] },
  support: { label: 'Soporte', icon: HelpCircle, color: colors.primary[500] },
  report_user: { label: 'Reportar usuario', icon: AlertCircle, color: colors.warning[500] },
  report_contract: { label: 'Reportar contrato', icon: FileText, color: colors.warning[500] },
  payment: { label: 'Pago', icon: DollarSign, color: colors.success[500] },
  other: { label: 'Otro', icon: HelpCircle, color: colors.slate[500] },
};

const statusLabels: Record<string, { label: string; color: string; icon: any }> = {
  open: { label: 'Abierto', color: colors.primary[500], icon: AlertCircle },
  in_progress: { label: 'En progreso', color: colors.warning[500], icon: Clock },
  waiting_response: { label: 'Esperando respuesta', color: colors.warning[500], icon: MessageSquare },
  resolved: { label: 'Resuelto', color: colors.success[500], icon: CheckCircle },
  closed: { label: 'Cerrado', color: colors.slate[500], icon: CheckCircle },
};

const priorityLabels: Record<string, { label: string; color: string }> = {
  low: { label: 'Baja', color: colors.slate[500] },
  medium: { label: 'Media', color: colors.primary[500] },
  high: { label: 'Alta', color: colors.warning[500] },
  urgent: { label: 'Urgente', color: colors.danger[500] },
};

export default function TicketDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTicket = useCallback(async () => {
    try {
      const response = await get<{ ticket: Ticket }>(`/tickets/${id}`);
      if (response.success && response.ticket) {
        setTicket(response.ticket);
        setError(null);
      } else {
        setError(response.message || 'Error al cargar el ticket');
      }
    } catch (err) {
      console.error('Error loading ticket:', err);
      setError('Error al cargar el ticket');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) loadTicket();
  }, [id, loadTicket]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTicket();
  }, [loadTicket]);

  const handleSendMessage = async () => {
    if (!message.trim() || !id) return;

    setSending(true);
    try {
      const response = await post(`/tickets/${id}/messages`, { message });
      if (response.success) {
        setMessage('');
        await loadTicket();
      } else {
        setError(response.message || 'Error al enviar mensaje');
      }
    } catch (err) {
      setError('Error al enviar mensaje');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
            Ticket
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !ticket) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
            Ticket
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <AlertCircle size={48} color={colors.danger[500]} />
          <Text style={[styles.errorText, { color: themeColors.text.muted }]}>
            {error || 'Ticket no encontrado'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const category = categoryLabels[ticket.category] || categoryLabels.other;
  const status = statusLabels[ticket.status] || statusLabels.open;
  const priority = priorityLabels[ticket.priority] || priorityLabels.medium;
  const CategoryIcon = category.icon;
  const StatusIcon = status.icon;

  const isResolved = ticket.status === 'resolved' || ticket.status === 'closed';

  // Filter out internal messages
  const visibleMessages = ticket.messages?.filter(msg => !msg.isInternal) || [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
            {ticket.ticketNumber}
          </Text>
          <View style={{ width: 40 }} />
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
          {/* Ticket Info */}
          <View style={[styles.infoCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <View style={styles.infoHeader}>
              <View style={[styles.categoryIcon, { backgroundColor: `${category.color}20` }]}>
                <CategoryIcon size={24} color={category.color} />
              </View>
              <View style={styles.infoHeaderText}>
                <View style={styles.badges}>
                  <View style={[styles.badge, { backgroundColor: `${priority.color}20` }]}>
                    <Text style={[styles.badgeText, { color: priority.color }]}>{priority.label}</Text>
                  </View>
                </View>
                <Text style={[styles.ticketSubject, { color: themeColors.text.primary }]}>
                  {ticket.subject}
                </Text>
                <View style={styles.statusRow}>
                  <View style={[styles.statusBadge, { backgroundColor: `${status.color}20` }]}>
                    <StatusIcon size={14} color={status.color} />
                    <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                  </View>
                  <Text style={[styles.dateText, { color: themeColors.text.muted }]}>
                    {new Date(ticket.createdAt).toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
              </View>
            </View>

            {ticket.assignee && (
              <View style={[styles.assigneeRow, { borderTopColor: themeColors.border }]}>
                <User size={16} color={themeColors.text.muted} />
                <Text style={[styles.assigneeText, { color: themeColors.text.muted }]}>
                  Asignado a: {ticket.assignee.name}
                </Text>
              </View>
            )}

            {ticket.resolution && (
              <View style={[styles.resolutionBox, { backgroundColor: colors.success[50], borderColor: colors.success[200] }]}>
                <Text style={[styles.resolutionTitle, { color: colors.success[700] }]}>Resolución</Text>
                <Text style={[styles.resolutionText, { color: colors.success[600] }]}>{ticket.resolution}</Text>
              </View>
            )}
          </View>

          {/* Messages */}
          <View style={[styles.messagesCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <View style={[styles.messagesHeader, { borderBottomColor: themeColors.border }]}>
              <MessageSquare size={20} color={themeColors.text.primary} />
              <Text style={[styles.messagesTitle, { color: themeColors.text.primary }]}>
                Conversación ({visibleMessages.length} mensajes)
              </Text>
            </View>

            {visibleMessages.length === 0 ? (
              <View style={styles.emptyMessages}>
                <Text style={[styles.emptyMessagesText, { color: themeColors.text.muted }]}>
                  No hay mensajes aún
                </Text>
              </View>
            ) : (
              visibleMessages.map((msg, index) => {
                const isOwnMessage = msg.author === user?._id || msg.author === user?.id;
                return (
                  <View key={msg.id || index} style={[styles.messageItem, { borderBottomColor: themeColors.border }]}>
                    <View style={[
                      styles.messageAvatar,
                      { backgroundColor: isOwnMessage ? colors.primary[100] : colors.primary[600] + '20' }
                    ]}>
                      <User size={16} color={isOwnMessage ? colors.primary[600] : colors.primary[600]} />
                    </View>
                    <View style={styles.messageContent}>
                      <View style={styles.messageHeader}>
                        <Text style={[styles.messageSender, { color: themeColors.text.primary }]}>
                          {msg.authorName || (isOwnMessage ? 'Tú' : 'Soporte')}
                        </Text>
                        {!isOwnMessage && (
                          <View style={[styles.staffBadge, { backgroundColor: colors.primary[100] }]}>
                            <Text style={[styles.staffBadgeText, { color: colors.primary[600] }]}>Staff</Text>
                          </View>
                        )}
                        <Text style={[styles.messageDate, { color: themeColors.text.muted }]}>
                          {new Date(msg.createdAt).toLocaleDateString('es-AR', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                      <Text style={[styles.messageText, { color: themeColors.text.secondary }]}>
                        {msg.message}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>

        {/* Reply Input */}
        {!isResolved ? (
          <View style={[styles.replyContainer, { backgroundColor: themeColors.card, borderTopColor: themeColors.border }]}>
            <TextInput
              style={[styles.replyInput, {
                backgroundColor: themeColors.background,
                borderColor: themeColors.border,
                color: themeColors.text.primary,
              }]}
              value={message}
              onChangeText={setMessage}
              placeholder="Escribe tu mensaje..."
              placeholderTextColor={themeColors.text.muted}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendButton, { opacity: sending || !message.trim() ? 0.5 : 1 }]}
              onPress={handleSendMessage}
              disabled={sending || !message.trim()}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Send size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.closedContainer, { backgroundColor: themeColors.card, borderTopColor: themeColors.border }]}>
            <Text style={[styles.closedText, { color: themeColors.text.muted }]}>
              Este ticket está cerrado. Si necesitas más ayuda, crea un nuevo ticket.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
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
    fontFamily: 'monospace',
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  errorText: {
    fontSize: fontSize.base,
    textAlign: 'center',
  },
  infoCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  infoHeader: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.sm,
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
  ticketSubject: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  dateText: {
    fontSize: fontSize.xs,
  },
  assigneeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  assigneeText: {
    fontSize: fontSize.sm,
  },
  resolutionBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  resolutionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  resolutionText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  messagesCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  messagesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  messagesTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  emptyMessages: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyMessagesText: {
    fontSize: fontSize.base,
  },
  messageItem: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageContent: {
    flex: 1,
    gap: spacing.xs,
  },
  messageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  messageSender: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  staffBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
  },
  staffBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.medium,
  },
  messageDate: {
    fontSize: fontSize.xs,
  },
  messageText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  replyContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
  },
  replyInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.base,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.primary[500],
    justifyContent: 'center',
    alignItems: 'center',
  },
  closedContainer: {
    padding: spacing.md,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  closedText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
});
