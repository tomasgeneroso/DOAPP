import { describe, it, expect, afterAll } from '@jest/globals';

/**
 * SEC-01 en `ActionPassword` (la contraseña de las acciones del dueño: cambiar de fase, promover a producción, pago al terminar).
 *
 * Guardaba el hash de la contraseña y el del token de recuperación sin ninguna protección: cualquier consulta sin `attributes` explícitos los
 * devolvía, y bastaba una ruta que serializara la fila para filtrarlos. Ahora ninguna consulta por defecto los trae; quien los necesita (verificar,
 * restablecer) pide `ActionPassword.scope('withSecrets')`, y ni así salen al serializar.
 */
import { ActionPassword } from '../../server/models/sql/ActionPassword.model.js';
import {
  ACTIONS,
  createActionPassword,
  verifyActionPassword,
  startActionPasswordReset,
  completeActionPasswordReset,
} from '../../server/services/actionPassword.js';

const ACCION = ACTIONS.PAYMENT_MODE;

describe('ActionPassword: los hashes no salen por defecto', () => {
  afterAll(async () => {
    await ActionPassword.destroy({ where: { action: ACCION } }).catch(() => undefined);
  });

  it('crear la contraseña y consultar la fila sin pedir los secretos: no trae ningún hash', async () => {
    await ActionPassword.destroy({ where: { action: ACCION } });
    expect((await createActionPassword(ACCION, 'una-clave-larga')).ok).toBe(true);

    const fila: any = await ActionPassword.findByPk(ACCION);
    const todas: any[] = await ActionPassword.findAll({ where: { action: ACCION } });

    expect(fila.action).toBe(ACCION);
    expect([fila.passwordHash, fila.resetTokenHash]).toEqual([undefined, undefined]);
    expect([todas[0].passwordHash, todas[0].resetTokenHash]).toEqual([undefined, undefined]);
    expect(JSON.stringify(fila)).not.toMatch(/\$2[aby]\$|passwordHash|resetTokenHash/);
  });

  it('con el scope «withSecrets» el hash está para verificar, pero al serializar la fila tampoco sale', async () => {
    const fila: any = await ActionPassword.scope('withSecrets').findByPk(ACCION);

    expect(String(fila.passwordHash)).toMatch(/^\$2[aby]\$/);
    expect(await fila.compare('una-clave-larga')).toBe(true);
    expect(Object.keys(fila.toJSON() as object)).not.toEqual(expect.arrayContaining(['passwordHash']));
    expect(JSON.stringify(fila)).not.toMatch(/\$2[aby]\$|passwordHash|resetTokenHash/);
  });

  it('una fila cargada sin los secretos no se compara en silencio: avisa qué falta', async () => {
    const fila: any = await ActionPassword.findByPk(ACCION);

    await expect(fila.compare('una-clave-larga')).rejects.toThrow(/withSecrets/);
  });

  it('verificar la contraseña sigue funcionando: la correcta pasa, la equivocada no', async () => {
    expect(await verifyActionPassword(ACCION, 'una-clave-larga')).toBe(true);
    expect(await verifyActionPassword(ACCION, 'otra-clave-larga')).toBe(false);
    expect(await verifyActionPassword(ACCION, '')).toBe(false);
  });

  it('el restablecimiento por correo sigue funcionando: un token ajeno no sirve, el correcto cambia la clave y se usa una sola vez', async () => {
    const token = await startActionPasswordReset(ACCION);
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    expect((await completeActionPasswordReset(ACCION, 'f'.repeat(64), 'clave-nueva-larga')).ok).toBe(false);
    expect((await completeActionPasswordReset(ACCION, token as string, 'clave-nueva-larga')).ok).toBe(true);

    expect(await verifyActionPassword(ACCION, 'clave-nueva-larga')).toBe(true);
    expect(await verifyActionPassword(ACCION, 'una-clave-larga')).toBe(false);
    const fila: any = await ActionPassword.scope('withSecrets').findByPk(ACCION);
    expect(fila.resetTokenHash).toBeNull();
    expect((await completeActionPasswordReset(ACCION, token as string, 'otra-mas-larga')).ok).toBe(false); // ya no hay recuperación pendiente
  });
});
