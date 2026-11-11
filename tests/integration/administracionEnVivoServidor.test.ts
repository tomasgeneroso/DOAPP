import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

/**
 * Todo el panel de administración se actualiza en vivo (regla del dueño, 2026-11-09): el servidor avisa a la sala de administración cuando cambia algo que una
 * pantalla del equipo muestra. Acá, lo que no pasa por un contrato: tickets, auditoría, personas (solo cuando cambia algo que mira administración), identidades
 * baneadas, códigos y artículos. Sin servidor ni sockets: los avisos se capturan.
 */
import { User } from '../../server/models/sql/User.model.js';
import { Ticket } from '../../server/models/sql/Ticket.model.js';
import { AuditLog } from '../../server/models/sql/AuditLog.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import { registrarAvisosEnVivo, SALA_DE_ADMINISTRACION } from '../../server/services/avisosEnVivo.js';
import { instalarAvisosPorCambios } from '../../server/services/avisosPorCambios.js';
import { crearUsuario } from '../helpers/fixtures.js';

interface RegistroDeSala {
  sala: string;
  evento: string;
  datos: any;
}
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ASENTAR = 450;

describe('administración en vivo: lo que no pasa por un contrato', () => {
  const salas: RegistroDeSala[] = [];
  const usuarios: string[] = [];
  let persona: any;
  const deAdmin = (tipo: string) => salas.filter((s) => s.sala === SALA_DE_ADMINISTRACION && s.evento === 'admin:cambio' && s.datos?.tipo === tipo);

  beforeAll(async () => {
    registrarAvisosEnVivo({ aUsuario: () => undefined, aSala: (sala, evento, datos) => salas.push({ sala, evento, datos }) });
    instalarAvisosPorCambios();
    persona = await crearUsuario({ role: 'client', kycStatus: null });
    usuarios.push(persona.id);
    await esperar(ASENTAR);
  });

  beforeEach(async () => {
    await esperar(ASENTAR);
    salas.length = 0;
  });

  afterAll(async () => {
    try {
      await conSistema(async () => {
        await Ticket.destroy({ where: { createdBy: usuarios } as any, force: true } as any).catch(() => undefined);
        await AuditLog.destroy({ where: { targetId: usuarios } as any });
        await User.destroy({ where: { id: usuarios }, force: true });
      });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('una persona nueva avisa a administración (una cuenta que se registra aparece en la lista de usuarios)', async () => {
    const nueva = await crearUsuario({ role: 'client' });
    usuarios.push(nueva.id);
    await esperar(ASENTAR);
    expect(deAdmin('user').some((s) => s.datos.id === String(nueva.id))).toBe(true);
  });

  it('un cambio que mira administración (verificación de identidad, baneo, rol) avisa; guardar otra cosa no', async () => {
    const u: any = await User.findByPk(persona.id);
    // lo primero que se guarda de cada persona fija la «huella»; después solo avisa lo que cambia
    await u.update({ bio: 'una biografía' });
    await esperar(ASENTAR);
    salas.length = 0;

    await u.update({ bio: 'otra biografía distinta', lastLogin: new Date() } as any);
    await esperar(ASENTAR);
    expect(deAdmin('user')).toHaveLength(0); // un ingreso o una biografía no mueven pantallas del equipo

    await u.update({ kycStatus: 'Approved', dniVerified: true } as any);
    await esperar(ASENTAR);
    expect(deAdmin('user').some((s) => s.datos.id === String(persona.id))).toBe(true);

    salas.length = 0;
    await u.update({ isBanned: true } as any);
    await esperar(ASENTAR);
    expect(deAdmin('user').length).toBeGreaterThanOrEqual(1);
    await u.update({ isBanned: false } as any);
  });

  it('un registro de auditoría nuevo avisa (la pantalla «Registro de acciones» se actualiza sola)', async () => {
    await AuditLog.create({
      action: 'prueba_en_vivo', category: 'user', severity: 'low', description: 'prueba', targetModel: 'User', targetId: String(persona.id), performedBy: persona.id,
    } as any).catch(async () => {
      // Algunos esquemas piden más campos: lo que importa es que el modelo avise al guardarse.
      await conSistema(() => AuditLog.create({ action: 'prueba_en_vivo', category: 'user', severity: 'low', description: 'prueba', targetId: String(persona.id) } as any));
    });
    await esperar(ASENTAR);
    expect(deAdmin('audit').length).toBeGreaterThanOrEqual(1);
  });

  it('un ticket nuevo o con cambios avisa (la bandeja de soporte se actualiza sola)', async () => {
    const t: any = await Ticket.create({
      ticketNumber: `TK-V${Math.random().toString(36).slice(2, 9)}`, createdBy: persona.id, subject: 'Prueba en vivo', category: 'support', status: 'open', priority: 'medium', messages: [], tags: [],
    } as any);
    await esperar(ASENTAR);
    expect(deAdmin('ticket').some((s) => s.datos.id === String(t.id))).toBe(true);

    salas.length = 0;
    await t.update({ status: 'in_progress' });
    await esperar(ASENTAR);
    expect(deAdmin('ticket').some((s) => s.datos.id === String(t.id))).toBe(true);
  });
});
