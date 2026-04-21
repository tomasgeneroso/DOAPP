import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Send, User, Key, Copy, Check, Briefcase, MapPin, DollarSign, ExternalLink, X } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { getMessages, sendMessage, sendMessageWithJob, markAsRead, getConversation } from '../../services/chat';
import { getJobs } from '../../services/jobs';
import { Message, User as UserType, Conversation } from '../../types';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const { user } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [copiedJobCode, setCopiedJobCode] = useState(false);

  // Inline job attachment
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [inlineJobs, setInlineJobs] = useState<any[]>([]);
  const [loadingInlineJobs, setLoadingInlineJobs] = useState(false);
  const [selectedJob, setSelectedJob] = useState<any>(null);

  const getJobCode = (jobId: string | undefined): string => {
    if (!jobId) return 'A0000';
    const hex = jobId.replace(/-/g, '');
    const letter = String.fromCharCode(65 + (parseInt(hex[0], 16) % 26));
    const nums = hex.slice(1, 5).split('').map(c => String(parseInt(c, 16) % 10)).join('');
    return letter + nums;
  };

  const handleCopyJobCode = async () => {
    const jobId = conversation?.jobId || conversation?.job?.id || conversation?.job?._id;
    if (jobId) {
      const code = getJobCode(jobId);
      await Clipboard.setStringAsync(code);
      setCopiedJobCode(true);
      setTimeout(() => setCopiedJobCode(false), 3000);
    }
  };

  const fetchConversation = async () => {
    if (!id) return;
    try {
      const response = await getConversation(id);
      if (response.success && response.data) {
        setConversation(response.data.conversation);
      }
    } catch (error) {
      console.error('Error fetching conversation:', error);
    }
  };

  const fetchMessages = async (pageNum: number = 1, append: boolean = false) => {
    if (!id) return;

    try {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      const response = await getMessages(id, pageNum);
      const raw = response as any;

      if (response.success) {
        // Server returns { success, data: [...messages], pagination: {...} }
        const newMessages: Message[] = Array.isArray(raw.data) ? raw.data : [];
        const pagination = raw.pagination;
        if (append) {
          setMessages((prev) => [...prev, ...newMessages]);
        } else {
          setMessages(newMessages);
        }
        if (pagination) setHasMore(pagination.page < pagination.pages);
        setPage(pageNum);

        // Mark as read
        await markAsRead(id);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    fetchConversation();
  }, [id]);

  const toggleJobPicker = async () => {
    if (!showJobPicker) {
      setLoadingInlineJobs(true);
      try {
        const response = await getJobs({ status: 'open', limit: 50 });
        const jobsList = (response as any).jobs || response.data || [];
        setInlineJobs(jobsList);
      } catch (error) {
        console.error('Error fetching jobs:', error);
      } finally {
        setLoadingInlineJobs(false);
      }
    }
    setShowJobPicker(!showJobPicker);
  };

  const handleSend = async () => {
    if ((!messageText.trim() && !selectedJob) || sending) return;

    setSending(true);
    const text = messageText.trim();
    setMessageText('');

    try {
      if (selectedJob) {
        // Send with job attachment via HTTP
        const body: any = { jobId: selectedJob.id || selectedJob._id };
        if (text) body.content = text;

        const response = await sendMessageWithJob(id!, body);
        if (response.success) {
          const allMsgs = (response as any).messages || [response.data?.message || (response as any).message];
          setMessages((prev) => [...allMsgs.reverse(), ...prev]);
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        } else {
          setMessageText(text);
        }
        setSelectedJob(null);
        setShowJobPicker(false);
      } else {
        const response = await sendMessage(id!, { content: text, type: 'text' });
        if (response.success && response.data) {
          setMessages((prev) => [response.data!.message, ...prev]);
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        } else {
          setMessageText(text);
        }
      }
    } catch (error) {
      setMessageText(text);
      console.error('Error sending message:', error);
    } finally {
      setSending(false);
    }
  };

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    fetchMessages(page + 1, true);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Hoy';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Ayer';
    }
    return date.toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
    });
  };

  const shouldShowDate = (currentIndex: number) => {
    if (currentIndex === messages.length - 1) return true;
    const current = new Date(messages[currentIndex].createdAt).toDateString();
    const next = new Date(messages[currentIndex + 1].createdAt).toDateString();
    return current !== next;
  };

  // Helper to get message content (supports both 'message' and 'content' fields)
  const getMessageContent = (msg: Message) => msg.message || msg.content || '';

  // Helper to get sender info
  const getSenderId = (sender: any) => sender?.id || sender?._id || '';

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const sender = item.sender as UserType;
    const senderId = getSenderId(sender);
    const userId = user?._id || user?.id;
    const isOwn = senderId === userId;
    const showDate = shouldShowDate(index);
    const messageContent = getMessageContent(item);

    // Job attachment system message - special card rendering
    if (item.type === 'system' && item.metadata?.action === 'job_attachment') {
      const meta = item.metadata;
      return (
        <View>
          {showDate && (
            <View style={chatStyles.dateSeparator}>
              <Text style={[chatStyles.dateText, { color: themeColors.text.muted }]}>{formatDate(item.createdAt)}</Text>
            </View>
          )}
          <View style={[{ alignItems: isOwn ? 'flex-end' : 'flex-start', marginBottom: spacing.md }]}>
            <View style={[chatStyles.jobAttachmentCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
              <View style={[chatStyles.jobAttachmentHeader, { backgroundColor: colors.primary[50], borderBottomColor: themeColors.border }]}>
                <Briefcase size={14} color={colors.primary[600]} strokeWidth={2} />
                <Text style={[chatStyles.jobAttachmentLabel, { color: colors.primary[600] }]}>
                  {isOwn ? 'Compartiste un trabajo' : `${sender?.name || 'Usuario'} compartió un trabajo`}
                </Text>
              </View>
              <View style={{ padding: spacing.md }}>
                <Text style={[chatStyles.jobAttachmentTitle, { color: themeColors.text.primary }]}>{meta.jobTitle}</Text>
                <View style={{ gap: 4, marginTop: spacing.sm }}>
                  <View style={chatStyles.jobAttachmentRow}>
                    <DollarSign size={13} color={colors.success[500]} strokeWidth={2} />
                    <Text style={[chatStyles.jobAttachmentMeta, { color: themeColors.text.secondary }]}>
                      ${Number(meta.jobPrice).toLocaleString('es-AR')}
                    </Text>
                  </View>
                  {meta.jobLocation && (
                    <View style={chatStyles.jobAttachmentRow}>
                      <MapPin size={13} color={colors.danger[400]} strokeWidth={2} />
                      <Text style={[chatStyles.jobAttachmentMeta, { color: themeColors.text.secondary }]}>{meta.jobLocation}</Text>
                    </View>
                  )}
                  {meta.jobCategory && (
                    <View style={chatStyles.jobAttachmentRow}>
                      <Briefcase size={13} color={colors.primary[400]} strokeWidth={2} />
                      <Text style={[chatStyles.jobAttachmentMeta, { color: themeColors.text.secondary }]}>{meta.jobCategory}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => router.push(`/job/${meta.jobId}`)}
                  style={[chatStyles.jobAttachmentBtn, { backgroundColor: colors.primary[50] }]}
                >
                  <ExternalLink size={14} color={colors.primary[600]} strokeWidth={2} />
                  <Text style={[chatStyles.jobAttachmentBtnText, { color: colors.primary[600] }]}>Ver trabajo</Text>
                </TouchableOpacity>
              </View>
              <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
                <Text style={[{ fontSize: 10, color: themeColors.text.muted, textAlign: 'right' }]}>{formatTime(item.createdAt)}</Text>
              </View>
            </View>
          </View>
        </View>
      );
    }

    // System message - special styling
    if (item.type === 'system') {
      // Parse message with || delimiter: "header||title||content"
      const parts = messageContent.split('||');
      const header = parts[0] || '';
      const title = parts[1] || '';
      const content = parts[2] || messageContent;
      const isPending = item.metadata?.proposalStatus === 'pending';
      const isDirectProposal = header === 'direct_proposal' || item.metadata?.action === 'direct_contract_proposal';

      // Determine header text based on sender/receiver and message type
      const getHeaderText = () => {
        if (isDirectProposal) {
          return isOwn
            ? 'Enviaste una propuesta de contrato'
            : `${sender?.name || 'Usuario'} te envió una propuesta de contrato`;
        }
        if (header.toLowerCase().includes('contraoferta')) {
          return isOwn
            ? 'Enviaste una contraoferta'
            : `${sender?.name || 'Usuario'} envió una contraoferta`;
        }
        if (header.toLowerCase().includes('postuló') || header.toLowerCase().includes('aplicó')) {
          return isOwn
            ? 'Te postulaste al trabajo'
            : `${sender?.name || 'Usuario'} quiere trabajar contigo`;
        }
        return header;
      };

      // System message styling
      const getSystemStyles = () => {
        if (isOwn) {
          return {
            bgColor: colors.primary[50],
            borderColor: colors.primary[200],
            headerColor: colors.primary[700],
            iconBgColor: colors.primary[100],
            iconColor: colors.primary[600],
          };
        }
        if (isPending) {
          return {
            bgColor: colors.success[50],
            borderColor: colors.success[300],
            headerColor: colors.success[700],
            iconBgColor: colors.success[100],
            iconColor: colors.success[600],
          };
        }
        return {
          bgColor: themeColors.slate[50],
          borderColor: themeColors.border,
          headerColor: themeColors.text.primary,
          iconBgColor: themeColors.slate[100],
          iconColor: themeColors.text.secondary,
        };
      };

      const sStyles = getSystemStyles();

      return (
        <View>
          {showDate && (
            <View style={styles.dateSeparator}>
              <Text style={[styles.dateSeparatorText, { color: themeColors.text.muted }]}>
                {formatDate(item.createdAt)}
              </Text>
            </View>
          )}
          <View style={[styles.messageContainer, isOwn ? styles.ownMessage : styles.otherMessage]}>
            <View
              style={[
                styles.systemMessageBubble,
                {
                  backgroundColor: sStyles.bgColor,
                  borderColor: sStyles.borderColor,
                  marginLeft: isOwn ? 'auto' : 0,
                  marginRight: isOwn ? 0 : 'auto',
                },
              ]}
            >
              {/* Nueva Postulación badge for received pending */}
              {!isOwn && isPending && (
                <View style={[styles.pendingBadge, { backgroundColor: colors.success[600] }]}>
                  <View style={styles.pendingDot} />
                  <Text style={styles.pendingBadgeText}>Nueva Postulación</Text>
                </View>
              )}

              {/* Header with icon */}
              <View style={styles.systemMessageHeader}>
                <View style={[styles.systemIconContainer, { backgroundColor: sStyles.iconBgColor }]}>
                  <User size={18} color={sStyles.iconColor} />
                </View>
                <View style={styles.systemMessageHeaderText}>
                  <Text style={[styles.systemMessageTitle, { color: sStyles.headerColor }]}>
                    {getHeaderText()}
                  </Text>
                  {title && (
                    <Text style={[styles.systemMessageSubtitle, { color: themeColors.text.primary }]}>
                      {title}
                    </Text>
                  )}
                </View>
              </View>

              {/* Content */}
              <Text style={[styles.systemMessageContent, { color: themeColors.text.secondary }]}>
                {content.replace(/\*\*/g, '').replace(/\n/g, '\n')}
              </Text>

              {/* Action buttons for job_application or direct_contract_proposal */}
              {(item.metadata?.action === 'job_application' || item.metadata?.action === 'direct_contract_proposal') && (
                <View style={styles.systemMessageActions}>
                  {item.metadata?.jobId && item.metadata?.action === 'job_application' && (
                    <TouchableOpacity
                      style={[styles.systemActionButton, { backgroundColor: colors.primary[600] }]}
                      onPress={() => router.push(`/job/${item.metadata?.jobId}`)}
                    >
                      <Text style={styles.systemActionButtonText}>Ver Trabajo</Text>
                    </TouchableOpacity>
                  )}
                  {isPending && !isOwn && (
                    <Text style={[styles.pendingStatusText, { color: colors.warning[600] }]}>
                      Esperando tu respuesta...
                    </Text>
                  )}
                  {isPending && isOwn && (
                    <Text style={[styles.pendingStatusText, { color: colors.warning[600] }]}>
                      Esperando respuesta...
                    </Text>
                  )}
                </View>
              )}

              <Text style={[styles.systemMessageTime, { color: themeColors.text.muted }]}>
                {formatTime(item.createdAt)}
              </Text>
            </View>
          </View>
        </View>
      );
    }

    // Regular message
    return (
      <View>
        {showDate && (
          <View style={styles.dateSeparator}>
            <Text style={[styles.dateSeparatorText, { color: themeColors.text.muted }]}>
              {formatDate(item.createdAt)}
            </Text>
          </View>
        )}
        <View
          style={[
            styles.messageContainer,
            isOwn ? styles.ownMessage : styles.otherMessage,
          ]}
        >
          {!isOwn && (
            <View style={[styles.avatarSmall, { backgroundColor: themeColors.slate[100] }]}>
              <User size={16} color={themeColors.text.secondary} />
            </View>
          )}
          <View
            style={[
              styles.messageBubble,
              isOwn
                ? { backgroundColor: colors.primary[600] }
                : { backgroundColor: themeColors.card, borderWidth: 1, borderColor: themeColors.border },
            ]}
          >
            <Text
              style={[
                styles.messageText,
                { color: isOwn ? '#fff' : themeColors.text.primary },
              ]}
            >
              {messageContent}
            </Text>
            <Text
              style={[
                styles.messageTime,
                { color: isOwn ? 'rgba(255,255,255,0.7)' : themeColors.text.muted },
              ]}
            >
              {formatTime(item.createdAt)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.backButton}>
            <ArrowLeft size={24} color={themeColors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
            Chat
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
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
            Chat
          </Text>
          {/* Job Code Badge */}
          {(conversation?.jobId || conversation?.job) && (
            <TouchableOpacity
              onPress={handleCopyJobCode}
              style={[styles.jobCodeBadge, { backgroundColor: themeColors.primary[50], borderColor: themeColors.primary[200] }]}
            >
              <Key size={12} color={themeColors.primary[600]} />
              <Text style={[styles.jobCodeText, { color: themeColors.primary[700] }]}>
                #{getJobCode(conversation?.jobId || conversation?.job?.id || conversation?.job?._id)}
              </Text>
              {copiedJobCode ? (
                <Check size={12} color={colors.success[500]} />
              ) : (
                <Copy size={12} color={themeColors.primary[400]} />
              )}
            </TouchableOpacity>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id || item._id}
          inverted
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color={themeColors.primary[600]} style={{ marginVertical: spacing.md }} />
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: themeColors.text.muted }]}>
                No hay mensajes aún. ¡Envía el primero!
              </Text>
            </View>
          }
        />

        {/* Job Picker */}
        {showJobPicker && (
          <View style={[chatStyles.inlineJobPicker, { backgroundColor: themeColors.card, borderTopColor: themeColors.border }]}>
            <View style={chatStyles.inlineJobPickerHeader}>
              <Text style={[{ fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: themeColors.text.secondary }]}>Adjuntar trabajo</Text>
              <TouchableOpacity onPress={() => { setShowJobPicker(false); setSelectedJob(null); }}>
                <X size={16} color={themeColors.text.muted} strokeWidth={2} />
              </TouchableOpacity>
            </View>
            {loadingInlineJobs ? (
              <ActivityIndicator size="small" color={colors.primary[500]} style={{ padding: spacing.md }} />
            ) : inlineJobs.length > 0 ? (
              <FlatList
                data={inlineJobs}
                keyExtractor={(item) => item.id || item._id}
                style={{ maxHeight: 160 }}
                renderItem={({ item: job }) => (
                  <TouchableOpacity
                    onPress={() => { setSelectedJob(job); setShowJobPicker(false); }}
                    style={[chatStyles.inlineJobItem, { borderBottomColor: themeColors.border }]}
                  >
                    <Text style={[{ fontSize: fontSize.sm, fontWeight: fontWeight.medium, color: themeColors.text.primary }]} numberOfLines={1}>{job.title}</Text>
                    <Text style={[{ fontSize: fontSize.xs, color: themeColors.text.muted, marginTop: 2 }]}>
                      ${Number(job.price).toLocaleString('es-AR')}{job.location && ` · ${job.location}`}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            ) : (
              <Text style={[{ fontSize: fontSize.sm, color: themeColors.text.muted, textAlign: 'center', padding: spacing.md }]}>No hay trabajos disponibles</Text>
            )}
          </View>
        )}

        {/* Selected Job Preview */}
        {selectedJob && !showJobPicker && (
          <View style={[chatStyles.inlineJobPreview, { backgroundColor: themeColors.card, borderTopColor: themeColors.border }]}>
            <Briefcase size={16} color={colors.primary[500]} strokeWidth={2} />
            <Text style={[{ flex: 1, fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: themeColors.text.primary }]} numberOfLines={1}>
              {selectedJob.title}
            </Text>
            <TouchableOpacity onPress={() => setSelectedJob(null)}>
              <X size={14} color={themeColors.text.muted} strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}

        {/* Input */}
        <View style={[styles.inputContainer, { backgroundColor: themeColors.card, borderTopColor: themeColors.border }]}>
          <TouchableOpacity
            onPress={toggleJobPicker}
            style={[chatStyles.attachBtn, showJobPicker || selectedJob ? { backgroundColor: colors.primary[50] } : {}]}
          >
            <Briefcase size={20} color={showJobPicker || selectedJob ? colors.primary[600] : themeColors.text.muted} strokeWidth={2} />
          </TouchableOpacity>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: themeColors.slate[50],
                borderColor: themeColors.border,
                color: themeColors.text.primary,
              },
            ]}
            placeholder="Escribe un mensaje..."
            placeholderTextColor={themeColors.text.muted}
            value={messageText}
            onChangeText={setMessageText}
            multiline
            maxLength={1000}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!messageText.trim() && !selectedJob || sending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={(!messageText.trim() && !selectedJob) || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Send size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const chatStyles = StyleSheet.create({
  dateSeparator: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  dateText: {
    fontSize: fontSize.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  jobAttachmentCard: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    maxWidth: '80%' as any,
  },
  jobAttachmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  jobAttachmentLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  jobAttachmentTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  jobAttachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  jobAttachmentMeta: {
    fontSize: fontSize.xs,
  },
  jobAttachmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    marginTop: spacing.md,
  },
  jobAttachmentBtnText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  attachBtn: {
    padding: spacing.sm,
    borderRadius: borderRadius.full,
  },
  inlineJobPicker: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  inlineJobPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  inlineJobItem: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
  },
  inlineJobPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
  },
});

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
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  jobCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    gap: 6,
  },
  jobCodeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    letterSpacing: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messagesList: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  messageContainer: {
    flexDirection: 'row',
    marginVertical: spacing.xs,
    alignItems: 'flex-end',
  },
  ownMessage: {
    justifyContent: 'flex-end',
  },
  otherMessage: {
    justifyContent: 'flex-start',
  },
  avatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.xs,
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.xl,
  },
  messageText: {
    fontSize: fontSize.base,
    lineHeight: 22,
  },
  messageTime: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    alignSelf: 'flex-end',
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  dateSeparatorText: {
    fontSize: fontSize.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    borderTopWidth: 1,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.base,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.slate[300],
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyText: {
    fontSize: fontSize.base,
    textAlign: 'center',
  },
  // System message styles
  systemMessageBubble: {
    maxWidth: '90%',
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    marginVertical: spacing.sm,
  },
  systemMessageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  systemIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  systemMessageHeaderText: {
    flex: 1,
  },
  systemMessageTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    marginBottom: 2,
  },
  systemMessageSubtitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  systemMessageContent: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  systemMessageTime: {
    fontSize: fontSize.xs,
    alignSelf: 'flex-end',
  },
  systemMessageActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  systemActionButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
  },
  systemActionButtonText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
    gap: 6,
  },
  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  pendingBadgeText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  pendingStatusText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
