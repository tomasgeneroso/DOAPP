import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { GUIAS, ORDEN_DE_GUIAS } from '../client/components/guias/guias';
import { duracionPara } from '../client/utils/desplazamientoSuave';

/**
 * Pedidos del dueño, 2026-11-15: guía paso a paso (solo publicar y el menú), desplazamiento suave, pestañas iguales en toda la app y textos en positivo. Todo esto se
 * mira en un navegador; estas pruebas evitan que se deshaga sin querer.
 */
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');

describe('guías paso a paso', () => {
  it('hay tres: publicar un trabajo, el menú de la cuenta y el calendario', () => {
    expect(ORDEN_DE_GUIAS).toEqual(['publicar', 'menu', 'calendario']);
    expect(Object.keys(GUIAS).sort()).toEqual(['calendario', 'menu', 'publicar']);
  });

  it('el camino del calendario sale del menú, llega a «Mis trabajos» y marca cada parte del calendario', () => {
    const pasos = GUIAS.calendario.pasos;
    expect(pasos[0]).toMatchObject({ objetivo: '[data-guia="menu-usuario"]', avanzaCon: 'click' });
    expect(pasos[1]).toMatchObject({ objetivo: '[data-guia="menu-mis-trabajos"]', avanzaCon: 'click', volverSiFalta: true });
    expect(pasos[2]).toMatchObject({ objetivo: '[data-guia="vista-calendario"]', avanzaCon: 'click' });
    for (const p of pasos.slice(2)) expect(p.ruta?.test('/my-jobs')).toBe(true);
    // cada lugar marcado existe en el código de la pantalla
    const fuentes = [leer('client/components/app/Header.tsx'), leer('client/pages/MyJobsScreen.tsx'), leer('client/components/jobs/JobsCalendar.tsx')].join('\n');
    for (const p of pasos) expect(fuentes).toContain(p.objetivo.replace(/^\[|\]$/g, ''));
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
      leer('client/components/profile/BiografiaDelPerfil.tsx'),
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

describe('pestañas: un solo diseño en toda la app', () => {
  /** Todos los .tsx del cliente. */
  const archivos = (): string[] => {
    return execSync('git ls-files -z client', { maxBuffer: 1e8 }).toString().split('\0').filter((f) => f.endsWith('.tsx'));
  };

  it('nadie arma sus propias pestañas: solo components/ui/Pestanas (el carrusel de fotos tiene sus puntos, que no son pestañas de contenido)', () => {
    const permitidos = new Set(['client/components/ui/Pestanas.tsx', 'client/components/jobDetail/CarruselDeFotos.tsx']);
    const propios = archivos().filter((f) => !permitidos.has(f) && /role="(tab|tablist)"/.test(leer(f)));
    expect(propios).toEqual([]);
  });

  it('ni barras subrayadas hechas a mano (-mb-px + border-b-2)', () => {
    const subrayadas = archivos().filter((f) => /-mb-px/.test(leer(f)) && /border-b-2/.test(leer(f)));
    expect(subrayadas).toEqual([]);
  });

  it('la barra de pestañas de administración es la misma de toda la app', () => {
    const f = leer('client/components/admin/Pestanas.tsx');
    expect(f).toContain('import Pestanas from "../ui/Pestanas"');
    expect(f).not.toMatch(/role="tab"/);
  });

  it('el color de la pestaña elegida es el celeste de siempre (no violeta, verde ni naranja según la pantalla)', () => {
    const f = leer('client/components/ui/Pestanas.tsx');
    expect(f).toContain('bg-sky-100 text-sky-700');
    expect(f).not.toMatch(/purple|violet|emerald|orange/);
  });
});

describe('redes oficiales', () => {
  it('Instagram, Facebook, X y LinkedIn con las cuentas del dueño, en un solo lugar', async () => {
    const { REDES_SOCIALES, ORDEN_DE_REDES } = await import('../shared/constants/redesSociales');
    expect(REDES_SOCIALES.instagram.url).toBe('https://www.instagram.com/doapparg');
    expect(REDES_SOCIALES.facebook.url).toBe('https://www.facebook.com/profile.php?id=61593201473371');
    expect(REDES_SOCIALES.x).toMatchObject({ usuario: '@DoAppArgentina', url: 'https://x.com/DoAppArgentina' });
    expect(REDES_SOCIALES.linkedin.url).toBe('https://www.linkedin.com/in/doapp/');
    expect([...ORDEN_DE_REDES]).toEqual(['instagram', 'facebook', 'x', 'linkedin']);
  });

  it('el pie, el contacto, la app y los datos para buscadores usan esas cuentas (nada de enlaces a la portada de cada red)', () => {
    const pie = leer('client/components/app/Footer.tsx');
    expect(pie).toContain('REDES_SOCIALES.x.url');
    expect(pie).toContain('REDES_SOCIALES.linkedin.url');
    expect(pie).not.toMatch(/href="https:\/\/(twitter|linkedin|instagram|facebook)\.com"/);
    expect(leer('client/pages/ContactPage.tsx')).toContain('ORDEN_DE_REDES');
    expect(leer('mobile/app/contact.tsx')).toContain('ORDEN_DE_REDES');
    const html = leer('index.html');
    expect(html).toContain('https://x.com/DoAppArgentina');
    expect(html).toContain('https://www.linkedin.com/in/doapp/');
    expect(html).not.toContain('twitter.com/doapparg');
  });
});

describe('fotos', () => {
  it('lo que se sube nunca pasa del tope: el editor y «usar original» pasan por utils/imagenes', () => {
    expect(leer('client/components/profile/ImageEditorModal.tsx')).toContain('codificarConTope(out, type)');
    expect(leer('client/hooks/useEditorDeFotos.tsx')).toContain('achicarSiPesaDeMas');
    expect(leer('client/utils/imagenes.ts')).toMatch(/TOPE_DE_IMAGEN_BYTES = 4 \* 1024 \* 1024/);
  });

  it('el error de la foto se ve junto a la foto', () => {
    expect(leer('client/pages/UserSettings.tsx')).toContain('error-de-la-foto');
  });

  it('la guía se esconde mientras hay una ventana abierta', () => {
    expect(leer('client/components/guias/GuiaPasoAPaso.tsx')).toContain('[role="dialog"][aria-modal="true"]');
  });
});

describe('vacíos y avisos en positivo (barrido 2026-11-17)', () => {
  const todo = (): string => {
    const archivos = execSync('git ls-files -z client mobile/app mobile/components', { maxBuffer: 1e8 }).toString().split('\0').filter((f) => /\.(tsx|json)$/.test(f) && !f.includes('/admin/') && !f.includes('en.json'));
    return archivos.map((f) => leer(f)).join('\n');
  };

  it('las pantallas de la cuenta no abren con «No tenés / No tienes / No hay» a secas: dicen qué va a aparecer', () => {
    const t = todo();
    for (const frase of ['No tienes contratos', 'No tienes trabajos', 'No tienes propuestas', 'No tienes aplicaciones', 'No tienes postulaciones', 'No tienes notificaciones', 'No hay trabajos disponibles', 'No hay transacciones', 'No hay mensajes aún', 'Todavía no es saldo']) {
      expect(t).not.toContain(frase);
    }
  });

  it('la portada deja solo «Sé el primero en ofrecer tus servicios o publicá lo que necesitás»', () => {
    const es = JSON.parse(leer('client/i18n/locales/es.json')).home as Record<string, string>;
    expect(es.noJobsYetDesc).toBe('Sé el primero en ofrecer tus servicios o publicá lo que necesitás');
  });
});
