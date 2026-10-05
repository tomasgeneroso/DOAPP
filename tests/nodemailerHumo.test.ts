import { describe, it, expect } from '@jest/globals';
import nodemailer from 'nodemailer';

/**
 * Prueba de humo de nodemailer, con las opciones que usa `server/services/email.ts`.
 *
 * Por qué existe: nodemailer manda todos los correos de la plataforma —
 * verificación de cuenta, recupero de contraseña, avisos de pago— y se subió de
 * la 7 a la 10 para cerrar vulnerabilidades publicadas. Esto no prueba
 * nodemailer: prueba que NUESTRA forma de usarlo sigue funcionando después del
 * salto de versión mayor.
 *
 * Lo que NO prueba, para no sobreprometer: que la 10 cierre esas
 * vulnerabilidades. Se verificó contra la 7.0.13 y los casos de inyección de
 * cabeceras de abajo ya pasaban ahí; las vulnerabilidades que cierra la 10 son
 * de otros caminos (el nombre del transporte en EHLO, la opción `raw`, listas
 * de permitidos de dominios) que esta aplicación no usa. Se actualiza igual
 * porque es la versión sin avisos publicados, no porque haya un exploit contra
 * este código.
 *
 * Usa `jsonTransport`: arma el mensaje completo sin abrir ninguna conexión.
 */

const transporte = nodemailer.createTransport({ jsonTransport: true });

async function armar(opciones: Record<string, unknown>) {
  const info = await transporte.sendMail({
    from: '"DOAPP" <support@doapparg.com>',
    to: 'usuario@example.com',
    subject: 'Verificá tu cuenta',
    text: 'texto plano',
    html: '<p>html</p>',
    ...opciones,
  });
  return JSON.parse(info.message as string);
}

describe('el mensaje que arma email.ts', () => {
  it('conserva remitente, destinatario, asunto, texto, html y replyTo', async () => {
    const m = await armar({ replyTo: 'support@doapparg.com' });
    expect(m.from.address).toBe('support@doapparg.com');
    expect(m.from.name).toBe('DOAPP');
    expect(m.to[0].address).toBe('usuario@example.com');
    expect(m.subject).toBe('Verificá tu cuenta');
    expect(m.text).toBe('texto plano');
    expect(m.html).toBe('<p>html</p>');
    expect(m.replyTo[0].address).toBe('support@doapparg.com');
  });

  it('el transporte SMTP se crea con las opciones que usa el servicio', () => {
    // Las mismas claves que `initializeSMTP`. No conecta: sólo falla si alguna
    // opción dejó de existir o cambió de forma.
    const smtp = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: { user: 'support@doapparg.com', pass: 'x' },
      tls: { rejectUnauthorized: true },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
      pool: true,
      maxConnections: 3,
      maxMessages: 100,
    });
    expect(typeof smtp.sendMail).toBe('function');
    expect(typeof smtp.verify).toBe('function');
    smtp.close();
  });
});

describe('guarda de regresión: los datos de usuario no inyectan cabeceras', () => {
  /**
   * Un nombre o un asunto con saltos de línea es la forma clásica de inyectar
   * cabeceras: lo que viene después del salto lo interpreta el servidor como
   * una cabecera nueva (un `Bcc:` que copia el correo a un tercero). El asunto
   * y el nombre salen de datos de usuario —el nombre con que se registró—.
   *
   * Esto ya se cumplía en la 7.x: es para que no se pierda en una versión
   * futura, no la prueba de un arreglo.
   */
  it('un salto de línea en el asunto no crea una cabecera nueva', async () => {
    const m = await armar({ subject: 'Hola\r\nBcc: atacante@evil.example' });
    expect(m.headers?.bcc ?? m.bcc).toBeUndefined();
    expect(JSON.stringify(m)).not.toMatch(/"bcc"\s*:\s*\[?\s*\{?\s*"address"\s*:\s*"atacante@evil/i);
  });

  it('un salto de línea en el nombre del remitente no crea una cabecera nueva', async () => {
    const m = await armar({ from: '"Juan\r\nBcc: atacante@evil.example" <support@doapparg.com>' });
    expect(m.bcc).toBeUndefined();
  });
});
