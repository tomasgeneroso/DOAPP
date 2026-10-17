import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Clock,
  DollarSign,
  FileText,
  Tag,
  Users,
  CheckCircle,
  ClipboardList,
  Plus,
  Trash2,
  ChevronDown,
  Check,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { createJob, createJobPaymentOrder, getCategories } from '../services/jobs';
import { get as apiGet } from '../services/api';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../constants/theme';
import LocationAutocomplete from '../components/ui/LocationAutocomplete';
import DireccionDelTrabajo from '../components/ui/DireccionDelTrabajo';
import RangoDeFechas from '../components/ui/RangoDeFechas';
import TareasDelTrabajo, { type TareaEnPantalla } from '../components/ui/TareasDelTrabajo';
import { diaParaElServidor } from '../services/calendario';
import { leerTareasDeCreacion } from '../../shared/jobs/tareasDeCreacion';
import { sanearCalle, validarCalleYNumero } from '../../shared/geo/lugares';

export default function CreateJobScreen() {
  const router = useRouter();
  const { isDarkMode, colors: themeColors } = useTheme();
  const { isAuthenticated } = useAuth();

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  const categories = getCategories();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  /**
   * "A cotizar": se publica sin precio y lo propone el trabajador.
   *
   * Faltaba en mobile y estaba en la web desde hace rato, asi que un cliente
   * que entraba por el telefono no tenia como publicar un trabajo cuyo precio
   * no sabia -que en oficios es el caso normal: nadie sabe cuanto sale
   * arreglar algo hasta que alguien lo mira-.
   *
   * No paga nada al publicar: el cobro ocurre al aceptar una cotizacion.
   */
  const [aCotizar, setACotizar] = useState(false);

  /**
   * Pagar al terminar, sin retencion. Solo aparece si el modulo esta
   * encendido, y obliga a cotizar: sin plata retenida lo unico que respalda el
   * acuerdo es el acuerdo, asi que tiene que estar escrito y detallado.
   */
  const [pagoAlTerminarDisponible, setPagoAlTerminarDisponible] = useState(false);
  const [sinProteccion, setSinProteccion] = useState(false);

  useEffect(() => {
    let vivo = true;
    apiGet<{ activo: boolean }>('/payment-orders/estado-del-modulo', false)
      .then((r: any) => {
        if (vivo && r?.data) setPagoAlTerminarDisponible(Boolean(r.data.activo));
      })
      .catch(() => {
        /* sin respuesta la opcion no aparece: el modo seguro es el normal */
      });
    return () => {
      vivo = false;
    };
  }, []);
  const [location, setLocation] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressNumber, setAddressNumber] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [postalCode, setPostalCode] = useState('');
  const [inicio, setInicio] = useState<Date | null>(null);
  const [fin, setFin] = useState<Date | null>(null);
  const [endDateFlexible, setEndDateFlexible] = useState(false);

  // Entrega única, o por tareas (cada una con su día)
  const [entregaUnica, setEntregaUnica] = useState(true);
  const [tareas, setTareas] = useState<TareaEnPantalla[]>([{ title: '', dueDate: '' }, { title: '', dueDate: '' }]);
  const [maxWorkers, setMaxWorkers] = useState('1');
  const [requirements, setRequirements] = useState(['', '', '']);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCategories, setShowCategories] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) newErrors.title = 'El título es requerido';
    if (!description.trim()) newErrors.description = 'La descripción es requerida';
    if (!category) newErrors.category = 'Selecciona una categoría';
    // A cotizar se publica sin precio: validarlo seria pedir justo lo que el
    // cliente dijo que no sabe.
    if (!aCotizar) {
      if (!price || isNaN(parseFloat(price))) newErrors.price = 'Ingresa un precio válido';
      else if (parseFloat(price) < 1000) newErrors.price = 'El precio mínimo es $1,000 ARS';
      else if (parseFloat(price) > 999999999) newErrors.price = 'El precio máximo es $999,999,999 ARS';
    }
    if (!location.trim()) newErrors.location = 'La ubicación es requerida';
    {
      const separada = sanearCalle(addressStreet);
      const problema = validarCalleYNumero(separada.numero && !addressNumber ? separada.calle : addressStreet, separada.numero && !addressNumber ? separada.numero : addressNumber);
      if (problema) newErrors.address = problema;
    }
    if (!inicio) newErrors.startDate = 'Elegí las fechas del trabajo';
    else if (!endDateFlexible && !fin) newErrors.startDate = 'Elegí también el día en que termina, o marcá «Fecha de fin flexible»';
    else if (inicio.getTime() < Date.now() - 60_000) newErrors.startDate = 'La fecha de inicio ya pasó';
    if (!entregaUnica) {
      const leidas = leerTareasDeCreacion(
        tareas.map((t) => ({ title: t.title, dueDate: diaParaElServidor(t.dueDate) })),
        { inicio, fin: endDateFlexible ? null : fin },
      );
      if (leidas.ok === false) newErrors.tareas = leidas.mensaje;
      else if (tareas.some((t) => t.title.trim() && t.dueDate && !diaParaElServidor(t.dueDate))) newErrors.tareas = 'Escribí los días con el formato DD/MM/AAAA.';
      else if (leidas.tareas.length === 0) newErrors.tareas = 'Escribí al menos una tarea, o elegí «Entrega única».';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      router.push('/(auth)/login');
      return;
    }

    if (!validate()) return;

    setLoading(true);
    try {
      const desc = description.trim();
      const jobData = {
        title: title.trim(),
        summary: desc.length > 150 ? desc.substring(0, 150) + '...' : desc,
        description: desc,
        category,
        // El backend necesita saber el modo, no deducirlo de un precio vacio:
        // de eso depende si se cobra al publicar o al aceptar la cotizacion.
        pricingMode: aCotizar ? 'quote' : 'fixed',
        price: aCotizar ? 0 : parseFloat(price),
        budget: aCotizar ? 0 : parseFloat(price),
        ...(pagoAlTerminarDisponible && sinProteccion ? { paymentMode: 'on_completion' } : {}),
        location: location.trim(),
        neighborhood: neighborhood.trim() || undefined,
        ...(() => {
          const separada = sanearCalle(addressStreet);
          const usarSeparada = separada.numero && !addressNumber;
          const calle = (usarSeparada ? separada.calle : addressStreet).trim();
          const numero = (usarSeparada ? separada.numero : addressNumber).trim();
          return { addressStreet: calle || undefined, addressNumber: numero || undefined };
        })(),
        ...(coords ? { latitude: coords.lat, longitude: coords.lon } : {}),
        postalCode: postalCode.trim() || undefined,
        // Las horas son las del teléfono (Argentina): toISOString las pasa a UTC bien (antes se guardaban como si ya fueran UTC).
        startDate: inicio ? inicio.toISOString() : undefined,
        endDate: endDateFlexible || !fin ? undefined : fin.toISOString(),
        endDateFlexible,
        singleDelivery: entregaUnica,
        ...(entregaUnica
          ? {}
          : { tasks: tareas.filter((t) => t.title.trim()).map((t) => ({ title: t.title.trim(), dueDate: diaParaElServidor(t.dueDate) || null })) }),
        maxWorkers: parseInt(maxWorkers) || 1,
        completionRequirements: requirements.filter(r => r.trim()),
      };

      const response = await createJob(jobData as any);

      // Backend returns job at root level, not under data
      const job = response.data?.job || (response as any).job;
      const requiresPayment = (response as any).requiresPayment;

      // Helper: works on both web and native
      const showAlert = (title: string, message: string, onOk?: () => void) => {
        if (Platform.OS === 'web') {
          window.alert(`${title}\n\n${message}`);
          onOk?.();
        } else {
          Alert.alert(title, message, [{ text: 'OK', onPress: onOk }]);
        }
      };

      const openUrl = (url: string) => {
        if (Platform.OS === 'web') {
          window.open(url, '_blank') || (window.location.href = url);
        } else {
          Linking.openURL(url);
        }
      };

      // Mercado Pago devuelve a una página web, no a la app: la app sigue el pago por su cuenta y muestra cuándo llegó.
      const seguirElPago = (jobId: string, preferenceId?: string) => {
        if (Platform.OS === 'web' || !preferenceId) return;
        router.replace({ pathname: '/pago-en-curso', params: { tipo: 'publicacion', preferenceId, jobId } } as any);
      };

      if (response.success && job) {
        if (requiresPayment === false) {
          // Job published for free (user has free contracts)
          showAlert('Trabajo publicado', 'Tu trabajo ha sido publicado exitosamente.', () => {
            router.replace(`/job/${job.id}`);
          });
        } else {
          // Job created as draft, needs payment

          try {
            const paymentResponse = await createJobPaymentOrder(job.id, 'mercadopago');


            // El cliente de la API devuelve los errores HTTP como respuesta (no los lanza): el 409 llega acá.
            if (!paymentResponse.success && (paymentResponse as any).code === 'JOB_NOT_AWAITING_PAYMENT') {
              showAlert('Esta publicación ya está paga', 'Mirá en qué está en «Mis trabajos».', () => {
                router.replace('/my-jobs');
              });
            } else if (paymentResponse.success && (paymentResponse as any).requiresPayment === false) {
              // Free contract detected at payment step
              showAlert('Trabajo publicado', 'Tu trabajo ha sido publicado.', () => {
                router.replace(`/job/${job.id}`);
              });
            } else if (paymentResponse.success && (paymentResponse as any).approvalUrl) {
              // Open MercadoPago checkout
              const checkoutUrl = (paymentResponse as any).approvalUrl;
              const amount = (paymentResponse as any).amount;


              if (Platform.OS === 'web') {
                const proceed = window.confirm(
                  `Pago requerido\n\nPara publicar tu trabajo necesitás pagar $${amount?.toLocaleString('es-AR') || ''} ARS.\n\n¿Abrir MercadoPago para completar el pago?`
                );
                if (proceed) {
                  openUrl(checkoutUrl);
                }
              } else {
                Alert.alert(
                  'Pago requerido',
                  `Para publicar tu trabajo necesitás pagar $${amount?.toLocaleString('es-AR') || ''} ARS.`,
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Pagar con MercadoPago',
                      onPress: () => {
                        openUrl(checkoutUrl);
                        seguirElPago(job.id, (paymentResponse as any).preferenceId);
                      },
                    },
                  ]
                );
              }
            } else {
              // No approvalUrl in payment response
              showAlert('Trabajo creado', 'Tu trabajo fue creado pero requiere pago para ser publicado.', () => {
                router.replace('/(tabs)');
              });
            }
          } catch (payError: any) {
            console.error('Payment error:', payError.message);
            // Ya no espera el pago (por un pago anterior o un toque repetido): no es un error, se lleva a ver en qué está.
            if (payError?.code === 'JOB_NOT_AWAITING_PAYMENT' || /no está esperando el pago/i.test(String(payError?.message ?? ''))) {
              showAlert('Esta publicación ya está paga', 'Mirá en qué está en «Mis trabajos».', () => {
                router.replace('/my-jobs');
              });
              return;
            }
            showAlert('Trabajo creado', 'Tu trabajo fue creado pero hubo un error al procesar el pago.', () => {
              router.replace(`/job/${job.id}`);
            });
          }
        }
      } else {
        showAlert('Error', (response as any).message || 'No se pudo crear el trabajo');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: themeColors.border }]}>
        <TouchableOpacity onPress={handleGoBack} style={styles.backButton}>
          <ArrowLeft size={24} color={themeColors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.topBarTitle, { color: themeColors.text.primary }]}>
          Publicar trabajo
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Info Banner */}
          <View style={[styles.infoBanner, { backgroundColor: themeColors.primary[50] }]}>
            <Text style={[styles.infoBannerText, { color: themeColors.primary[600] }]}>
              Antes de pagar vas a ver el desglose de lo que se cobra. Una vez publicado, tu dinero estará protegido en la plataforma hasta que el trabajo se complete.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Title */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                <FileText size={16} color={themeColors.text.secondary} /> Título *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: themeColors.slate[50],
                    borderColor: errors.title ? colors.danger[500] : themeColors.border,
                    color: themeColors.text.primary,
                  },
                ]}
                placeholder="Ej: Limpieza de departamento 2 ambientes"
                placeholderTextColor={themeColors.text.muted}
                value={title}
                onChangeText={setTitle}
                maxLength={100}
              />
              {errors.title && <Text style={styles.errorText}>{errors.title}</Text>}
            </View>

            {/* Category */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                <Tag size={16} color={themeColors.text.secondary} /> Categoría *
              </Text>
              <TouchableOpacity
                style={[
                  styles.input,
                  styles.selectInput,
                  {
                    backgroundColor: themeColors.slate[50],
                    borderColor: errors.category ? colors.danger[500] : themeColors.border,
                  },
                ]}
                onPress={() => setShowCategories(!showCategories)}
              >
                <Text
                  style={{
                    color: category ? themeColors.text.primary : themeColors.text.muted,
                    fontSize: fontSize.base,
                  }}
                >
                  {category
                    ? `${categories.find(c => c.id === category)?.icon || ''} ${categories.find(c => c.id === category)?.label || category}`
                    : 'Selecciona una categoría'}
                </Text>
              </TouchableOpacity>
              {errors.category && <Text style={styles.errorText}>{errors.category}</Text>}

              {showCategories && (
                <View style={[styles.categoriesList, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
                  {categories.map((cat) => (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryItem,
                        category === cat.id && { backgroundColor: themeColors.primary[50] },
                      ]}
                      onPress={() => {
                        setCategory(cat.id);
                        setShowCategories(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.categoryItemText,
                          { color: category === cat.id ? themeColors.primary[600] : themeColors.text.primary },
                        ]}
                      >
                        {cat.icon} {cat.label}
                      </Text>
                      {category === cat.id && <CheckCircle size={18} color={themeColors.primary[600]} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Description */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                Descripción *
              </Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: themeColors.slate[50],
                    borderColor: errors.description ? colors.danger[500] : themeColors.border,
                    color: themeColors.text.primary,
                  },
                ]}
                placeholder="Describe el trabajo en detalle. Incluye requisitos específicos, herramientas necesarias, etc."
                placeholderTextColor={themeColors.text.muted}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
              {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
            </View>

            {/* Precio, o a cotizar */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                <DollarSign size={16} color={themeColors.text.secondary} /> Precio (ARS){' '}
                {aCotizar ? '' : '*'}
              </Text>

              {!aCotizar && (
                <>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        backgroundColor: themeColors.slate[50],
                        borderColor: errors.price ? colors.danger[500] : themeColors.border,
                        color: themeColors.text.primary,
                      },
                    ]}
                    placeholder="Ej: 15.000"
                    placeholderTextColor={themeColors.text.muted}
                    value={price ? price.replace(/B(?=(d{3})+(?!d))/g, '.') : ''}
                    onChangeText={(v) => setPrice(v.replace(/D/g, '').replace(/^0+(?=d)/, '').slice(0, 12))}
                    keyboardType="numeric"
                  />
                  <Text style={[styles.helperText, { color: themeColors.text.muted }]}>
                    Precio mínimo: $1,000 ARS
                  </Text>
                  {errors.price && <Text style={styles.errorText}>{errors.price}</Text>}
                </>
              )}

              {/* A cotizar. Deshabilitado si el pago es al terminar: ese modo lo exige. */}
              <TouchableOpacity
                style={[styles.casilla, sinProteccion && styles.casillaTrabada]}
                onPress={() => !sinProteccion && setACotizar((v) => !v)}
                disabled={sinProteccion}
              >
                <View
                  style={[
                    styles.caja,
                    {
                      borderColor: aCotizar ? colors.primary[500] : themeColors.border,
                      backgroundColor: aCotizar ? colors.primary[500] : 'transparent',
                    },
                  ]}
                >
                  {aCotizar && <Check size={13} color="#fff" />}
                </View>
                <View style={styles.casillaTexto}>
                  <Text style={[styles.casillaTitulo, { color: themeColors.text.primary }]}>
                    A cotizar
                  </Text>
                  <Text style={[styles.helperText, { color: themeColors.text.muted }]}>
                    Publicás sin precio y el trabajador propone cuánto sale. No pagás nada ahora:
                    se cobra al aceptar una cotización.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Pago al terminar, si el módulo está encendido. */}
              {pagoAlTerminarDisponible && (
                <TouchableOpacity
                  style={[
                    styles.casilla,
                    {
                      backgroundColor: colors.warning[50],
                      borderWidth: 1,
                      borderColor: colors.warning[100],
                      borderRadius: borderRadius.md,
                      padding: spacing.sm,
                    },
                  ]}
                  onPress={() => {
                    const nuevo = !sinProteccion;
                    setSinProteccion(nuevo);
                    // El servidor lo fuerza igual; esto es para que la pantalla
                    // no muestre un estado que no existe.
                    if (nuevo) setACotizar(true);
                  }}
                >
                  <View
                    style={[
                      styles.caja,
                      {
                        borderColor: sinProteccion ? colors.warning[600] : colors.warning[100],
                        backgroundColor: sinProteccion ? colors.warning[600] : 'transparent',
                      },
                    ]}
                  >
                    {sinProteccion && <Check size={13} color="#fff" />}
                  </View>
                  <View style={styles.casillaTexto}>
                    <Text style={[styles.casillaTitulo, { color: colors.warning[600] }]}>
                      Pagar al terminar, sin protección de pago
                    </Text>
                    <Text style={[styles.helperText, { color: colors.warning[600] }]}>
                      No retenemos el dinero: pagás cuando el trabajo esté hecho, por una orden que
                      genera nuestra app. Va siempre a cotizar, porque sin dinero retenido el
                      precio tiene que quedar acordado y detallado antes de empezar.
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* Ubicación, calle y número: lugares y calles reales; elegir una dirección completa barrio y código postal */}
            <DireccionDelTrabajo
              location={location}
              onLocationChange={setLocation}
              street={addressStreet}
              onStreetChange={setAddressStreet}
              number={addressNumber}
              onNumberChange={setAddressNumber}
              onNeighborhoodChange={setNeighborhood}
              onPostalCodeChange={setPostalCode}
              onCoordinatesChange={(lat, lon) => setCoords({ lat, lon })}
              error={errors.location || errors.address}
              themeColors={themeColors}
            />

            {/* Neighborhood */}
            <View style={[styles.inputGroup, { zIndex: 10 }]}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                Barrio (opcional)
              </Text>
              <LocationAutocomplete
                value={neighborhood}
                onChangeText={setNeighborhood}
                placeholder="Ej: Palermo"
                themeColors={themeColors}
              />
            </View>

            {/* Postal Code */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                Código postal (opcional)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: themeColors.slate[50],
                    borderColor: themeColors.border,
                    color: themeColors.text.primary,
                  },
                ]}
                placeholder="Ej: 1425"
                placeholderTextColor={themeColors.text.muted}
                value={postalCode}
                onChangeText={setPostalCode}
                keyboardType="numeric"
                maxLength={10}
              />
            </View>

            {/* Fechas del trabajo: inicio y fin en un solo calendario */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                <Calendar size={16} color={themeColors.text.secondary} /> Fechas del trabajo *
              </Text>
              <RangoDeFechas
                inicio={inicio}
                fin={fin}
                onChange={(i, f) => { setInicio(i); setFin(f); }}
                finOpcional={endDateFlexible}
                error={errors.startDate}
                themeColors={themeColors}
              />
              <TouchableOpacity
                style={styles.checkboxRow}
                onPress={() => {
                  const nuevo = !endDateFlexible;
                  setEndDateFlexible(nuevo);
                  if (nuevo) setFin(null);
                }}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: themeColors.border,
                      backgroundColor: endDateFlexible ? themeColors.primary[600] : 'transparent',
                    },
                  ]}
                >
                  {endDateFlexible && <CheckCircle size={14} color="#fff" />}
                </View>
                <Text style={[styles.checkboxLabel, { color: themeColors.text.secondary }]}>
                  Todavía no sé cuándo termina
                </Text>
              </TouchableOpacity>
            </View>

            {/* Entrega única o por tareas */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                <ClipboardList size={16} color={themeColors.text.secondary} /> Tipo de entrega
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {([
                  { unica: true, titulo: 'Entrega única', desc: 'Todo se entrega al final.' },
                  { unica: false, titulo: 'Entrega por tareas', desc: 'Cada tarea con su día.' },
                ]).map((o) => (
                  <TouchableOpacity
                    key={String(o.unica)}
                    style={[
                      styles.entregaOpcion,
                      { borderColor: entregaUnica === o.unica ? colors.primary[600] : themeColors.border, backgroundColor: entregaUnica === o.unica ? themeColors.primary[50] : themeColors.slate[50] },
                    ]}
                    onPress={() => setEntregaUnica(o.unica)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: entregaUnica === o.unica }}
                  >
                    <Text style={{ color: themeColors.text.primary, fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>{o.titulo}</Text>
                    <Text style={{ color: themeColors.text.muted, fontSize: fontSize.xs }}>{o.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!entregaUnica && (
                <View style={{ marginTop: spacing.sm }}>
                  <TareasDelTrabajo tareas={tareas} onChange={setTareas} themeColors={themeColors} error={errors.tareas} />
                </View>
              )}
            </View>

            {/* Max Workers */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                <Users size={16} color={themeColors.text.secondary} /> Trabajadores máximos
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: themeColors.slate[50],
                    borderColor: themeColors.border,
                    color: themeColors.text.primary,
                  },
                ]}
                placeholder="1"
                placeholderTextColor={themeColors.text.muted}
                value={maxWorkers}
                onChangeText={setMaxWorkers}
                keyboardType="numeric"
              />
              <Text style={[styles.helperText, { color: themeColors.text.muted }]}>
                Para trabajos que requieren múltiples personas
              </Text>
            </View>

            {/* Completion Requirements */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.text.primary }]}>
                <ClipboardList size={16} color={themeColors.text.secondary} /> Requisitos de finalización
              </Text>
              <View style={[styles.requirementsInfo, { backgroundColor: themeColors.primary[50] }]}>
                <Text style={[styles.requirementsInfoText, { color: themeColors.primary[700] }]}>
                  Definí los criterios mínimos para considerar el trabajo terminado. Esto sirve como respaldo ante posibles disputas. Al postularse, se recomienda a los trabajadores consultar estos requisitos.
                </Text>
              </View>
              {requirements.map((req, idx) => (
                <View key={idx} style={styles.requirementRow}>
                  <Text style={[styles.requirementIndex, { color: themeColors.text.muted }]}>{idx + 1}.</Text>
                  <TextInput
                    style={[
                      styles.requirementInput,
                      {
                        backgroundColor: themeColors.slate[50],
                        borderColor: themeColors.border,
                        color: themeColors.text.primary,
                      },
                    ]}
                    placeholder={`Ej: ${idx === 0 ? 'Sin telas de araña en esquinas de paredes' : idx === 1 ? 'Pisos barridos y trapeados en todos los ambientes' : 'Baños desinfectados y limpios'}`}
                    placeholderTextColor={themeColors.text.muted}
                    value={req}
                    onChangeText={(text) => {
                      const updated = [...requirements];
                      updated[idx] = text;
                      setRequirements(updated);
                    }}
                    multiline
                  />
                  {requirements.length > 3 && (
                    <TouchableOpacity
                      onPress={() => setRequirements(requirements.filter((_, i) => i !== idx))}
                      style={styles.removeRequirementBtn}
                    >
                      <Trash2 size={16} color={colors.danger[500]} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {requirements.length < 8 && (
                <TouchableOpacity
                  style={[styles.addRequirementBtn, { borderColor: themeColors.primary[400] }]}
                  onPress={() => setRequirements([...requirements, ''])}
                >
                  <Plus size={16} color={themeColors.primary[600]} />
                  <Text style={[styles.addRequirementText, { color: themeColors.primary[600] }]}>Agregar requisito</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitButtonText}>Crear trabajo</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  entregaOpcion: { flex: 1, borderWidth: 1, borderRadius: borderRadius.lg, padding: spacing.md, gap: 2 },
  casilla: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12 },
  casillaTrabada: { opacity: 0.6 },
  casillaTexto: { flex: 1 },
  casillaTitulo: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  caja: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
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
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  infoBanner: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.xl,
  },
  infoBannerText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  form: {
    gap: spacing.lg,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    height: 48,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
  },
  selectInput: {
    justifyContent: 'center',
  },
  textArea: {
    minHeight: 120,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
  },
  helperText: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  errorText: {
    color: colors.danger[500],
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  categoriesList: {
    marginTop: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    maxHeight: 250,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  categoryItemText: {
    fontSize: fontSize.base,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: fontSize.sm,
  },
  requirementsInfo: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  requirementsInfoText: {
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  requirementIndex: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginTop: 14,
    width: 18,
  },
  requirementInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
  },
  removeRequirementBtn: {
    marginTop: 12,
    padding: 4,
  },
  addRequirementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignSelf: 'flex-start',
  },
  addRequirementText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  submitButton: {
    height: 52,
    backgroundColor: colors.primary[600],
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  // Date/time picker
  dateTimeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  datePickerText: {
    flex: 1,
    fontSize: fontSize.base,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerSheet: {
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    paddingBottom: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  pickerTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  pickerCancel: {
    fontSize: fontSize.base,
  },
  pickerConfirm: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  pickerColumns: {
    flexDirection: 'row',
    height: 220,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  pickerColumn: {
    flex: 1,
    overflow: 'hidden',
  },
  pickerColLabel: {
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pickerScroll: {
    flex: 1,
  },
  pickerItem: {
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    marginHorizontal: 2,
    marginVertical: 1,
  },
  pickerItemText: {
    fontSize: fontSize.base,
    textAlign: 'center',
  },
});
