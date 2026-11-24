import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { celdaCsv, celdaDeTextoCsv } from '../server/utils/csvSeguro';
import { extensionSegura, nombreSeguro, EXTENSIONES_QUE_SE_MUESTRAN } from '../server/utils/archivoSeguro';
import { motivoDeSospecha } from '../server/utils/archivosSospechosos';
import { nombreEnLaCarpetaVieja, direccionNueva } from '../server/utils/fotosDePublicaciones';
import { MARCADOR_DE_SESION, pareceUnTokenReal } from '../client/utils/sesion';
import { CSP_DE_LOS_ARCHIVOS } from '../server/middleware/cabecerasDeSeguridad';

/** Auditoría de inyecciones del 2026-11-24: reglas puras y que lo corregido no vuelva. */
describe('inyecciones y archivos (sin base)', () => {
  const leer = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');

  describe('CSV: sin fórmulas y sin columnas movidas', () => {
    it.each(['=HYPERLINK("https://malo","clic")', '+cmd|\' /C calc\'!A0', '-2+3', '@SUM(1+1)', '\t=1+1', '\r=1+1'])('«%s» no se ejecuta en Excel', (peligro) => {
      const c = celdaCsv(peligro);
      expect(c.replace(/^"/, '').startsWith("'")).toBe(true);
    });
    it('un alias con comas queda en UNA sola celda (antes movía las columnas del monto)', () => {
      expect(celdaDeTextoCsv('a,999999,0')).toBe('"a,999999,0"');
      expect(['x', celdaDeTextoCsv('a,999999,0'), '5000'].join(',').split(',').length).toBe(5); // la coma de adentro sigue ahí...
      // ...pero entre comillas: un lector de CSV la trata como parte del texto
      expect(celdaDeTextoCsv('di"jo')).toBe('"di""jo"');
    });
    it('lo normal queda igual', () => {
      expect(celdaCsv('Pintura del living')).toBe('Pintura del living');
      expect(celdaCsv(1500)).toBe('1500');
      expect(celdaCsv(null)).toBe('');
      expect(celdaCsv(true)).toBe('Sí');
      expect(celdaDeTextoCsv('Ana')).toBe('"Ana"');
      expect(celdaCsv('-')).toBe('"\'-"');
    });
    it('las exportaciones del panel usan la celda segura', () => {
      for (const f of ['server/routes/admin/padrones.ts', 'server/routes/admin/userData.ts']) expect(leer(f)).toContain('celdaCsv');
      expect(leer('server/routes/admin/pendingPayments.ts')).toContain('celdaDeTextoCsv(doer?.bankingInfo?.alias)');
      expect(leer('server/routes/admin/pendingPayments.ts')).not.toContain('`"${job?.title');
    });
  });

  describe('archivos subidos: la extensión sale del tipo, nunca del nombre', () => {
    it.each([
      ['image/png', '.png'], ['image/jpeg', '.jpg'], ['image/jpg', '.jpg'], ['image/webp', '.webp'], ['application/pdf', '.pdf'], ['video/mp4', '.mp4'],
      ['text/html', '.bin'], ['image/svg+xml', '.bin'], ['application/x-javascript', '.bin'], ['', '.bin'], [undefined, '.bin'],
    ])('tipo «%s» → %s', (tipo, ext) => {
      expect(extensionSegura(tipo as string | undefined)).toBe(ext);
    });
    it('el nombre guardado no lleva nada del nombre original y es distinto cada vez', () => {
      const a = nombreSeguro({ mimetype: 'image/png' }, 'ticket-');
      const b = nombreSeguro({ mimetype: 'image/png' }, 'ticket-');
      expect(a).toMatch(/^ticket-\d+-[0-9a-f]{16}\.png$/);
      expect(a).not.toBe(b);
    });
    it('solo imagen, video y PDF se muestran en la página; lo demás se descarga', () => {
      for (const e of ['.png', '.jpg', '.pdf', '.mp4']) expect(EXTENSIONES_QUE_SE_MUESTRAN.has(e)).toBe(true);
      for (const e of ['.html', '.svg', '.js', '.xml', '.bin', '.docx']) expect(EXTENSIONES_QUE_SE_MUESTRAN.has(e)).toBe(false);
    });
    it('los archivos subidos se sirven sin scripts', () => {
      expect(CSP_DE_LOS_ARCHIVOS).toContain("script-src 'none'");
    });
    it('ningún almacén de archivos vuelve a usar la extensión que escribe quien sube', () => {
      for (const f of ['server/middleware/upload.ts', 'server/routes/jobs.ts', 'server/routes/payments.ts', 'server/routes/admin/payments.ts', 'server/routes/admin/pendingPayments.ts']) {
        expect([f, /path\.extname\(file\.originalname\)(?!\.toLowerCase\(\)\)\s*;?\s*\n\s*(const extname|if))/.test(leer(f).replace(/allowedTypes\.test\(path\.extname\(file\.originalname\)\.toLowerCase\(\)\)/g, ''))]).toEqual([f, false]);
      }
      expect(leer('server/middleware/upload.ts')).not.toContain('${file.originalname}');
    });
    it('las consultas de ticket revisan el contenido real del archivo', () => {
      expect((leer('server/routes/tickets.ts').match(/verifyMagicBytes,/g) || []).length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('script que aparta archivos sospechosos de lo ya subido', () => {
    it('marca páginas y programas por extensión, y imágenes que en realidad son una página', () => {
      expect(motivoDeSospecha('uploads/avatars/x.html', '<html>')).toContain('.html');
      expect(motivoDeSospecha('uploads/a/x.svg', '')).toContain('.svg');
      expect(motivoDeSospecha('uploads/a/x.png', 'GIF89a<html><script>alert(1)</script>')).toContain('página');
      expect(motivoDeSospecha('uploads/a/x.png', '\x89PNG\r\n\x1a\n....')).toBeNull();
      expect(motivoDeSospecha('uploads/a/x.html.bloqueado', '<html>')).toBeNull();
    });
  });

  describe('script que pasa las fotos viejas de publicaciones a su carpeta', () => {
    it('reconoce las direcciones viejas (con o sin servidor) y arma la nueva', () => {
      expect(nombreEnLaCarpetaVieja('http://doapparg.com/uploads/disputes/a-1.png')).toBe('a-1.png');
      expect(nombreEnLaCarpetaVieja('/uploads/disputes/b.jpg')).toBe('b.jpg');
      expect(nombreEnLaCarpetaVieja('/uploads/post-media/b.jpg')).toBeNull();
      expect(nombreEnLaCarpetaVieja('/uploads/disputes/../x.png')).toBeNull();
      expect(nombreEnLaCarpetaVieja(undefined)).toBeNull();
      expect(direccionNueva('https://doapparg.com/uploads/disputes/a-1.png')).toBe('https://doapparg.com/uploads/post-media/a-1.png');
    });
  });

  describe('la sesión de la web no guarda el token', () => {
    it('el marcador no es un token y un token de verdad se reconoce para borrarlo', () => {
      expect(pareceUnTokenReal(MARCADOR_DE_SESION)).toBe(false);
      expect(pareceUnTokenReal('eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.firma_abc-123')).toBe(true);
      expect(pareceUnTokenReal(null)).toBe(false);
      expect(pareceUnTokenReal('cookie')).toBe(false);
    });
    it('ninguna pantalla guarda el token del servidor en localStorage', () => {
      for (const f of ['client/hooks/useAuth.tsx', 'client/hooks/useFacebookLogin.tsx', 'client/pages/AuthCallback.tsx']) {
        expect([f, /localStorage\.setItem\(["']token["'],\s*(?!MARCADOR)/.test(leer(f))]).toEqual([f, false]);
        expect(leer(f)).toContain('guardarMarcadorDeSesion');
      }
      expect(leer('client/main.tsx')).toContain('limpiarTokenViejo()');
    });
    it('el servidor no fabrica un token nuevo en cada /auth/me', () => {
      const f = leer('server/routes/auth.ts');
      const me = f.slice(f.indexOf('router.get("/me"'), f.indexOf('router.get("/me"') + 600);
      expect(me).not.toContain('jwt.sign');
      expect(me).not.toMatch(/\btoken\b,/);
    });
  });

  describe('lo que quedaba abierto (2026-11-24)', () => {
    it('xssProtection repite hasta que no cambie: «jajavascript:vascript:» no arma «javascript:»', async () => {
      const { xssProtection } = await import('../server/middleware/security');
      const req: any = { body: { a: 'jajavascript:vascript:alert(1)', b: '<scr<script></script>ipt>x</script>', c: 'hola' }, query: {}, params: {} };
      xssProtection(req, {} as any, () => undefined);
      expect(req.body.a).not.toMatch(/javascript:/i);
      expect(req.body.b).not.toMatch(/<script/i);
      expect(req.body.c).toBe('hola');
    });
    it('mientras la CSP completa solo avisa, el subconjunto seguro ya se aplica (nginx y Cloudflare)', async () => {
      const { POLITICA_QUE_SE_APLICA_YA, cabecerasDelSitio } = await import('../shared/seguridad/csp');
      const c = Object.fromEntries(cabecerasDelSitio([], true));
      expect(c['Content-Security-Policy']).toBe(POLITICA_QUE_SE_APLICA_YA);
      expect(c['Content-Security-Policy']).toContain("object-src 'none'");
      expect(c['Content-Security-Policy']).toContain("base-uri 'self'");
      expect(c['Content-Security-Policy']).toContain("form-action 'self'");
      expect(c['Content-Security-Policy']).not.toContain('script-src');
      expect(c['Content-Security-Policy-Report-Only']).toContain('script-src');
      expect(Object.keys(Object.fromEntries(cabecerasDelSitio([], false))).filter((k) => k.startsWith('Content-Security-Policy'))).toEqual(['Content-Security-Policy']);
    });
    it('las fotos de un trabajo solo pueden ser de la plataforma y los anuncios solo https', () => {
      expect(leer('server/routes/jobs.ts')).toContain('esDireccionDeArchivoPropia(u.pathname + u.search)');
      expect(leer('server/routes/advertisements.ts')).toContain("protocols: ['https']");
    });
  });

  describe('carpetas privadas y roles', () => {
    it('reclamos, tickets y bitácora son privados', () => {
      const f = leer('server/middleware/archivosPrivados.ts');
      for (const c of ["'disputes'", "'tickets'", "'daily-log'"]) expect(f).toContain(c);
      expect(leer('server/index.ts')).toContain('archivoEnlaceRoutes');
    });
    it('cada rol da solo roles de un nivel más bajo, y owner no se asigna desde el panel', () => {
      const f = leer('server/routes/admin/roles.ts');
      expect(f).toContain('ROL_NO_ASIGNABLE');
      expect(f).toContain('nivelDelRol(adminRole) > nivelDelRol(adminUser.adminRole)');
    });
    it('la búsqueda global del panel solo acepta ids', () => {
      expect(leer('server/routes/admin/search.ts')).toContain('/^[0-9a-f-]{4,36}$/i');
    });
  });
});
