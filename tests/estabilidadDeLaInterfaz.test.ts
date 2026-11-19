import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pedidos del dueño, 2026-11-17: pasar de ingresar a registrarse sin saltos, carrusel suave, el chat que no envía el segundo mensaje, la campanita con un número que no
 * existe y «siempre que arreglás algo se rompe otra cosa». Cada punto queda atado a una prueba para que no se deshaga sin querer.
 */
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n');

describe('ingresar ↔ registrarse sin saltos', () => {
  const pantalla = leer('client/pages/LoginScreen.tsx');
  const panel = leer('client/components/auth/AuthHero.tsx');

  it('el formulario parte siempre desde arriba y su alto cambia con una transición', () => {
    expect(pantalla).toContain('justify-start');
    expect(pantalla).toContain('<AlturaSuave>');
    expect(leer('client/components/ui/AlturaSuave.tsx')).toContain('transition: \'height');
  });

  it('el recuadro de bienvenida es el mismo en las dos pantallas (sin el aviso del correo, que el dueño pidió sacar el 2026-11-19)', () => {
    expect(pantalla).not.toContain('promoConfirmEmail');
    expect(leer('mobile/app/(auth)/register.tsx')).not.toContain('Para recibirlos tenés que confirmar');
  });

  it('el panel de la izquierda ocupa la pantalla entera y no se estira con el formulario', () => {
    expect(panel).toContain('lg:fixed lg:inset-y-0 lg:left-0');
    expect(panel).not.toContain('lg:sticky');
  });

  it('el carrusel cruza los mensajes apilados (sin hueco, sin cambiar de alto) y también con «reducir movimiento»', () => {
    expect(panel).toContain('col-start-1 row-start-1');
    expect(panel).toContain('transition-[opacity,transform]');
    // ya no hay un temporizador que apaga el texto, lo cambia y lo prende, ni un modo que cambia de golpe
    expect(panel).not.toContain('setVisible');
    expect(panel).not.toContain('sinMovimiento');
  });
});

describe('el chat dice si el mensaje salió', () => {
  const chat = leer('client/pages/ChatScreen.tsx');

  it('se envía por la API (con respuesta), se reconcilia con el provisorio y, si falla, devuelve el texto y avisa', () => {
    expect(chat).toContain('/api/chat/conversations/${conversationId}/messages');
    expect(chat).toContain("method: 'POST'");
    expect(chat).toContain('mezclarMensajes(prev, [datos.message as Message])');
    expect(chat).toContain('setNewMessage(prev => prev || messageText)');
    expect(chat).not.toContain('socketSendMessage');
  });

  it('el socket también aplica el filtro de teléfonos y correos (antes lo salteaba)', () => {
    const socket = leer('server/services/socket.ts');
    expect(socket).toContain('analyzeMessage(String(message))');
    expect(socket).toContain('CONTACT_INFO_BLOCKED');
  });
});

describe('la campanita nunca muestra un número inventado', () => {
  const campana = leer('client/components/NotificationDropdown.tsx');

  it('el número sale del servidor: un aviso en vivo vuelve a preguntar, no suma 1 a ciegas', () => {
    expect(campana).not.toMatch(/setUnreadCount\(prev => prev \+ 1\)/);
    expect(campana).not.toMatch(/setUnreadCount\(prev => Math\.max\(0, prev - 1\)\)/);
    expect(campana).toContain('fetchUnreadCount();');
  });

  it('si no se pudo cargar la lista se dice, en vez de «no tenés notificaciones»', () => {
    expect(campana).toContain('No pudimos cargar tus notificaciones.');
  });
});

describe('prueba de humo del entorno desplegado', () => {
  it('corre después del deploy en staging y en producción, con el mismo guion', () => {
    for (const f of ['.github/workflows/staging.yml', '.github/workflows/ci-cd.yml']) {
      const t = leer(f);
      expect(t).toContain('humo-del-entorno:');
      expect(t).toContain('node .github/scripts/humo-del-entorno.mjs');
    }
  });

  it('mira las puertas donde ya se rompió algo: la aplicación, la portada, las imágenes (/api/archivo), las notificaciones y el chat', () => {
    const s = leer('.github/scripts/humo-del-entorno.mjs');
    for (const ruta of ['/api/health', '/api/archivo', '/api/notifications', '/api/chat/conversations']) expect(s).toContain(ruta);
  });
});
