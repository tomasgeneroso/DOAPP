/**
 * Las partes de DOAPP de las que se avisa por correo cuando fallan (pedido del dueño, 2026-11-27: «avisar si falla algún componente de la app a través del
 * email: mapas, autenticación, fotos, emails, etc.»). Fuente única: el nombre, a quién afecta y qué hacer salen de acá.
 */
export const COMPONENTES = {
  base_de_datos: {
    nombre: 'Base de datos',
    afecta: 'Casi todo DOAPP: ingresar, publicar, pagar y ver los datos.',
    queHacer: 'En el servidor: pg_lsclusters y systemctl status postgresql. Después pm2 logs doapp --lines 100 --nostream.',
  },
  correos: {
    nombre: 'Envío de correos',
    afecta: 'Confirmar el correo, recuperar la contraseña, avisos y campañas.',
    queHacer: 'Revisá la casilla en Hostinger y las variables SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER y SMTP_PASS del servidor.',
  },
  ingreso: {
    nombre: 'Ingreso con Google o X',
    afecta: 'Quienes entran o se registran con Google o X.',
    queHacer: 'Revisá en la consola de Google y de X que las claves sigan activas y que la dirección de retorno sea la de DOAPP. pm2 logs doapp | grep -i "google\\|twitter".',
  },
  fotos: {
    nombre: 'Fotos y archivos',
    afecta: 'Subir y ver fotos de trabajos, entregas, comprobantes y perfiles.',
    queHacer: 'En el servidor: df -h (espacio en disco) y permisos de la carpeta uploads. Si el disco está bien, revisá la configuración de nginx para /api/archivo.',
  },
  mapas: {
    nombre: 'Mapas',
    afecta: 'Los mapas de la publicación, del buscador de trabajos y de las zonas de trabajo.',
    queHacer: 'Abrí un mapa en la web. Las imágenes son de OpenStreetMap y la librería viene de unpkg.com: si OpenStreetMap bloqueó el sitio por el uso, hay que pasar a otro proveedor de imágenes.',
  },
  direcciones: {
    nombre: 'Búsqueda de direcciones',
    afecta: 'Sugerencias de calle, ubicación, barrio y código postal al publicar.',
    queHacer: 'Suele ser del proveedor (Georef o Photon) y se arregla solo. Si Photon limitó a DOAPP por el uso, hay que pasar a uno propio o pago.',
  },
  pagos: {
    nombre: 'Pagos (Mercado Pago y otros)',
    afecta: 'Crear pagos, confirmarlos y devolver dinero.',
    queHacer: 'Revisá el estado de Mercado Pago y que MERCADOPAGO_ACCESS_TOKEN siga vigente. pm2 logs doapp | grep -i mercadopago. Mirá en el panel los pagos de las últimas horas.',
  },
  cambio: {
    nombre: 'Cotización de monedas',
    afecta: 'Los precios en euros pasados a pesos (membresía y comisión mínima).',
    queHacer: 'Es de los proveedores de cotización (dolarapi y bluelytics). Mientras tanto DOAPP usa el último valor guardado: revisá que sea razonable.',
  },
  notificaciones: {
    nombre: 'Notificaciones en el teléfono',
    afecta: 'Los avisos que llegan con la app o la web cerradas.',
    queHacer: 'Revisá las credenciales de Firebase del servidor.',
  },
  tiempo_real: {
    nombre: 'Avisos en vivo',
    afecta: 'Chat, campanita y pantallas que se actualizan solas.',
    queHacer: 'Revisá que nginx pase /socket.io (Upgrade) y pm2 logs doapp | grep -i socket.',
  },
  pantalla: {
    nombre: 'Pantallas de la web',
    afecta: 'A las personas se les rompe una pantalla y ven el cartel de error.',
    queHacer: 'Entrá a la web y recorré las pantallas principales. Si empezó después de un deploy, conviene volver a la versión anterior.',
  },
} as const;

export type ComponenteId = keyof typeof COMPONENTES;

/** Lo único que un navegador puede reportar (la ruta es pública: no se acepta ningún otro dato ni texto libre). */
export const REPORTABLES_DESDE_EL_NAVEGADOR = ['mapas', 'direcciones', 'fotos', 'tiempo_real', 'pantalla'] as const;
export type ComponenteReportable = (typeof REPORTABLES_DESDE_EL_NAVEGADOR)[number];
export const esReportable = (x: unknown): x is ComponenteReportable => (REPORTABLES_DESDE_EL_NAVEGADOR as readonly unknown[]).includes(x);
