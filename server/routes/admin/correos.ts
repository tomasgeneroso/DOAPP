import express, { Response } from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { logAudit } from '../../utils/auditLog.js';
import type { AuthRequest } from '../../types/index.js';
import { conSistema } from '../../db/contextoRls.js';
import { User } from '../../models/sql/User.model.js';
import { EmailTemplate } from '../../models/sql/EmailTemplate.model.js';
import { EmailAudience } from '../../models/sql/EmailAudience.model.js';
import { EmailCampaign } from '../../models/sql/EmailCampaign.model.js';
import { EmailCampaignRecipient } from '../../models/sql/EmailCampaignRecipient.model.js';
import {
  CORREOS_POR_MINUTO,
  ErrorDeCampana,
  MAXIMO_POR_CAMPANA,
  cancelarCampana,
  crearCampana,
  enviarPrueba,
  hostsPermitidos,
  iniciarCampana,
  resumirCampana,
  sembrarLoDePartida,
} from '../../services/campanasDeCorreo.js';
import { contarGrupo, muestraDelGrupo, type CategoriaDeCorreo } from '../../services/gruposDeCorreo.js';
import { erroresDePlantilla, LIMITES_DE_PLANTILLA, VARIABLES_DE_PLANTILLA } from '../../../shared/correos/plantillas.js';
import { describirFiltros, limpiarFiltros } from '../../../shared/correos/grupos.js';

/**
 * Módulo de correos a usuarios (regla del dueño, 2026-11-11): plantillas, grupos de destinatarios y campañas. Lo usan el equipo de administración y de marketing.
 * La baja de correos de las personas va en `routes/bajaDeCorreos.ts` (pública, con token).
 */
const router = express.Router();
router.use(protect, authorize('owner', 'super_admin', 'admin', 'marketing'));

const CATEGORIAS: CategoriaDeCorreo[] = ['servicio', 'promocional'];
const texto = (v: unknown): string => (typeof v === 'string' ? v : '').trim();
const textoOpcional = (v: unknown): string | null => {
  const t = texto(v);
  return t ? t : null;
};

function responderError(res: Response, e: unknown): void {
  if (e instanceof ErrorDeCampana) {
    res.status(e.estado).json({ success: false, code: e.codigo, message: e.message, ...(e.datos ? { data: e.datos } : {}) });
    return;
  }
  console.error('[correos]', (e as Error)?.message);
  res.status(500).json({ success: false, message: 'No pudimos completar la acción. Probá de nuevo.' });
}

const auditar = (req: AuthRequest, accion: string, descripcion: string, id?: string, metadata?: Record<string, unknown>) =>
  logAudit({ req, action: accion, category: 'system', severity: 'medium', description: descripcion, targetModel: 'EmailCampaign', targetId: id, metadata });

// ───────────────────────────── datos fijos

router.get('/opciones', (_req: AuthRequest, res: Response): void => {
  res.json({ success: true, data: { variables: VARIABLES_DE_PLANTILLA, limites: LIMITES_DE_PLANTILLA, ritmos: CORREOS_POR_MINUTO, maximoPorCampana: MAXIMO_POR_CAMPANA, hostsPermitidos: hostsPermitidos() } });
});

// ───────────────────────────── plantillas

const plantillaDe = (b: Record<string, unknown>) => ({
  nombre: texto(b.name),
  category: (CATEGORIAS as string[]).includes(texto(b.category)) ? (texto(b.category) as CategoriaDeCorreo) : 'servicio',
  asunto: texto(b.subject),
  cuerpo: typeof b.body === 'string' ? b.body.replace(/\r\n/g, '\n').trim() : '',
  botonTexto: textoOpcional(b.buttonLabel),
  botonUrl: textoOpcional(b.buttonUrl),
});

router.get('/templates', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await sembrarLoDePartida(req.user?.id);
    const filas = await conSistema(() => EmailTemplate.findAll({ order: [['createdAt', 'ASC']] }));
    res.json({ success: true, data: filas.map((t) => ({ id: t.id, name: t.name, category: t.category, subject: t.subject, body: t.body, buttonLabel: t.buttonLabel ?? null, buttonUrl: t.buttonUrl ?? null, updatedAt: t.updatedAt })) });
  } catch (e) {
    responderError(res, e);
  }
});

router.post('/templates', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const p = plantillaDe(req.body ?? {});
    const errores = erroresDePlantilla({ nombre: p.nombre, asunto: p.asunto, cuerpo: p.cuerpo, botonTexto: p.botonTexto, botonUrl: p.botonUrl }, hostsPermitidos());
    if (errores.length) {
      res.status(400).json({ success: false, field: errores[0].campo, message: errores[0].mensaje, errors: errores });
      return;
    }
    const t = await conSistema(() => EmailTemplate.create({ name: p.nombre, category: p.category, subject: p.asunto, body: p.cuerpo, buttonLabel: p.botonTexto, buttonUrl: p.botonUrl, createdById: req.user?.id ?? null } as never));
    await auditar(req, 'email_template.create', `Plantilla de correo creada: ${p.nombre}`, undefined, { plantilla: t.id });
    res.status(201).json({ success: true, message: 'Plantilla guardada.', data: { id: t.id } });
  } catch (e) {
    responderError(res, e);
  }
});

router.put('/templates/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const t = await conSistema(() => EmailTemplate.findByPk(req.params.id));
    if (!t) {
      res.status(404).json({ success: false, message: 'La plantilla no existe.' });
      return;
    }
    const p = plantillaDe(req.body ?? {});
    const errores = erroresDePlantilla({ nombre: p.nombre, asunto: p.asunto, cuerpo: p.cuerpo, botonTexto: p.botonTexto, botonUrl: p.botonUrl }, hostsPermitidos());
    if (errores.length) {
      res.status(400).json({ success: false, field: errores[0].campo, message: errores[0].mensaje, errors: errores });
      return;
    }
    await conSistema(() => t.update({ name: p.nombre, category: p.category, subject: p.asunto, body: p.cuerpo, buttonLabel: p.botonTexto, buttonUrl: p.botonUrl } as never));
    await auditar(req, 'email_template.update', `Plantilla de correo editada: ${p.nombre}`, undefined, { plantilla: t.id });
    res.json({ success: true, message: 'Plantilla guardada. Las campañas que ya armaste siguen con el texto de cuando las armaste.' });
  } catch (e) {
    responderError(res, e);
  }
});

router.delete('/templates/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const t = await conSistema(() => EmailTemplate.findByPk(req.params.id));
    if (!t) {
      res.status(404).json({ success: false, message: 'La plantilla no existe.' });
      return;
    }
    await conSistema(() => t.destroy());
    await auditar(req, 'email_template.delete', `Plantilla de correo borrada: ${t.name}`, undefined, { plantilla: t.id });
    res.json({ success: true, message: 'Plantilla borrada. Las campañas ya armadas con ella no cambian.' });
  } catch (e) {
    responderError(res, e);
  }
});

/** Manda a QUIEN LO PIDE (nunca a otra persona) cómo se ve el correo, con sus datos y la marca de prueba. */
router.post('/templates/test', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const p = plantillaDe(req.body ?? {});
    const yo = await conSistema(() => User.findByPk(req.user!.id, { attributes: ['id', 'name', 'email'] }));
    await enviarPrueba({ asunto: p.asunto, cuerpo: p.cuerpo, botonTexto: p.botonTexto, botonUrl: p.botonUrl }, { id: String(req.user!.id), name: yo?.name, email: yo?.email });
    res.json({ success: true, message: 'Te mandamos la prueba a tu correo.' });
  } catch (e) {
    responderError(res, e);
  }
});

// ───────────────────────────── grupos

const grupoDe = (b: Record<string, unknown>) => {
  const { filtros, errores } = limpiarFiltros(b.filters);
  return { nombre: texto(b.name), descripcion: textoOpcional(b.description), filtros, errores };
};

router.get('/audiences', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await sembrarLoDePartida(req.user?.id);
    const filas = await conSistema(() => EmailAudience.findAll({ order: [['createdAt', 'ASC']] }));
    const data = await Promise.all(
      filas.map(async (g) => ({
        id: g.id,
        name: g.name,
        description: g.description ?? null,
        filters: g.filters ?? {},
        resumen: describirFiltros(g.filters ?? {}),
        // Cuántas personas lo recibirían hoy, según la categoría del correo.
        servicio: await contarGrupo(g.filters ?? {}, 'servicio'),
        promocional: await contarGrupo(g.filters ?? {}, 'promocional'),
      })),
    );
    res.json({ success: true, data });
  } catch (e) {
    responderError(res, e);
  }
});

router.post('/audiences/preview', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { filtros, errores } = limpiarFiltros(req.body?.filters);
    if (errores.length) {
      res.status(400).json({ success: false, message: errores[0] });
      return;
    }
    const categoria = (CATEGORIAS as string[]).includes(texto(req.body?.category)) ? (texto(req.body.category) as CategoriaDeCorreo) : 'servicio';
    res.json({ success: true, data: { ...(await muestraDelGrupo(filtros, categoria)), resumen: describirFiltros(filtros) } });
  } catch (e) {
    responderError(res, e);
  }
});

router.post('/audiences', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const g = grupoDe(req.body ?? {});
    if (!g.nombre) {
      res.status(400).json({ success: false, field: 'name', message: 'Ponele un nombre al grupo.' });
      return;
    }
    if (g.nombre.length > 80) {
      res.status(400).json({ success: false, field: 'name', message: 'El nombre tiene más de 80 caracteres.' });
      return;
    }
    if (g.errores.length) {
      res.status(400).json({ success: false, message: g.errores[0] });
      return;
    }
    const creado = await conSistema(() => EmailAudience.create({ name: g.nombre, description: g.descripcion?.slice(0, 300) ?? null, filters: g.filtros, createdById: req.user?.id ?? null } as never));
    await auditar(req, 'email_audience.create', `Grupo de correo creado: ${g.nombre}`, undefined, { grupo: creado.id });
    res.status(201).json({ success: true, message: 'Grupo guardado.', data: { id: creado.id } });
  } catch (e) {
    responderError(res, e);
  }
});

router.put('/audiences/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const existente = await conSistema(() => EmailAudience.findByPk(req.params.id));
    if (!existente) {
      res.status(404).json({ success: false, message: 'El grupo no existe.' });
      return;
    }
    const g = grupoDe(req.body ?? {});
    if (!g.nombre || g.nombre.length > 80) {
      res.status(400).json({ success: false, field: 'name', message: g.nombre ? 'El nombre tiene más de 80 caracteres.' : 'Ponele un nombre al grupo.' });
      return;
    }
    if (g.errores.length) {
      res.status(400).json({ success: false, message: g.errores[0] });
      return;
    }
    await conSistema(() => existente.update({ name: g.nombre, description: g.descripcion?.slice(0, 300) ?? null, filters: g.filtros } as never));
    await auditar(req, 'email_audience.update', `Grupo de correo editado: ${g.nombre}`, undefined, { grupo: existente.id });
    res.json({ success: true, message: 'Grupo guardado. Las campañas que ya armaste siguen con los filtros de cuando las armaste.' });
  } catch (e) {
    responderError(res, e);
  }
});

router.delete('/audiences/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const g = await conSistema(() => EmailAudience.findByPk(req.params.id));
    if (!g) {
      res.status(404).json({ success: false, message: 'El grupo no existe.' });
      return;
    }
    await conSistema(() => g.destroy());
    await auditar(req, 'email_audience.delete', `Grupo de correo borrado: ${g.name}`, undefined, { grupo: g.id });
    res.json({ success: true, message: 'Grupo borrado. Las campañas ya armadas con él no cambian.' });
  } catch (e) {
    responderError(res, e);
  }
});

// ───────────────────────────── campañas

router.get('/campaigns', async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const filas = await conSistema(() => EmailCampaign.findAll({ order: [['createdAt', 'DESC']], limit: 100 }));
    res.json({ success: true, data: filas.map(resumirCampana) });
  } catch (e) {
    responderError(res, e);
  }
});

router.get('/campaigns/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const c = await conSistema(() => EmailCampaign.findByPk(req.params.id));
    if (!c) {
      res.status(404).json({ success: false, message: 'La campaña no existe.' });
      return;
    }
    // Los motivos de lo que no salió, SIN datos de personas (solo el motivo y cuántas veces).
    const motivos = await conSistema(async () => {
      const filas = await EmailCampaignRecipient.findAll({ where: { campaignId: c.id, status: ['failed', 'skipped'] }, attributes: ['status', 'error'] });
      const cuenta = new Map<string, { estado: string; motivo: string; cantidad: number }>();
      for (const f of filas) {
        const clave = `${f.status}|${f.error ?? ''}`;
        const previo = cuenta.get(clave);
        if (previo) previo.cantidad += 1;
        else cuenta.set(clave, { estado: f.status, motivo: f.error ?? '', cantidad: 1 });
      }
      return [...cuenta.values()];
    });
    res.json({
      success: true,
      data: {
        ...resumirCampana(c),
        body: c.body,
        buttonLabel: c.buttonLabel ?? null,
        buttonUrl: c.buttonUrl ?? null,
        filters: c.filters ?? {},
        resumenDelGrupo: describirFiltros(c.filters ?? {}),
        motivos,
        // Cuántas personas lo recibirían HOY (puede ser distinto del total si ya empezó): es el número que se confirma al enviar.
        alcanzaHoy: c.status === 'draft' ? await contarGrupo(c.filters ?? {}, c.category) : null,
      },
    });
  } catch (e) {
    responderError(res, e);
  }
});

router.get('/campaigns/:id/destinatarios', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const c = await conSistema(() => EmailCampaign.findByPk(req.params.id));
    if (!c) {
      res.status(404).json({ success: false, message: 'La campaña no existe.' });
      return;
    }
    res.json({ success: true, data: { ...(await muestraDelGrupo(c.filters ?? {}, c.category)), resumen: describirFiltros(c.filters ?? {}) } });
  } catch (e) {
    responderError(res, e);
  }
});

router.post('/campaigns', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const c = await crearCampana({ nombre: texto(req.body?.name), plantillaId: texto(req.body?.templateId), grupoId: texto(req.body?.audienceId), ritmo: texto(req.body?.pace) || undefined, actorId: req.user?.id });
    await auditar(req, 'email_campaign.create', `Campaña de correo armada: ${c.name} (plantilla «${c.templateName}», grupo «${c.audienceName}»)`, c.id);
    res.status(201).json({ success: true, message: 'Campaña armada. Todavía no se mandó nada.', data: { id: c.id } });
  } catch (e) {
    responderError(res, e);
  }
});

router.post('/campaigns/:id/test', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const c = await conSistema(() => EmailCampaign.findByPk(req.params.id));
    if (!c) {
      res.status(404).json({ success: false, message: 'La campaña no existe.' });
      return;
    }
    const yo = await conSistema(() => User.findByPk(req.user!.id, { attributes: ['id', 'name', 'email'] }));
    await enviarPrueba({ asunto: c.subject, cuerpo: c.body, botonTexto: c.buttonLabel, botonUrl: c.buttonUrl }, { id: String(req.user!.id), name: yo?.name, email: yo?.email });
    res.json({ success: true, message: 'Te mandamos la prueba a tu correo.' });
  } catch (e) {
    responderError(res, e);
  }
});

router.post('/campaigns/:id/send', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const r = await iniciarCampana(req.params.id, Number(req.body?.confirmaTotal));
    await auditar(req, 'email_campaign.send', `Campaña de correo enviada: ${r.campana.name} a ${r.total} personas (ritmo ${r.campana.pace})`, r.campana.id, { total: r.total, ritmo: r.campana.pace, categoria: r.campana.category });
    res.json({ success: true, message: `Listo: se va a mandar a ${r.total} personas, de a poco.`, data: { total: r.total } });
  } catch (e) {
    responderError(res, e);
  }
});

router.post('/campaigns/:id/cancel', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const c = await cancelarCampana(req.params.id);
    await auditar(req, 'email_campaign.cancel', `Campaña de correo cancelada: ${c.name} (ya salieron ${c.sentCount})`, c.id, { enviados: c.sentCount });
    res.json({ success: true, message: 'Campaña cancelada. Lo que ya salió no se puede deshacer; lo que faltaba no sale.' });
  } catch (e) {
    responderError(res, e);
  }
});

router.delete('/campaigns/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const c = await conSistema(() => EmailCampaign.findByPk(req.params.id));
    if (!c) {
      res.status(404).json({ success: false, message: 'La campaña no existe.' });
      return;
    }
    if (c.status !== 'draft') {
      res.status(409).json({ success: false, code: 'CAMPANA_YA_ENVIADA', message: 'Solo se borran los borradores: una campaña enviada queda como registro.' });
      return;
    }
    await conSistema(() => c.destroy());
    await auditar(req, 'email_campaign.delete', `Borrador de campaña borrado: ${c.name}`, c.id);
    res.json({ success: true, message: 'Borrador borrado.' });
  } catch (e) {
    responderError(res, e);
  }
});

export default router;
