import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import fs from 'fs';
import path from 'path';

/**
 * Avisos de componentes caídos (pedido del dueño, 2026-11-27: «avisar si falla algún componente de la app a través del email: mapas, autenticación, fotos,
 * emails, etc.»). Contra la base real. Lo que más se cuida: que un tropiezo suelto no avise, que no lleguen correos repetidos, que avise aunque lo caído
 * sea el correo (sin quedar en un bucle) y que la ruta pública del navegador no acepte nada más que el nombre de una parte.
 */
const correos: Array<{ to: string; subject: string; html: string; text?: string }> = [];
const correoRoto = { si: false, intentos: 0 };
jest.mock('../../server/index.js', () => {
  const nada: any = new Proxy(function () {}, { get: () => nada, apply: () => nada });
  return { __esModule: true, socketService: nada };
});
jest.mock('../../server/services/email.js', () => ({
  __esModule: true,
  default: {
    sendEmail: async (c: any) => {
      correoRoto.intentos++;
      if (correoRoto.si) {
        // Igual que el servicio real: un envío que falla se anota como falla del correo.
        const { reportarFalla } = await import('../../server/services/saludDeComponentes.js');
        await reportarFalla('correos', 'El servidor de correo rechazó el usuario o la contraseña.');
        return false;
      }
      correos.push(c);
      return true;
    },
    motivoDelUltimoFallo: () => null,
    verificar: async () => null,
  },
}));

import { Notification } from '../../server/models/sql/Notification.model.js';
import { __activarAvisos, __reiniciarAvisos, ENTRE_AVISOS_MS } from '../../server/services/avisoAlDueno.js';
import {
  reportarFalla, reportarExito, anotarChequeo, reportarDesdeElNavegador, olvidarLasCalmadas, componentesCaidos, __reiniciarSalud,
  FALLAS_PARA_AVISAR, VENTANA_DE_FALLAS_MS, CONEXIONES_PARA_AVISAR, CALMA_PARA_OLVIDAR_MS, ENTRE_INTENTOS_MS,
} from '../../server/services/saludDeComponentes.js';
import { chequearLasFotos, chequearLaBase, CHEQUEOS } from '../../server/services/chequeosDeSalud.js';
import { COMPONENTES, REPORTABLES_DESDE_EL_NAVEGADOR } from '../../shared/salud/componentes.js';
import { crearUsuario } from '../helpers/fixtures.js';

const BASE = Date.UTC(2026, 10, 27, 15, 0, 0);

describe('avisos de componentes caídos', () => {
  let dueno: any;
  const alDueno = () => correos.filter((c) => c.to === dueno.email);
  const dentroDeDoapp = (titulo: string) => Notification.count({ where: { recipientId: dueno.id, title: titulo } as any });

  beforeAll(async () => {
    dueno = await crearUsuario({ role: 'admin', adminRole: 'owner' });
  });
  beforeEach(async () => {
    __activarAvisos(true);
    __reiniciarAvisos();
    __reiniciarSalud();
    correos.length = 0;
    correoRoto.si = false;
    correoRoto.intentos = 0;
    await Notification.destroy({ where: { recipientId: dueno.id } });
  });
  afterAll(() => __activarAvisos(false));

  it('un tropiezo suelto no avisa; al repetirse llega UN correo con qué falla, a quién afecta y qué hacer, y el aviso dentro de DOAPP', async () => {
    for (let i = 0; i < FALLAS_PARA_AVISAR - 1; i++) await reportarFalla('pagos', 'timeout', BASE + i * 1000);
    expect(alDueno()).toHaveLength(0);
    await reportarFalla('pagos', 'Mercado Pago respondió 500', BASE + 5000);
    expect(alDueno()).toHaveLength(1);
    expect(alDueno()[0].subject).toContain('Está fallando: Pagos');
    expect(alDueno()[0].text).toContain(COMPONENTES.pagos.afecta);
    expect(alDueno()[0].text).toContain('MERCADOPAGO_ACCESS_TOKEN');
    expect(alDueno()[0].text).toContain('Mercado Pago respondió 500');
    for (let i = 0; i < 50; i++) await reportarFalla('pagos', 'sigue', BASE + 10_000 + i * 1000);
    expect(alDueno()).toHaveLength(1);
    expect(await dentroDeDoapp('Está fallando: Pagos (Mercado Pago y otros)')).toBe(1);
  });

  it('tres tropiezos muy separados en el tiempo no son una caída', async () => {
    for (let i = 0; i < 6; i++) await reportarFalla('pagos', 'x', BASE + i * (VENTANA_DE_FALLAS_MS / 2 + 1000));
    expect(componentesCaidos()).toEqual([]);
    expect(alDueno()).toHaveLength(0);
  });

  it('si sigue caída se recuerda a las 6 horas', async () => {
    for (let i = 0; i < 3; i++) await reportarFalla('fotos', 'disco lleno', BASE + i);
    await reportarFalla('fotos', 'disco lleno', BASE + ENTRE_AVISOS_MS + 1000);
    expect(alDueno()).toHaveLength(2);
  });

  it('al volver avisa cuánto duró y cuántas fallas hubo', async () => {
    for (let i = 0; i < 4; i++) await reportarFalla('pagos', 'x', BASE + i);
    await reportarExito('pagos', BASE + 12 * 60_000);
    expect(alDueno()).toHaveLength(2);
    expect(alDueno()[1].subject).toContain('Volvió a funcionar: Pagos');
    expect(alDueno()[1].text).toContain('12 minutos');
    expect(alDueno()[1].text).toContain('4 fallas');
    expect(componentesCaidos()).toEqual([]);
  });

  it('si lo que falla es el correo: no entra en un bucle, avisa dentro de DOAPP y manda el correo cuando vuelve', async () => {
    correoRoto.si = true;
    // Acá se usa el reloj de verdad: el envío que falla se anota a sí mismo con la hora actual, como en el servidor.
    const BASE = Date.now();
    for (let i = 0; i < 3; i++) await reportarFalla('correos', 'sin conexión', BASE + i);
    expect(componentesCaidos().map((c) => c.id)).toEqual(['correos']);
    expect(await dentroDeDoapp('Está fallando: Envío de correos')).toBe(1);
    const intentos = correoRoto.intentos;
    expect(intentos).toBe(1);
    for (let i = 0; i < 40; i++) await reportarFalla('correos', 'sigue', BASE + 1000 + i);
    expect(correoRoto.intentos).toBe(intentos); // no insiste a cada falla
    await reportarFalla('correos', 'sigue', BASE + ENTRE_INTENTOS_MS + 5000);
    expect(correoRoto.intentos).toBe(intentos + 1);

    correoRoto.si = false;
    await reportarExito('correos', BASE + 40 * 60_000);
    expect(alDueno()).toHaveLength(1);
    expect(alDueno()[0].subject).toContain('Volvió a funcionar: Envío de correos');
    expect(alDueno()[0].text).toContain('no se reenvían solos');
  });

  it('un chequeo propio avisa a la segunda vez seguida; si en el medio anduvo, vuelve a contar', async () => {
    await anotarChequeo('direcciones', 'Photon respondió 503', BASE);
    await anotarChequeo('direcciones', null, BASE + 1000);
    await anotarChequeo('direcciones', 'Photon respondió 503', BASE + 2000);
    expect(alDueno()).toHaveLength(0);
    await anotarChequeo('direcciones', 'Photon respondió 503', BASE + 62_000);
    expect(alDueno()).toHaveLength(1);
    await anotarChequeo('direcciones', null, BASE + 600_000);
    expect(alDueno()).toHaveLength(2);
  });

  it('desde el navegador hacen falta conexiones distintas: una sola (bloqueador, sin señal) no avisa', async () => {
    for (let i = 0; i < 20; i++) await reportarDesdeElNavegador('mapas', 'la-misma', BASE + i);
    expect(alDueno()).toHaveLength(0);
    for (let i = 1; i < CONEXIONES_PARA_AVISAR; i++) await reportarDesdeElNavegador('mapas', `otra-${i}`, BASE + 100 + i);
    expect(alDueno()).toHaveLength(1);
    expect(alDueno()[0].subject).toContain('Está fallando: Mapas');
  });

  it('una parte sin chequeo que deja de fallar se da por buena, y la próxima falla vuelve a avisar', async () => {
    for (let i = 0; i < 3; i++) await reportarFalla('notificaciones', 'x', BASE + i);
    olvidarLasCalmadas(new Set(), BASE + CALMA_PARA_OLVIDAR_MS + 10_000);
    expect(componentesCaidos()).toEqual([]);
  });

  it('con los avisos apagados (desarrollo y pruebas) no hace nada', async () => {
    __activarAvisos(false);
    for (let i = 0; i < 10; i++) await reportarFalla('pagos', 'x', BASE + i);
    expect(componentesCaidos()).toEqual([]);
    expect(correoRoto.intentos).toBe(0);
  });

  describe('la ruta pública del navegador', () => {
    let app: Express;
    beforeAll(async () => {
      app = express();
      app.use(express.json());
      app.use('/api/salud', (await import('../../server/routes/salud.js')).default);
    });

    it('acepta solo el nombre de una parte de la lista; cualquier otra cosa es 400', async () => {
      for (const componente of REPORTABLES_DESDE_EL_NAVEGADOR) {
        expect((await request(app).post('/api/salud/falla').send({ componente })).status).toBe(202);
      }
      for (const cuerpo of [{}, { componente: 'base_de_datos' }, { componente: 'correos' }, { componente: 'persona@ejemplo.com' }, { componente: ['mapas'] }]) {
        expect((await request(app).post('/api/salud/falla').send(cuerpo)).status).toBe(400);
      }
    });

    it('tiene tope: nadie la usa para llenar de pedidos', async () => {
      const estados: number[] = [];
      for (let i = 0; i < 30; i++) estados.push((await request(app).post('/api/salud/falla').send({ componente: 'mapas' })).status);
      expect(estados).toContain(429);
    });
  });

  describe('los chequeos propios', () => {
    it('la base y la carpeta de fotos sanas contestan que andan', async () => {
      expect(await chequearLaBase()).toBeNull();
      expect(await chequearLasFotos()).toBeNull();
    });

    it('si no se puede escribir en la carpeta de fotos, lo dice', async () => {
      const archivo = path.join(process.cwd(), 'uploads', `no-es-carpeta-${Date.now()}`);
      fs.mkdirSync(path.dirname(archivo), { recursive: true });
      fs.writeFileSync(archivo, 'x');
      try {
        expect(await chequearLasFotos(path.join(archivo, 'adentro'))).toMatch(/No se puede escribir/);
      } finally {
        fs.rmSync(archivo, { force: true });
      }
    });

    it('cada chequeo es de una parte que existe', () => {
      for (const c of CHEQUEOS) expect(Object.keys(COMPONENTES)).toContain(c.id);
    });
  });

  it('ninguna tarea automática anota un error sin avisar (usan fallaDeTarea, no console.error)', () => {
    const carpeta = path.join(process.cwd(), 'server', 'jobs');
    const mudas = fs.readdirSync(carpeta).filter((f) => f.endsWith('.ts') && /console\.error\(/.test(fs.readFileSync(path.join(carpeta, f), 'utf8')));
    expect(mudas).toEqual([]);
  });
});
