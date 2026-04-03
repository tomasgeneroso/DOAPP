import { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Star, X, Send, Briefcase, Calendar, Clock } from 'lucide-react-native';
import { submitReview } from '../../services/reviews';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

interface ReviewModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  contractId: string;
  otherUserName: string;
  jobTitle: string;
  jobStartDate?: string;
  jobEndDate?: string;
  actualStartDate?: string;
  actualEndDate?: string;
  role: 'client' | 'doer';
  themeColors: any;
}

const StarRatingRow = ({
  value,
  onChange,
  label,
  themeColors,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  themeColors: any;
}) => (
  <View style={styles.starRow}>
    <Text style={[styles.starLabel, { color: themeColors.text.secondary }]}>{label}</Text>
    <View style={styles.starsContainer}>
      {[1, 2, 3, 4, 5].map((star) => (
        <TouchableOpacity key={star} onPress={() => onChange(star)} style={styles.starButton}>
          <Star
            size={22}
            color={star <= value ? '#f59e0b' : colors.slate[300]}
            fill={star <= value ? '#f59e0b' : 'none'}
          />
        </TouchableOpacity>
      ))}
    </View>
  </View>
);

export default function ReviewModal({
  visible,
  onClose,
  onSuccess,
  contractId,
  otherUserName,
  jobTitle,
  jobStartDate,
  actualStartDate,
  actualEndDate,
  role,
  themeColors,
}: ReviewModalProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [communication, setCommunication] = useState(0);
  const [professionalism, setProfessionalism] = useState(0);
  const [quality, setQuality] = useState(0);
  const [timeliness, setTimeliness] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      Alert.alert('Error', 'Seleccioná una puntuación general');
      return;
    }
    if (comment.length < 10) {
      Alert.alert('Error', 'El comentario debe tener al menos 10 caracteres');
      return;
    }

    setSubmitting(true);
    try {
      const body: any = { contractId, rating, comment };
      if (communication > 0) body.communication = communication;
      if (professionalism > 0) body.professionalism = professionalism;
      if (quality > 0) body.quality = quality;
      if (timeliness > 0) body.timeliness = timeliness;

      const res = await submitReview(body);
      if (res.success) {
        Alert.alert('Listo', 'Tu opinión fue enviada');
        onSuccess();
      } else {
        Alert.alert('Error', (res as any).message || 'No se pudo enviar');
      }
    } catch {
      Alert.alert('Error', 'Error de conexión');
    } finally {
      setSubmitting(false);
    }
  };

  const ratingLabels = ['', 'Malo', 'Regular', 'Bueno', 'Muy bueno', 'Excelente'];

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: themeColors.card }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: themeColors.border }]}>
            <Text style={[styles.title, { color: themeColors.text.primary }]}>
              {role === 'client' ? 'Calificá al trabajador' : 'Calificá al cliente'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={22} color={themeColors.text.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* Job Info */}
            <View style={[styles.jobCard, { backgroundColor: themeColors.background }]}>
              <Briefcase size={18} color={colors.primary[500]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.jobTitle, { color: themeColors.text.primary }]}>{jobTitle}</Text>
                <View style={styles.jobMeta}>
                  {(actualStartDate || jobStartDate) && (
                    <View style={styles.metaRow}>
                      <Calendar size={12} color={themeColors.text.muted} />
                      <Text style={[styles.metaText, { color: themeColors.text.muted }]}>
                        {formatDate(actualStartDate || jobStartDate)}
                      </Text>
                    </View>
                  )}
                  {actualStartDate && actualEndDate && (
                    <View style={styles.metaRow}>
                      <Clock size={12} color={themeColors.text.muted} />
                      <Text style={[styles.metaText, { color: themeColors.text.muted }]}>
                        {formatTime(actualStartDate)} - {formatTime(actualEndDate)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Reviewing */}
            <Text style={[styles.sectionLabel, { color: themeColors.text.muted }]}>
              {role === 'client' ? 'Trabajador' : 'Cliente'}: <Text style={{ color: themeColors.text.primary, fontWeight: '600' as any }}>{otherUserName}</Text>
            </Text>

            {/* Overall Rating */}
            <Text style={[styles.sectionLabel, { color: themeColors.text.primary }]}>Puntuación general *</Text>
            <View style={styles.mainStars}>
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setRating(star)} style={styles.mainStarBtn}>
                  <Star
                    size={36}
                    color={star <= rating ? '#f59e0b' : colors.slate[300]}
                    fill={star <= rating ? '#f59e0b' : 'none'}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {rating > 0 && (
              <Text style={[styles.ratingLabel, { color: themeColors.text.muted }]}>
                {ratingLabels[rating]}
              </Text>
            )}

            {/* Specific Ratings */}
            <View style={styles.specificRatings}>
              <StarRatingRow value={communication} onChange={setCommunication} label="Comunicación" themeColors={themeColors} />
              <StarRatingRow value={professionalism} onChange={setProfessionalism} label="Profesionalismo" themeColors={themeColors} />
              <StarRatingRow value={quality} onChange={setQuality} label="Calidad" themeColors={themeColors} />
              <StarRatingRow value={timeliness} onChange={setTimeliness} label="Puntualidad" themeColors={themeColors} />
            </View>

            {/* Comment */}
            <Text style={[styles.sectionLabel, { color: themeColors.text.primary }]}>Comentario *</Text>
            <TextInput
              style={[styles.textInput, {
                color: themeColors.text.primary,
                borderColor: themeColors.border,
                backgroundColor: themeColors.background,
              }]}
              value={comment}
              onChangeText={setComment}
              placeholder={
                role === 'client'
                  ? '¿Cómo fue tu experiencia con el trabajador?'
                  : '¿Cómo fue tu experiencia con el cliente?'
              }
              placeholderTextColor={themeColors.text.muted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={1000}
            />
            <Text style={[styles.charCount, { color: themeColors.text.muted }]}>{comment.length}/1000</Text>

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, { opacity: submitting || rating === 0 ? 0.5 : 1 }]}
              onPress={handleSubmit}
              disabled={submitting || rating === 0}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Send size={18} color="#fff" />
                  <Text style={styles.submitText}>Enviar opinión</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    maxHeight: '90%',
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  closeBtn: {
    padding: spacing.sm,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing['5xl'],
  },
  jobCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.lg,
  },
  jobTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  jobMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: fontSize.xs,
  },
  sectionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  mainStars: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  mainStarBtn: {
    padding: spacing.xs,
  },
  ratingLabel: {
    textAlign: 'center',
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  specificRatings: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  starRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  starLabel: {
    fontSize: fontSize.sm,
    flex: 1,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 2,
  },
  starButton: {
    padding: 2,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    fontSize: fontSize.base,
    minHeight: 100,
  },
  charCount: {
    fontSize: fontSize.xs,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[600],
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    marginTop: spacing.xl,
  },
  submitText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
