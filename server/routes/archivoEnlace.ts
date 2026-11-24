import { Router, Response } from 'express';
import { protect, type AuthRequest } from '../middleware/auth.js';
import {
  CARPETAS_PRIVADAS,
  ROLES_QUE_VEN_ARCHIVOS_PRIVADOS,
  SEGUNDOS_DE_UN_ENLACE_FIRMADO,
  esElDuenoDelArchivo,
  firmarArchivo,
  parsearRutaDeArchivo,
  type CarpetaPrivada,
} from '../middleware/archivosPrivados.js';

const router = Router();

/**
 * GET /api/archivo/enlace?ruta=<carpeta/archivo | /uploads/carpeta/archivo | dirección completa>
 *
 * Le da a quien PUEDE ver un archivo privado una dirección que vale 10 minutos y se abre sin sesión (auditoría de seguridad, 2026-11-24). La necesita la app móvil:
 * abre los archivos con el navegador del teléfono, que no lleva la sesión. Quien no puede ver el archivo recibe 403 (la misma regla que al abrirlo).
 */
router.get('/', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const crudo = typeof req.query.ruta === 'string' ? req.query.ruta : '';
    const dentroDeUploads = crudo.match(/(?:^|\/)uploads\/(.+)$/);
    const limpia = (dentroDeUploads ? dentroDeUploads[1] : crudo).split('?')[0].replace(/^\/+/, '');
    const ruta = parsearRutaDeArchivo('/' + limpia);
    if (!ruta || !ruta.archivo) {
      res.status(400).json({ success: false, message: 'Falta indicar el archivo' });
      return;
    }
    // Una carpeta pública no necesita enlace: se abre directo.
    if (!(CARPETAS_PRIVADAS as readonly string[]).includes(ruta.carpeta)) {
      res.json({ success: true, url: `/api/archivo?ruta=${encodeURIComponent(`${ruta.carpeta}/${ruta.archivo}`)}`, firmado: false });
      return;
    }
    const user: any = req.user;
    const esEquipo = !!user?.adminRole && ROLES_QUE_VEN_ARCHIVOS_PRIVADOS.includes(String(user.adminRole));
    if (!esEquipo && !(await esElDuenoDelArchivo(user, ruta.carpeta as CarpetaPrivada, ruta.archivo))) {
      res.status(403).json({ success: false, message: 'No tenés permiso para ver este archivo' });
      return;
    }
    const f = firmarArchivo(ruta.carpeta, ruta.archivo);
    res.json({
      success: true,
      url: `/api/archivo?ruta=${encodeURIComponent(f.ruta)}&firma=${f.firma}&vence=${f.vence}`,
      firmado: true,
      venceEnSegundos: SEGUNDOS_DE_UN_ENLACE_FIRMADO,
    });
  } catch (error) {
    console.error('[archivo/enlace] error:', error);
    res.status(500).json({ success: false, message: 'No se pudo preparar el enlace al archivo' });
  }
});

export default router;
