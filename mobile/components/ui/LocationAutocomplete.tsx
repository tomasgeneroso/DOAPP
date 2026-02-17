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

// Ubicaciones principales de Argentina por provincia
const LOCATIONS = [
  "Palermo, CABA", "Recoleta, CABA", "Belgrano, CABA", "Caballito, CABA",
  "Villa Urquiza, CABA", "Núñez, CABA", "Almagro, CABA", "Flores, CABA",
  "Villa Crespo, CABA", "Colegiales, CABA", "San Telmo, CABA", "Puerto Madero, CABA",
  "Retiro, CABA", "Microcentro, CABA", "Once, CABA", "Balvanera, CABA",
  "Villa Devoto, CABA", "Saavedra, CABA", "Villa del Parque, CABA", "Parque Patricios, CABA",
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
  "Córdoba Capital, Córdoba", "Villa Carlos Paz, Córdoba", "Río Cuarto, Córdoba",
  "Alta Gracia, Córdoba", "Villa María, Córdoba", "San Francisco, Córdoba",
  "Jesús María, Córdoba", "La Falda, Córdoba", "Cosquín, Córdoba",
  "Rosario, Santa Fe", "Santa Fe Capital, Santa Fe", "Rafaela, Santa Fe",
  "Venado Tuerto, Santa Fe", "Reconquista, Santa Fe",
  "Mendoza Capital, Mendoza", "San Rafael, Mendoza", "Godoy Cruz, Mendoza",
  "Luján de Cuyo, Mendoza", "Maipú, Mendoza", "Guaymallén, Mendoza",
  "San Miguel de Tucumán, Tucumán", "Yerba Buena, Tucumán", "Tafí Viejo, Tucumán",
  "Paraná, Entre Ríos", "Concordia, Entre Ríos", "Gualeguaychú, Entre Ríos",
  "Salta Capital, Salta", "Tartagal, Salta",
  "Posadas, Misiones", "Oberá, Misiones", "Puerto Iguazú, Misiones",
  "Resistencia, Chaco", "Presidencia Roque Sáenz Peña, Chaco",
  "Corrientes Capital, Corrientes", "Goya, Corrientes", "Paso de los Libres, Corrientes",
  "Santiago del Estero Capital, Santiago del Estero", "La Banda, Santiago del Estero",
  "San Salvador de Jujuy, Jujuy", "San Pedro de Jujuy, Jujuy",
  "San Fernando del Valle de Catamarca, Catamarca",
  "La Rioja Capital, La Rioja", "Chilecito, La Rioja",
  "San Juan Capital, San Juan", "Rawson, San Juan",
  "San Luis Capital, San Luis", "Villa Mercedes, San Luis",
  "Neuquén Capital, Neuquén", "San Martín de los Andes, Neuquén", "Zapala, Neuquén",
  "Viedma, Río Negro", "San Carlos de Bariloche, Río Negro", "Cipolletti, Río Negro",
  "Rawson, Chubut", "Comodoro Rivadavia, Chubut", "Trelew, Chubut", "Puerto Madryn, Chubut",
  "Río Gallegos, Santa Cruz", "Caleta Olivia, Santa Cruz",
  "Ushuaia, Tierra del Fuego", "Río Grande, Tierra del Fuego",
  "Formosa Capital, Formosa", "Clorinda, Formosa",
  "Santa Rosa, La Pampa", "General Pico, La Pampa",
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
