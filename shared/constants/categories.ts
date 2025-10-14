// Categorías y etiquetas predefinidas para trabajos
export const JOB_CATEGORIES = [
  { id: 'plomeria', label: 'Plomería', icon: '🔧' },
  { id: 'construccion', label: 'Construcción', icon: '🏗️' },
  { id: 'limpieza', label: 'Limpieza', icon: '🧹' },
  { id: 'electricidad', label: 'Electricidad', icon: '⚡' },
  { id: 'pintura', label: 'Pintura', icon: '🎨' },
  { id: 'carpinteria', label: 'Carpintería', icon: '🪚' },
  { id: 'jardineria', label: 'Jardinería', icon: '🌱' },
  { id: 'armado_muebles', label: 'Armado de Muebles', icon: '🪑' },
  { id: 'mudanzas', label: 'Mudanzas', icon: '📦' },
  { id: 'tecnologia', label: 'Tecnología', icon: '💻' },
  { id: 'reparaciones', label: 'Reparaciones', icon: '🔨' },
  { id: 'climatizacion', label: 'Climatización', icon: '❄️' },
  { id: 'seguridad', label: 'Seguridad', icon: '🔒' },
  { id: 'decoracion', label: 'Decoración', icon: '🖼️' },
  { id: 'mascotas', label: 'Cuidado de Mascotas', icon: '🐕' },
  { id: 'automotriz', label: 'Automotriz', icon: '🚗' },
  { id: 'otros', label: 'Otros', icon: '📋' },
] as const;

export const JOB_TAGS = [
  // Plomería
  'plomeria',
  'cañerias',
  'destape',
  'griferia',
  'calefon',
  'tanque',
  'perdida',
  'agua',

  // Construcción
  'construccion',
  'albanil',
  'obra',
  'reforma',
  'ampliacion',
  'mamposteria',
  'revoque',
  'techado',

  // Limpieza
  'limpieza',
  'desinfeccion',
  'limpieza_profunda',
  'mantenimiento',
  'cristales',
  'alfombras',

  // Electricidad
  'electricidad',
  'electricista',
  'instalacion',
  'cableado',
  'tablero',
  'iluminacion',
  'tomas',
  'cortocircuito',

  // Pintura
  'pintura',
  'pintor',
  'latex',
  'esmalte',
  'enduido',
  'empapelado',
  'barnizado',

  // Carpintería
  'carpinteria',
  'muebles',
  'madera',
  'puertas',
  'ventanas',
  'placard',
  'estantes',

  // Jardinería
  'jardineria',
  'jardinero',
  'cesped',
  'poda',
  'plantas',
  'riego',
  'paisajismo',

  // Armado
  'armado',
  'armado_muebles',
  'ikea',
  'estanteria',
  'escritorio',
  'cama',

  // Mudanzas
  'mudanza',
  'flete',
  'transporte',
  'embalaje',
  'carga',
  'descarga',

  // Tecnología
  'tecnologia',
  'computacion',
  'redes',
  'wifi',
  'pc',
  'notebook',
  'celular',
  'soporte',

  // Reparaciones
  'reparacion',
  'arreglo',
  'compostura',
  'mantenimiento',
  'fix',

  // Climatización
  'aire_acondicionado',
  'climatizacion',
  'calefaccion',
  'ventilacion',
  'split',
  'estufa',

  // Seguridad
  'seguridad',
  'cerrajeria',
  'cerraduras',
  'llaves',
  'rejas',
  'alarma',
  'camaras',

  // Decoración
  'decoracion',
  'diseño',
  'cortinas',
  'tapiceria',
  'cuadros',

  // Mascotas
  'mascotas',
  'perros',
  'gatos',
  'paseo',
  'veterinario',
  'grooming',

  // Automotriz
  'auto',
  'mecanica',
  'gomeria',
  'chapa_pintura',
  'service',
  'lavado',

  // Generales
  'urgente',
  'rapido',
  'economico',
  'profesional',
  'certificado',
  'garantia',
] as const;

export type JobCategory = typeof JOB_CATEGORIES[number]['id'];
export type JobTag = typeof JOB_TAGS[number];

// Helper para buscar categoría por ID
export const getCategoryById = (id: string) => {
  return JOB_CATEGORIES.find(cat => cat.id === id);
};

// Helper para buscar categorías por etiqueta
export const getCategoriesByTag = (tag: string): typeof JOB_CATEGORIES[number][] => {
  const tagLower = tag.toLowerCase();
  return JOB_CATEGORIES.filter(cat =>
    cat.label.toLowerCase().includes(tagLower) ||
    cat.id.includes(tagLower)
  );
};
