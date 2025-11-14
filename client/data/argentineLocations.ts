// Ubicaciones principales de Argentina por provincia
export const argentineLocations = [
  // Ciudad Autónoma de Buenos Aires
  "Palermo, CABA",
  "Recoleta, CABA",
  "Belgrano, CABA",
  "Caballito, CABA",
  "Villa Urquiza, CABA",
  "Núñez, CABA",
  "Almagro, CABA",
  "Flores, CABA",
  "Villa Crespo, CABA",
  "Colegiales, CABA",
  "San Telmo, CABA",
  "Puerto Madero, CABA",
  "Retiro, CABA",
  "Microcentro, CABA",
  "Once, CABA",
  "Balvanera, CABA",
  "Villa Devoto, CABA",
  "Saavedra, CABA",
  "Villa del Parque, CABA",
  "Parque Patricios, CABA",

  // Buenos Aires (GBA)
  "La Plata, Buenos Aires",
  "Mar del Plata, Buenos Aires",
  "Bahía Blanca, Buenos Aires",
  "Vicente López, Buenos Aires",
  "San Isidro, Buenos Aires",
  "Tigre, Buenos Aires",
  "San Fernando, Buenos Aires",
  "Quilmes, Buenos Aires",
  "Avellaneda, Buenos Aires",
  "Lanús, Buenos Aires",
  "Lomas de Zamora, Buenos Aires",
  "Banfield, Buenos Aires",
  "San Martín, Buenos Aires",
  "Tres de Febrero, Buenos Aires",
  "Morón, Buenos Aires",
  "Ituzaingó, Buenos Aires",
  "Hurlingham, Buenos Aires",
  "La Matanza, Buenos Aires",
  "Ramos Mejía, Buenos Aires",
  "Haedo, Buenos Aires",
  "Moreno, Buenos Aires",
  "Merlo, Buenos Aires",
  "Pilar, Buenos Aires",
  "Escobar, Buenos Aires",
  "San Miguel, Buenos Aires",
  "José C. Paz, Buenos Aires",
  "Malvinas Argentinas, Buenos Aires",
  "Zárate, Buenos Aires",
  "Campana, Buenos Aires",
  "Luján, Buenos Aires",

  // Córdoba
  "Córdoba Capital, Córdoba",
  "Villa Carlos Paz, Córdoba",
  "Río Cuarto, Córdoba",
  "Alta Gracia, Córdoba",
  "Villa María, Córdoba",
  "San Francisco, Córdoba",
  "Bell Ville, Córdoba",
  "Jesús María, Córdoba",
  "La Falda, Córdoba",
  "Cosquín, Córdoba",

  // Santa Fe
  "Rosario, Santa Fe",
  "Santa Fe Capital, Santa Fe",
  "Rafaela, Santa Fe",
  "Venado Tuerto, Santa Fe",
  "Reconquista, Santa Fe",
  "Villa Gobernador Gálvez, Santa Fe",
  "Casilda, Santa Fe",

  // Mendoza
  "Mendoza Capital, Mendoza",
  "San Rafael, Mendoza",
  "Godoy Cruz, Mendoza",
  "Luján de Cuyo, Mendoza",
  "Maipú, Mendoza",
  "Guaymallén, Mendoza",

  // Tucumán
  "San Miguel de Tucumán, Tucumán",
  "Yerba Buena, Tucumán",
  "Tafí Viejo, Tucumán",
  "Concepción, Tucumán",

  // Entre Ríos
  "Paraná, Entre Ríos",
  "Concordia, Entre Ríos",
  "Gualeguaychú, Entre Ríos",
  "Concepción del Uruguay, Entre Ríos",

  // Salta
  "Salta Capital, Salta",
  "San Ramón de la Nueva Orán, Salta",
  "Tartagal, Salta",
  "Metán, Salta",

  // Misiones
  "Posadas, Misiones",
  "Oberá, Misiones",
  "Eldorado, Misiones",
  "Puerto Iguazú, Misiones",

  // Chaco
  "Resistencia, Chaco",
  "Presidencia Roque Sáenz Peña, Chaco",
  "Barranqueras, Chaco",

  // Corrientes
  "Corrientes Capital, Corrientes",
  "Goya, Corrientes",
  "Paso de los Libres, Corrientes",
  "Mercedes, Corrientes",

  // Santiago del Estero
  "Santiago del Estero Capital, Santiago del Estero",
  "La Banda, Santiago del Estero",
  "Termas de Río Hondo, Santiago del Estero",

  // Jujuy
  "San Salvador de Jujuy, Jujuy",
  "San Pedro de Jujuy, Jujuy",
  "Libertador General San Martín, Jujuy",

  // Catamarca
  "San Fernando del Valle de Catamarca, Catamarca",

  // La Rioja
  "La Rioja Capital, La Rioja",
  "Chilecito, La Rioja",

  // San Juan
  "San Juan Capital, San Juan",
  "Rawson, San Juan",
  "Chimbas, San Juan",

  // San Luis
  "San Luis Capital, San Luis",
  "Villa Mercedes, San Luis",

  // Neuquén
  "Neuquén Capital, Neuquén",
  "San Martín de los Andes, Neuquén",
  "Zapala, Neuquén",
  "Cutral-Có, Neuquén",
  "Centenario, Neuquén",

  // Río Negro
  "Viedma, Río Negro",
  "San Carlos de Bariloche, Río Negro",
  "General Roca, Río Negro",
  "Cipolletti, Río Negro",

  // Chubut
  "Rawson, Chubut",
  "Comodoro Rivadavia, Chubut",
  "Trelew, Chubut",
  "Puerto Madryn, Chubut",
  "Esquel, Chubut",

  // Santa Cruz
  "Río Gallegos, Santa Cruz",
  "Caleta Olivia, Santa Cruz",
  "Pico Truncado, Santa Cruz",
  "Puerto Deseado, Santa Cruz",

  // Tierra del Fuego
  "Ushuaia, Tierra del Fuego",
  "Río Grande, Tierra del Fuego",

  // Formosa
  "Formosa Capital, Formosa",
  "Clorinda, Formosa",

  // La Pampa
  "Santa Rosa, La Pampa",
  "General Pico, La Pampa",
];

// Función para buscar ubicaciones
export function searchLocations(query: string, limit: number = 5): string[] {
  if (!query || query.length < 2) return [];

  const normalizedQuery = query.toLowerCase().trim();

  return argentineLocations
    .filter(location =>
      location.toLowerCase().includes(normalizedQuery)
    )
    .slice(0, limit);
}
