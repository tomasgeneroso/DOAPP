import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

export default function DisputeResolutionScreen() {
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
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Resolución de Disputas</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.headerIcon}>⚖️</Text>
          <Text style={[styles.pageTitle, { color: themeColors.text.primary }]}>Resolución de Disputas</Text>
        </View>
        <Text style={[styles.lastUpdated, { color: themeColors.text.muted }]}>Última actualización: 7 de Noviembre de 2025</Text>
        <S title="1. ¿Cuándo abrir una disputa?">
          <P>Podés abrir una disputa cuando:</P>
          <P>• El servicio no fue entregado como se acordó.</P>
          <P>• El trabajo está incompleto o tiene defectos graves.</P>
          <P>• Hay desacuerdo sobre los términos del contrato.</P>
          <P>• Se produjeron problemas de pago.</P>
        </S>
        <S title="2. Proceso de resolución">
          <P>Paso 1 — Comunicación directa: Intentá resolver el problema directamente con la otra parte mediante el chat de la plataforma.</P>
          <P>Paso 2 — Apertura de disputa: Si no llegás a un acuerdo, abrí una disputa desde el detalle del contrato.</P>
          <P>Paso 3 — Revisión por DOAPP: Nuestro equipo revisará la evidencia presentada por ambas partes en un plazo de 72 horas hábiles.</P>
          <P>Paso 4 — Resolución: DOAPP tomará una decisión basada en la evidencia disponible.</P>
        </S>
        <S title="3. Tipos de resolución">
          <P>• Liberación total: el pago en escrow se libera al doer.</P>
          <P>• Reembolso total: el pago se devuelve al cliente.</P>
          <P>• Reembolso parcial: distribución proporcional según lo acordado.</P>
        </S>
        <S title="4. Evidencia aceptada">
          <P>• Capturas de pantalla de conversaciones.</P>
          <P>• Fotos o videos del trabajo realizado.</P>
          <P>• Documentos o comprobantes relacionados.</P>
          <P>• Cualquier otra prueba relevante (PDF, imágenes).</P>
        </S>
        <S title="5. Escrow durante la disputa">
          <P>Mientras una disputa esté abierta, los fondos en escrow quedan congelados. Se liberarán o devolverán según la resolución del equipo de DOAPP.</P>
        </S>
        <S title="6. Plazos">
          <P>• Apertura de disputa: hasta 14 días luego del vencimiento del contrato.</P>
          <P>• Resolución por DOAPP: hasta 5 días hábiles desde la apertura.</P>
          <P>• Apelación de resolución: hasta 72 horas luego de la resolución.</P>
        </S>
        <S title="7. Sanciones por abuso">
          <P>Abrir disputas de mala fe o proporcionar evidencia falsa puede resultar en suspensión o cancelación de la cuenta.</P>
        </S>
        <S title="8. Contacto">
          <P>Para disputas o consultas: support@doapp.com.ar</P>
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
