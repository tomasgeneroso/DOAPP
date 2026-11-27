import express, { Response } from 'express';
import { protect } from '../middleware/auth.js';
import { User } from '../models/sql/User.model.js';
import emailService from '../services/email.js';
import { logAudit } from '../utils/auditLog.js';
import type { AuthRequest } from '../types/index.js';
import {
  HORAS_QUE_DURA_EL_PASE, NOMBRE_DEL_PASE, claveCorrecta, claveDePanelExigida, codigoCorrecto, conIntentos, crearCodigo, emitirPase, estadoDeLaClave,
  generarClaveDePanel, paseDelPedido, paseValido,
} from '../services/claveDePanel.js';

/** La clave de panel de quien tiene un rol: crearla, abrir y cerrar el panel, cambiarla y recuperarla. */
const router = express.Router();
router.use(protect);
router.use((req: AuthRequest, res: Response, next) => {
  if (!(req.user as any)?.adminRole) {
    res.status(403).json({ success: false, message: 'Tu cuenta no tiene un rol en DOAPP.' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  next();
});

type Manejador = (req: AuthRequest, res: Response, userId: string) => Promise<void>;
const manejar = (nombre: string, fn: Manejador) => async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await fn(req, res, String(req.user.id));
  } catch (e: any) {
    console.error(`Clave de panel, ${nombre}:`, e?.message);
    res.status(500).json({ success: false, message: 'No pudimos completar eso. Probá de nuevo.' });
  }
};

const rechazar = (res: Response, status: number, message: string) => {
  res.status(status).json({ success: false, message });
};

const rastro = (req: AuthRequest, action: string, description: string) =>
  logAudit({ req, action, category: 'role', severity: 'high', description, targetModel: 'User', targetId: String(req.user.id) });

/** La cuenta con su contraseña (`protect` la excluye). */
const cuentaDe = (userId: string) => User.findByPk(userId);

async function avisarPorCorreo(destino: string | undefined, asunto: string, texto: string): Promise<void> {
  if (!destino) return;
  try {
    await emailService.sendEmail({ to: destino, subject: asunto, html: `<p>${texto}</p><p>Si no fuiste vos, cambiá la contraseña de tu cuenta y avisale al owner.</p>` });
  } catch (e: any) {
    console.error('Clave de panel, aviso:', e?.message);
  }
}

router.get('/estado', manejar('estado', async (req, res, userId) => {
  const [{ creada, desde }, cuenta] = await Promise.all([estadoDeLaClave(userId), cuentaDe(userId)]);
  const abierta = !claveDePanelExigida() || (await paseValido(paseDelPedido(req as any), req.user as any));
  res.json({ success: true, data: { exigida: claveDePanelExigida(), creada, desde, abierta, tieneContrasena: !!cuenta?.password, horas: HORAS_QUE_DURA_EL_PASE } });
}));

/** Manda un código al correo de la cuenta. */
router.post('/pedir-codigo', manejar('pedir código', async (req, res, userId) => {
  const cuenta = await cuentaDe(userId);
  if (!cuenta?.email) return rechazar(res, 400, 'Tu cuenta no tiene un correo cargado.');
  const codigo = await crearCodigo(userId);
  const salio = await emailService.sendEmail({
    to: cuenta.email,
    subject: 'Código para tu clave de panel · DOAPP',
    html: `<p>Tu código para la clave de panel es:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${codigo}</p><p>Vence en 30 minutos. Si no lo pediste, cambiá la contraseña de tu cuenta.</p>`,
  });
  // 424 y no 502: Cloudflare reemplaza las respuestas 502 por su propia página.
  if (!salio) return rechazar(res, 424, `No pudimos mandar el código. ${emailService.motivoDelUltimoFallo?.() || ''}`.trim());
  await rastro(req, 'panel_key.code_requested', 'Pidió un código por correo para su clave de panel');
  res.json({ success: true, message: 'Te mandamos un código al correo de tu cuenta. Vence en 30 minutos.' });
}));

/** La primera clave. Se comprueba la contraseña de la cuenta (o, en cuentas sin contraseña, el código del correo). */
router.post('/crear', manejar('crear', async (req, res, userId) => {
  if ((await estadoDeLaClave(userId)).creada) return rechazar(res, 409, 'Ya tenés una clave de panel. Si la perdiste, usá «Perdí mi clave».');
  const cuenta = await cuentaDe(userId);
  const conContrasena = !!cuenta?.password;
  const intento = await conIntentos(userId, async () => (conContrasena
    ? await cuenta!.comparePassword(String(req.body?.contrasena || ''))
    : codigoCorrecto(userId, req.body?.codigo)), conContrasena ? 'La contraseña de tu cuenta no coincide.' : 'El código no coincide o venció.');
  if (intento.ok === false) return rechazar(res, intento.status, intento.message);
  const clave = await generarClaveDePanel(userId, { soloSiNoHay: true });
  if (!clave) return rechazar(res, 409, 'Ya tenés una clave de panel.');
  await rastro(req, 'panel_key.created', 'Creó su clave de panel');
  await avisarPorCorreo(cuenta?.email, 'Se creó tu clave de panel · DOAPP', 'Se creó la clave de panel de tu cuenta.');
  res.json({ success: true, data: { clave } });
}));

router.post('/abrir', manejar('abrir', async (req, res, userId) => {
  let sello: string | null = null;
  const intento = await conIntentos(userId, async () => !!(sello = await claveCorrecta(userId, req.body?.clave)), 'La clave de panel no coincide.');
  if (intento.ok === false) {
    if (intento.status === 429) await rastro(req, 'panel_key.locked', 'La clave de panel quedó trabada por intentos fallidos');
    return rechazar(res, intento.status, intento.message);
  }
  const pase = emitirPase(userId, sello!);
  res.cookie(NOMBRE_DEL_PASE, pase, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: HORAS_QUE_DURA_EL_PASE * 3_600_000, path: '/' });
  await rastro(req, 'panel_key.opened', 'Abrió el panel con su clave');
  // El pase viaja en la respuesta solo para la app, que no usa cookies; la web lo tiene en una cookie que ningún script puede leer.
  res.json({ success: true, data: { horas: HORAS_QUE_DURA_EL_PASE, ...(req.body?.paraLaApp === true ? { pase } : {}) } });
}));

router.post('/cerrar', manejar('cerrar', async (_req, res) => {
  res.clearCookie(NOMBRE_DEL_PASE, { path: '/' });
  res.json({ success: true });
}));

/** Cambiarla sabiendo la actual. */
router.post('/cambiar', manejar('cambiar', async (req, res, userId) => {
  const intento = await conIntentos(userId, async () => !!(await claveCorrecta(userId, req.body?.claveActual)), 'La clave de panel actual no coincide.');
  if (intento.ok === false) return rechazar(res, intento.status, intento.message);
  const clave = await generarClaveDePanel(userId);
  res.clearCookie(NOMBRE_DEL_PASE, { path: '/' });
  await rastro(req, 'panel_key.changed', 'Cambió su clave de panel');
  await avisarPorCorreo((await cuentaDe(userId))?.email, 'Se cambió tu clave de panel · DOAPP', 'Se generó una clave de panel nueva para tu cuenta.');
  res.json({ success: true, data: { clave } });
}));

/** Recuperar (la anterior no se puede ver: se genera otra): código del correo y, si la cuenta tiene, la contraseña de la cuenta. */
router.post('/recuperar', manejar('recuperar', async (req, res, userId) => {
  const cuenta = await cuentaDe(userId);
  const intento = await conIntentos(userId, async () => {
    if (!(await codigoCorrecto(userId, req.body?.codigo))) return false;
    return !cuenta?.password || cuenta.comparePassword(String(req.body?.contrasena || ''));
  }, 'El código o la contraseña de la cuenta no coinciden (el código vence a los 30 minutos).');
  if (intento.ok === false) return rechazar(res, intento.status, intento.message);
  const clave = await generarClaveDePanel(userId);
  res.clearCookie(NOMBRE_DEL_PASE, { path: '/' });
  await rastro(req, 'panel_key.recovered', 'Recuperó su clave de panel con un código por correo');
  await avisarPorCorreo(cuenta?.email, 'Se recuperó tu clave de panel · DOAPP', 'Se generó una clave de panel nueva con un código enviado a este correo.');
  res.json({ success: true, data: { clave } });
}));

export default router;
