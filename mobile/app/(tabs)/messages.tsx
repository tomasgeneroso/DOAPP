import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { PenSquare, X, Search, Briefcase, ChevronRight, User } from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Conversation, Job } from '../../types';
import { get } from '../../services/api';
import { searchUsers, startConversation } from '../../services/chat';
import { getJobs } from '../../services/jobs';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';
import { LogoIcon } from '../../components/ui/Logo';

export default function MessagesScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { colors: themeColors } = useTheme();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // New message modal
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchedUsers, setSearchedUsers] = useState<any[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [availableJobs, setAvailableJobs] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<any>(null);
  const [newConvMessage, setNewConvMessage] = useState('');
  const [creatingConv, setCreatingConv] = useState(false);
  const [showJobPicker, setShowJobPicker] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace('/(auth)/login');
      return;
    }
    fetchConversations();
  }, [isAuthenticated, authLoading]);

  const fetchConversations = async () => {
    try {
      const response = await get<Conversation[]>('/chat/conversations');
      if (response.success) {
        // Backend returns data as array directly, or nested under data
        const convs = Array.isArray(response.data) ? response.data : (response as any).data || [];
        setConversations(convs);
      }
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchConversations();
  };

  // User search with debounce
  const handleUserSearch = useCallback((query: string) => {
    setUserSearchQuery(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (query.length < 2) { setSearchedUsers([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const response = await searchUsers(query);
        if (response.success) {
          const users = (response as any).users || response.data?.users || [];
          const userId = user?._id || user?.id;
          setSearchedUsers(users.filter((u: any) => (u.id || u._id) !== userId));
        }
      } catch (error) {
        console.error('Error searching users:', error);
      } finally {
        setSearchingUsers(false);
      }
    }, 400);
  }, [user]);

  const handleSelectUser = async (u: any) => {
    setSelectedUser(u);
    setUserSearchQuery('');
    setSearchedUsers([]);
    // Fetch available jobs
    setLoadingJobs(true);
    try {
      const response = await getJobs({ status: 'open', limit: 50 });
      const jobsList = (response as any).jobs || response.data || [];
      setAvailableJobs(jobsList);
    } catch (error) {
      console.error('Error fetching jobs:', error);
    } finally {
      setLoadingJobs(false);
    }
  };

  const handleCreateConversation = async () => {
    if (!selectedUser) return;
    if (!newConvMessage.trim() && !selectedJob) return;
    setCreatingConv(true);
    try {
      const body: any = { participantId: selectedUser.id || selectedUser._id };
      if (selectedJob) body.jobId = selectedJob.id || selectedJob._id;
      if (newConvMessage.trim()) body.message = newConvMessage.trim();

      const response = await startConversation(body);
      if (response.success) {
        const conv = (response as any).data || response.data?.conversation;
        const convId = conv?.id || conv?._id;
        closeNewMessageModal();
        await fetchConversations();
        if (convId) router.push(`/chat/${convId}`);
      }
    } catch (error) {
      console.error('Error creating conversation:', error);
    } finally {
      setCreatingConv(false);
    }
  };

  const closeNewMessageModal = () => {
    setShowNewMessageModal(false);
    setSelectedUser(null);
    setSelectedJob(null);
    setNewConvMessage('');
    setUserSearchQuery('');
    setSearchedUsers([]);
    setShowJobPicker(false);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Ayer';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('es-AR', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
    }
  };

  const getOtherParticipant = (conversation: Conversation) => {
    if (Array.isArray(conversation.participants)) {
      const other = conversation.participants[0];
      if (typeof other === 'object') {
        return other;
      }
    }
    return null;
  };

  // Show nothing while loading or redirecting
  if (authLoading || !isAuthenticated) {
    return null;
  }

  const renderConversation = ({ item }: { item: Conversation }) => {
    const other = getOtherParticipant(item);
    const hasUnread = (item.unreadCount || 0) > 0;

    return (
      <TouchableOpacity
        style={[
          styles.conversationItem,
          { backgroundColor: hasUnread ? themeColors.primary[50] : themeColors.card, borderBottomColor: themeColors.border },
        ]}
        onPress={() => router.push(`/chat/${item._id}`)}
        activeOpacity={0.7}
      >
        {other?.avatar ? (
          <Image source={{ uri: other.avatar }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatarPlaceholder, { backgroundColor: themeColors.slate[200] }]}>
            <Text style={[styles.avatarText, { color: themeColors.slate[500] }]}>
              {other?.name?.charAt(0)?.toUpperCase() || '?'}
            </Text>
          </View>
        )}

        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text style={[styles.userName, { color: themeColors.text.primary, fontWeight: hasUnread ? fontWeight.bold : fontWeight.medium }]}>
              {other?.name || 'Usuario'}
            </Text>
            {item.lastMessage && (
              <Text style={[styles.messageTime, { color: themeColors.text.muted }]}>
                {formatTime(item.lastMessage.createdAt)}
              </Text>
            )}
          </View>

          <View style={styles.conversationFooter}>
            <Text
              style={[styles.lastMessage, { color: hasUnread ? themeColors.text.primary : themeColors.text.secondary, fontWeight: hasUnread ? fontWeight.medium : fontWeight.normal }]}
              numberOfLines={1}
            >
              {item.lastMessage?.content || 'Sin mensajes'}
            </Text>
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadCount}>{item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.header, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
          <View style={styles.headerRow}>
            <LogoIcon size="small" />
            <Text style={[styles.headerTitle, { color: themeColors.text.primary }]}>Mensajes</Text>
          </View>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[500]} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
        <View style={styles.headerRow}>
          <LogoIcon size="small" />
          <Text style={[styles.headerTitle, { color: themeColors.text.primary }]}>Mensajes</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => setShowNewMessageModal(true)}
            style={styles.newMessageBtn}
          >
            <PenSquare size={22} color={colors.primary[600]} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {conversations.length > 0 ? (
        <FlatList
          data={conversations}
          renderItem={renderConversation}
          keyExtractor={(item) => item._id || item.id || String(Math.random())}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.primary[500]]}
            />
          }
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💬</Text>
          <Text style={[styles.emptyTitle, { color: themeColors.text.primary }]}>Sin conversaciones</Text>
          <Text style={[styles.emptyText, { color: themeColors.text.secondary }]}>
            Tus mensajes con clientes y trabajadores aparecerán acá
          </Text>
          <TouchableOpacity
            onPress={() => setShowNewMessageModal(true)}
            style={[styles.emptyBtn, { backgroundColor: colors.primary[600] }]}
          >
            <Text style={styles.emptyBtnText}>Nuevo mensaje</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* New Message Modal */}
      <Modal
        visible={showNewMessageModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeNewMessageModal}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: themeColors.background }]} edges={['top']}>
          {/* Modal Header */}
          <View style={[styles.modalHeader, { backgroundColor: themeColors.card, borderBottomColor: themeColors.border }]}>
            <TouchableOpacity onPress={closeNewMessageModal} style={styles.modalCloseBtn}>
              <X size={24} color={themeColors.text.primary} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: themeColors.text.primary }]}>Nuevo mensaje</Text>
            <View style={{ width: 40 }} />
          </View>

          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
              {!selectedUser ? (
                <>
                  {/* User Search */}
                  <View style={[styles.searchContainer, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                    <Search size={18} color={themeColors.text.muted} strokeWidth={2} />
                    <TextInput
                      style={[styles.searchInput, { color: themeColors.text.primary }]}
                      placeholder="Buscar por nombre o @usuario..."
                      placeholderTextColor={themeColors.text.muted}
                      value={userSearchQuery}
                      onChangeText={handleUserSearch}
                      autoFocus
                    />
                  </View>

                  {searchingUsers ? (
                    <ActivityIndicator size="small" color={colors.primary[500]} style={{ marginTop: spacing.xl }} />
                  ) : searchedUsers.length > 0 ? (
                    <View style={[styles.searchResults, { borderColor: themeColors.border }]}>
                      {searchedUsers.map((u) => (
                        <TouchableOpacity
                          key={u.id || u._id}
                          onPress={() => handleSelectUser(u)}
                          style={[styles.userItem, { borderBottomColor: themeColors.border }]}
                        >
                          {u.avatar ? (
                            <Image source={{ uri: u.avatar }} style={styles.userAvatar} />
                          ) : (
                            <View style={[styles.userAvatarPlaceholder, { backgroundColor: colors.primary[100] }]}>
                              <User size={20} color={colors.primary[600]} strokeWidth={2} />
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.userName, { color: themeColors.text.primary }]}>{u.name}</Text>
                            {u.username && <Text style={[styles.userUsername, { color: themeColors.text.muted }]}>@{u.username}</Text>}
                          </View>
                          <ChevronRight size={18} color={themeColors.text.muted} strokeWidth={2} />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : userSearchQuery.length >= 2 ? (
                    <Text style={[styles.noResults, { color: themeColors.text.muted }]}>No se encontraron usuarios</Text>
                  ) : null}
                </>
              ) : (
                <>
                  {/* Selected User */}
                  <View style={[styles.selectedUserCard, { backgroundColor: colors.primary[50], borderColor: colors.primary[200] }]}>
                    {selectedUser.avatar ? (
                      <Image source={{ uri: selectedUser.avatar }} style={styles.userAvatar} />
                    ) : (
                      <View style={[styles.userAvatarPlaceholder, { backgroundColor: colors.primary[100] }]}>
                        <User size={20} color={colors.primary[600]} strokeWidth={2} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.userName, { color: themeColors.text.primary }]}>{selectedUser.name}</Text>
                      {selectedUser.username && <Text style={[styles.userUsername, { color: themeColors.text.muted }]}>@{selectedUser.username}</Text>}
                    </View>
                    <TouchableOpacity onPress={() => { setSelectedUser(null); setSelectedJob(null); }}>
                      <X size={18} color={themeColors.text.muted} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>

                  {/* Job Attachment */}
                  {selectedJob ? (
                    <View style={[styles.jobCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.jobLabel, { color: colors.primary[600] }]}>📋 Trabajo adjunto</Text>
                        <Text style={[styles.jobTitle, { color: themeColors.text.primary }]} numberOfLines={1}>{selectedJob.title}</Text>
                        <Text style={[styles.jobMeta, { color: themeColors.text.muted }]}>
                          ${Number(selectedJob.price).toLocaleString('es-AR')}
                          {selectedJob.location && ` · ${selectedJob.location}`}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => setSelectedJob(null)}>
                        <X size={16} color={themeColors.text.muted} strokeWidth={2} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setShowJobPicker(!showJobPicker)}
                      style={[styles.attachJobBtn, { borderColor: colors.primary[300] }]}
                    >
                      <Briefcase size={18} color={colors.primary[600]} strokeWidth={2} />
                      <Text style={[styles.attachJobText, { color: colors.primary[600] }]}>Adjuntar un trabajo publicado</Text>
                    </TouchableOpacity>
                  )}

                  {/* Job Picker */}
                  {showJobPicker && !selectedJob && (
                    <View style={[styles.jobPickerContainer, { borderColor: themeColors.border }]}>
                      {loadingJobs ? (
                        <ActivityIndicator size="small" color={colors.primary[500]} style={{ padding: spacing.lg }} />
                      ) : availableJobs.length > 0 ? (
                        availableJobs.map((job: any) => (
                          <TouchableOpacity
                            key={job.id || job._id}
                            onPress={() => { setSelectedJob(job); setShowJobPicker(false); }}
                            style={[styles.jobPickerItem, { borderBottomColor: themeColors.border }]}
                          >
                            <Text style={[styles.jobPickerTitle, { color: themeColors.text.primary }]} numberOfLines={1}>{job.title}</Text>
                            <Text style={[styles.jobPickerMeta, { color: themeColors.text.muted }]}>
                              ${Number(job.price).toLocaleString('es-AR')}
                              {job.location && ` · ${job.location}`}
                            </Text>
                          </TouchableOpacity>
                        ))
                      ) : (
                        <Text style={[styles.noResults, { color: themeColors.text.muted, padding: spacing.lg }]}>No hay trabajos disponibles</Text>
                      )}
                    </View>
                  )}

                  {/* Message Input */}
                  <Text style={[styles.inputLabel, { color: themeColors.text.secondary }]}>
                    Mensaje {!selectedJob && '(requerido)'}
                  </Text>
                  <TextInput
                    style={[styles.messageInput, { backgroundColor: themeColors.card, borderColor: themeColors.border, color: themeColors.text.primary }]}
                    placeholder="Escribí tu mensaje..."
                    placeholderTextColor={themeColors.text.muted}
                    value={newConvMessage}
                    onChangeText={setNewConvMessage}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />

                  {/* Send Button */}
                  <TouchableOpacity
                    onPress={handleCreateConversation}
                    disabled={creatingConv || (!newConvMessage.trim() && !selectedJob)}
                    style={[
                      styles.sendBtn,
                      { backgroundColor: (!newConvMessage.trim() && !selectedJob) || creatingConv ? colors.slate[300] : colors.primary[600] },
                    ]}
                  >
                    {creatingConv ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.sendBtnText}>Enviar mensaje</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerTitle: { fontSize: fontSize['2xl'], fontWeight: fontWeight.bold },
  listContent: { paddingVertical: spacing.sm },
  conversationItem: {
    flexDirection: 'row',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  avatar: { width: 52, height: 52, borderRadius: borderRadius.full, marginRight: spacing.md },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarText: { fontSize: fontSize.xl, fontWeight: fontWeight.bold },
  conversationContent: { flex: 1, justifyContent: 'center' },
  conversationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  userName: { fontSize: fontSize.base },
  messageTime: { fontSize: fontSize.xs },
  conversationFooter: { flexDirection: 'row', alignItems: 'center' },
  lastMessage: { flex: 1, fontSize: fontSize.sm },
  unreadBadge: {
    backgroundColor: colors.primary[500],
    borderRadius: borderRadius.full,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    marginLeft: spacing.sm,
  },
  unreadCount: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing['3xl'],
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.lg,
  },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: spacing.sm },
  emptyText: { fontSize: fontSize.sm, textAlign: 'center' },
  emptyBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  newMessageBtn: {
    padding: spacing.sm,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  modalCloseBtn: {
    padding: spacing.xs,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  modalContent: {
    flex: 1,
    padding: spacing.lg,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: fontSize.sm,
  },
  searchResults: {
    marginTop: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  userAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userUsername: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  noResults: {
    textAlign: 'center',
    fontSize: fontSize.sm,
    marginTop: spacing.xl,
  },
  selectedUserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  jobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  jobLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    marginBottom: 2,
  },
  jobTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  jobMeta: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  attachJobBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    marginBottom: spacing.md,
  },
  attachJobText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  jobPickerContainer: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.md,
    maxHeight: 200,
  },
  jobPickerItem: {
    padding: spacing.md,
    borderBottomWidth: 1,
  },
  jobPickerTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  jobPickerMeta: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.sm,
  },
  messageInput: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    padding: spacing.md,
    fontSize: fontSize.sm,
    minHeight: 80,
    marginBottom: spacing.lg,
  },
  sendBtn: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
