import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

export default function CookiesPolicyScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();
  const S = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: themeColors.text.primary }]}>{title}</Text>
      {children}
    </View>
  );
  const P = ({ children }: { children: React.ReactNode }) => (
    <Text style={[styles.paragraph, { color: themeColors.text.secondary }]}>{children}</Text>
  );
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: themeColors.border, backgroundColor: themeColors.card }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Política de Cookies</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.headerIcon}>🍪</Text>
          <Text style={[styles.pageTitle, { color: themeColors.text.primary }]}>Política de Cookies</Text>
        </View>
        <Text style={[styles.lastUpdated, { color: themeColors.text.muted }]}>Última actualización: 7 de Noviembre de 2025</Text>
        <S title="1. ¿Qué son las cookies?">
          <P>Las cookies son pequeños archivos de texto que se almacenan en tu dispositivo cuando accedés a nuestra plataforma. Nos ayudan a recordar tus preferencias y a mejorar tu experiencia.</P>
        </S>
        <S title="2. Tipos de cookies que usamos">
          <P>• Cookies esenciales: necesarias para el funcionamiento básico (autenticación, seguridad).</P>
          <P>• Cookies de preferencias: recuerdan tus configuraciones como el idioma o el modo oscuro.</P>
          <P>• Cookies analíticas: nos ayudan a entender cómo los usuarios interactúan con la plataforma.</P>
          <P>• Cookies de rendimiento: mejoran la velocidad y funcionalidad de la aplicación.</P>
        </S>
        <S title="3. Cookies de terceros">
          <P>Utilizamos servicios de terceros que pueden establecer sus propias cookies:</P>
          <P>• MercadoPago: para el procesamiento de pagos.</P>
          <P>• Firebase: para notificaciones push y análisis.</P>
          <P>• Google Analytics: para análisis de uso anónimo.</P>
        </S>
        <S title="4. Gestión de cookies">
          <P>Podés gestionar o deshabilitar las cookies desde la configuración de tu navegador. Ten en cuenta que algunas funcionalidades pueden dejar de funcionar si deshabilitás las cookies esenciales.</P>
        </S>
        <S title="5. Cookies en la app móvil">
          <P>La aplicación móvil usa tecnologías similares a las cookies (almacenamiento local seguro) para mantener tu sesión activa y guardar tus preferencias. Estos datos se almacenan en tu dispositivo y podés eliminarlos desinstalando la aplicación.</P>
        </S>
        <S title="6. Cambios en esta política">
          <P>Podemos actualizar esta política periódicamente. Te notificaremos sobre cambios significativos a través de la aplicación.</P>
        </S>
        <S title="7. Contacto">
          <P>Para consultas sobre cookies: support@doapp.com.ar</P>
        </S>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  backButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  topBarTitle: { fontSize: 17, fontWeight: '600' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  headerIcon: { fontSize: 32 },
  pageTitle: { fontSize: 24, fontWeight: '800', flex: 1 },
  lastUpdated: { fontSize: 13, marginBottom: 24 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  paragraph: { fontSize: 14, lineHeight: 22, marginBottom: 4 },
});
