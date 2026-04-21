import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

export default function PrivacyPolicyScreen() {
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
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Política de Privacidad</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.headerIcon}>🛡️</Text>
          <Text style={[styles.pageTitle, { color: themeColors.text.primary }]}>Política de Privacidad</Text>
        </View>
        <Text style={[styles.lastUpdated, { color: themeColors.text.muted }]}>Última actualización: 7 de Noviembre de 2025</Text>

        <S title="1. Responsable del Tratamiento">
          <P>DOAPP, operando en la República Argentina, es responsable del tratamiento de los datos personales recopilados a través de su plataforma.</P>
        </S>
        <S title="2. Datos que Recopilamos">
          <P>Recopilamos los siguientes datos personales:</P>
          <P>• Datos de identificación: nombre, apellido, email, número de teléfono.</P>
          <P>• Datos de cuenta: contraseña cifrada, foto de perfil, descripción personal.</P>
          <P>• Datos bancarios: CBU/alias para retiros (almacenados de forma segura).</P>
          <P>• Datos de uso: historial de trabajos, contratos, calificaciones recibidas.</P>
          <P>• Datos técnicos: dirección IP, tipo de dispositivo, sistema operativo.</P>
        </S>
        <S title="3. Finalidades del Tratamiento">
          <P>Utilizamos tus datos para:</P>
          <P>• Gestionar tu cuenta y permitirte usar la plataforma.</P>
          <P>• Procesar pagos y retiros de saldo.</P>
          <P>• Enviar notificaciones sobre actividad en tu cuenta.</P>
          <P>• Mejorar nuestros servicios y personalizar la experiencia.</P>
          <P>• Cumplir obligaciones legales y fiscales en Argentina.</P>
        </S>
        <S title="4. Compartición de Datos">
          <P>No vendemos tus datos personales. Podemos compartirlos con:</P>
          <P>• Procesadores de pago (MercadoPago) para gestionar transacciones.</P>
          <P>• Proveedores de infraestructura (hosting, email) bajo acuerdos de confidencialidad.</P>
          <P>• Autoridades legales cuando sea requerido por ley.</P>
        </S>
        <S title="5. Seguridad">
          <P>Implementamos medidas técnicas y organizativas para proteger tus datos, incluyendo cifrado SSL/TLS, hashing de contraseñas y control de acceso. Sin embargo, ningún sistema es 100% seguro.</P>
        </S>
        <S title="6. Tus Derechos (LPDP Argentina)">
          <P>Tenés derecho a: acceder a tus datos, rectificarlos, suprimirlos, oponerte al tratamiento y solicitar la portabilidad. Para ejercerlos, contactá a support@doapp.com.ar</P>
        </S>
        <S title="7. Retención de Datos">
          <P>Conservamos tus datos mientras tu cuenta esté activa y por el período requerido por las leyes argentinas (generalmente 5 años para datos financieros).</P>
        </S>
        <S title="8. Cookies y Tecnologías Similares">
          <P>Usamos cookies para mantener sesiones activas, recordar preferencias y analizar el uso de la plataforma. Podés gestionar las cookies desde la configuración de tu navegador.</P>
        </S>
        <S title="9. Contacto">
          <P>Para consultas sobre privacidad: support@doapp.com.ar</P>
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
