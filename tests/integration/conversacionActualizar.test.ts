import { describe, it, expect, afterAll } from '@jest/globals';
import { Conversation } from '../../server/models/sql/Conversation.model.js';
import { User } from '../../server/models/sql/User.model.js';
import { crearUsuario } from '../helpers/fixtures.js';

/**
 * Actualizar el último mensaje de una conversación fallaba con «Conversation must have at least 2 participants» (la validación corría aunque no se
 * tocaran los participantes): una cotización enviada por chat quedaba a medias. Crear una conversación con menos de 2 sigue prohibido.
 */
describe('conversaciones: participantes', () => {
  const ids: string[] = [];
  const convs: string[] = [];
  afterAll(async () => {
    try {
      await Conversation.destroy({ where: { id: convs } });
      await User.destroy({ where: { id: ids }, force: true });
    } catch {
      /* la limpieza no puede hacer fallar el test */
    }
  });

  it('actualizar el último mensaje (en bloque o sobre la instancia) no pide los participantes', async () => {
    const a: any = await crearUsuario({ role: 'client' });
    const b: any = await crearUsuario({ role: 'doer' });
    ids.push(a.id, b.id);
    const c: any = await Conversation.create({ participants: [a.id, b.id] } as any);
    convs.push(c.id);

    await expect(Conversation.update({ lastMessage: 'Cotización: algo', lastMessageAt: new Date() } as any, { where: { id: c.id }, individualHooks: false })).resolves.toBeDefined();
    expect(((await Conversation.findByPk(c.id)) as any).lastMessage).toBe('Cotización: algo');

    const viva: any = await Conversation.findByPk(c.id);
    viva.lastMessage = 'otro';
    await expect(viva.save()).resolves.toBeDefined();
  });

  it('crear una conversación con menos de 2 participantes sigue siendo un error, y cambiar la lista a una de 1 también', async () => {
    const a: any = await crearUsuario({ role: 'client' });
    ids.push(a.id);
    await expect(Conversation.create({ participants: [a.id] } as any)).rejects.toThrow(/at least 2 participants/);
    const b: any = await crearUsuario({ role: 'doer' });
    ids.push(b.id);
    const c: any = await Conversation.create({ participants: [a.id, b.id] } as any);
    convs.push(c.id);
    c.participants = [a.id];
    await expect(c.save()).rejects.toThrow(/at least 2 participants/);
  });
});
