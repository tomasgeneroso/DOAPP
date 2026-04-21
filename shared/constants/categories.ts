// Categorías y etiquetas predefinidas para trabajos
// type: 'presencial' = requiere presencia física, 'remoto' = puede entregarse virtualmente
export type CategoryType = 'presencial' | 'remoto';

export const JOB_CATEGORIES = [
  { id: 'plomeria', label: 'Plomería', labelKey: 'categories.plomeria', icon: '🔧', type: 'presencial' as CategoryType },
  { id: 'construccion', label: 'Construcción', labelKey: 'categories.construccion', icon: '🏗️', type: 'presencial' as CategoryType },
  { id: 'limpieza', label: 'Limpieza', labelKey: 'categories.limpieza', icon: '🧹', type: 'presencial' as CategoryType },
  { id: 'electricidad', label: 'Electricidad', labelKey: 'categories.electricidad', icon: '⚡', type: 'presencial' as CategoryType },
  { id: 'pintura', label: 'Pintura', labelKey: 'categories.pintura', icon: '🎨', type: 'presencial' as CategoryType },
  { id: 'carpinteria', label: 'Carpintería', labelKey: 'categories.carpinteria', icon: '🪚', type: 'presencial' as CategoryType },
  { id: 'jardineria', label: 'Jardinería', labelKey: 'categories.jardineria', icon: '🌱', type: 'presencial' as CategoryType },
  { id: 'armado_muebles', label: 'Armado de Muebles', labelKey: 'categories.armado_muebles', icon: '🪑', type: 'presencial' as CategoryType },
  { id: 'mudanzas', label: 'Mudanzas', labelKey: 'categories.mudanzas', icon: '📦', type: 'presencial' as CategoryType },
  { id: 'tecnologia', label: 'Tecnología', labelKey: 'categories.tecnologia', icon: '💻', type: 'remoto' as CategoryType },
  { id: 'reparaciones', label: 'Reparaciones', labelKey: 'categories.reparaciones', icon: '🔨', type: 'presencial' as CategoryType },
  { id: 'climatizacion', label: 'Climatización', labelKey: 'categories.climatizacion', icon: '❄️', type: 'presencial' as CategoryType },
  { id: 'seguridad', label: 'Seguridad', labelKey: 'categories.seguridad', icon: '🔒', type: 'presencial' as CategoryType },
  { id: 'decoracion', label: 'Decoración', labelKey: 'categories.decoracion', icon: '🖼️', type: 'presencial' as CategoryType },
  { id: 'mascotas', label: 'Cuidado de Mascotas', labelKey: 'categories.mascotas', icon: '🐕', type: 'presencial' as CategoryType },
  { id: 'automotriz', label: 'Automotriz', labelKey: 'categories.automotriz', icon: '🚗', type: 'presencial' as CategoryType },
  { id: 'otros', label: 'Otros', labelKey: 'categories.otros', icon: '📋', type: 'presencial' as CategoryType },
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
