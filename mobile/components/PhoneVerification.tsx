import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Check, MessageCircle } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { post } from '../services/api';

/**
 * Phone verification via a WhatsApp code the user copies and pastes back.
 */
export default function PhoneVerification({
  phone,
  verified,
  onVerified,
}: {
  phone?: string;
  verified?: boolean;
  onVerified?: () => void;
}) {
  const { colors }: any = useTheme();
  const [localPhone, setLocalPhone] = useState(phone || '');
  const [step, setStep] = useState<'idle' | 'sent'>('idle');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [done, setDone] = useState(!!verified);

  const sendCode = async () => {
    if (!localPhone.trim()) { setError('Ingresá tu número de teléfono.'); return; }
    setLoading(true); setError(null); setInfo(null);
    try {
      const res: any = await post('/auth/phone/send-code', { phone: localPhone.trim() });
      if (res.success) {
        setStep('sent');
        setInfo(res.devCode ? `Modo prueba — tu código es: ${res.devCode}` : 'Te enviamos un código por WhatsApp.');
      } else setError(res.message || 'No se pudo enviar el código.');
    } catch {
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    if (!code.trim()) { setError('Pegá el código que te llegó.'); return; }
    setLoading(true); setError(null);
    try {
      const res: any = await post('/auth/phone/verify-code', { code: code.trim() });
      if (res.success) { setDone(true); setStep('idle'); onVerified?.(); }
      else setError(res.message || 'Código incorrecto.');
    } catch {
      setError('Error de conexión.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Check size={16} color={colors.success} />
        <Text style={{ color: colors.success, fontWeight: '600', fontSize: 14 }}>Teléfono verificado</Text>
      </View>
    );
  }

  const inputStyle = {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    color: colors.text.primary, backgroundColor: colors.background, fontSize: 14,
  } as const;

  return (
    <View style={{ gap: 10 }}>
      <TextInput
        value={localPhone}
        onChangeText={setLocalPhone}
        placeholder="Ej: +54 9 11 1234-5678"
        placeholderTextColor={colors.text.muted}
        editable={step !== 'sent'}
        keyboardType="phone-pad"
        style={inputStyle}
      />

      {step === 'idle' ? (
        <TouchableOpacity
          onPress={sendCode}
          disabled={loading}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.success, paddingVertical: 12, borderRadius: 10, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <MessageCircle size={16} color="#fff" />}
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Enviar código por WhatsApp</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text.secondary }}>
            Pegá el código que te llegó por WhatsApp
          </Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.replace(/[^0-9]/g, ''))}
              placeholder="000000"
              placeholderTextColor={colors.text.muted}
              keyboardType="number-pad"
              maxLength={6}
              style={[inputStyle, { flex: 1, textAlign: 'center', letterSpacing: 6 }]}
            />
            <TouchableOpacity
              onPress={verify}
              disabled={loading}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary[500], paddingHorizontal: 16, borderRadius: 10, justifyContent: 'center', opacity: loading ? 0.6 : 1 }}
            >
              {loading && <ActivityIndicator color="#fff" size="small" />}
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Verificar</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={sendCode} disabled={loading}>
            <Text style={{ fontSize: 12, color: colors.primary[500] }}>Reenviar código</Text>
          </TouchableOpacity>
        </View>
      )}

      {info ? <Text style={{ fontSize: 12, color: colors.success }}>{info}</Text> : null}
      {error ? <Text style={{ fontSize: 12, color: colors.error }}>{error}</Text> : null}
    </View>
  );
}
