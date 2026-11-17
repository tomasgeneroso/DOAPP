/**
 * Las redes oficiales de DOAPP: UN solo lugar. La página de contacto, el pie, la app y los datos para buscadores leen de acá (pedido del dueño, 2026-11-15 y 2026-11-17).
 * Un enlace a la portada de una red («https://instagram.com») no es la cuenta de DOAPP: acá van solo cuentas que existen.
 */
export const REDES_SOCIALES = {
  instagram: { nombre: 'Instagram', usuario: '@doapparg', url: 'https://www.instagram.com/doapparg' },
  facebook: { nombre: 'Facebook', usuario: 'Doapp Argentina', url: 'https://www.facebook.com/profile.php?id=61593201473371' },
  x: { nombre: 'X', usuario: '@DoAppArgentina', url: 'https://x.com/DoAppArgentina' },
  linkedin: { nombre: 'LinkedIn', usuario: 'DoApp', url: 'https://www.linkedin.com/in/doapp/' },
} as const;

/** Las redes en el orden en que se muestran. */
export const ORDEN_DE_REDES = ['instagram', 'facebook', 'x', 'linkedin'] as const;
export type IdDeRed = (typeof ORDEN_DE_REDES)[number];
