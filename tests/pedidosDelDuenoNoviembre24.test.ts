import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

/** Pedidos del dueño, 2026-11-24: configuración con dos pestañas, biografía desplegable en el perfil, muro del perfil que se agrega y se quita (no se edita). */
describe('pedidos del dueño del 24 de noviembre', () => {
  const leer = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');

  describe('Notificaciones y Posts', () => {
    const f = leer('client/pages/UserSettings.tsx');

    it('la lista lateral dice «Notificaciones y Posts» y «Profesión y matrícula» (igual que el título de cada sección)', () => {
      expect(f).toContain('notifications: "Notificaciones y Posts"');
      expect(f).toContain('profession: "Profesión y matrícula"');
      expect(f).toContain('{ id: "profession", label: "Profesión y matrícula", icon: Briefcase }');
      expect(leer('client/i18n/locales/es.json')).toContain('"notifications": "Notificaciones y Posts"');
    });

    it('la sección tiene dos pestañas con el componente de pestañas de la app: Notificaciones y Posts', () => {
      expect(f).toContain('testid="pestanas-de-notificaciones-y-posts"');
      expect(f).toContain('{ id: "notificaciones" as const, texto: "Notificaciones"');
      expect(f).toContain('{ id: "posts" as const, texto: "Posts"');
      expect(f).toContain('subpestanaDeAvisos === "notificaciones"');
      expect(f).toContain('subpestanaDeAvisos === "posts"');
    });

    it('«Que me etiqueten» vive en la pestaña Posts, no en la de Notificaciones', () => {
      const posts = f.slice(f.indexOf('data-testid="preferencias-de-posts"'));
      const notificaciones = f.slice(f.indexOf('data-testid="preferencias-de-notificaciones"'), f.indexOf('data-testid="preferencias-de-posts"'));
      expect(posts).toContain('data-testid="permitir-etiquetas"');
      expect(notificaciones).not.toContain('permitir-etiquetas');
    });
  });

  describe('biografía en el perfil, desplegable', () => {
    it('Configuración ya no tiene la biografía y manda al perfil; el guardado de Configuración no la envía', () => {
      const f = leer('client/pages/UserSettings.tsx');
      expect(f).not.toContain('settings.basic.bio');
      expect(f).not.toContain('setBio');
      expect(f).toContain('data-testid="la-biografia-esta-en-el-perfil"');
      expect(f).not.toMatch(/phone,\s*bio,/);
    });

    it('el perfil la muestra en una sección que se despliega y la propia se escribe ahí mismo', () => {
      const c = leer('client/components/profile/BiografiaDelPerfil.tsx');
      expect(c).toContain('aria-expanded={abierta}');
      expect(c).toContain('data-testid="biografia-desplegar"');
      expect(c).toContain('/api/auth/settings');
      expect(c).toContain('if (!esPropio && !escrita) return null'); // en el perfil de otra persona solo si escribió algo
      expect(c).toContain('maxLength={LARGO_MAXIMO}');
      const p = leer('client/pages/ProfilePage.tsx');
      expect(p).toContain('<BiografiaDelPerfil');
      expect(p).not.toMatch(/\{user\.bio && \(/);
    });

    it('la caja ocupa el ancho disponible (no el del nombre) y ordena el texto: renglones vacíos juntos, largo con scroll', () => {
      const c = leer('client/components/profile/BiografiaDelPerfil.tsx');
      expect(c).toContain('mb-3 w-full max-w-2xl');
      expect(c).toContain('max-h-64 overflow-y-auto');
      expect(c).toContain('break-words');
      expect(c).toContain('.replace(/\\n{3,}/g, "\\n\\n")');
      expect(leer('client/pages/ProfilePage.tsx')).toMatch(/<div className="min-w-0 flex-1">\s*<h1/);
    });

    it('la guía de inicio ya no manda a escribir la biografía en Configuración', () => {
      const g = leer('client/components/guias/guias.ts');
      expect(g).not.toContain("id: 'bio'");
      expect(g).toContain('La biografía se escribe desde tu perfil');
    });
  });

  describe('muro del perfil: la publicación de un trabajo no se edita', () => {
    it('«Trabajos publicados» NO ofrece agregar, quitar ni eliminar nada (el dueño lo descartó)', () => {
      const f = leer('client/components/profile/TrabajosPublicados.tsx');
      expect(f).not.toContain('agregar-al-muro');
      expect(f).not.toContain('quitar-del-muro');
      expect(f).not.toContain('mis-trabajos-en-el-muro');
      expect(f).not.toContain('ConfirmModal');
      expect(f).not.toContain('method: "DELETE"');
    });

    it('la publicación de un trabajo no muestra «Editar» (tarjeta, detalle y lista del perfil)', () => {
      expect(leer('client/components/user/PostCard.tsx')).toContain('{!post.linkedContract && (');
      expect(leer('client/pages/PostDetail.tsx')).toContain('{!post.linkedContract && (');
      expect(leer('client/pages/PostDetail.tsx')).toContain('if (post.linkedContract) return;');
      expect(leer('client/pages/ProfilePage.tsx')).toContain('{!(post as any).linkedContract && (');
    });

    it('el servidor también lo frena', () => {
      const f = leer('server/routes/posts.ts');
      expect(f).toContain('PUBLICACION_DE_TRABAJO_NO_SE_EDITA');
      expect(f).not.toContain('mis-trabajos-en-el-muro');
    });
  });
});
