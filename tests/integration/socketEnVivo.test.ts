import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';

/**
 * El tiempo real, con sockets de verdad (servidor y clientes socket.io), no con emisores de mentira.
 *
 * Lo que se arregló y se prueba acá:
 * - Los avisos van a TODAS las pestañas y dispositivos de una persona. Antes el servidor guardaba UN socket por persona (el último que se conectó): con dos
 *   pestañas abiertas, la primera se quedaba sin avisos, y al cerrar una la persona figuraba «desconectada» para las dos.
 * - Los avisos de administración (pagos, retiros, contratos, trabajos con datos de otras personas) llegan sólo al equipo. Antes se emitían a TODOS los conectados.
 * - Una notificación creada en cualquier camino llega en vivo a quien corresponde (el enganche del modelo, conectado a los sockets reales).
 */
import { createServer, Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';
import { io as clienteSocket, Socket } from 'socket.io-client';
import { config } from '../../server/config/env.js';
import { SocketService } from '../../server/services/socket.js';
import { User } from '../../server/models/sql/User.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import { registrarAvisosEnVivo } from '../../server/services/avisosEnVivo.js';
import { instalarAvisosPorCambios } from '../../server/services/avisosPorCambios.js';
import { crearUsuario } from '../helpers/fixtures.js';

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('tiempo real con sockets reales', () => {
  let http: HttpServer;
  let servicio: SocketService;
  let url: string;
  let ana: any;
  let beto: any;
  let admin: any;
  const abiertos: Socket[] = [];

  const token = (u: any) => jwt.sign({ id: u.id, email: u.email }, config.jwtSecret);

  /** Abre una pestaña de esa persona y espera a que quede conectada. */
  const abrir = async (u: any): Promise<Socket> => {
    const s = clienteSocket(url, { auth: { token: token(u) }, transports: ['websocket'], reconnection: false, forceNew: true });
    abiertos.push(s);
    await new Promise<void>((resolver, rechazar) => {
      s.once('connect', () => resolver());
      s.once('connect_error', (e) => rechazar(e));
    });
    return s;
  };

  /** Anota todo lo que llega de ese evento. */
  const escuchar = (s: Socket, evento: string) => {
    const recibidos: any[] = [];
    s.on(evento, (datos) => recibidos.push(datos));
    return recibidos;
  };

  beforeAll(async () => {
    http = createServer();
    servicio = new SocketService(http);
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;

    registrarAvisosEnVivo({
      aUsuario: (id, evento, datos) => servicio.broadcastToUser(id, evento, datos),
      aSala: (sala, evento, datos) => servicio.emitToRoom(sala, evento, datos),
    });
    instalarAvisosPorCambios();

    ana = await crearUsuario({ role: 'client' });
    beto = await crearUsuario({ role: 'doer' });
    admin = await crearUsuario({ role: 'client', adminRole: 'admin' });
  });

  // Cada prueba arranca sin pestañas abiertas de las anteriores (si no, nunca habría una «última»).
  afterEach(async () => {
    abiertos.splice(0).forEach((s) => s.disconnect());
    await esperar(200);
  });

  afterAll(async () => {
    registrarAvisosEnVivo({ aUsuario: () => {}, aSala: () => {} });
    abiertos.forEach((s) => s.disconnect());
    await new Promise<void>((r) => http.close(() => r()));
    try {
      await conSistema(async () => {
        await Notification.destroy({ where: { recipientId: [ana.id, beto.id, admin.id] }, force: true } as any);
        await User.destroy({ where: { id: [ana.id, beto.id, admin.id] }, force: true } as any);
      });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('un aviso para una persona llega a TODAS sus pestañas, no sólo a la última', async () => {
    const primera = await abrir(ana);
    const segunda = await abrir(ana);
    const enPrimera = escuchar(primera, 'prueba:aviso');
    const enSegunda = escuchar(segunda, 'prueba:aviso');
    const enBeto = escuchar(await abrir(beto), 'prueba:aviso');

    await servicio.notifyUser(ana.id, 'prueba:aviso', { n: 1 });
    await esperar(300);

    expect(enPrimera).toEqual([{ n: 1 }]);
    expect(enSegunda).toEqual([{ n: 1 }]);
    expect(enBeto).toEqual([]);
  });

  it('cerrar una pestaña no la deja «desconectada»: sólo cuando se cierra la última', async () => {
    const observador = await abrir(beto);
    const estados = escuchar(observador, 'user:status');
    const unaDeAna = await abrir(ana);
    const otraDeAna = await abrir(ana);
    await esperar(200);
    estados.length = 0;

    unaDeAna.disconnect();
    await esperar(300);
    expect(estados.filter((e) => e.userId === ana.id && e.isOnline === false)).toHaveLength(0);

    // Y a la que sigue abierta le siguen llegando los avisos.
    const recibidos = escuchar(otraDeAna, 'prueba:sigue');
    await servicio.notifyUser(ana.id, 'prueba:sigue', { ok: true });
    await esperar(200);
    expect(recibidos).toEqual([{ ok: true }]);

    otraDeAna.disconnect();
    await esperar(300);
    expect(estados.filter((e) => e.userId === ana.id && e.isOnline === false)).toHaveLength(1);
  });

  it('los avisos de administración llegan al equipo y NO a un usuario común', async () => {
    const delEquipo = escuchar(await abrir(admin), 'admin:payment:created');
    const comun = escuchar(await abrir(beto), 'admin:payment:created');
    const otroComun = escuchar(await abrir(ana), 'admin:payment:created');

    servicio.notifyNewPayment({ id: 'pago-de-otra-persona', amount: 12345 });
    await esperar(300);

    expect(delEquipo).toHaveLength(1);
    expect(comun).toHaveLength(0);
    expect(otroComun).toHaveLength(0);
  });

  it('lo mismo con los aviso de cambios de dinero (admin:cambio): sólo el equipo', async () => {
    const delEquipo = escuchar(await abrir(admin), 'admin:cambio');
    const comun = escuchar(await abrir(beto), 'admin:cambio');

    servicio.emitToRoom('admins', 'admin:cambio', { tipo: 'withdrawal', id: 'x' });
    await esperar(300);

    expect(delEquipo).toEqual([{ tipo: 'withdrawal', id: 'x' }]);
    expect(comun).toEqual([]);
  });

  it('una notificación creada por cualquier camino llega en vivo a todas las pestañas de quien corresponde', async () => {
    const enPrimera = escuchar(await abrir(ana), 'notification:new');
    const enSegunda = escuchar(await abrir(ana), 'notification:new');
    const enBeto = escuchar(await abrir(beto), 'notification:new');

    const n: any = await Notification.create({
      recipientId: ana.id, type: 'success', category: 'payment', title: 'Pago acreditado', message: 'Se acreditó tu pago', data: { origen: 'webhook' },
    } as any);
    await esperar(400);

    for (const recibidas of [enPrimera, enSegunda]) {
      expect(recibidas).toHaveLength(1);
      expect(recibidas[0]).toMatchObject({ id: n.id, title: 'Pago acreditado', category: 'payment' });
    }
    expect(enBeto).toHaveLength(0);
  });

  describe('lo que se le avisa a TODOS de un trabajo no incluye datos reservados', () => {
    const trabajoAbierto = () => ({
      id: 'trabajo-1', status: 'open', title: 'Pintar el living', price: 50000, clientId: 'dueno-1',
      addressStreet: 'Calle Falsa', addressNumber: '123', addressDetails: 'Piso 4 B', neighborhood: 'Almagro',
      client: { id: 'dueno-1', name: 'Ana', phone: '1155550000', email: 'ana@example.com' },
    });

    it('un trabajo abierto sale al muro SIN la dirección exacta ni el contacto del cliente, y la administración lo recibe completo', async () => {
      const comun = escuchar(await abrir(beto), 'jobs:refresh');
      const delEquipo = escuchar(await abrir(admin), 'admin:job:created');

      const job = trabajoAbierto();
      servicio.notifyNewJob(job);
      await esperar(300);

      expect(comun).toHaveLength(1);
      expect(comun[0]).toMatchObject({ action: 'created', jobId: 'trabajo-1', status: 'open' });
      expect(comun[0].job).toMatchObject({ title: 'Pintar el living', neighborhood: 'Almagro' });
      expect(comun[0].job.addressStreet).toBeUndefined();
      expect(comun[0].job.addressNumber).toBeUndefined();
      expect(comun[0].job.addressDetails).toBeUndefined();
      expect(comun[0].job.client).toEqual({ id: 'dueno-1', name: 'Ana' });
      // La administración sí ve el completo, y el objeto original no se modificó.
      expect(delEquipo[0].job.addressStreet).toBe('Calle Falsa');
      expect(delEquipo[0].job.client.phone).toBe('1155550000');
      expect(job.addressStreet).toBe('Calle Falsa');
    });

    it('un borrador o una publicación sin aprobar no se manda a todos: sólo su id y su estado', async () => {
      const comun = escuchar(await abrir(beto), 'jobs:refresh');
      servicio.notifyJobStatusChanged({ ...trabajoAbierto(), status: 'pending_approval' }, 'pending_payment');
      await esperar(300);
      expect(comun).toHaveLength(1);
      expect(comun[0]).toEqual({ jobId: 'trabajo-1', action: 'updated', status: 'pending_approval' });
    });

    it('las tareas y el avance de un trabajo le llegan al dueño, no a todos', async () => {
      const dueno = escuchar(await abrir(ana), 'job:updated');
      const comun = escuchar(await abrir(beto), 'jobs:refresh');
      await servicio.notifyJobUpdate('trabajo-1', ana.id, { action: 'updated', tasks: [{ id: 't1', title: 'Comprar pintura' }], progress: 50 });
      await esperar(300);
      expect(dueno[0].tasks).toHaveLength(1);
      expect(comun).toHaveLength(1);
      expect(comun[0].tasks).toBeUndefined();
      expect(comun[0].progress).toBeUndefined();
    });
  });
});
