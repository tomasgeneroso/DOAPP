import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { User } from '../../server/models/sql/User.model.js';
import { Notification } from '../../server/models/sql/Notification.model.js';
import { BalanceTransaction } from '../../server/models/sql/BalanceTransaction.model.js';
import { conSistema } from '../../server/db/contextoRls.js';
import { correrAuditoriaNocturna } from '../../server/jobs/auditoriaNocturna.js';
import { crearUsuario } from '../helpers/fixtures.js';

/**
 * La auditoría de saldos corre todas las noches y avisa a administración SOLO si encuentra algo, con el código y el enlace a la guía.
 */
describe('auditoría nocturna de saldos', () => {
  let admin: any, usuario: any;
  const avisos = () =>
    Notification.findAll({ where: { recipientId: admin.id, actionUrl: '/admin/guia-de-errores#AUDITORIA-CON-HALLAZGOS' } as any });

  beforeAll(async () => {
    admin = await crearUsuario({ role: 'admin', adminRole: 'admin' });
    usuario = await crearUsuario({ balanceArs: 1000 });
  });
  afterAll(async () => {
    try {
      await conSistema(async () => {
        await Notification.destroy({ where: { recipientId: admin.id } as any });
        await BalanceTransaction.destroy({ where: { userId: usuario.id } as any });
        await User.destroy({ where: { id: [admin.id, usuario.id] } as any, force: true });
      });
    } catch {
      /* el próximo DROP SCHEMA lo limpia */
    }
  });

  it('si todo cierra no avisa a nadie', async () => {
    const r = await correrAuditoriaNocturna();
    expect(r.hallazgos).toEqual([]);
    expect(r.avisado).toBe(false);
    expect((await avisos()).length).toBe(0);
  });

  it('si un saldo no cierra con sus movimientos, avisa con el código, el enlace a la guía y el detalle', async () => {
    await usuario.update({ balanceArs: 1750 }); // alguien tocó el saldo sin dejar asiento
    const r = await correrAuditoriaNocturna();
    expect(r.hallazgos.length).toBeGreaterThan(0);
    expect(r.avisado).toBe(true);
    const a: any[] = await avisos();
    expect(a.length).toBe(1);
    expect(a[0].message).toMatch(/AUDITORIA-CON-HALLAZGOS/);
    expect(a[0].message).toMatch(/El saldo no coincide con el libro/);
    expect(a[0].message).toMatch(/\$1\.750/);
    expect(a[0].actionText).toBe('Ver la guía');
  });

  it('corregido el descuadre, la noche siguiente no vuelve a avisar', async () => {
    await usuario.update({ balanceArs: 1000 });
    const antes = (await avisos()).length;
    const r = await correrAuditoriaNocturna();
    expect(r.avisado).toBe(false);
    expect((await avisos()).length).toBe(antes);
  });

  it('está registrada en el arranque del servidor', async () => {
    const { readFileSync } = await import('fs');
    const src = readFileSync('server/index.ts', 'utf8');
    expect(src).toMatch(/startAuditoriaNocturna\(\);/);
  });
});
