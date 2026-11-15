import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GUIAS, ORDEN_DE_GUIAS } from '../client/components/guias/guias';
import { duracionPara } from '../client/utils/desplazamientoSuave';

/**
 * Pedidos del dueño, 2026-11-15: guía paso a paso (solo publicar y el menú), desplazamiento suave, pestañas iguales en toda la app y textos en positivo. Todo esto se
 * mira en un navegador; estas pruebas evitan que se deshaga sin querer.
 */
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');

describe('guías paso a paso', () => {
  it('por ahora hay solo dos: publicar un trabajo y el menú de la cuenta', () => {
    expect(ORDEN_DE_GUIAS).toEqual(['publicar', 'menu']);
    expect(Object.keys(GUIAS).sort()).toEqual(['menu', 'publicar']);
  });

  it('el camino del menú pasa por «Configuración» tocando de verdad el botón', () => {
    const pasos = GUIAS.menu.pasos;
    expect(pasos[0]).toMatchObject({ objetivo: '[data-guia="menu-usuario"]', avanzaCon: 'click' });
    expect(pasos[1]).toMatchObject({ objetivo: '[data-guia="menu-configuracion"]', avanzaCon: 'click', volverSiFalta: true });
    expect(pasos[2].ruta?.test('/settings')).toBe(true);
  });

  it('el camino de publicar arranca en el botón del encabezado y sigue en el formulario', () => {
    const pasos = GUIAS.publicar.pasos;
    expect(pasos[0].objetivo).toBe('[data-onboarding="create-job"]');
    for (const p of pasos.slice(1)) expect(p.ruta?.test('/contracts/create')).toBe(true);
  });

  it('cada lugar que marca una guía existe en el código de la pantalla', () => {
    const fuentes = [
      leer('client/components/app/Header.tsx'),
      leer('client/pages/UserSettings.tsx'),
      leer('client/components/ui/MontoEnPesos.tsx'),
      leer('client/pages/CreateContractScreen.tsx'),
    ].join('\n');
    for (const marca of ['data-guia="menu-usuario"', 'data-guia="menu-configuracion"', 'data-guia="perfil-foto"', 'data-guia="perfil-bio"', 'data-onboarding="create-job"', 'name="title"']) {
      expect(fuentes).toContain(marca);
    }
    expect(fuentes).toContain('data-guia={`pestana-${tab.id}`}');
    expect(fuentes).toContain('data-guia={name ? `campo-${name}` : undefined}');
  });

  it('la visita automática de bienvenida muestra solo publicar y el menú', () => {
    const f = leer('client/hooks/useOnboarding.tsx');
    expect(f).toContain("id: 'create-job'");
    expect(f).toContain("id: 'profile'");
    expect(f).not.toMatch(/id: '(welcome|search|jobs)'/);
  });
});

describe('desplazamiento suave', () => {
  it('dura entre 0,35 y 0,9 segundos según la distancia', () => {
    expect(duracionPara(10)).toBe(350);
    expect(duracionPara(1000)).toBe(450);
    expect(duracionPara(100000)).toBe(900);
    expect(duracionPara(-1000)).toBe(450);
  });

  it('la navegación y los enlaces a un lugar de la página lo usan', () => {
    const layout = leer('client/components/app/Layout.tsx');
    expect(layout).toMatch(/desplazarSuave\(0\)/);
    expect(layout).toMatch(/desplazarAElemento\(el\)/);
  });
});

describe('diseño congruente', () => {
  it('las tres pestañas del perfil usan el mismo componente', () => {
    const f = leer('client/pages/ProfilePage.tsx');
    expect((f.match(/<Pestanas\b/g) || []).length).toBe(3);
    expect(f).not.toMatch(/setViewMode\('posts'\)/);
  });

  it('el teléfono de la portada tiene botón de pausa y no depende de «reducir movimiento»', () => {
    const f = leer('client/components/home/MovilPagoLiberado.tsx');
    expect(f).toContain('pausa-del-movil');
    expect(f).not.toMatch(/matchMedia\(["']\(prefers-reduced-motion/);
  });
});

describe('textos en positivo', () => {
  const textos = [leer('client/i18n/locales/es.json'), leer('client/components/auth/AuthHero.tsx'), leer('client/components/KycWelcomeModal.tsx'), leer('client/pages/ProfilePage.tsx')].join('\n');

  it('«Si cancelás, podés recibir tu dinero de vuelta»', () => {
    expect(leer('client/components/auth/AuthHero.tsx')).toContain('podés recibir tu dinero de vuelta');
  });

  it('no vuelven los avisos que asustaban', () => {
    for (const frase of ['no perdés todo', 'perderás la comisión', 'No podés postularte hasta', 'Todavía no podés promocionarte', 'Hasta verificarte, tu cuenta está limitada']) {
      expect(textos + leer('client/components/CancellationLadder.tsx') + leer('client/components/profile/ProfilePromotion.tsx')).not.toContain(frase);
    }
  });
});
