import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

/**
 * Mensajes, notificaciones, contratos, trabajos y dinero se ven al instante, cambie quien cambie.
 *
 * Antes cada ruta avisaba a mano y se olvidaba en los demás caminos (un cron, el webhook de Mercado Pago, una devolución al saldo, una notificación creada desde
 * un servicio): la otra persona seguía mirando lo viejo hasta recargar. Ahora el MODELO avisa (`services/avisosPorCambios.ts`). Acá se prueba, sin servidor
 * ni sockets, que cada cambio avisa a las personas involucradas y a nadie más, DESPUÉS de confirmar, sin repetirse de más y sin perder ninguna notificación.
 */
import { sequelize } from '../../server/config/database.js';
import { User } from '../../server/models/sql/User.model.js';
import { Job } from '../../server/models/sql/Job.model.js';
import { Contract } from '../../server/models/sql/Contract.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { WithdrawalRequest } from '../../server/models/sql/WithdrawalRequest.model.js';
import { Payment } from '../../server/models/sql/Payment.model.js';
import { Conversation } from '../../server/models/sql/Conversation.model.js';
import { ChatMessage } from '../../server/models/sql/ChatMessage.model.js';
import { Dispute } from '../../server/models/sql/Dispute.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import { avisarJuntando, registrarAvisosEnVivo, SALA_DE_ADMINISTRACION } from '../../server/services/avisosEnVivo.js';
import { instalarAvisosPorCambios } from '../../server/services/avisosPorCambios.js';
import { crearUsuario, crearTrabajo, crearContrato, crearDisputa } from '../helpers/fixtures.js';

interface Registro {
  para: string;
  evento: string;
  datos: any;
}
interface RegistroDeSala {
  sala: string;
  evento: string;
  datos: any;
}

const CBU = '0170099220000067797370';
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Más que la ventana en la que se juntan los avisos (120 ms) y que el tiempo que tardan los ganchos en leer a los participantes.
const ASENTAR = 450;

describe('avisos en vivo por cambios en el modelo', () => {
  let cliente: any;
  let trabajador: any;
  let ajeno: any;
  let trabajo: any;
  let contrato: any;
  const usuarios: string[] = [];
  const registro: Registro[] = [];
  const salas: RegistroDeSala[] = [];

  const a = (u: any, evento: string) => registro.filter((r) => r.para === u.id && r.evento === evento);

  beforeAll(async () => {
    registrarAvisosEnVivo({
      aUsuario: (para, evento, datos) => registro.push({ para, evento, datos }),
      aSala: (sala, evento, datos) => salas.push({ sala, evento, datos }),
    });
    instalarAvisosPorCambios();

    cliente = await crearUsuario({ role: 'client' });
    trabajador = await crearUsuario({ role: 'doer' });
    ajeno = await crearUsuario({ role: 'doer' });
    usuarios.push(cliente.id, trabajador.id, ajeno.id);
    trabajo = await crearTrabajo(cliente.id, { status: 'in_progress' });
    contrato = await crearContrato({ jobId: trabajo.id, clientId: cliente.id, doerId: trabajador.id });
    await esperar(ASENTAR);
  });

  beforeEach(async () => {
    await esperar(ASENTAR);
    registro.length = 0;
    salas.length = 0;
  });

  afterAll(async () => {
    registrarAvisosEnVivo({ aUsuario: () => {}, aSala: () => {} });
    try {
      await conSistema(async () => {
        await Dispute.destroy({ where: { contractId: contrato.id }, force: true } as any);
        await Payment.destroy({ where: { payerId: usuarios }, force: true } as any);
        await WithdrawalRequest.destroy({ where: { userId: usuarios }, force: true } as any);
        await BalanceTransaction.destroy({ where: { userId: usuarios }, force: true } as any);
        await Notification.destroy({ where: { recipientId: usuarios }, force: true } as any);
        await Conversation.destroy({ where: { participants: [cliente.id, trabajador.id] } as any, force: true } as any).catch(() => {});
        await Contract.destroy({ where: { id: contrato.id }, force: true } as any);
        await Job.destroy({ where: { id: trabajo.id }, force: true } as any);
        await User.destroy({ where: { id: usuarios }, force: true } as any);
      });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  describe('notificaciones', () => {
    it('una notificación nueva llega entera a quien es de él, y a nadie más', async () => {
      const n: any = await Notification.create({
        recipientId: trabajador.id, type: 'info', category: 'contract', title: 'Contrato aprobado', message: 'El cliente aprobó tu contrato', data: { contractId: contrato.id },
      } as any);
      await esperar(ASENTAR);

      const recibidas = a(trabajador, 'notification:new');
      expect(recibidas).toHaveLength(1);
      expect(recibidas[0].datos).toMatchObject({ id: n.id, title: 'Contrato aprobado', category: 'contract', read: false });
      expect(a(cliente, 'notification:new')).toHaveLength(0);
      expect(a(ajeno, 'notification:new')).toHaveLength(0);
    });

    it('varias notificaciones seguidas llegan TODAS (no se juntan: cada una trae su contenido)', async () => {
      await Promise.all(
        [1, 2, 3].map((i) =>
          Notification.create({ recipientId: cliente.id, type: 'info', category: 'payment', title: `Pago ${i}`, message: `Se acreditó el pago ${i}` } as any),
        ),
      );
      await esperar(ASENTAR);
      const titulos = a(cliente, 'notification:new').map((r) => r.datos.title).sort();
      expect(titulos).toEqual(['Pago 1', 'Pago 2', 'Pago 3']);
    });

    it('crear varias de una vez (bulkCreate) también avisa a cada destinatario', async () => {
      await Notification.bulkCreate([
        { recipientId: cliente.id, type: 'info', category: 'jobs', title: 'Uno', message: 'uno' },
        { recipientId: trabajador.id, type: 'info', category: 'jobs', title: 'Dos', message: 'dos' },
      ] as any);
      await esperar(ASENTAR);
      expect(a(cliente, 'notification:new').map((r) => r.datos.title)).toEqual(['Uno']);
      expect(a(trabajador, 'notification:new').map((r) => r.datos.title)).toEqual(['Dos']);
    });

    it('marcarla como leída NO es una notificación nueva: sólo pide recontar (otras pestañas, el celular)', async () => {
      const n: any = await Notification.create({ recipientId: cliente.id, type: 'info', category: 'system', title: 'Leer', message: 'leer' } as any);
      await esperar(ASENTAR);
      registro.length = 0;

      await conSistema(() => n.markAsRead());
      await esperar(ASENTAR);

      expect(a(cliente, 'notification:new')).toHaveLength(0);
      expect(a(cliente, 'notifications:refresh')).toHaveLength(1);
    });
  });

  describe('contratos y trabajos', () => {
    it('al cambiar un contrato se entera cada parte —y sólo ellas— con el id para que la pantalla abierta recargue', async () => {
      contrato.status = 'awaiting_confirmation';
      await contrato.save();
      await esperar(ASENTAR);

      for (const parte of [cliente, trabajador]) {
        const actualizados = a(parte, 'contract:updated');
        expect(actualizados.length).toBeGreaterThanOrEqual(1);
        expect(actualizados[0].datos).toMatchObject({ contractId: contrato.id, jobId: trabajo.id });
        expect(a(parte, 'contracts:refresh').length).toBeGreaterThanOrEqual(1);
        expect(a(parte, 'dashboard:refresh').length).toBeGreaterThanOrEqual(1);
        // La pantalla del trabajo muestra sus contratos: también se entera.
        expect(a(parte, 'job:updated').some((r) => r.datos.jobId === trabajo.id)).toBe(true);
      }
      expect(registro.filter((r) => r.para === ajeno.id)).toHaveLength(0);
      // Y la administración ve que algo de contratos cambió.
      expect(salas.some((s) => s.sala === SALA_DE_ADMINISTRACION && s.evento === 'admin:cambio' && s.datos.tipo === 'contract')).toBe(true);
    });

    it('un cambio en masa (el «reclamo atómico» UPDATE … WHERE) avisa con el estado de AHORA', async () => {
      const [filas] = await Contract.update({ status: 'completed' } as any, { where: { id: contrato.id, status: ['awaiting_confirmation'] } as any });
      expect(filas).toBe(1);
      await esperar(ASENTAR);

      const ultimo = a(trabajador, 'contract:updated').map((r) => r.datos).filter((d) => d.status);
      expect(ultimo.length).toBeGreaterThanOrEqual(1);
      expect(ultimo[ultimo.length - 1]).toMatchObject({ contractId: contrato.id, status: 'completed' });
      expect(a(cliente, 'contract:updated').length).toBeGreaterThanOrEqual(1);
      expect(registro.filter((r) => r.para === ajeno.id)).toHaveLength(0);
    });

    it('un cambio en masa que no toca ninguna fila no avisa a nadie', async () => {
      const [filas] = await Contract.update({ status: 'cancelled' } as any, { where: { id: contrato.id, status: ['pending'] } as any });
      expect(filas).toBe(0);
      await esperar(ASENTAR);
      expect(registro).toHaveLength(0);
    });

    it('un trabajo que cambia avisa al dueño y a los elegidos, con su id y estado', async () => {
      trabajo.status = 'completed';
      trabajo.selectedWorkers = [trabajador.id];
      await trabajo.save();
      await esperar(ASENTAR);

      expect(a(cliente, 'job:updated').some((r) => r.datos.jobId === trabajo.id && r.datos.status === 'completed')).toBe(true);
      expect(a(trabajador, 'job:updated').some((r) => r.datos.jobId === trabajo.id && r.datos.status === 'completed')).toBe(true);
      expect(a(cliente, 'myjobs:refresh').length).toBeGreaterThanOrEqual(1);
      expect(registro.filter((r) => r.para === ajeno.id)).toHaveLength(0);
    });

    it('un reclamo sobre el contrato lo ven las dos partes, y el contrato se recarga', async () => {
      const d: any = await crearDisputa({ contractId: contrato.id, initiatedBy: cliente.id, against: trabajador.id });
      await esperar(ASENTAR);

      for (const parte of [cliente, trabajador]) {
        expect(a(parte, 'dispute:updated').some((r) => r.datos.disputeId === d.id && r.datos.contractId === contrato.id)).toBe(true);
        expect(a(parte, 'contract:updated').some((r) => r.datos.contractId === contrato.id)).toBe(true);
      }
      expect(registro.filter((r) => r.para === ajeno.id)).toHaveLength(0);
      expect(salas.some((s) => s.evento === 'admin:cambio' && s.datos.tipo === 'dispute')).toBe(true);
    });
  });

  describe('después de confirmar, no antes', () => {
    it('dentro de una transacción NO avisa hasta el commit (la pantalla recargaría y vería lo viejo)', async () => {
      const t = await sequelize.transaction();
      contrato.status = 'in_progress';
      await contrato.save({ transaction: t });
      await esperar(ASENTAR);
      expect(a(trabajador, 'contract:updated')).toHaveLength(0);

      await t.commit();
      await esperar(ASENTAR);
      expect(a(trabajador, 'contract:updated').length).toBeGreaterThanOrEqual(1);
    });

    it('si la transacción se deshace, no avisa de algo que no pasó', async () => {
      const t = await sequelize.transaction();
      contrato.status = 'cancelled';
      await contrato.save({ transaction: t });
      await t.rollback();
      await esperar(ASENTAR);
      expect(registro.filter((r) => r.evento === 'contract:updated')).toHaveLength(0);
      await contrato.reload();
    });
  });

  describe('dinero', () => {
    it('un movimiento del saldo avisa a su dueño y a nadie más', async () => {
      await BalanceTransaction.create({
        userId: trabajador.id, type: 'refund', amount: 500, balanceBefore: 0, balanceAfter: 500, description: 'Devolución de prueba', status: 'completed',
      } as any);
      await esperar(ASENTAR);

      expect(a(trabajador, 'balance:updated')).toHaveLength(1);
      expect(a(trabajador, 'dashboard:refresh').length).toBeGreaterThanOrEqual(1);
      expect(registro.filter((r) => r.para !== trabajador.id)).toHaveLength(0);
    });

    it('un pago de un contrato avisa a quien paga, a quien cobra, y recarga el contrato de las dos partes', async () => {
      const p: any = await Payment.create({
        payerId: cliente.id, recipientId: trabajador.id, contractId: contrato.id, amount: 5000, amountArs: 5000, currency: 'ARS', status: 'held_escrow',
        paymentType: 'contract_payment', paymentMethod: 'bank_transfer', platformFee: 0, platformFeePercentage: 0,
      } as any);
      await esperar(ASENTAR);

      for (const parte of [cliente, trabajador]) {
        expect(a(parte, 'payment:updated').some((r) => r.datos.paymentId === p.id && r.datos.contractId === contrato.id)).toBe(true);
        expect(a(parte, 'balance:updated').length).toBeGreaterThanOrEqual(1);
        expect(a(parte, 'contract:updated').some((r) => r.datos.contractId === contrato.id)).toBe(true);
      }
      expect(registro.filter((r) => r.para === ajeno.id)).toHaveLength(0);
      expect(salas.some((s) => s.evento === 'admin:cambio' && s.datos.tipo === 'payment')).toBe(true);
    });

    it('un retiro nuevo, y su cambio de estado, los ve la persona y la administración', async () => {
      const r: any = await conSistema(() =>
        WithdrawalRequest.create({
          userId: cliente.id, amount: 1000, bankingInfo: { accountHolder: 'Persona de Prueba', bankName: 'Mercado Pago', cbu: CBU, accountType: 'savings' }, status: 'pending',
          balanceBeforeWithdrawal: 1000, balanceAfterWithdrawal: 0, metadata: {},
        } as any),
      );
      await esperar(ASENTAR);
      expect(a(cliente, 'withdrawal:updated').some((x) => x.datos.withdrawalId === r.id && x.datos.status === 'pending')).toBe(true);
      expect(a(cliente, 'balance:updated').length).toBeGreaterThanOrEqual(1);
      expect(salas.some((s) => s.evento === 'admin:cambio' && s.datos.tipo === 'withdrawal')).toBe(true);

      registro.length = 0;
      // El camino de administración: un UPDATE condicional (reclamar el paso), no una instancia.
      await conSistema(() => WithdrawalRequest.update({ status: 'approved' } as any, { where: { id: r.id, status: 'pending' } as any }));
      await esperar(ASENTAR);
      expect(a(cliente, 'withdrawal:updated').some((x) => x.datos.status === 'approved')).toBe(true);
    });
  });

  describe('mensajes', () => {
    let conversacion: any;
    beforeAll(async () => {
      conversacion = await Conversation.create({ participants: [cliente.id, trabajador.id] } as any);
    });

    it('un mensaje de SISTEMA (el contrato empezó, se acreditó el pago) llega a la conversación abierta y actualiza la lista de las dos personas', async () => {
      const m: any = await ChatMessage.create({ conversationId: conversacion.id, senderId: cliente.id, message: 'Titulo||El contrato empezó', type: 'system' } as any);
      await esperar(ASENTAR);

      const enLaSala = salas.filter((s) => s.sala === `conversation:${conversacion.id}` && s.evento === 'message:new');
      expect(enLaSala).toHaveLength(1);
      expect(enLaSala[0].datos.id).toBe(m.id);
      // Con el remitente, como el que emiten las rutas: la pantalla lo dibuja igual venga de donde venga.
      expect(enLaSala[0].datos.sender).toMatchObject({ id: cliente.id, name: cliente.name });
      for (const parte of [cliente, trabajador]) {
        expect(a(parte, 'chat:actualizado').some((r) => r.datos.conversationId === conversacion.id)).toBe(true);
      }
      expect(registro.filter((r) => r.para === ajeno.id)).toHaveLength(0);
    });

    it('un mensaje de una PERSONA actualiza la lista pero no se emite a la sala (eso lo hace el socket, con el nombre y el avatar de quien escribe)', async () => {
      await ChatMessage.create({ conversationId: conversacion.id, senderId: cliente.id, message: 'Hola, ¿cómo va el trabajo?', type: 'text' } as any);
      await esperar(ASENTAR);

      expect(salas.filter((s) => s.evento === 'message:new')).toHaveLength(0);
      for (const parte of [cliente, trabajador]) {
        expect(a(parte, 'chat:actualizado').some((r) => r.datos.conversationId === conversacion.id)).toBe(true);
      }
    });
  });

  describe('sin inundar', () => {
    it('muchos avisos «recargá» iguales seguidos salen como UNO por persona', async () => {
      for (let i = 0; i < 25; i++) avisarJuntando({ usuarios: [cliente.id, trabajador.id], evento: 'contracts:refresh' });
      await esperar(ASENTAR);
      expect(a(cliente, 'contracts:refresh')).toHaveLength(1);
      expect(a(trabajador, 'contracts:refresh')).toHaveLength(1);
    });

    it('con claves distintas (dos contratos distintos) no se juntan: cada pantalla necesita saber CUÁL cambió', async () => {
      avisarJuntando({ usuarios: [cliente.id], evento: 'contract:updated', datos: { contractId: 'A' }, clave: 'A' });
      avisarJuntando({ usuarios: [cliente.id], evento: 'contract:updated', datos: { contractId: 'B' }, clave: 'B' });
      await esperar(ASENTAR);
      expect(a(cliente, 'contract:updated').map((r) => r.datos.contractId).sort()).toEqual(['A', 'B']);
    });

    it('sin nadie registrado (pruebas, scripts) guardar no falla ni avisa', async () => {
      registrarAvisosEnVivo({ aUsuario: () => { throw new Error('sin conexión'); }, aSala: () => { throw new Error('sin conexión'); } });
      // Un emisor que revienta no puede romper el guardado que lo originó.
      const n: any = await Notification.create({ recipientId: cliente.id, type: 'info', category: 'system', title: 'Sigue funcionando', message: 'ok' } as any);
      expect(n.id).toBeTruthy();
      await esperar(ASENTAR);
      registrarAvisosEnVivo({
        aUsuario: (para, evento, datos) => registro.push({ para, evento, datos }),
        aSala: (sala, evento, datos) => salas.push({ sala, evento, datos }),
      });
    });
  });
});
