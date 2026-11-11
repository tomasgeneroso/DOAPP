import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../config/database.js';
import { config } from '../config/env.js';
import { conSistema } from '../db/contextoRls.js';
import { User } from '../models/sql/User.model.js';
import { EmailTemplate } from '../models/sql/EmailTemplate.model.js';
import { EmailAudience } from '../models/sql/EmailAudience.model.js';
import { EmailCampaign, type RitmoDeEnvio } from '../models/sql/EmailCampaign.model.js';
import { EmailCampaignRecipient } from '../models/sql/EmailCampaignRecipient.model.js';
import emailService from './email.js';
import { enlaceDeBaja, enlaceDeBajaDeUnToque } from './bajaDeCorreos.js';
import { contarGrupo, dondeDelGrupo, idsDelGrupo, type CategoriaDeCorreo } from './gruposDeCorreo.js';
import { armarCorreo, erroresDePlantilla, type DatosDeLaPersona, type PlantillaDeCorreo } from '../../shared/correos/plantillas.js';
import { GRUPOS_DE_PARTIDA, type FiltrosDeGrupo } from '../../shared/correos/grupos.js';
import { POLITICAS } from '../../shared/constants/policies.js';
import { limpiarTextoLibre } from '../../shared/seguridad/datosPersonales.js';

/**
 * Campañas de correo (módulo de correos a usuarios, regla del dueño 2026-11-11: «enviar correo a los usuarios que no pudieron terminar el registro, con plantillas y grupos»).
 *
 * Una campaña = una plantilla + un grupo + un ritmo. Al crearla se COPIA el texto y los filtros (editar la plantilla después no cambia lo que sale). Al enviarla se arma la lista de
 * personas (una fila por persona y campaña) y un barrido que corre cada minuto manda de a poco —según el ritmo— hasta terminar: el correo de la plataforma es un SMTP con tope y mandar
 * 300 de golpe lo bloquea. En el momento de mandar cada correo se VUELVE a mirar a la persona (si se dio de baja o la suspendieron mientras tanto, se la saltea).
 */

/** Correos por minuto de cada ritmo (lento 60/h, normal 180/h, rápido 300/h). */
export const CORREOS_POR_MINUTO: Record<RitmoDeEnvio, number> = { lento: 1, normal: 3, rapido: 5 };
/** Tope de todas las campañas juntas en un minuto (el SMTP es uno solo). */
export const MAXIMO_POR_MINUTO_EN_TOTAL = 10;
/** Más personas que esto en una sola campaña casi seguro es un error de filtros: se frena. */
export const MAXIMO_POR_CAMPANA = 5000;
/** Un destinatario «enviando» hace más de esto es un envío que se cortó (el proceso se reinició a mitad de camino): se da por fallido, no se reenvía (podría haber salido). */
export const MINUTOS_PARA_DAR_POR_CORTADO = 10;

export class ErrorDeCampana extends Error {
  constructor(
    message: string,
    public estado: number = 400,
    public codigo?: string,
    public datos?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Las direcciones https a las que puede llevar el botón de una plantilla: solo las de DOAPP. */
export function hostsPermitidos(): string[] {
  const hosts = new Set<string>(['doapparg.com', 'www.doapparg.com']);
  try {
    const h = new URL(config.clientUrl || 'https://doapparg.com').hostname.toLowerCase();
    if (h && h !== 'localhost') hosts.add(h);
  } catch {
    /* sin URL válida: quedan las de siempre */
  }
  return [...hosts];
}

const baseDeLaApp = (): string => (config.clientUrl || 'https://doapparg.com').replace(/\/$/, '');

export function datosDeLaPersona(user: { id: string; name?: string | null }): DatosDeLaPersona {
  return {
    nombre: user.name ?? '',
    enlaceRegistro: `${baseDeLaApp()}/complete-registration`,
    enlaceApp: baseDeLaApp(),
    enlaceDeBaja: enlaceDeBaja(String(user.id)),
  };
}

const cabecerasDeBaja = (enlace: string): Record<string, string> => ({ 'List-Unsubscribe': `<${enlace}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });

type ConPlantilla = Pick<EmailTemplate, 'subject' | 'body' | 'buttonLabel' | 'buttonUrl'>;
const comoPlantilla = (x: ConPlantilla): PlantillaDeCorreo => ({ asunto: x.subject, cuerpo: x.body, botonTexto: x.buttonLabel, botonUrl: x.buttonUrl });

// ───────────────────────────── plantillas y grupos de partida

/** La primera vez que se abre el módulo: una plantilla de «terminá tu registro» y los grupos más usados, para no empezar de cero. */
export async function sembrarLoDePartida(actorId?: string | null): Promise<void> {
  await conSistema(async () => {
    if ((await EmailTemplate.count()) === 0) {
      await EmailTemplate.create({
        name: 'Terminá tu registro',
        category: 'servicio',
        subject: '{{saludo}}, terminá tu registro en DOAPP',
        body:
          `{{saludo}}:\n\nCreaste tu cuenta en DOAPP pero todavía no terminaste el registro. Te falta un solo paso: completar tus datos (nombre, número de DNI y nombre de usuario). Son un par de minutos.\n\n` +
          `Cuando lo termines vas a poder publicar trabajos, postularte a los de otras personas y cobrar. Además, las primeras ${POLITICAS.PRIMEROS_USUARIOS_CON_CONTRATOS_LIBRES} cuentas con el registro completo reciben ` +
          `${POLITICAS.CONTRATOS_LIBRES_DE_LANZAMIENTO} contrato sin comisión (una sola vez) y ${POLITICAS.MESES_DE_PRO_DE_LANZAMIENTO} mes de PRO gratis.\n\nSi ya no querés usar DOAPP, no hace falta que hagas nada.`,
        buttonLabel: 'Terminar mi registro',
        buttonUrl: '{{enlaceRegistro}}',
        createdById: actorId ?? null,
      } as never);
    }
    if ((await EmailAudience.count()) === 0) {
      for (const g of GRUPOS_DE_PARTIDA) await EmailAudience.create({ name: g.nombre, description: g.descripcion, filters: g.filtros, createdById: actorId ?? null } as never);
    }
  });
}

// ───────────────────────────── crear

export interface EntradaDeCampana {
  nombre: string;
  plantillaId: string;
  grupoId: string;
  ritmo?: string;
  actorId?: string | null;
}

export async function crearCampana(e: EntradaDeCampana): Promise<EmailCampaign> {
  const nombre = String(e.nombre ?? '').trim();
  if (!nombre) throw new ErrorDeCampana('Ponele un nombre a la campaña.');
  if (nombre.length > 120) throw new ErrorDeCampana('El nombre tiene más de 120 caracteres.');
  const ritmo = (e.ritmo ?? 'normal') as RitmoDeEnvio;
  if (!(ritmo in CORREOS_POR_MINUTO)) throw new ErrorDeCampana('El ritmo tiene que ser lento, normal o rápido.');

  return conSistema(async () => {
    const plantilla = await EmailTemplate.findByPk(e.plantillaId);
    if (!plantilla) throw new ErrorDeCampana('Elegí una plantilla que exista.', 404);
    const grupo = await EmailAudience.findByPk(e.grupoId);
    if (!grupo) throw new ErrorDeCampana('Elegí un grupo que exista.', 404);
    const errores = erroresDePlantilla(comoPlantilla(plantilla), hostsPermitidos());
    if (errores.length) throw new ErrorDeCampana(`La plantilla tiene un problema: ${errores[0].mensaje}`, 400, 'PLANTILLA_CON_ERRORES');

    return EmailCampaign.create({
      name: nombre,
      status: 'draft',
      category: plantilla.category,
      templateId: plantilla.id,
      audienceId: grupo.id,
      templateName: plantilla.name,
      audienceName: grupo.name,
      subject: plantilla.subject,
      body: plantilla.body,
      buttonLabel: plantilla.buttonLabel ?? null,
      buttonUrl: plantilla.buttonUrl ?? null,
      filters: grupo.filters ?? {},
      pace: ritmo,
      createdById: e.actorId ?? null,
    } as never);
  });
}

// ───────────────────────────── prueba

const pruebasPorAdmin = new Map<string, number[]>();
export const PRUEBAS_POR_HORA = 10;

/** Le manda a QUIEN LA PIDE (nunca a otra persona) cómo se ve el correo, con sus propios datos y la marca de prueba. Con tope por hora. */
export async function enviarPrueba(plantilla: PlantillaDeCorreo, quien: { id: string; name?: string | null; email?: string | null }, ahora: number = Date.now()): Promise<void> {
  if (!quien.email) throw new ErrorDeCampana('Tu cuenta no tiene correo: no se puede mandar la prueba.');
  const errores = erroresDePlantilla(plantilla, hostsPermitidos());
  if (errores.length) throw new ErrorDeCampana(errores[0].mensaje, 400, 'PLANTILLA_CON_ERRORES');
  const recientes = (pruebasPorAdmin.get(quien.id) ?? []).filter((t) => ahora - t < 3_600_000);
  if (recientes.length >= PRUEBAS_POR_HORA) throw new ErrorDeCampana(`Ya mandaste ${PRUEBAS_POR_HORA} pruebas en la última hora: esperá un rato.`, 429, 'DEMASIADAS_PRUEBAS');
  pruebasPorAdmin.set(quien.id, [...recientes, ahora]);

  const datos = datosDeLaPersona({ id: quien.id, name: quien.name });
  const correo = armarCorreo(plantilla, datos, { prueba: true });
  const salio = await emailService.sendEmail({ to: quien.email, subject: correo.asunto, html: correo.html, text: correo.texto, headers: cabecerasDeBaja(enlaceDeBajaDeUnToque(quien.id)) });
  if (!salio) throw new ErrorDeCampana('El servidor de correo no aceptó la prueba. Probá de nuevo en un rato.', 502, 'CORREO_NO_SALIO');
}

export function __reiniciarPruebas(): void {
  pruebasPorAdmin.clear();
}

// ───────────────────────────── enviar

export interface ResultadoDeInicio {
  campana: EmailCampaign;
  total: number;
}

/**
 * Empieza el envío: arma la lista de personas y deja la campaña «enviando». `confirmaTotal` es la cantidad que la persona VIO en pantalla al confirmar: si el grupo cambió
 * mientras tanto (alguien se dio de baja, otra terminó el registro), el número ya no coincide y se le pide que lo mire de nuevo en vez de mandar a un grupo distinto del que aprobó.
 */
export async function iniciarCampana(id: string, confirmaTotal: number, ahora: Date = new Date()): Promise<ResultadoDeInicio> {
  return conSistema(async () => {
    const campana = await EmailCampaign.findByPk(id);
    if (!campana) throw new ErrorDeCampana('La campaña no existe.', 404);
    if (campana.status !== 'draft') throw new ErrorDeCampana('Esta campaña ya se envió o se canceló.', 409, 'CAMPANA_YA_ENVIADA');
    const errores = erroresDePlantilla(comoPlantilla(campana), hostsPermitidos());
    if (errores.length) throw new ErrorDeCampana(`El texto tiene un problema: ${errores[0].mensaje}`, 400, 'PLANTILLA_CON_ERRORES');

    const ids = await idsDelGrupo(campana.filters ?? {}, campana.category, ahora);
    if (ids.length === 0) throw new ErrorDeCampana('El grupo no tiene a nadie que pueda recibir este correo.', 400, 'GRUPO_VACIO');
    if (ids.length > MAXIMO_POR_CAMPANA) {
      throw new ErrorDeCampana(`El grupo tiene ${ids.length} personas y el máximo por campaña es ${MAXIMO_POR_CAMPANA}. Revisá los filtros.`, 400, 'GRUPO_DEMASIADO_GRANDE', { total: ids.length });
    }
    if (Number(confirmaTotal) !== ids.length) {
      throw new ErrorDeCampana(`El grupo cambió: ahora son ${ids.length} personas (vos viste ${Number(confirmaTotal) || 0}). Revisalo y confirmá de nuevo.`, 409, 'CAMBIO_EL_TOTAL', { total: ids.length });
    }

    // Una sola persona puede pasar de «borrador» a «enviando»: el UPDATE condicional es el candado (dos clics a la vez no mandan dos veces).
    const [tomada] = await EmailCampaign.update({ status: 'sending', startedAt: ahora, totalRecipients: ids.length } as never, { where: { id, status: 'draft' } });
    if (tomada === 0) throw new ErrorDeCampana('Esta campaña ya se está enviando.', 409, 'CAMPANA_YA_ENVIADA');

    for (let i = 0; i < ids.length; i += 500) {
      await EmailCampaignRecipient.bulkCreate(ids.slice(i, i + 500).map((userId) => ({ campaignId: id, userId, status: 'pending' }) as never), { ignoreDuplicates: true });
    }
    const actualizada = await EmailCampaign.findByPk(id);
    return { campana: actualizada as EmailCampaign, total: ids.length };
  });
}

export async function cancelarCampana(id: string, ahora: Date = new Date()): Promise<EmailCampaign> {
  return conSistema(async () => {
    const campana = await EmailCampaign.findByPk(id);
    if (!campana) throw new ErrorDeCampana('La campaña no existe.', 404);
    if (campana.status === 'sent' || campana.status === 'cancelled') throw new ErrorDeCampana('Esta campaña ya terminó.', 409, 'CAMPANA_TERMINADA');
    const [cambio] = await EmailCampaign.update({ status: 'cancelled', cancelledAt: ahora, finishedAt: ahora } as never, { where: { id, status: { [Op.in]: ['draft', 'sending'] } } });
    if (cambio === 0) throw new ErrorDeCampana('Esta campaña ya terminó.', 409, 'CAMPANA_TERMINADA');
    await EmailCampaignRecipient.update({ status: 'skipped', error: 'Campaña cancelada' } as never, { where: { campaignId: id, status: 'pending' } });
    await recontar(id);
    return (await EmailCampaign.findByPk(id)) as EmailCampaign;
  });
}

/** Pone en la campaña los números reales (se cuentan de las filas: nunca quedan desfasados). */
async function recontar(id: string): Promise<void> {
  const filas = (await sequelize.query('SELECT status, COUNT(*)::int AS n FROM email_campaign_recipients WHERE campaign_id = :id GROUP BY status', {
    replacements: { id },
    type: QueryTypes.SELECT,
  })) as Array<{ status: string; n: number }>;
  const n = (s: string) => filas.find((f) => f.status === s)?.n ?? 0;
  await EmailCampaign.update({ sentCount: n('sent'), failedCount: n('failed'), skippedCount: n('skipped') } as never, { where: { id } });
}

// ───────────────────────────── el barrido (cada minuto)

interface Reclamado {
  id: string;
  user_id: string;
}

/**
 * Manda la tanda de este minuto de cada campaña que está enviando. Cada destinatario se reclama con `FOR UPDATE SKIP LOCKED` (dos barridos a la vez no mandan el mismo).
 * Devuelve cuántos correos salieron.
 */
export async function procesarCampanas(ahora: Date = new Date()): Promise<number> {
  return conSistema(async () => {
    // Un envío cortado a la mitad (el proceso se reinició) no se reintenta solo: podría haber salido. Se anota y alguien decide.
    await sequelize.query(
      `UPDATE email_campaign_recipients SET status = 'failed', error = 'Se cortó mientras se enviaba: revisá si le llegó antes de reenviar', updated_at = NOW()
        WHERE status = 'sending' AND updated_at < CAST(:corte AS timestamptz)`,
      { replacements: { corte: new Date(ahora.getTime() - MINUTOS_PARA_DAR_POR_CORTADO * 60_000).toISOString() } },
    );

    const campanas = await EmailCampaign.findAll({ where: { status: 'sending' }, order: [['startedAt', 'ASC']] });
    let presupuesto = MAXIMO_POR_MINUTO_EN_TOTAL;
    let enviados = 0;

    for (const c of campanas) {
      if (presupuesto <= 0) break;
      const cupo = Math.min(CORREOS_POR_MINUTO[c.pace] ?? 3, presupuesto);
      const reclamados = (await sequelize.query(
        `UPDATE email_campaign_recipients SET status = 'sending', updated_at = NOW()
          WHERE id IN (SELECT id FROM email_campaign_recipients WHERE campaign_id = :id AND status = 'pending' ORDER BY created_at, id LIMIT :cupo FOR UPDATE SKIP LOCKED)
        RETURNING id, user_id`,
        { replacements: { id: c.id, cupo }, type: QueryTypes.SELECT },
      )) as Reclamado[];
      presupuesto -= reclamados.length;

      for (const r of reclamados) {
        const resultado = await mandarUno(c, r.user_id);
        await EmailCampaignRecipient.update(
          { status: resultado.estado, error: resultado.error ?? null, sentAt: resultado.estado === 'sent' ? new Date() : null } as never,
          { where: { id: r.id } },
        );
        if (resultado.estado === 'sent') enviados += 1;
      }

      await recontar(c.id);
      const [{ quedan }] = (await sequelize.query(`SELECT COUNT(*)::int AS quedan FROM email_campaign_recipients WHERE campaign_id = :id AND status IN ('pending', 'sending')`, {
        replacements: { id: c.id },
        type: QueryTypes.SELECT,
      })) as Array<{ quedan: number }>;
      if (quedan === 0) await EmailCampaign.update({ status: 'sent', finishedAt: ahora } as never, { where: { id: c.id, status: 'sending' } });
    }
    return enviados;
  });
}

async function mandarUno(c: EmailCampaign, userId: string): Promise<{ estado: 'sent' | 'failed' | 'skipped'; error?: string }> {
  try {
    // Se vuelve a mirar a la persona en este momento: una baja, una suspensión o un cambio de preferencias posterior se respeta.
    const user = await User.findOne({ where: { [Op.and]: [{ id: userId }, dondeDelGrupo({}, c.category)] }, attributes: ['id', 'name', 'email'] });
    if (!user) return { estado: 'skipped', error: 'Ya no corresponde enviarle (se dio de baja, fue suspendida o cambió sus preferencias)' };
    const datos = datosDeLaPersona(user);
    const correo = armarCorreo(comoPlantilla(c), datos);
    const salio = await emailService.sendEmail({ to: String(user.email), subject: correo.asunto, html: correo.html, text: correo.texto, headers: cabecerasDeBaja(enlaceDeBajaDeUnToque(String(user.id))) });
    return salio ? { estado: 'sent' } : { estado: 'failed', error: 'El servidor de correo no lo aceptó' };
  } catch (e) {
    // Sin correos ni números largos en el error guardado (CLAUDE.md, regla 6).
    return { estado: 'failed', error: limpiarTextoLibre((e as Error)?.message ?? 'Error', 250) };
  }
}

// ───────────────────────────── lectura para la pantalla

export interface ResumenDeCampana {
  id: string;
  name: string;
  status: string;
  category: string;
  templateName: string | null;
  audienceName: string | null;
  subject: string;
  pace: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export function resumirCampana(c: EmailCampaign): ResumenDeCampana {
  const hechos = c.sentCount + c.failedCount + c.skippedCount;
  return {
    id: String(c.id),
    name: c.name,
    status: c.status,
    category: c.category,
    templateName: c.templateName ?? null,
    audienceName: c.audienceName ?? null,
    subject: c.subject,
    pace: c.pace,
    total: c.totalRecipients,
    sent: c.sentCount,
    failed: c.failedCount,
    skipped: c.skippedCount,
    pending: c.status === 'sending' ? Math.max(0, c.totalRecipients - hechos) : 0,
    createdAt: c.createdAt,
    startedAt: c.startedAt ?? null,
    finishedAt: c.finishedAt ?? null,
  };
}

export async function cuantasPersonasAlcanza(filtros: FiltrosDeGrupo, categoria: CategoriaDeCorreo): Promise<number> {
  return contarGrupo(filtros, categoria);
}
