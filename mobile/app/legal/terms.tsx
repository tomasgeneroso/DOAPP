import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

export default function TermsScreen() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
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
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>Términos y Condiciones</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={[styles.lastUpdated, { color: themeColors.text.muted }]}>
          Última actualización: 17 de Marzo de 2026
        </Text>

        <P>
          Los presentes Términos y Condiciones regulan el acceso y uso de la plataforma digital denominada DOAPP, por parte de cualquier persona humana o jurídica que se registre y/o utilice sus servicios.
        </P>
        <P>
          La utilización de la Plataforma implica la aceptación plena y sin reservas de los presentes Términos, los cuales constituyen un contrato válido y vinculante conforme a los artículos 958 y concordantes del Código Civil y Comercial de la Nación.
        </P>

        <Section title="1. Identificación del Titular">
          <P>La Plataforma es operada por DOAPP, con domicilio legal en la República Argentina.</P>
        </Section>

        <Section title="2. Descripción del Servicio">
          <P>DOAPP es una plataforma digital de intermediación tecnológica, bajo el modelo de marketplace y red social, que permite vincular Clientes (personas que demandan servicios) con Trabajadores/Doers (personas que ofrecen servicios profesionales de manera independiente).</P>
          <View style={[styles.warningBox, { backgroundColor: colors.warning[50], borderColor: colors.warning[300] }]}>
            <Text style={[styles.warningText, { color: colors.warning[800] }]}>
              DOAPP NO presta los servicios publicados, NO es empleador, NO actúa como parte del contrato de prestación de servicios, limitándose su rol a facilitar herramientas tecnológicas de contacto, gestión de pagos, custodia de fondos y mediación en disputas.
            </Text>
          </View>
        </Section>

        <Section title="3. Naturaleza Jurídica de la Relación">
          <P>3.1. Los Trabajadores se registran y actúan como prestadores independientes y autónomos, sin que exista relación laboral, societaria, de dependencia, mandato, agencia o franquicia con DOAPP.</P>
          <P>3.2. Cada contrato celebrado a través de la Plataforma se perfecciona exclusivamente entre Cliente y Trabajador, quienes asumen íntegramente los derechos y obligaciones emergentes del mismo.</P>
          <P>3.3. DOAPP no ejerce control técnico, disciplinario ni organizativo sobre los Trabajadores, limitándose a reglas de uso de la Plataforma.</P>
        </Section>

        <Section title="4. Registro de Usuarios">
          <P>4.1. El acceso a la Plataforma requiere registro previo y creación de una cuenta personal.</P>
          <P>4.2. El Usuario garantiza la veracidad, exactitud y actualización de los datos suministrados.</P>
          <P>4.3. DOAPP podrá requerir procesos de verificación de identidad (KYC), incluyendo validación de correo electrónico, teléfono, documento de identidad y datos fiscales, especialmente para membresías PRO y SUPER PRO.</P>
        </Section>

        <Section title="5. Categorías de Servicios">
          <P>La Plataforma permite la publicación y contratación de servicios como: Limpieza, Mudanzas, Jardinería, Construcción, Tecnología y Servicios profesionales varios.</P>
          <P>DOAPP no garantiza la idoneidad, calidad, resultado ni legalidad de los servicios ofrecidos.</P>
        </Section>

        <Section title="6. Sistema de Contratación">
          <P>6.1. El ciclo de contratación incluye: publicación, postulación, aceptación, pago, ejecución, confirmación por parte de un administrador de la plataforma y completado.</P>
          <P>6.2. La aceptación del Trabajador y del Cliente genera un contrato digital vinculante entre ambos.</P>
          <P>6.3. El sistema requiere confirmación bilateral de finalización para la liberación de fondos.</P>
        </Section>

        <Section title="7. Pagos, Comisiones y Escrow">
          <P>7.1. Los pagos se procesan a través de MercadoPago, aceptándose los medios habilitados por dicho proveedor.</P>
          <P>7.2. DOAPP actúa como custodio de fondos (escrow), reteniendo el dinero hasta la confirmación del servicio.</P>
          <P>7.3. DOAPP percibe una comisión por el uso de la Plataforma, conforme al plan del Usuario:</P>
          <View style={[styles.tableContainer, { borderColor: themeColors.border }]}>
            <View style={[styles.tableHeader, { backgroundColor: themeColors.slate[100] }]}>
              <Text style={[styles.tableHeaderText, { color: themeColors.text.primary, flex: 1 }]}>Plan</Text>
              <Text style={[styles.tableHeaderText, { color: themeColors.text.primary, width: 80, textAlign: 'center' }]}>Comisión</Text>
            </View>
            {[
              { plan: 'FREE', rate: '8%' },
              { plan: 'PRO ($4.999/mes)', rate: '3%' },
              { plan: 'SUPER PRO ($8.999/mes)', rate: '1%' },
            ].map((row, i) => (
              <View key={i} style={[styles.tableRow, { borderTopColor: themeColors.border }]}>
                <Text style={[styles.tableCell, { color: themeColors.text.secondary, flex: 1 }]}>{row.plan}</Text>
                <Text style={[styles.tableCell, { color: themeColors.text.secondary, width: 80, textAlign: 'center', fontWeight: '600' }]}>{row.rate}</Text>
              </View>
            ))}
          </View>
          <P>7.4. Comisión mínima: para contratos inferiores a $8.000 ARS se aplicará una comisión fija de $1.000 ARS.</P>
          <P>7.5. La comisión de DOAPP no es reembolsable, incluso en casos de cancelación o disputa.</P>
        </Section>

        <Section title="8. Membresías y Suscripciones">
          <P>8.1. DOAPP ofrece planes FREE, PRO y SUPER PRO, con renovación automática mensual.</P>
          <P>8.2. La cancelación no genera reintegro y los beneficios subsisten hasta el vencimiento del período abonado.</P>
          <P>8.3. DOAPP podrá modificar precios, notificando previamente al Usuario.</P>
        </Section>

        <Section title="9. Cancelaciones">
          <P>9.1. Cancelaciones previas a la aceptación por parte de un Administrador de la plataforma: devolución total.</P>
          <P>9.2. Cancelaciones hasta 24 horas antes del inicio: devolución del monto menos comisión, siempre y cuando la publicación no haya sido aceptada por un administrador de la plataforma.</P>
          <P>9.3. Cancelaciones tardías o durante la ejecución: distribución proporcional conforme lo establecido en la Plataforma, con retención de comisiones.</P>
        </Section>

        <Section title="10. Disputas y Mediación">
          <P>10.1. DOAPP actúa como mediador interno, sin carácter jurisdiccional.</P>
          <P>10.2. La apertura de una disputa congela los fondos hasta su resolución.</P>
          <P>10.3. Las decisiones del Administrador podrán consistir en liberación total, reembolso total, parcial o cierre sin acción. Para la toma de la resolución definitiva, se utilizará la información que voluntariamente remitieron las partes sobre las condiciones de contratación.</P>
          <P>10.4. La comisión de la Plataforma no se devuelve en ningún supuesto.</P>
        </Section>

        <Section title="11. Responsabilidad">
          <P>11.1. DOAPP no responde por la calidad, ejecución o resultado de los servicios, ni por daños personales, materiales o patrimoniales derivados de la prestación.</P>
          <P>11.2. El Usuario exonera a DOAPP de cualquier reclamo derivado de su relación contractual con otros Usuarios.</P>
        </Section>

        <Section title="12. Impuestos y Facturación">
          <P>12.1. Los Trabajadores son responsables de emitir las facturas correspondientes y cumplir con sus obligaciones fiscales ante AFIP.</P>
          <P>12.2. DOAPP podrá emitir factura por el cobro de sus comisiones.</P>
        </Section>

        <Section title="13. Protección de Datos Personales">
          <P>13.1. DOAPP cumple con la Ley 25.326 de Protección de Datos Personales.</P>
          <P>13.2. Los datos bancarios y de identidad se almacenan de forma encriptada.</P>
          <P>13.3. El Usuario podrá ejercer los derechos de acceso, rectificación, supresión y oposición.</P>
        </Section>

        <Section title="14. Publicidad">
          <P>DOAPP podrá ofrecer espacios publicitarios sujetos a disponibilidad, aprobación previa y pago anticipado.</P>
        </Section>

        <Section title="15. Sanciones">
          <P>DOAPP podrá aplicar advertencias, suspensiones o cancelación definitiva de cuentas ante incumplimientos, fraude o uso indebido de la Plataforma.</P>
        </Section>

        <Section title="16. Modificaciones">
          <P>DOAPP podrá modificar estos Términos, los cuales entrarán en vigencia desde su publicación.</P>
        </Section>

        <Section title="17. Ley Aplicable y Jurisdicción">
          <P>Los presentes Términos se rigen por las leyes de la República Argentina. Para los consumidores, será competente el tribunal del domicilio del Usuario conforme Ley 24.240.</P>
        </Section>

        <Section title="18. Aceptación">
          <P>El Usuario declara haber leído, comprendido y aceptado íntegramente los presentes Términos y Condiciones.</P>
        </Section>

        <View style={[styles.noteBox, { backgroundColor: colors.primary[50], borderLeftColor: colors.primary[500] }]}>
          <Text style={[styles.noteText, { color: colors.primary[800] }]}>
            Al registrarte y utilizar DOAPP, confirmas que has leído, entendido y aceptado estos Términos y Condiciones en su totalidad.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  topBarTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold },
  scrollContent: { padding: spacing.lg, paddingBottom: 50 },
  lastUpdated: { fontSize: fontSize.xs, marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  sectionTitle: { fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing.sm },
  paragraph: { fontSize: fontSize.sm, lineHeight: 22, marginBottom: spacing.sm },
  warningBox: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  warningText: { fontSize: fontSize.sm, lineHeight: 20 },
  tableContainer: { borderWidth: 1, borderRadius: borderRadius.lg, overflow: 'hidden', marginVertical: spacing.sm },
  tableHeader: { flexDirection: 'row', padding: spacing.sm },
  tableHeaderText: { fontSize: fontSize.sm, fontWeight: fontWeight.semibold },
  tableRow: { flexDirection: 'row', padding: spacing.sm, borderTopWidth: 1 },
  tableCell: { fontSize: fontSize.sm },
  noteBox: {
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderLeftWidth: 4,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  noteText: { fontSize: fontSize.sm, lineHeight: 20 },
});
