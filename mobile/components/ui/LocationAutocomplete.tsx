import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { MapPin } from 'lucide-react-native';
import { colors, spacing, borderRadius, fontSize, fontWeight } from '../../constants/theme';

// Ciudades y barrios de Argentina por provincia
const LOCATIONS = [
  // CABA - Barrios
  "Palermo, CABA", "Recoleta, CABA", "Belgrano, CABA", "Caballito, CABA",
  "Villa Urquiza, CABA", "Núñez, CABA", "Almagro, CABA", "Flores, CABA",
  "Villa Crespo, CABA", "Colegiales, CABA", "San Telmo, CABA", "Puerto Madero, CABA",
  "Retiro, CABA", "Microcentro, CABA", "Once, CABA", "Balvanera, CABA",
  "Villa Devoto, CABA", "Saavedra, CABA", "Villa del Parque, CABA", "Parque Patricios, CABA",
  "La Boca, CABA", "Barracas, CABA", "Boedo, CABA", "San Cristóbal, CABA",
  "Constitución, CABA", "Monserrat, CABA", "San Nicolás, CABA", "Chacarita, CABA",
  "Villa Ortúzar, CABA", "Paternal, CABA", "Villa Luro, CABA", "Liniers, CABA",
  "Mataderos, CABA", "Floresta, CABA", "Versalles, CABA", "Villa Real, CABA",
  "Monte Castro, CABA", "Villa Pueyrredón, CABA", "Agronomía, CABA", "Parque Chas, CABA",
  "Villa Santa Rita, CABA", "Villa General Mitre, CABA", "Vélez Sársfield, CABA",
  "Parque Avellaneda, CABA", "Villa Soldati, CABA", "Villa Lugano, CABA",
  "Villa Riachuelo, CABA", "Pompeya, CABA", "Parque Chacabuco, CABA",

  // Buenos Aires - Ciudades y barrios GBA
  "La Plata, Buenos Aires", "Mar del Plata, Buenos Aires", "Bahía Blanca, Buenos Aires",
  "Vicente López, Buenos Aires", "San Isidro, Buenos Aires", "Tigre, Buenos Aires",
  "San Fernando, Buenos Aires", "Quilmes, Buenos Aires", "Avellaneda, Buenos Aires",
  "Lanús, Buenos Aires", "Lomas de Zamora, Buenos Aires", "Banfield, Buenos Aires",
  "San Martín, Buenos Aires", "Tres de Febrero, Buenos Aires", "Morón, Buenos Aires",
  "Ituzaingó, Buenos Aires", "Hurlingham, Buenos Aires", "La Matanza, Buenos Aires",
  "Ramos Mejía, Buenos Aires", "Haedo, Buenos Aires", "Moreno, Buenos Aires",
  "Merlo, Buenos Aires", "Pilar, Buenos Aires", "Escobar, Buenos Aires",
  "San Miguel, Buenos Aires", "José C. Paz, Buenos Aires",
  "Zárate, Buenos Aires", "Campana, Buenos Aires", "Luján, Buenos Aires",
  "Olivos, Buenos Aires", "Martínez, Buenos Aires", "Acassuso, Buenos Aires",
  "Béccar, Buenos Aires", "Florida, Buenos Aires", "Munro, Buenos Aires",
  "Castelar, Buenos Aires", "El Palomar, Buenos Aires", "Ciudadela, Buenos Aires",
  "San Justo, Buenos Aires", "Temperley, Buenos Aires", "Adrogué, Buenos Aires",
  "Berazategui, Buenos Aires", "Florencio Varela, Buenos Aires",
  "Ezeiza, Buenos Aires", "Cañuelas, Buenos Aires", "Tandil, Buenos Aires",
  "Olavarría, Buenos Aires", "Necochea, Buenos Aires", "Junín, Buenos Aires",
  "Pergamino, Buenos Aires", "San Nicolás, Buenos Aires",

  // Córdoba - Capital y barrios
  "Córdoba Capital, Córdoba", "Villa Carlos Paz, Córdoba", "Río Cuarto, Córdoba",
  "Alta Gracia, Córdoba", "Villa María, Córdoba", "San Francisco, Córdoba",
  "Jesús María, Córdoba", "La Falda, Córdoba", "Cosquín, Córdoba",
  "Nueva Córdoba, Córdoba", "Güemes, Córdoba", "Alberdi, Córdoba",
  "General Paz, Córdoba", "Alta Córdoba, Córdoba", "Cerro de las Rosas, Córdoba",
  "Argüello, Córdoba", "Villa Belgrano, Córdoba", "Jardín Espinosa, Córdoba",
  "Cofico, Córdoba", "San Vicente, Córdoba", "Barrio Juniors, Córdoba",
  "Villa Allende, Córdoba", "Unquillo, Córdoba", "Bell Ville, Córdoba",
  "Río Tercero, Córdoba", "Villa Dolores, Córdoba", "Mina Clavero, Córdoba",
  "Carlos Paz, Córdoba", "Dean Funes, Córdoba",

  // Santa Fe - Ciudades y barrios
  "Rosario, Santa Fe", "Santa Fe Capital, Santa Fe", "Rafaela, Santa Fe",
  "Venado Tuerto, Santa Fe", "Reconquista, Santa Fe",
  "Villa Gobernador Gálvez, Santa Fe", "Casilda, Santa Fe",
  "Fisherton, Rosario", "Pichincha, Rosario", "Centro, Rosario",
  "Echesortu, Rosario", "Arroyito, Rosario", "Alberdi, Rosario",
  "Macrocentro, Rosario", "Abasto, Rosario", "Barrio Martín, Rosario",
  "Santo Tomé, Santa Fe", "San Lorenzo, Santa Fe", "Esperanza, Santa Fe",

  // Mendoza - Ciudades y barrios
  "Mendoza Capital, Mendoza", "San Rafael, Mendoza", "Godoy Cruz, Mendoza",
  "Luján de Cuyo, Mendoza", "Maipú, Mendoza", "Guaymallén, Mendoza",
  "Las Heras, Mendoza", "San Martín, Mendoza", "Tunuyán, Mendoza",
  "Quinta Sección, Mendoza", "Sexta Sección, Mendoza", "Dorrego, Mendoza",
  "Chacras de Coria, Mendoza", "Vistalba, Mendoza", "Rivadavia, Mendoza",

  // Tucumán - Ciudades y barrios
  "San Miguel de Tucumán, Tucumán", "Yerba Buena, Tucumán", "Tafí Viejo, Tucumán",
  "Concepción, Tucumán", "Banda del Río Salí, Tucumán",
  "Barrio Norte, Tucumán", "Barrio Sur, Tucumán", "Centro, Tucumán",
  "Marcos Paz, Tucumán", "Villa Luján, Tucumán",

  // Entre Ríos
  "Paraná, Entre Ríos", "Concordia, Entre Ríos", "Gualeguaychú, Entre Ríos",
  "Concepción del Uruguay, Entre Ríos", "Villaguay, Entre Ríos",
  "Victoria, Entre Ríos", "Colón, Entre Ríos", "Chajarí, Entre Ríos",

  // Salta - Ciudades y barrios
  "Salta Capital, Salta", "San Ramón de la Nueva Orán, Salta", "Tartagal, Salta",
  "Metán, Salta", "Cafayate, Salta",
  "Centro, Salta", "Tres Cerritos, Salta", "Grand Bourg, Salta",
  "Limache, Salta", "Villa San Lorenzo, Salta",

  // Misiones
  "Posadas, Misiones", "Oberá, Misiones", "Eldorado, Misiones",
  "Puerto Iguazú, Misiones", "Apóstoles, Misiones", "Jardín América, Misiones",

  // Chaco
  "Resistencia, Chaco", "Presidencia Roque Sáenz Peña, Chaco",
  "Barranqueras, Chaco", "Villa Ángela, Chaco", "Charata, Chaco",

  // Corrientes
  "Corrientes Capital, Corrientes", "Goya, Corrientes", "Paso de los Libres, Corrientes",
  "Mercedes, Corrientes", "Curuzú Cuatiá, Corrientes", "Monte Caseros, Corrientes",

  // Santiago del Estero
  "Santiago del Estero Capital, Santiago del Estero", "La Banda, Santiago del Estero",
  "Termas de Río Hondo, Santiago del Estero", "Añatuya, Santiago del Estero",

  // Jujuy - Ciudades y barrios
  "San Salvador de Jujuy, Jujuy", "San Pedro de Jujuy, Jujuy",
  "Libertador General San Martín, Jujuy", "Palpalá, Jujuy",
  "Humahuaca, Jujuy", "Tilcara, Jujuy",
  "Centro, Jujuy", "Alto Padilla, Jujuy", "Los Perales, Jujuy",

  // Catamarca
  "San Fernando del Valle de Catamarca, Catamarca",
  "Valle Viejo, Catamarca", "Fray Mamerto Esquiú, Catamarca",

  // La Rioja
  "La Rioja Capital, La Rioja", "Chilecito, La Rioja", "Aimogasta, La Rioja",

  // San Juan - Ciudades y barrios
  "San Juan Capital, San Juan", "Rawson, San Juan", "Chimbas, San Juan",
  "Rivadavia, San Juan", "Santa Lucía, San Juan", "Pocito, San Juan",
  "Caucete, San Juan",

  // San Luis
  "San Luis Capital, San Luis", "Villa Mercedes, San Luis",
  "Merlo, San Luis", "Juana Koslay, San Luis", "La Punta, San Luis",

  // Neuquén - Ciudades y barrios
  "Neuquén Capital, Neuquén", "San Martín de los Andes, Neuquén", "Zapala, Neuquén",
  "Cutral-Có, Neuquén", "Centenario, Neuquén", "Plottier, Neuquén",
  "Villa La Angostura, Neuquén", "Junín de los Andes, Neuquén",

  // Río Negro
  "Viedma, Río Negro", "San Carlos de Bariloche, Río Negro",
  "General Roca, Río Negro", "Cipolletti, Río Negro",
  "Allen, Río Negro", "El Bolsón, Río Negro", "Choele Choel, Río Negro",
  "Centro Cívico, Bariloche", "Melipal, Bariloche", "Km 5, Bariloche",

  // Chubut
  "Rawson, Chubut", "Comodoro Rivadavia, Chubut", "Trelew, Chubut",
  "Puerto Madryn, Chubut", "Esquel, Chubut", "Rada Tilly, Chubut",

  // Santa Cruz
  "Río Gallegos, Santa Cruz", "Caleta Olivia, Santa Cruz",
  "Pico Truncado, Santa Cruz", "Puerto Deseado, Santa Cruz",
  "El Calafate, Santa Cruz",

  // Tierra del Fuego
  "Ushuaia, Tierra del Fuego", "Río Grande, Tierra del Fuego", "Tolhuin, Tierra del Fuego",

  // Formosa
  "Formosa Capital, Formosa", "Clorinda, Formosa", "Pirané, Formosa",

  // La Pampa
  "Santa Rosa, La Pampa", "General Pico, La Pampa", "Toay, La Pampa",
];

function searchLocations(query: string, limit = 6): string[] {
  if (!query || query.length < 2) return [];
  const normalized = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return LOCATIONS
    .filter(loc => loc.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(normalized))
    .slice(0, limit);
}

interface LocationAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  style?: any;
  inputStyle?: any;
  themeColors?: any;
}

export default function LocationAutocomplete({
  value,
  onChangeText,
  placeholder = 'Ej: Buenos Aires',
  label,
  error,
  style,
  inputStyle,
  themeColors,
}: LocationAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleChange = useCallback((text: string) => {
    onChangeText(text);
    const results = searchLocations(text);
    setSuggestions(results);
    setShowSuggestions(results.length > 0);
  }, [onChangeText]);

  const handleSelect = useCallback((location: string) => {
    onChangeText(location);
    setSuggestions([]);
    setShowSuggestions(false);
  }, [onChangeText]);

  const bgColor = themeColors?.slate?.[50] || colors.slate[50];
  const borderColor = error ? colors.danger[500] : (themeColors?.border || colors.slate[300]);
  const textColor = themeColors?.text?.primary || colors.slate[900];
  const mutedColor = themeColors?.text?.muted || colors.slate[400];

  return (
    <View style={[styles.container, style]}>
      {label && (
        <Text style={[styles.label, { color: themeColors?.text?.primary || colors.slate[700] }]}>
          {label}
        </Text>
      )}
      <TextInput
        style={[
          styles.input,
          { backgroundColor: bgColor, borderColor, color: textColor },
          inputStyle,
        ]}
        placeholder={placeholder}
        placeholderTextColor={mutedColor}
        value={value}
        onChangeText={handleChange}
        onFocus={() => {
          if (value.length >= 2) {
            const results = searchLocations(value);
            setSuggestions(results);
            setShowSuggestions(results.length > 0);
          }
        }}
        onBlur={() => {
          // Delay to allow tap on suggestion
          setTimeout(() => setShowSuggestions(false), 200);
        }}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
      {showSuggestions && suggestions.length > 0 && (
        <View style={[styles.suggestionsContainer, { backgroundColor: themeColors?.card || '#fff', borderColor: themeColors?.border || colors.slate[200] }]}>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={styles.suggestionsList}>
            {suggestions.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.suggestionItem, index < suggestions.length - 1 && { borderBottomWidth: 1, borderBottomColor: themeColors?.border || colors.slate[100] }]}
                onPress={() => handleSelect(item)}
                activeOpacity={0.7}
              >
                <MapPin size={14} color={themeColors?.primary?.[500] || colors.primary[500]} />
                <Text style={[styles.suggestionText, { color: textColor }]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 10,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.sm,
  },
  input: {
    height: 48,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    fontSize: fontSize.base,
    borderWidth: 1,
  },
  errorText: {
    color: colors.danger[500],
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  suggestionsContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    marginTop: 4,
    maxHeight: 200,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    zIndex: 999,
  },
  suggestionsList: {
    maxHeight: 200,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  suggestionText: {
    fontSize: fontSize.sm,
    flex: 1,
  },
});
