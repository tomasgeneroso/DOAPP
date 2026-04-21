export type NeighborhoodEntry = {
  neighborhood: string;
  postalCode: string;
};

export const NEIGHBORHOODS_BY_LOCATION: Record<string, NeighborhoodEntry[]> = {
  "Palermo, CABA": [
    { neighborhood: "Palermo Soho", postalCode: "C1425" },
    { neighborhood: "Palermo Hollywood", postalCode: "C1425" },
    { neighborhood: "Palermo Chico", postalCode: "C1425" },
    { neighborhood: "Palermo Viejo", postalCode: "C1425" },
    { neighborhood: "Las Cañitas", postalCode: "C1426" },
    { neighborhood: "Alto Palermo", postalCode: "C1425" },
    { neighborhood: "Villa del Parque", postalCode: "C1417" },
    { neighborhood: "Jardín Botánico", postalCode: "C1425" },
  ],
  "Recoleta, CABA": [
    { neighborhood: "Barrio Norte", postalCode: "C1425" },
    { neighborhood: "Recoleta Centro", postalCode: "C1425" },
    { neighborhood: "Tribunales", postalCode: "C1116" },
    { neighborhood: "Retiro", postalCode: "C1003" },
    { neighborhood: "San Nicolás", postalCode: "C1060" },
    { neighborhood: "Cementerio de Recoleta", postalCode: "C1425" },
    { neighborhood: "Plaza Francia", postalCode: "C1425" },
  ],
  "Belgrano, CABA": [
    { neighborhood: "Belgrano R", postalCode: "C1426" },
    { neighborhood: "Belgrano C", postalCode: "C1426" },
    { neighborhood: "Belgrano Chico", postalCode: "C1426" },
    { neighborhood: "Colegiales", postalCode: "C1427" },
    { neighborhood: "Villa Ortúzar", postalCode: "C1427" },
    { neighborhood: "Núñez", postalCode: "C1429" },
    { neighborhood: "Belgrano Barrancas", postalCode: "C1426" },
    { neighborhood: "Villa Urquiza", postalCode: "C1431" },
  ],
  "Caballito, CABA": [
    { neighborhood: "Caballito Norte", postalCode: "C1406" },
    { neighborhood: "Caballito Sur", postalCode: "C1407" },
    { neighborhood: "Parque Centenario", postalCode: "C1405" },
    { neighborhood: "Caballito Centro", postalCode: "C1406" },
    { neighborhood: "Primera Junta", postalCode: "C1406" },
    { neighborhood: "Rivadavia", postalCode: "C1406" },
    { neighborhood: "Acoyte", postalCode: "C1405" },
  ],
  "San Telmo, CABA": [
    { neighborhood: "San Telmo", postalCode: "C1066" },
    { neighborhood: "Montserrat", postalCode: "C1060" },
    { neighborhood: "Constitución", postalCode: "C1148" },
    { neighborhood: "San Telmo Centro", postalCode: "C1066" },
    { neighborhood: "Parque Lezama", postalCode: "C1066" },
    { neighborhood: "Balvanera Sur", postalCode: "C1198" },
    { neighborhood: "Boca Norte", postalCode: "C1164" },
  ],
  "Flores, CABA": [
    { neighborhood: "Flores Norte", postalCode: "C1405" },
    { neighborhood: "Floresta", postalCode: "C1407" },
    { neighborhood: "Parque Chacabuco", postalCode: "C1407" },
    { neighborhood: "Flores Centro", postalCode: "C1406" },
    { neighborhood: "Vélez Sarsfield", postalCode: "C1407" },
    { neighborhood: "Monte Castro", postalCode: "C1407" },
    { neighborhood: "Villa Luro", postalCode: "C1407" },
    { neighborhood: "Haedo Norte", postalCode: "C1405" },
  ],
  "Almagro, CABA": [
    { neighborhood: "Almagro", postalCode: "C1196" },
    { neighborhood: "Abasto", postalCode: "C1196" },
    { neighborhood: "Once", postalCode: "C1198" },
    { neighborhood: "Almagro Norte", postalCode: "C1196" },
    { neighborhood: "Almagro Sur", postalCode: "C1197" },
    { neighborhood: "Medrano", postalCode: "C1196" },
    { neighborhood: "Castro Barros", postalCode: "C1197" },
  ],
  "Villa Crespo, CABA": [
    { neighborhood: "Villa Crespo", postalCode: "C1414" },
    { neighborhood: "Chacarita", postalCode: "C1427" },
    { neighborhood: "Villa del Parque", postalCode: "C1417" },
    { neighborhood: "Villa Crespo Norte", postalCode: "C1414" },
    { neighborhood: "Paternal", postalCode: "C1416" },
    { neighborhood: "Villa Santa Rita", postalCode: "C1419" },
    { neighborhood: "Villa Gral. Mitre", postalCode: "C1416" },
    { neighborhood: "Palermo Nuevo", postalCode: "C1425" },
  ],
  "Núñez, CABA": [
    { neighborhood: "Núñez", postalCode: "C1429" },
    { neighborhood: "Saavedra", postalCode: "C1431" },
    { neighborhood: "Villa Pueyrredón", postalCode: "C1440" },
    { neighborhood: "Núñez Centro", postalCode: "C1429" },
    { neighborhood: "Coghlan", postalCode: "C1431" },
    { neighborhood: "Palermo Norte", postalCode: "C1426" },
    { neighborhood: "Villa Urquiza Sur", postalCode: "C1431" },
    { neighborhood: "Aristóbulo del Valle", postalCode: "C1429" },
  ],
  "Córdoba Capital, Córdoba": [
    { neighborhood: "Nueva Córdoba", postalCode: "5000" },
    { neighborhood: "Güemes", postalCode: "5000" },
    { neighborhood: "Cerro de las Rosas", postalCode: "5009" },
    { neighborhood: "Urca", postalCode: "5016" },
    { neighborhood: "Villa Belgrano", postalCode: "5001" },
    { neighborhood: "Argüello", postalCode: "5000" },
    { neighborhood: "Villa Allende", postalCode: "5105" },
    { neighborhood: "Jardín", postalCode: "5000" },
    { neighborhood: "General Paz", postalCode: "5000" },
    { neighborhood: "Alta Córdoba", postalCode: "5003" },
  ],
  "Rosario, Santa Fe": [
    { neighborhood: "Centro", postalCode: "2000" },
    { neighborhood: "Pichincha", postalCode: "2000" },
    { neighborhood: "Fisherton", postalCode: "2012" },
    { neighborhood: "Saavedra", postalCode: "2000" },
    { neighborhood: "Las Cañitas", postalCode: "2000" },
    { neighborhood: "Alberdi", postalCode: "2000" },
    { neighborhood: "Refinería", postalCode: "2000" },
    { neighborhood: "Echesortu", postalCode: "2000" },
  ],
  "Mendoza Capital, Mendoza": [
    { neighborhood: "Ciudad", postalCode: "5500" },
    { neighborhood: "Dorrego", postalCode: "5500" },
    { neighborhood: "Godoy Cruz", postalCode: "5501" },
    { neighborhood: "Luján de Cuyo", postalCode: "5507" },
    { neighborhood: "Palmares", postalCode: "5500" },
    { neighborhood: "Vistalba", postalCode: "5507" },
    { neighborhood: "Chacras de Coria", postalCode: "5505" },
    { neighborhood: "Maipú", postalCode: "5515" },
  ],
  "San Miguel de Tucumán, Tucumán": [
    { neighborhood: "Centro", postalCode: "4000" },
    { neighborhood: "San Cayetano", postalCode: "4000" },
    { neighborhood: "Yerba Buena", postalCode: "4107" },
    { neighborhood: "Las Talitas", postalCode: "4109" },
    { neighborhood: "Villa Urquiza", postalCode: "4000" },
    { neighborhood: "Alderetes", postalCode: "4178" },
    { neighborhood: "Banda del Río Salí", postalCode: "4178" },
  ],
  "Salta Capital, Salta": [
    { neighborhood: "Centro", postalCode: "4400" },
    { neighborhood: "Tres Cerritos", postalCode: "4400" },
    { neighborhood: "San Bernardo", postalCode: "4400" },
    { neighborhood: "Limache", postalCode: "4400" },
    { neighborhood: "San Lorenzo", postalCode: "4401" },
    { neighborhood: "Villa Las Rosas", postalCode: "4400" },
    { neighborhood: "Buena Vista", postalCode: "4400" },
  ],
  "Mar del Plata, Buenos Aires": [
    { neighborhood: "Centro", postalCode: "7600" },
    { neighborhood: "La Perla", postalCode: "7600" },
    { neighborhood: "Los Troncos", postalCode: "7600" },
    { neighborhood: "Punta Mogotes", postalCode: "7602" },
    { neighborhood: "Constitución", postalCode: "7600" },
    { neighborhood: "Playa Grande", postalCode: "7600" },
    { neighborhood: "Camet", postalCode: "7605" },
    { neighborhood: "Aldea", postalCode: "7602" },
  ],
  "La Plata, Buenos Aires": [
    { neighborhood: "Centro", postalCode: "1900" },
    { neighborhood: "Tolosa", postalCode: "1900" },
    { neighborhood: "City Bell", postalCode: "1900" },
    { neighborhood: "Los Hornos", postalCode: "1903" },
    { neighborhood: "Villa Elvira", postalCode: "1900" },
    { neighborhood: "Gonnet", postalCode: "1897" },
    { neighborhood: "Ensenada", postalCode: "1925" },
    { neighborhood: "Berisso", postalCode: "1923" },
  ],
};

/**
 * Returns neighborhood suggestions for a given location key, filtered by query.
 * Matches against neighborhood name or postal code (case-insensitive, includes/starts-with).
 * Returns at most 8 results. Returns empty array for unknown locations.
 */
export function getNeighborhoodSuggestions(
  locationValue: string,
  query: string
): NeighborhoodEntry[] {
  const entries = NEIGHBORHOODS_BY_LOCATION[locationValue];
  if (!entries || entries.length === 0) return [];

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return entries.slice(0, 8);

  const filtered = entries.filter(
    (entry) =>
      entry.neighborhood.toLowerCase().includes(normalizedQuery) ||
      entry.postalCode.toLowerCase().includes(normalizedQuery)
  );

  return filtered.slice(0, 8);
}
