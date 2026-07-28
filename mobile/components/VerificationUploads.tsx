import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Shield, Check, BadgeCheck } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { upload, post } from '../services/api';

/**
 * Selfie + insurance (seguro) uploads for the credibility ladder.
 * Selfie → POST /auth/dni-photos (field `selfie`).
 * Insurance → POST /auth/insurance-document (field `insuranceDocument`).
 */
export default function VerificationUploads() {
  const { colors }: any = useTheme();
  const { user, refreshUser } = useAuth() as any;
  const [busy, setBusy] = useState<null | 'selfie' | 'insurance' | 'kyc'>(null);

  const isProfessional = !!(user?.profession || user?.licenseNumber || user?.licenseDocumentUrl);
  const selfieDone = !!user?.selfieUrl;
  const insuranceDone = !!user?.insuranceVerified || !!user?.insuranceDocumentUrl;
  const identityDone = !!user?.dniVerified;
  const kycDeclined = user?.kycStatus === 'Declined';

  const runKyc = async () => {
    setBusy('kyc');
    try {
      const res: any = await post('/auth/kyc/start', {});
      if (res.success && res.url) {
        await Linking.openURL(res.url);
      } else {
        Alert.alert('No disponible', res.message || 'La verificación de identidad no está disponible por el momento.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No pudimos iniciar la verificación.');
    } finally {
      setBusy(null);
    }
  };

  const reportKycProblem = async () => {
    try {
      const res: any = await post('/tickets', {
        email: user?.email,
        subject: 'Problema con la verificación automática (KYC)',
        category: 'support',
        message: 'No pude completar la verificación de identidad automática. Por favor revisen mi caso para poder terminar el registro.',
      });
      Alert.alert(res.success ? 'Reporte enviado' : 'Error', res.success ? 'Nuestro equipo va a revisar tu caso.' : (res.message || 'No se pudo enviar.'));
    } catch (e: any) {
      Alert.alert('Error', 'No se pudo enviar el reporte.');
    }
  };

  const startKyc = () => {
    if (kycDeclined) {
      Alert.alert(
        'Verificación rechazada',
        'Tu registro quedó sin terminar. Podés reintentar o reportar un problema.',
        [
          { text: 'Reintentar', onPress: runKyc },
          { text: 'Reportar problema', onPress: reportKycProblem },
          { text: 'Cancelar', style: 'cancel' },
        ],
      );
    } else {
      runKyc();
    }
  };

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

  const row = (opts: { icon: React.ReactNode; label: string; hint: string; done: boolean; onPress: () => void; kind: 'selfie' | 'insurance' | 'kyc' }) => (
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
        kind: 'kyc',
        icon: <BadgeCheck size={20} color={colors.primary[600]} />,
        label: 'Verificar identidad',
        hint: identityDone ? 'Identidad verificada' : kycDeclined ? 'Rechazado · registro sin terminar — tocá para reintentar' : 'Con documento y selfie (Didit) — nivel 1',
        done: identityDone,
        onPress: startKyc,
      })}

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
