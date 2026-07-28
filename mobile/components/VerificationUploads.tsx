import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Shield, Check } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { upload } from '../services/api';

/**
 * Selfie + insurance (seguro) uploads for the credibility ladder.
 * Selfie → POST /auth/dni-photos (field `selfie`).
 * Insurance → POST /auth/insurance-document (field `insuranceDocument`).
 */
export default function VerificationUploads() {
  const { colors }: any = useTheme();
  const { user, refreshUser } = useAuth() as any;
  const [busy, setBusy] = useState<null | 'selfie' | 'insurance'>(null);

  const isProfessional = !!(user?.profession || user?.licenseNumber || user?.licenseDocumentUrl);
  const selfieDone = !!user?.selfieUrl;
  const insuranceDone = !!user?.insuranceVerified || !!user?.insuranceDocumentUrl;

  const pick = async (): Promise<string | null> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería');
      return null;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return null;
    return res.assets[0].uri;
  };

  const takeSelfie = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara'); return null; }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      cameraType: ImagePicker.CameraType.front,
      quality: 0.8,
    });
    if (res.canceled || !res.assets?.[0]) return null;
    return res.assets[0].uri;
  };

  const doUpload = async (kind: 'selfie' | 'insurance', uri: string) => {
    setBusy(kind);
    try {
      const filename = uri.split('/').pop() || `${kind}.jpg`;
      const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';
      const type = ext === 'png' ? 'image/png' : 'image/jpeg';
      const fd = new FormData();
      const field = kind === 'selfie' ? 'selfie' : 'insuranceDocument';
      const endpoint = kind === 'selfie' ? '/auth/dni-photos' : '/auth/insurance-document';
      fd.append(field, { uri, name: filename, type } as any);
      const res: any = await upload(endpoint, fd);
      if (res.success) {
        await refreshUser?.();
        Alert.alert('Listo', kind === 'selfie' ? 'Selfie subida.' : 'Seguro subido. Lo verifica el equipo.');
      } else {
        Alert.alert('Error', res.message || 'No se pudo subir.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Error al subir.');
    } finally {
      setBusy(null);
    }
  };

  const row = (opts: { icon: React.ReactNode; label: string; hint: string; done: boolean; onPress: () => void; kind: 'selfie' | 'insurance' }) => (
    <TouchableOpacity
      onPress={opts.onPress}
      disabled={busy !== null}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12,
        borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginBottom: 10, opacity: busy && busy !== opts.kind ? 0.5 : 1,
      }}
    >
      {opts.icon}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text.primary }}>{opts.label}</Text>
        <Text style={{ fontSize: 12, color: colors.text.muted }}>{opts.hint}</Text>
      </View>
      {busy === opts.kind ? (
        <ActivityIndicator color={colors.primary[500]} />
      ) : opts.done ? (
        <Check size={18} color={colors.success} />
      ) : null}
    </TouchableOpacity>
  );

  return (
    <View style={{ marginTop: 8 }}>
      {row({
        kind: 'selfie',
        icon: <Camera size={20} color={colors.primary[500]} />,
        label: 'Selfie',
        hint: selfieDone ? 'Subida — suma credibilidad' : 'Sacate una selfie para confirmar que sos vos',
        done: selfieDone,
        onPress: () => {
          Alert.alert('Selfie', 'Elegí una opción', [
            { text: 'Cámara', onPress: async () => { const u = await takeSelfie(); if (u) doUpload('selfie', u); } },
            { text: 'Galería', onPress: async () => { const u = await pick(); if (u) doUpload('selfie', u); } },
            { text: 'Cancelar', style: 'cancel' },
          ]);
        },
      })}

      {isProfessional && row({
        kind: 'insurance',
        icon: <Shield size={20} color={colors.success} />,
        label: 'Seguro profesional',
        hint: user?.insuranceVerified ? 'Verificado' : insuranceDone ? 'En revisión' : 'Subí tu seguro (suma credibilidad)',
        done: insuranceDone,
        onPress: async () => { const u = await pick(); if (u) doUpload('insurance', u); },
      })}
    </View>
  );
}
