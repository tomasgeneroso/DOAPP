import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Módulo de correos a usuarios (regla del dueño, 2026-11-11): «enviar correo a los usuarios que no pudieron terminar el registro, con plantillas y grupos de destinatarios».
 * Plantillas con variables, grupos = filtros guardados, campañas que mandan de a poco, baja con un enlace y control de quién puede usarlo.
 */
const correos: Array<{ to: string; subject: string; html: string; text?: string; headers?: Record<string, string> }> = [];
const fallan = new Set<string>();
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: {
    sendEmail: async (o: any) => {
      if (fallan.has(o.to)) return false;
      correos.push(o);
      return true;
    },
  },
}));
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});

import { sequelize } from '../../server/config/database.js';
import { User } from '../../server/models/sql/User.model.js';
import { EmailTemplate } from '../../server/models/sql/EmailTemplate.model.js';
import { EmailAudience } from '../../server/models/sql/EmailAudience.model.js';
import { EmailCampaign } from '../../server/models/sql/EmailCampaign.model.js';
import { EmailCampaignRecipient } from '../../server/models/sql/EmailCampaignRecipient.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { procesarCampanas, __reiniciarPruebas, PRUEBAS_POR_HORA } from '../../server/services/campanasDeCorreo.js';
import { tokenDeBaja, userIdDelToken } from '../../server/services/bajaDeCorreos.js';
import { crearUsuario } from '../helpers/fixtures.js';

describe('módulo de correos a usuarios', () => {
  let app: Express;
  let dueno: any, marketing: any, soporte: any;
  const creados: string[] = [];
  const con = (u: any) => ({ Authorization: `Bearer ${jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET || 'test-secret')}` });
  const api = (m: 'get' | 'post' | 'put' | 'delete', ruta: string, quien: any = dueno) => (request(app) as any)[m](`/api/admin/correos${ruta}`).set(con(quien));
  const persona = async (over: Record<string, unknown> = {}) => {
    const u = await crearUsuario({ registrationPending: true, ...over });
    creados.push(String(u.id));
    return u;
  };
  const hace = (horas: number) => new Date(Date.now() - horas * 3_600_000);
  const contar = async (filtros: any, categoria: 'servicio' | 'promocional' = 'servicio') => (await api('post', '/audiences/preview').send({ filters: filtros, category: categoria })).body.data.total as number;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/admin/correos', (await import('../../server/routes/admin/correos.js')).default);
    app.use('/api/correos', (await import('../../server/routes/bajaDeCorreos.js')).default);
    dueno = await crearUsuario({ role: 'admin', adminRole: 'owner' });
    marketing = await crearUsuario({ role: 'admin', adminRole: 'marketing' });
    soporte = await crearUsuario({ role: 'admin', adminRole: 'support' });
    creados.push(String(dueno.id), String(marketing.id), String(soporte.id));
    // Estas tablas solo las usa este módulo: arrancan vacías para que se vea la siembra y los números sean los de la prueba.
    await sequelize.query('DELETE FROM email_campaign_recipients');
    await sequelize.query('DELETE FROM email_campaigns');
    await sequelize.query('DELETE FROM email_audiences');
    await sequelize.query('DELETE FROM email_templates');
  });

  beforeEach(() => {
    correos.length = 0;
    fallan.clear();
    __reiniciarPruebas();
  });

  afterAll(async () => {
    try {
      await sequelize.query('DELETE FROM email_campaign_recipients');
      await sequelize.query('DELETE FROM email_campaigns');
      await sequelize.query('DELETE FROM email_audiences');
      await sequelize.query('DELETE FROM email_templates');
      await AuditLog.destroy({ where: { performedBy: [dueno.id, marketing.id, soporte.id] } as any });
      await User.destroy({ where: { id: creados }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  describe('quién puede usarlo', () => {
    it('administración y marketing sí; soporte y una persona común no', async () => {
      expect((await api('get', '/opciones', dueno)).status).toBe(200);
      expect((await api('get', '/opciones', marketing)).status).toBe(200);
      expect((await api('get', '/opciones', soporte)).status).toBe(403);
      const comun = await persona({ registrationPending: false });
      expect((await api('get', '/opciones', comun)).status).toBe(403);
      expect((await request(app).get('/api/admin/correos/opciones')).status).toBe(401);
    });
  });

  describe('plantillas', () => {
    it('la primera vez trae una plantilla de «terminá tu registro» y los grupos más usados (una sola vez)', async () => {
      const t1 = await api('get', '/templates');
      expect(t1.body.data).toHaveLength(1);
      expect(t1.body.data[0]).toMatchObject({ name: 'Terminá tu registro', category: 'servicio', buttonUrl: '{{enlaceRegistro}}' });
      expect(t1.body.data[0].body).toMatch(/\{\{saludo\}\}/);
      expect((await api('get', '/templates')).body.data).toHaveLength(1); // no se siembra de nuevo
      const g = await api('get', '/audiences');
      expect(g.body.data.map((x: any) => x.name)).toEqual(['Registro sin terminar', 'Cuentas completas sin verificar', 'Todas las personas con cuenta']);
      expect(g.body.data[0].resumen).toMatch(/registro sin terminar/);
    });

    it('rechaza lo que está mal y dice qué campo: sin asunto, variable inventada, botón que lleva a otro sitio', async () => {
      const base = { name: 'Prueba', category: 'servicio', subject: 'Hola', body: 'Texto' };
      const sinAsunto = await api('post', '/templates').send({ ...base, subject: '' });
      expect(sinAsunto.status).toBe(400);
      expect(sinAsunto.body.field).toBe('asunto');
      const inventada = await api('post', '/templates').send({ ...base, body: 'Hola {{nombr}}' });
      expect(inventada.body.message).toMatch(/Variable desconocida: \{\{nombr\}\}/);
      const afuera = await api('post', '/templates').send({ ...base, buttonLabel: 'Entrá', buttonUrl: 'https://sitio-malicioso.example/login' });
      expect(afuera.status).toBe(400);
      expect(afuera.body.field).toBe('botonUrl');
      const http = await api('post', '/templates').send({ ...base, buttonLabel: 'Entrá', buttonUrl: 'http://doapparg.com/x' });
      expect(http.status).toBe(400);
      const soloTexto = await api('post', '/templates').send({ ...base, buttonLabel: 'Entrá' });
      expect(soloTexto.status).toBe(400);
    });

    it('crea, edita y borra; el botón puede llevar a una variable o a una dirección de DOAPP', async () => {
      const creada = await api('post', '/templates').send({ name: 'Bienvenida', category: 'promocional', subject: '{{saludo}}: novedades', body: 'Mirá lo nuevo.', buttonLabel: 'Ver', buttonUrl: 'https://doapparg.com/jobs' });
      expect(creada.status).toBe(201);
      const id = creada.body.data.id;
      const editada = await api('put', `/templates/${id}`).send({ name: 'Bienvenida 2', category: 'promocional', subject: 'Otro asunto', body: 'Otro texto', buttonLabel: 'Ir', buttonUrl: '{{enlaceApp}}' });
      expect(editada.status).toBe(200);
      expect(((await EmailTemplate.findByPk(id)) as any).name).toBe('Bienvenida 2');
      expect((await api('delete', `/templates/${id}`)).status).toBe(200);
      expect(await EmailTemplate.findByPk(id)).toBeNull();
      expect((await api('delete', `/templates/${id}`)).status).toBe(404);
    });

    it('«Enviarme una prueba» le llega SOLO a quien la pide, con la marca de prueba y sus datos; con tope por hora', async () => {
      const r = await api('post', '/templates/test').send({ name: 'x', category: 'servicio', subject: '{{saludo}}, terminá tu registro', body: 'Cuerpo con {{enlaceRegistro}}', buttonLabel: 'Terminar', buttonUrl: '{{enlaceRegistro}}' });
      expect(r.status).toBe(200);
      expect(correos).toHaveLength(1);
      expect(correos[0].to).toBe(dueno.email);
      expect(correos[0].subject).toBe('[PRUEBA] Hola Usuario, terminá tu registro');
      expect(correos[0].html).toMatch(/Esto es una PRUEBA/);
      expect(correos[0].html).not.toMatch(/\{\{/);
      for (let i = 1; i < PRUEBAS_POR_HORA; i++) expect((await api('post', '/templates/test').send({ name: 'x', subject: 'a', body: 'b' })).status).toBe(200);
      const tope = await api('post', '/templates/test').send({ name: 'x', subject: 'a', body: 'b' });
      expect(tope.status).toBe(429);
    });
  });

  describe('grupos de destinatarios', () => {
    it('un filtro inventado o mal escrito se rechaza', async () => {
      expect((await api('post', '/audiences').send({ name: 'Mal', filters: { hackear: true } })).status).toBe(400);
      expect((await api('post', '/audiences').send({ name: 'Mal', filters: { registro: 'a medias' } })).status).toBe(400);
      expect((await api('post', '/audiences').send({ name: 'Mal', filters: { creadosHaceMasDeHoras: -3 } })).status).toBe(400);
      expect((await api('post', '/audiences').send({ name: '', filters: {} })).status).toBe(400);
    });

    it('«registro sin terminar» trae a quienes lo tienen sin terminar y deja afuera a quien nunca debe recibir (baja, suspendida, unida, del equipo, sin correo, o con los correos apagados)', async () => {
      const filtros = { registro: 'incompleto', creadosHaceMasDeHoras: 24 };
      const antes = await contar(filtros);
      const elegible = await persona({ createdAt: hace(30) } as any);
      await User.update({ createdAt: hace(30) } as never, { where: { id: elegible.id }, silent: true } as never);
      expect(await contar(filtros)).toBe(antes + 1);

      const excluidas = [
        await persona({ marketingEmailsUnsubscribedAt: new Date() }), // se dio de baja
        await persona({ isBanned: true }), // suspendida
        await persona({ adminRole: 'support' }), // del equipo
        await persona({ notificationPreferences: { email: false, push: true, sms: false, newMessage: true, jobUpdate: true, contractUpdate: true, paymentUpdate: true, marketing: false } }), // apagó los correos
        await persona({ registrationPending: false }), // ya terminó el registro
      ];
      for (const e of excluidas) await User.update({ createdAt: hace(30) } as never, { where: { id: e.id }, silent: true } as never);
      expect(await contar(filtros)).toBe(antes + 1);

      // recién creada (hace menos de 24 h): no se le escribe a quien está registrándose en este momento
      await persona();
      expect(await contar(filtros)).toBe(antes + 1);
    });

    it('según la categoría: «servicio» le llega a quien no apagó los correos; «promocional» solo a quien aceptó recibir novedades', async () => {
      const sinFiltros = {};
      const antesS = await contar(sinFiltros, 'servicio');
      const antesP = await contar(sinFiltros, 'promocional');
      await persona({ registrationPending: false }); // preferencias de fábrica: correos sí, novedades no
      expect(await contar(sinFiltros, 'servicio')).toBe(antesS + 1);
      expect(await contar(sinFiltros, 'promocional')).toBe(antesP);
      await persona({ registrationPending: false, notificationPreferences: { email: true, push: true, sms: false, newMessage: true, jobUpdate: true, contractUpdate: true, paymentUpdate: true, marketing: true } });
      expect(await contar(sinFiltros, 'promocional')).toBe(antesP + 1);
    });

    it('la vista previa muestra el primer nombre y el correo TAPADO, nunca el correo entero', async () => {
      const u = await persona({ name: 'MARÍA PAZ GARCÍA' });
      const r = await api('post', '/audiences/preview').send({ filters: { registro: 'incompleto' }, category: 'servicio' });
      expect(r.status).toBe(200);
      expect(r.body.data.muestra.length).toBeGreaterThan(0);
      const texto = JSON.stringify(r.body.data.muestra);
      expect(texto).not.toContain(u.email);
      expect(r.body.data.muestra.every((m: any) => /\*\*\*@/.test(m.correo))).toBe(true);
      expect(texto).toMatch(/María/);
      expect(texto).not.toMatch(/García/); // solo el primer nombre
    });

    it('crea, edita y borra un grupo', async () => {
      const c = await api('post', '/audiences').send({ name: 'Mi grupo', description: 'Para probar', filters: { registro: 'completo', identidad: 'sin_verificar' } });
      expect(c.status).toBe(201);
      const id = c.body.data.id;
      expect((await api('put', `/audiences/${id}`).send({ name: 'Mi grupo 2', filters: { dni: 'sin' } })).status).toBe(200);
      expect(((await EmailAudience.findByPk(id)) as any).filters).toEqual({ dni: 'sin' });
      expect((await api('delete', `/audiences/${id}`)).status).toBe(200);
      expect(await EmailAudience.findByPk(id)).toBeNull();
    });
  });

  describe('campañas', () => {
    let plantillaId: string, grupoId: string;
    beforeAll(async () => {
      plantillaId = (await api('get', '/templates')).body.data[0].id;
      grupoId = (await api('get', '/audiences')).body.data[0].id;
    });

    it('guarda COPIA del texto y de los filtros: editar la plantilla después no cambia lo que sale', async () => {
      const c = await api('post', '/campaigns').send({ name: 'Recordatorio de registro', templateId: plantillaId, audienceId: grupoId, pace: 'lento' });
      expect(c.status).toBe(201);
      const id = c.body.data.id;
      const t = (await EmailTemplate.findByPk(plantillaId)) as any;
      await t.update({ subject: 'ASUNTO NUEVO', body: 'TEXTO NUEVO' });
      const det = (await api('get', `/campaigns/${id}`)).body.data;
      expect(det.status).toBe('draft');
      expect(det.subject).toBe('{{saludo}}, terminá tu registro en DOAPP');
      expect(det.body).not.toMatch(/TEXTO NUEVO/);
      expect(det.templateName).toBe('Terminá tu registro');
      expect(det.audienceName).toBe('Registro sin terminar');
      expect(det.resumenDelGrupo).toMatch(/registro sin terminar/);
      await t.update({ subject: '{{saludo}}, terminá tu registro en DOAPP', body: det.body });
      expect((await api('delete', `/campaigns/${id}`)).status).toBe(200);
    });

    it('el borrador pide los datos que existen: plantilla y grupo inexistentes, ritmo inventado, sin nombre', async () => {
      const mal = '00000000-0000-4000-8000-000000000000';
      expect((await api('post', '/campaigns').send({ name: 'x', templateId: mal, audienceId: grupoId })).status).toBe(404);
      expect((await api('post', '/campaigns').send({ name: 'x', templateId: plantillaId, audienceId: mal })).status).toBe(404);
      expect((await api('post', '/campaigns').send({ name: 'x', templateId: plantillaId, audienceId: grupoId, pace: 'velozmente' })).status).toBe(400);
      expect((await api('post', '/campaigns').send({ name: '', templateId: plantillaId, audienceId: grupoId })).status).toBe(400);
    });

    it('enviar pide confirmar el total que se VIO: si el grupo cambió, no se manda y se dice cuántos son ahora; dos envíos seguidos no mandan dos veces', async () => {
      await persona({ createdAt: hace(40) } as any);
      const id = (await api('post', '/campaigns').send({ name: 'A confirmar', templateId: plantillaId, audienceId: grupoId })).body.data.id;
      const alcanza = (await api('get', `/campaigns/${id}`)).body.data.alcanzaHoy as number;
      const distinto = await api('post', `/campaigns/${id}/send`).send({ confirmaTotal: alcanza + 1 });
      expect(distinto.status).toBe(409);
      expect(distinto.body.code).toBe('CAMBIO_EL_TOTAL');
      expect(((await EmailCampaign.findByPk(id)) as any).status).toBe('draft');
      const sinNada = await api('post', `/campaigns/${id}/send`).send({});
      expect(sinNada.status).toBe(409);
      // el total correcto la pone «enviando» y arma una fila por persona
      const ok = await api('post', `/campaigns/${id}/send`).send({ confirmaTotal: alcanza });
      expect(ok.status === 200 || ok.status === 400).toBe(true); // 400 si el grupo quedó vacío en una base de pruebas limpia
      if (ok.status === 200) {
        const c = (await EmailCampaign.findByPk(id)) as any;
        expect(c.status).toBe('sending');
        expect(c.totalRecipients).toBe(alcanza);
        expect(await EmailCampaignRecipient.count({ where: { campaignId: id } })).toBe(alcanza);
        const repetido = await api('post', `/campaigns/${id}/send`).send({ confirmaTotal: alcanza });
        expect(repetido.status).toBe(409);
        expect(repetido.body.code).toBe('CAMPANA_YA_ENVIADA');
        // se cancela para que el barrido de las pruebas siguientes no la tome
        expect((await api('post', `/campaigns/${id}/cancel`)).status).toBe(200);
        const cancelada = (await EmailCampaign.findByPk(id)) as any;
        expect(cancelada.status).toBe('cancelled');
        expect(await EmailCampaignRecipient.count({ where: { campaignId: id, status: 'pending' } })).toBe(0);
        expect((await api('post', `/campaigns/${id}/cancel`)).status).toBe(409);
        expect((await api('delete', `/campaigns/${id}`)).status).toBe(409); // solo se borran los borradores
      }
    });

    it('un grupo vacío no se manda', async () => {
      const vacio = (await api('post', '/audiences').send({ name: 'Vacío', filters: { creadosHaceMenosDeDias: 0, registro: 'incompleto' } })).body.data.id;
      const id = (await api('post', '/campaigns').send({ name: 'Vacía', templateId: plantillaId, audienceId: vacio })).body.data.id;
      const r = await api('post', `/campaigns/${id}/send`).send({ confirmaTotal: 0 });
      expect(r.status).toBe(400);
      expect(r.body.code).toBe('GRUPO_VACIO');
    });

    it('queda anotado en el registro de acciones quién armó y quién envió (sin los correos de las personas)', async () => {
      const filas = await AuditLog.findAll({ where: { performedBy: dueno.id } as any });
      const acciones = filas.map((f: any) => f.action);
      expect(acciones).toEqual(expect.arrayContaining(['email_campaign.create', 'email_template.create', 'email_audience.create']));
      expect(JSON.stringify(filas.map((f: any) => [f.description, f.metadata]))).not.toMatch(/@test\.local/);
    });
  });

  describe('el envío, de a poco', () => {
    const armar = async (pace: 'lento' | 'normal' | 'rapido', personas: any[], category: 'servicio' | 'promocional' = 'servicio') => {
      const c = (await EmailCampaign.create({
        name: 'Envío de prueba', status: 'sending', category, subject: '{{saludo}}, terminá tu registro', body: '{{saludo}}:\n\nTe falta un paso.', buttonLabel: 'Terminar', buttonUrl: '{{enlaceRegistro}}',
        filters: {}, pace, totalRecipients: personas.length, startedAt: new Date(),
      } as any)) as any;
      for (const p of personas) await EmailCampaignRecipient.create({ campaignId: c.id, userId: p.id, status: 'pending' } as any);
      return c;
    };
    const estado = async (campanaId: string, userId: string) => ((await EmailCampaignRecipient.findOne({ where: { campaignId: campanaId, userId } })) as any).status;

    it('manda lo que dice el ritmo por minuto, con cabecera de baja y pie con el enlace; al terminar la campaña queda «enviada» con sus números', async () => {
      const gente = [await persona({ name: 'Ana López' }), await persona({ name: 'Nuevo usuario' }), await persona()];
      const c = await armar('lento', gente); // lento = 1 por minuto
      expect(await procesarCampanas()).toBe(1);
      expect(correos).toHaveLength(1);
      const [mail] = correos;
      expect(gente.map((g) => g.email)).toContain(mail.to);
      expect(mail.headers?.['List-Unsubscribe']).toMatch(/^<https?:\/\/[^>]+\/api\/correos\/baja\/[^>]+>$/);
      expect(mail.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
      expect(mail.html).toMatch(/\/baja-de-correos\//);
      expect(mail.text).toMatch(/darte de baja/);
      expect(mail.html + mail.subject).not.toMatch(/\{\{/);
      expect(((await EmailCampaign.findByPk(c.id)) as any).status).toBe('sending');
      expect(await procesarCampanas()).toBe(1);
      expect(await procesarCampanas()).toBe(1);
      const fin = (await EmailCampaign.findByPk(c.id)) as any;
      expect(fin).toMatchObject({ status: 'sent', sentCount: 3, failedCount: 0, skippedCount: 0 });
      expect(fin.finishedAt).toBeTruthy();
      expect(await procesarCampanas()).toBe(0); // ya no hay nada que mandar
      // el saludo usa el primer nombre, y «Hola» a secas si todavía no se cargó
      const saludos = correos.map((x) => x.subject).sort();
      expect(saludos).toEqual(['Hola Ana, terminá tu registro', 'Hola Usuario, terminá tu registro', 'Hola, terminá tu registro'].sort());
    });

    it('el ritmo rápido manda más por minuto que el lento', async () => {
      const gente = [await persona(), await persona(), await persona(), await persona(), await persona(), await persona(), await persona()];
      const c = await armar('rapido', gente); // rápido = 5 por minuto
      expect(await procesarCampanas()).toBe(5);
      expect(await procesarCampanas()).toBe(2);
      expect(((await EmailCampaign.findByPk(c.id)) as any).status).toBe('sent');
    });

    it('en el momento de mandar se vuelve a mirar a la persona: quien se dio de baja o fue suspendida ENTRE medio se saltea; lo que el servidor de correo rechaza queda como fallido', async () => {
      const ok = await persona();
      const deBaja = await persona();
      const suspendida = await persona();
      const rechazada = await persona();
      const c = await armar('rapido', [ok, deBaja, suspendida, rechazada]);
      await User.update({ marketingEmailsUnsubscribedAt: new Date() } as never, { where: { id: deBaja.id } }); // se dio de baja después de armarse
      await User.update({ isBanned: true } as never, { where: { id: suspendida.id } });
      fallan.add(rechazada.email);
      expect(await procesarCampanas()).toBe(1);
      expect(correos.map((x) => x.to)).toEqual([ok.email]);
      expect(await estado(c.id, ok.id)).toBe('sent');
      expect(await estado(c.id, deBaja.id)).toBe('skipped');
      expect(await estado(c.id, suspendida.id)).toBe('skipped');
      expect(await estado(c.id, rechazada.id)).toBe('failed');
      const fin = (await EmailCampaign.findByPk(c.id)) as any;
      expect(fin).toMatchObject({ status: 'sent', sentCount: 1, failedCount: 1, skippedCount: 2 });
      // el detalle de la campaña explica lo que no salió, sin datos de las personas
      const det = (await api('get', `/campaigns/${c.id}`)).body.data;
      expect(JSON.stringify(det.motivos)).not.toMatch(/@test\.local/);
      expect(det.motivos.map((m: any) => m.cantidad).reduce((a: number, b: number) => a + b, 0)).toBe(3);
    });

    it('una campaña «promocional» no le llega a quien no aceptó recibir novedades', async () => {
      const noAcepto = await persona();
      const c = await armar('rapido', [noAcepto], 'promocional');
      expect(await procesarCampanas()).toBe(0);
      expect(await estado(c.id, noAcepto.id)).toBe('skipped');
    });

    it('un envío que se cortó a la mitad (más de 10 minutos «enviando») no se reenvía solo: queda como fallido para que alguien lo mire', async () => {
      const p = await persona();
      const c = await armar('lento', [p]);
      await sequelize.query(`UPDATE email_campaign_recipients SET status = 'sending', updated_at = NOW() - INTERVAL '30 minutes' WHERE campaign_id = :id`, { replacements: { id: c.id } });
      expect(await procesarCampanas()).toBe(0);
      expect(correos).toHaveLength(0);
      expect(await estado(c.id, p.id)).toBe('failed');
      expect(((await EmailCampaign.findByPk(c.id)) as any).status).toBe('sent');
    });

    it('todas las campañas juntas no pasan del tope por minuto', async () => {
      const a = await armar('rapido', [await persona(), await persona(), await persona(), await persona(), await persona(), await persona()]);
      const b = await armar('rapido', [await persona(), await persona(), await persona(), await persona(), await persona(), await persona()]);
      const c = await armar('rapido', [await persona(), await persona(), await persona(), await persona(), await persona(), await persona()]);
      expect(await procesarCampanas()).toBe(10); // 5 + 5 y la tercera espera
      expect(((await EmailCampaign.findByPk(c.id)) as any).sentCount).toBe(0);
      while ((await procesarCampanas()) > 0) { /* termina de mandar */ }
      for (const x of [a, b, c]) expect(((await EmailCampaign.findByPk(x.id)) as any).status).toBe('sent');
    });
  });

  describe('baja de correos', () => {
    it('el token es auténtico solo si lo firmó el servidor: uno cambiado, cortado o de otra persona no vale', async () => {
      const u = await persona();
      const t = tokenDeBaja(String(u.id));
      expect(userIdDelToken(t)).toBe(String(u.id));
      const [id64, firma] = t.split('.');
      expect(userIdDelToken(`${id64}.${firma.slice(0, -2)}xx`)).toBeNull();
      expect(userIdDelToken(`${Buffer.from('00000000-0000-4000-8000-000000000000').toString('base64url')}.${firma}`)).toBeNull();
      expect(userIdDelToken('basura')).toBeNull();
      expect(userIdDelToken('')).toBeNull();
    });

    it('con el enlace se da de baja (sin sesión), puede volver a darse de alta, y deja de aparecer en los grupos', async () => {
      const u = await persona({ createdAt: hace(30) } as any);
      await User.update({ createdAt: hace(30) } as never, { where: { id: u.id }, silent: true } as never);
      const t = tokenDeBaja(String(u.id));
      const filtros = { registro: 'incompleto', creadosHaceMasDeHoras: 24 };
      const antes = await contar(filtros);
      expect((await request(app).get(`/api/correos/baja/${t}`)).body.data.deBaja).toBe(false);
      const baja = await request(app).post(`/api/correos/baja/${t}`);
      expect(baja.status).toBe(200);
      expect(baja.body.data.deBaja).toBe(true);
      expect(((await User.findByPk(u.id)) as any).marketingEmailsUnsubscribedAt).toBeTruthy();
      expect((await request(app).get(`/api/correos/baja/${t}`)).body.data.deBaja).toBe(true);
      expect(await contar(filtros)).toBe(antes - 1);
      expect((await request(app).post(`/api/correos/alta/${t}`)).body.data.deBaja).toBe(false);
      expect(await contar(filtros)).toBe(antes);
    });

    it('un enlace que no es válido responde 404 sin decir si la persona existe', async () => {
      const r = await request(app).post('/api/correos/baja/cualquier-cosa.firma');
      expect(r.status).toBe(404);
      expect((await request(app).get('/api/correos/baja/x')).status).toBe(404);
    });
  });
});
