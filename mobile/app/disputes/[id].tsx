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
  Linking,
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
  AlertTriangle,
  FileText,
  DollarSign,
  Briefcase,
  ExternalLink,
  Image as ImageIcon,
  Video,
  File,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { get, post } from '../../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

interface Attachment {
  fileName: string;
  fileUrl: string;
  fileType: 'image' | 'video' | 'pdf' | 'other';
  fileSize: number;
}

interface DisputeMessage {
  from: string | {
    _id?: string;
    id?: string;
    name: string;
    avatar?: string;
  };
  message: string;
  attachments?: Attachment[];
  isAdmin?: boolean;
  createdAt: string;
}

interface Dispute {
  id: string;
  contractId: string;
  reason: string;
  detailedDescription: string;
  category: string;
  status: string;
  priority: string;
  evidence: Attachment[];
  messages: DisputeMessage[];
  createdAt: string;
  contract?: {
    id: string;
    job?: {
      title: string;
    };
  };
  initiator?: {
    id?: string;
    name: string;
    avatar?: string;
  };
  defendant?: {
    id?: string;
    name: string;
    avatar?: string;
  };
  resolution?: string;
  resolvedAt?: string;
}

const categoryLabels: Record<string, { label: string; icon: any; color: string }> = {
  service_not_delivered: { label: 'Servicio no entregado', icon: Briefcase, color: colors.danger[500] },
  incomplete_work: { label: 'Trabajo incompleto', icon: FileText, color: colors.warning[500] },
  quality_issues: { label: 'Problemas de calidad', icon: AlertTriangle, color: colors.warning[500] },
  payment_issues: { label: 'Problema de pago', icon: DollarSign, color: colors.danger[500] },
  breach_of_contract: { label: 'Incumplimiento de contrato', icon: Clock, color: colors.primary[500] },
  other: { label: 'Otro', icon: AlertCircle, color: colors.slate[500] },
};

const statusLabels: Record<string, { label: string; color: string; icon: any }> = {
  open: { label: 'Abierta', color: colors.primary[500], icon: AlertCircle },
  in_review: { label: 'En revisión', color: colors.warning[500], icon: Clock },
  awaiting_info: { label: 'Esperando info', color: colors.warning[500], icon: MessageSquare },
  resolved_released: { label: 'Resuelta - Liberado', color: colors.success[500], icon: CheckCircle },
  resolved_refunded: { label: 'Resuelta - Reembolsado', color: colors.success[500], icon: CheckCircle },
  resolved_partial: { label: 'Resuelta - Parcial', color: colors.success[500], icon: CheckCircle },
  cancelled: { label: 'Cancelada', color: colors.slate[500], icon: AlertCircle },
};

const priorityLabels: Record<string, { label: string; color: string }> = {
  low: { label: 'Baja', color: colors.slate[500] },
  medium: { label: 'Media', color: colors.primary[500] },
  high: { label: 'Alta', color: colors.warning[500] },
  urgent: { label: 'Urgente', color: colors.danger[500] },
};

export default function DisputeDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();

  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDispute = useCallback(async () => {
    try {
      const response = await get<{ data: Dispute }>(`/disputes/${id}`);
      if (response.success && response.data) {
        setDispute(response.data);
        setError(null);
      } else {
        setError(response.message || 'Error al cargar la disputa');
      }
    } catch (err) {
      console.error('Error loading dispute:', err);
      setError('Error al cargar la disputa');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) loadDispute();
  }, [id, loadDispute]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDispute();
  }, [loadDispute]);

  const handleSendMessage = async () => {
    if (!message.trim() || !id) return;

    setSending(true);
    try {
      const response = await post(`/disputes/${id}/messages`, { message });
      if (response.success) {
        setMessage('');
        await loadDispute();
      } else {
        setError(response.message || 'Error al enviar mensaje');
      }
    } catch (err) {
      setError('Error al enviar mensaje');
    } finally {
      setSending(false);
    }
  };

  const openFile = (url: string) => {
    Linking.openURL(url);
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image':
        return ImageIcon;
      case 'video':
        return Video;
      case 'pdf':
        return FileText;
      default:
        return File;
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
            Disputa
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !dispute) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
            Disputa
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <AlertCircle size={48} color={colors.danger[500]} />
          <Text style={[styles.errorText, { color: themeColors.text.muted }]}>
            {error || 'Disputa no encontrada'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const category = categoryLabels[dispute.category] || categoryLabels.other;
  const status = statusLabels[dispute.status] || statusLabels.open;
  const priority = priorityLabels[dispute.priority] || priorityLabels.medium;
  const CategoryIcon = category.icon;
  const StatusIcon = status.icon;

  const isResolved = ['resolved_released', 'resolved_refunded', 'resolved_partial', 'cancelled'].includes(dispute.status);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
            Disputa
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
          {/* Dispute Info */}
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
                <Text style={[styles.disputeReason, { color: themeColors.text.primary }]}>
                  {dispute.reason}
                </Text>
                <View style={styles.statusRow}>
                  <View style={[styles.statusBadge, { backgroundColor: `${status.color}20` }]}>
                    <StatusIcon size={14} color={status.color} />
                    <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
                  </View>
                  <Text style={[styles.dateText, { color: themeColors.text.muted }]}>
                    {new Date(dispute.createdAt).toLocaleDateString('es-AR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
              </View>
            </View>

            {/* Contract Info */}
            {dispute.contract?.job?.title && (
              <View style={[styles.contractInfo, { borderTopColor: themeColors.border }]}>
                <Briefcase size={16} color={themeColors.text.muted} />
                <Text style={[styles.contractText, { color: themeColors.text.muted }]}>
                  Contrato: {dispute.contract.job.title}
                </Text>
              </View>
            )}

            {/* Description */}
            <View style={[styles.descriptionBox, { backgroundColor: themeColors.background }]}>
              <Text style={[styles.descriptionTitle, { color: themeColors.text.primary }]}>
                Descripción
              </Text>
              <Text style={[styles.descriptionText, { color: themeColors.text.secondary }]}>
                {dispute.detailedDescription}
              </Text>
            </View>

            {/* Resolution */}
            {dispute.resolution && (
              <View style={[styles.resolutionBox, { backgroundColor: colors.success[50], borderColor: colors.success[200] }]}>
                <Text style={[styles.resolutionTitle, { color: colors.success[700] }]}>Resolución</Text>
                <Text style={[styles.resolutionText, { color: colors.success[600] }]}>{dispute.resolution}</Text>
              </View>
            )}
          </View>

          {/* Evidence */}
          {dispute.evidence && dispute.evidence.length > 0 && (
            <View style={[styles.evidenceCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>
                Evidencia ({dispute.evidence.length})
              </Text>
              <View style={styles.evidenceList}>
                {dispute.evidence.map((file, index) => {
                  const FileIcon = getFileIcon(file.fileType);
                  return (
                    <TouchableOpacity
                      key={index}
                      style={[styles.evidenceItem, { backgroundColor: themeColors.background }]}
                      onPress={() => openFile(file.fileUrl)}
                    >
                      <FileIcon size={20} color={themeColors.text.muted} />
                      <Text style={[styles.evidenceFileName, { color: themeColors.text.primary }]} numberOfLines={1}>
                        {file.fileName}
                      </Text>
                      <ExternalLink size={16} color={themeColors.text.muted} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Messages */}
          <View style={[styles.messagesCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <View style={[styles.messagesHeader, { borderBottomColor: themeColors.border }]}>
              <MessageSquare size={20} color={themeColors.text.primary} />
              <Text style={[styles.messagesTitle, { color: themeColors.text.primary }]}>
                Conversación ({dispute.messages?.length || 0})
              </Text>
            </View>

            {!dispute.messages || dispute.messages.length === 0 ? (
              <View style={styles.emptyMessages}>
                <Text style={[styles.emptyMessagesText, { color: themeColors.text.muted }]}>
                  No hay mensajes aún
                </Text>
              </View>
            ) : (
              dispute.messages.map((msg, index) => {
                const fromUser = typeof msg.from === 'object' ? msg.from : null;
                const fromId = fromUser?._id || fromUser?.id || msg.from;
                const isOwnMessage = fromId === user?._id || fromId === user?.id;
                const senderName = fromUser?.name || (isOwnMessage ? 'Tú' : 'Usuario');

                return (
                  <View key={index} style={[styles.messageItem, { borderBottomColor: themeColors.border }]}>
                    <View style={[
                      styles.messageAvatar,
                      { backgroundColor: msg.isAdmin ? colors.primary[100] : isOwnMessage ? colors.primary[100] : colors.slate[100] }
                    ]}>
                      <User size={16} color={msg.isAdmin ? colors.primary[600] : isOwnMessage ? colors.primary[600] : colors.slate[600]} />
                    </View>
                    <View style={styles.messageContent}>
                      <View style={styles.messageHeader}>
                        <Text style={[styles.messageSender, { color: themeColors.text.primary }]}>
                          {msg.isAdmin ? 'Administrador' : senderName}
                        </Text>
                        {msg.isAdmin && (
                          <View style={[styles.adminBadge, { backgroundColor: colors.primary[100] }]}>
                            <Text style={[styles.adminBadgeText, { color: colors.primary[600] }]}>Admin</Text>
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
                      {msg.attachments && msg.attachments.length > 0 && (
                        <View style={styles.messageAttachments}>
                          {msg.attachments.map((att, attIndex) => {
                            const AttIcon = getFileIcon(att.fileType);
                            return (
                              <TouchableOpacity
                                key={attIndex}
                                style={[styles.attachmentChip, { backgroundColor: themeColors.background }]}
                                onPress={() => openFile(att.fileUrl)}
                              >
                                <AttIcon size={14} color={themeColors.text.muted} />
                                <Text style={[styles.attachmentName, { color: themeColors.text.muted }]} numberOfLines={1}>
                                  {att.fileName}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
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
              Esta disputa está cerrada. Si necesitas más ayuda, crea una nueva disputa.
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
  disputeReason: {
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
  contractInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  contractText: {
    fontSize: fontSize.sm,
  },
  descriptionBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  descriptionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  descriptionText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
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
  evidenceCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  evidenceList: {
    gap: spacing.sm,
  },
  evidenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  evidenceFileName: {
    flex: 1,
    fontSize: fontSize.sm,
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
  adminBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
  },
  adminBadgeText: {
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
  messageAttachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.lg,
    maxWidth: 150,
  },
  attachmentName: {
    fontSize: fontSize.xs,
    flex: 1,
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
