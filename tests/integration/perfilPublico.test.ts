import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import { User } from '../../server/models/sql/User.model.js';

/**
 * Lo que el perfil publico NO puede devolver.
 *
 * Los tres endpoints de perfil (/users/:id, /users/u/:username,
 * /users/:id/profile) no piden login y devolvian email y telefono de
 * cualquier usuario. Al mismo tiempo, el formulario de registro promete que
 * el telefono "no aparece en tu perfil, no se lo damos a otros usuarios".
 * Lo que se le promete al usuario en el formulario tiene que ser verdad en
 * la API, y este test es lo que lo sostiene.
 *
 * Tambien verifica lo contrario: la marca de cancelaciones (T&C 9.4) SI se
 * devuelve mientras esta vigente, porque la escalera solo disuade si el
 * cliente la ve al elegir.
 */
describe('perfil publico', () => {
  let app: Express;
  let usuario: any;
  let marcado: any;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const usersRoutes = await import('../../server/routes/users.js');
    app.use('/api/users', usersRoutes.default);
  });

  beforeEach(async () => {
    usuario = await User.create({
      email: 'privado@perfil.test',
      name: 'Persona Privada',
      username: 'personaprivada',
      password: 'password123',
      role: 'doer',
      phone: '+5491112345678',
      dni: '12345678',
    } as any);

    marcado = await User.create({
      email: 'marcado@perfil.test',
      name: 'Trabajador Marcado',
      username: 'marcado',
      password: 'password123',
      role: 'doer',
      cancellationMarkUntil: new Date(Date.now() + 30 * 86_400_000),
    } as any);
  });

  const SENSIBLES = ['email', 'phone', 'dni', 'password', 'bankingInfo'];

  for (const ruta of [
    (u: any) => `/api/users/${u.id}`,
    (u: any) => `/api/users/u/${u.username}`,
    (u: any) => `/api/users/${u.id}/profile`,
  ]) {
    it(`${ruta({ id: ':id', username: ':username' })} no devuelve datos de contacto ni de identidad`, async () => {
      const res = await request(app).get(ruta(usuario));
      expect(res.status).toBe(200);
      const cuerpo = res.body.user || res.body.data;
      expect(cuerpo).toBeTruthy();
      for (const campo of SENSIBLES) {
        if (campo in cuerpo && cuerpo[campo] !== undefined) {
          throw new Error(`${ruta(usuario)} devuelve "${campo}" a un visitante sin login: ${JSON.stringify(cuerpo[campo])}`);
        }
      }
      // Pero si es un perfil: nombre y calificacion tienen que estar.
      expect(cuerpo.name).toBe('Persona Privada');
    });
  }

  it('devuelve la marca de cancelaciones mientras esta vigente', async () => {
    const res = await request(app).get(`/api/users/${marcado.id}`);
    expect(res.status).toBe(200);
    expect(res.body.user.cancellationMarkUntil).toBeTruthy();
    expect(new Date(res.body.user.cancellationMarkUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it('no devuelve la marca si ya vencio', async () => {
    await marcado.update({ cancellationMarkUntil: new Date(Date.now() - 86_400_000) });
    const res = await request(app).get(`/api/users/${marcado.id}`);
    expect(res.body.user.cancellationMarkUntil).toBeNull();
  });
});
