/**
 * Cambios SIGNIFICATIVOS de las políticas: lo que la Política de privacidad (sección 9) promete avisar con un cartel en la plataforma y un correo.
 *
 * **Cuándo agregar una entrada** (regla propuesta y aceptada el 2026-11-26): se junta un dato nuevo o se usa para algo nuevo; un tercero nuevo recibe datos;
 * los datos se guardan más tiempo; o cambian los derechos de la persona o cómo ejercerlos. Un error de tipeo o una redacción más clara NO se avisa: alcanza con
 * actualizar la fecha del documento.
 *
 * **Cómo:** agregar una entrada AL FINAL con la versión siguiente. El cartel aparece una vez a cada cuenta que ya existía (las que se registran después nacen
 * con la versión vigente marcada como vista). El correo se manda aparte desde `/admin/correos`, categoría «servicio».
 */
export interface CambioDePoliticas {
  version: number;
  titulo: string;
  puntos: string[];
  /** Ruta de la web donde se lee el documento completo. */
  enlace: string;
}

export const CAMBIOS_DE_POLITICAS: CambioDePoliticas[] = [
  {
    version: 1,
    titulo: 'Actualizamos la Política de privacidad',
    puntos: [
      'Medimos nosotros cuánto se usa DOAPP: qué días ingresás, cuántas visitas, cuánto duran y si usás la web, Android o iOS. Se borra a los 400 días y no se comparte.',
      'Nombramos los servicios de mapas y direcciones: OpenStreetMap, Georef y Mapbox.',
      'Un «antes y después» de un trabajo se publica solo si lo aceptan quien contrató y quien trabajó.',
    ],
    enlace: '/legal/privacidad',
  },
];

export const cambioVigente = (): CambioDePoliticas => CAMBIOS_DE_POLITICAS[CAMBIOS_DE_POLITICAS.length - 1];
export const claveDelCambio = (version: number): string => `politicas:${version}`;
