// Categorías y etiquetas predefinidas para trabajos
// type: 'presencial' = requiere presencia física, 'remoto' = puede entregarse virtualmente
export type CategoryType = 'presencial' | 'remoto';

export const JOB_CATEGORIES = [
  { id: 'plomeria', label: 'Plomería', icon: '🔧', type: 'presencial' as CategoryType },
  { id: 'construccion', label: 'Construcción', icon: '🏗️', type: 'presencial' as CategoryType },
  { id: 'limpieza', label: 'Limpieza', icon: '🧹', type: 'presencial' as CategoryType },
  { id: 'electricidad', label: 'Electricidad', icon: '⚡', type: 'presencial' as CategoryType },
  { id: 'pintura', label: 'Pintura', icon: '🎨', type: 'presencial' as CategoryType },
  { id: 'carpinteria', label: 'Carpintería', icon: '🪚', type: 'presencial' as CategoryType },
  { id: 'jardineria', label: 'Jardinería', icon: '🌱', type: 'presencial' as CategoryType },
  { id: 'armado_muebles', label: 'Armado de Muebles', icon: '🪑', type: 'presencial' as CategoryType },
  { id: 'mudanzas', label: 'Mudanzas', icon: '📦', type: 'presencial' as CategoryType },
  { id: 'tecnologia', label: 'Tecnología', icon: '💻', type: 'remoto' as CategoryType },
  { id: 'reparaciones', label: 'Reparaciones', icon: '🔨', type: 'presencial' as CategoryType },
  { id: 'climatizacion', label: 'Climatización', icon: '❄️', type: 'presencial' as CategoryType },
  { id: 'seguridad', label: 'Seguridad', icon: '🔒', type: 'presencial' as CategoryType },
  { id: 'decoracion', label: 'Decoración', icon: '🖼️', type: 'presencial' as CategoryType },
  { id: 'mascotas', label: 'Cuidado de Mascotas', icon: '🐕', type: 'presencial' as CategoryType },
  { id: 'automotriz', label: 'Automotriz', icon: '🚗', type: 'presencial' as CategoryType },
  { id: 'otros', label: 'Otros', icon: '📋', type: 'presencial' as CategoryType },
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

// Helper para obtener el tipo de una categoría
export const getCategoryType = (categoryId: string): CategoryType | undefined => {
  const category = JOB_CATEGORIES.find(cat => cat.id === categoryId);
  return category?.type;
};

// Helper para verificar si dos trabajos pueden superponerse
// Solo se permite superposición si las categorías son de tipos diferentes
// (uno presencial y otro remoto)
export const canJobsOverlap = (category1: string, category2: string): boolean => {
  const type1 = getCategoryType(category1);
  const type2 = getCategoryType(category2);

  // Si alguna categoría no se encuentra, no permitir superposición por seguridad
  if (!type1 || !type2) return false;

  // Permitir superposición solo si los tipos son diferentes
  return type1 !== type2;
};
