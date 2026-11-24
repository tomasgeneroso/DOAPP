import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { motivoDeClaveDebil, TEXTO_DE_LA_REGLA_DE_CLAVE } from '../shared/seguridad/clave';
import { sesionVigente } from '../server/services/vigenciaDeSesion';
import { esMensajeTecnico } from '../server/middleware/respuestasDeError';
import { esDireccionDeArchivoPropia } from '../server/utils/direccionDeArchivo';
import { acotarPaginacion } from '../server/middleware/paginacion';

/** Auditoría de seguridad del 2026-11-24: reglas puras y que lo sacado (AstroPay, PayPal) no vuelva. */
describe('auditoría de seguridad del 24 de noviembre (sin base)', () => {
  const raiz = process.cwd();
  const leer = (r: string) => readFileSync(join(raiz, r), 'utf8');

  describe('contraseña nueva: 6 caracteres y un símbolo', () => {
    it.each(['Clave1!', 'abcdef-', 'ñandú.123', 'Contraseña#segura', '¡Hola1.', 'a_b_c_d']) ('«%s» sirve', (c) => {
      expect(motivoDeClaveDebil(c)).toBeNull();
    });
    it('sin símbolo no sirve (las letras con tilde y la ñ no cuentan como símbolo)', () => {
      expect(motivoDeClaveDebil('password123')).toContain('símbolo');
      expect(motivoDeClaveDebil('Contraseñá1')).toContain('símbolo');
      expect(motivoDeClaveDebil('ñandú123')).toContain('símbolo');
    });
    it('menos de 6 caracteres no sirve, ni algo que no es texto', () => {
      expect(motivoDeClaveDebil('a!1')).toContain('6 caracteres');
      expect(motivoDeClaveDebil(undefined)).toContain('6 caracteres');
      expect(motivoDeClaveDebil(123456 as unknown)).toContain('6 caracteres');
    });
    it('más de 72 bytes no sirve (bcrypt ignora lo que pasa de ahí)', () => {
      expect(motivoDeClaveDebil('a!'.repeat(36))).toBeNull(); // 72 bytes justos
      expect(motivoDeClaveDebil('a!'.repeat(37))).toContain('larga');
      expect(motivoDeClaveDebil('ñ!'.repeat(30))).toContain('larga'); // la ñ pesa 2 bytes
    });
    it('el texto de la regla lo dice con las mismas palabras', () => {
      expect(TEXTO_DE_LA_REGLA_DE_CLAVE).toContain('6 caracteres');
      expect(TEXTO_DE_LA_REGLA_DE_CLAVE).toContain('símbolo');
    });
    it('el servidor, la web y la app usan la MISMA función (no cada uno su regla)', () => {
      expect(leer('server/routes/auth.ts')).toContain('motivoDeClaveDebil');
      expect(leer('server/routes/auth.ts')).not.toMatch(/body\("(password|newPassword)"\)\s*\.isLength\(\{ min: 6 \}\)/);
      for (const f of ['client/pages/LoginScreen.tsx', 'client/pages/ResetPassword.tsx', 'client/components/CambiarContrasena.tsx', 'mobile/app/(auth)/register.tsx', 'mobile/app/(auth)/reset-password.tsx', 'mobile/app/cambiar-contrasena.tsx']) {
        expect([f, leer(f).includes('motivoDeClaveDebil')]).toEqual([f, true]);
      }
    });
  });

  describe('vigencia de la sesión', () => {
    const ahora = Math.floor(Date.now() / 1000);
    it('sin fecha de cierre, un token de sesión vale', () => {
      expect(sesionVigente({ iat: ahora }, { tokensValidAfter: null })).toBe(true);
      expect(sesionVigente({ iat: ahora }, {})).toBe(true);
    });
    it('un token emitido ANTES del cierre no vale; uno emitido en el mismo segundo o después sí', () => {
      const cierre = new Date(ahora * 1000 + 500);
      expect(sesionVigente({ iat: ahora - 10 }, { tokensValidAfter: cierre })).toBe(false);
      expect(sesionVigente({ iat: ahora }, { tokensValidAfter: cierre })).toBe(true);
      expect(sesionVigente({ iat: ahora + 5 }, { tokensValidAfter: cierre })).toBe(true);
    });
    it('un token con propósito (vincular cuenta, factura) nunca es una sesión', () => {
      expect(sesionVigente({ iat: ahora, proposito: 'vincular-cuenta' }, {})).toBe(false);
      expect(sesionVigente({ iat: ahora, typ: 'descarga-de-factura' }, {})).toBe(false);
    });
    it('sin token o sin usuario, no', () => {
      expect(sesionVigente(null, {})).toBe(false);
      expect(sesionVigente({ iat: ahora }, null)).toBe(false);
    });
  });

  describe('errores del servidor: el texto técnico no sale', () => {
    it.each([
      'invalid input syntax for type uuid: "abc"',
      'column "price_a_r_s" does not exist',
      'relation "users" does not exist',
      'duplicate key value violates unique constraint "users_email_key"',
      "Cannot read properties of undefined (reading 'id')",
      'SequelizeDatabaseError: algo',
      'connect ECONNREFUSED 127.0.0.1:5432',
      'x'.repeat(200),
      'línea uno\nlínea dos',
      'at Object.<anonymous> (server/routes/x.ts:10:5)',
    ])('«%s» es técnico', (m) => {
      expect(esMensajeTecnico(m)).toBe(true);
    });
    it('un mensaje corto y pensado para la persona se deja', () => {
      expect(esMensajeTecnico('No pudimos crear el pago, probá de nuevo')).toBe(false);
      expect(esMensajeTecnico('El archivo no es válido')).toBe(false);
    });
  });

  describe('archivos del chat por el socket', () => {
    it.each(['/uploads/chat/foto.png', '/api/uploads/chat/a-b_c.pdf', '/api/archivo?ruta=chat/foto.png'])('«%s» es de la plataforma', (d) => {
      expect(esDireccionDeArchivoPropia(d)).toBe(true);
    });
    it.each(['https://malo.com/x.png', '//malo.com/x', 'javascript:alert(1)', '/uploads/../etc/passwd', '/uploads/a\\b', '/otra/carpeta/x.png', 'data:text/html,hola', '/uploads/chat/foto.png\n'])('«%s» no', (d) => {
      expect(esDireccionDeArchivoPropia(d)).toBe(false);
    });
    it('el socket solo acepta text, image y file (nunca system) y filtra el texto de todos los tipos', () => {
      const f = leer('server/services/socket.ts');
      expect(f).toContain('TIPOS_DE_MENSAJE_DEL_CLIENTE = ["text", "image", "file"]');
      expect(f).toContain('TIPO_DE_MENSAJE_INVALIDO');
      expect(f).not.toContain('if (type === "text" && message) {');
    });
  });

  describe('paginación acotada', () => {
    const correr = (query: Record<string, string>, metodo = 'GET') => {
      const req: any = { method: metodo, query };
      let siguio = false;
      acotarPaginacion(req, {} as any, () => { siguio = true; });
      return { query: req.query as Record<string, string>, siguio };
    };
    it('limit se acota entre 1 y 500, page desde 1 y offset desde 0', () => {
      expect(correr({ limit: '1000000' }).query.limit).toBe('500');
      expect(correr({ limit: '0' }).query.limit).toBe('1');
      expect(correr({ limit: '-5' }).query.limit).toBe('1');
      expect(correr({ page: '0' }).query.page).toBe('1');
      expect(correr({ page: '-3' }).query.page).toBe('1');
      expect(correr({ offset: '-10' }).query.offset).toBe('0');
    });
    it('lo normal y lo que no es un número se dejan como están, y siempre sigue', () => {
      const a = correr({ limit: '20', page: '2', q: 'hola' });
      expect(a.query).toEqual({ limit: '20', page: '2', q: 'hola' });
      expect(a.siguio).toBe(true);
      expect(correr({ limit: 'muchos' }).query.limit).toBe('muchos');
    });
    it('solo toca los GET', () => {
      expect(correr({ limit: '999999' }, 'POST').query.limit).toBe('999999');
    });
  });

  describe('AstroPay y PayPal quedaron afuera', () => {
    it('no existen sus servicios, ni el botón, ni el modal', () => {
      for (const f of ['server/services/astropay.ts', 'server/services/paypal.ts', 'server/services/paypalService.ts', 'server/scripts/testPaypal.ts', 'client/components/payments/PayPalButton.tsx', 'client/components/payments/PaymentModal.tsx']) {
        expect([f, existsSync(join(raiz, f))]).toEqual([f, false]);
      }
    });
    it('payments.ts no tiene sus rutas ni sus webhooks, y rechaza un medio que no existe', () => {
      const f = leer('server/routes/payments.ts');
      expect(f).not.toMatch(/astropayService|paypalService|webhook\/astropay|PayPal webhook/);
      expect(f).toContain("['mercadopago', 'bank_transfer', 'binance', 'balance']");
      expect(f).toContain('PAYMENT_METHOD_UNAVAILABLE');
    });
    it('ni en la configuración, ni en las variables, ni en las dependencias', () => {
      expect(leer('server/config/env.ts')).not.toMatch(/astropay(Enabled|ApiKey|SecretKey|BaseUrl)|paypal(Enabled|ClientId|ClientSecret|Mode)|process.env.(PAYPAL|ASTROPAY)_/);
      expect(leer('.env.schema')).not.toMatch(/ASTROPAY|PAYPAL/);
      expect(leer('.env.example')).not.toMatch(/ASTROPAY|PAYPAL/);
      expect(leer('package.json')).not.toMatch(/paypal/i);
      expect(leer('server/routes/config.ts')).not.toMatch(/astropayService|payment:astropay/);
    });
    it('el selector de pago de la web ya no ofrece AstroPay', () => {
      expect(leer('client/components/payments/PaymentMethodSelector.tsx')).not.toMatch(/astropay/i);
    });
  });

  describe('otros cierres de la auditoría', () => {
    it('el token de restablecer se guarda con hash y el enlace dura una hora', () => {
      const f = leer('server/models/sql/PasswordResetToken.model.ts');
      expect(f).toContain('hashDelToken');
      expect(f).toContain('60 * 60 * 1000');
      expect(leer('server/routes/auth.ts')).not.toContain('Reset password attempt with token');
    });
    it('las rutas públicas sin dueño quedaron cerradas o acotadas', () => {
      expect(leer('server/routes/users.ts')).toMatch(/share-stats", protect/);
      expect(leer('server/routes/tickets.ts')).not.toContain('Tickets route is working');
      expect(leer('server/routes/tickets.ts')).toContain('limitadorDeFormulariosPublicos');
      expect(leer('server/routes/contact.ts')).toContain('limitadorDeFormulariosPublicos');
      expect(leer('server/routes/referrals.ts')).toContain('limitadorDeCodigos');
      expect(leer('server/routes/search.ts')).not.toContain('nominatim.openstreetmap.org');
    });
    it('el correo a soporte escapa lo que escribió la persona', () => {
      expect(leer('server/routes/tickets.ts')).toContain('escaparHtml(message)');
    });
    it('los trabajos que se exportan al calendario y se adjuntan en el chat son los propios o los abiertos', () => {
      expect(leer('server/routes/chat.ts')).toContain("job.status === 'open'");
      expect(leer('server/routes/jobs.ts')).toContain("['open', 'in_progress', 'completed'].includes(String(job.status))");
    });
    it('las publicaciones nuevas van a su propia carpeta, no a la de los reclamos', () => {
      expect(leer('server/routes/posts.ts')).not.toContain('/uploads/disputes/');
      expect(leer('server/middleware/upload.ts')).toContain('postMediaStorage');
    });
    it('la biografía tiene tope también en el servidor', () => {
      expect(leer('server/routes/auth.ts')).toContain('BIO_MUY_LARGA');
    });
    it('los permisos del panel: lista conocida, «*» solo del owner y jerarquía', () => {
      const f = leer('server/routes/admin/roles.ts');
      expect(f).toContain('puedeTocarA');
      expect(f).toContain('PERMISOS_CONOCIDOS');
      expect(f).toContain('Solo el owner puede dar el permiso de todo');
    });
  });
});
